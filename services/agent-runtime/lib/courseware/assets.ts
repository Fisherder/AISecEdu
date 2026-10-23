import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { CoursewareAsset } from './schema';

const HEADERS = {
  'User-Agent':
    'AISecEdu-Courseware/2.0 (educational-media; Wikimedia Commons attribution retained)',
};
const text = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim()
    : '';

async function boundedBody(response: Response, limit: number): Promise<Buffer> {
  if (!response.ok || Number(response.headers.get('content-length')) > limit)
    throw new Error(`Asset response rejected (HTTP ${response.status})`);
  if (!response.body) throw new Error('Asset response was empty');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new Error('Asset response exceeded size limit');
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export async function searchCommonsCoursewareImage(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<CoursewareAsset | null> {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  const normalized = query.trim();
  if (normalized.length < 3 || normalized.length > 100 || /https?:|@|[\r\n]/.test(normalized))
    throw new Error(
      'Asset queries must be short public topic terms, not URLs or private source text',
    );
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: normalized,
    gsrnamespace: '6',
    gsrlimit: '4',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1200',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription|Restrictions',
  }).toString();
  const response = await fetcher(url, {
    headers: HEADERS,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  const result = JSON.parse((await boundedBody(response, 300000)).toString('utf8'));
  if (result.error) throw new Error('Image search provider returned an error');
  const candidates = Object.values(result.query?.pages || {}) as Array<Record<string, any>>;
  candidates.sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  for (const candidate of candidates) {
    const info = candidate.imageinfo?.[0];
    if (!info) continue;
    const metadata = info.extmetadata || {};
    const license = text(metadata.LicenseShortName?.value);
    const licenseUrl = text(metadata.LicenseUrl?.value);
    const artist = text(metadata.Artist?.value);
    if (
      !/^(?:Public domain|CC0|CC BY(?:-SA)?(?: [0-9.]+)?)$/i.test(license) ||
      text(metadata.Restrictions?.value)
    )
      continue;
    if (
      license.startsWith('CC BY') &&
      (!artist || !/^https:\/\/creativecommons\.org\//.test(licenseUrl))
    )
      continue;
    const imageUrl = new URL(String(info.thumburl || info.url || ''));
    const sourceUrl = String(info.descriptionurl || '');
    if (
      imageUrl.protocol !== 'https:' ||
      imageUrl.hostname !== 'upload.wikimedia.org' ||
      imageUrl.username ||
      imageUrl.password ||
      imageUrl.port
    )
      continue;
    if (!sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:')) continue;
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(info.mime) ||
      Number(info.thumbwidth || info.width) < 400
    )
      continue;
    const source = [artist, license, licenseUrl, sourceUrl].filter(Boolean).join(' · ');
    if (source.length > 1500) continue;
    const rawImage = await fetcher(imageUrl, {
      headers: HEADERS,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!/^image\/(jpeg|png|webp)/.test(rawImage.headers.get('content-type') || '')) continue;
    const image = await boundedBody(rawImage, 4_000_000);
    const { data, info: size } = await sharp(image, { limitInputPixels: 16_000_000 })
      .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > 1_500_000 || size.width < 400 || size.height < 150) continue;
    return {
      id: 'commons_' + createHash('sha256').update(data).digest('hex').slice(0, 20),
      src: 'data:image/jpeg;base64,' + data.toString('base64'),
      source,
      alt: text(candidate.title)
        .replace(/^File:/, '')
        .slice(0, 240),
      width: size.width,
      height: size.height,
    };
  }
  return null;
}

export async function searchNasaCoursewareImage(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<CoursewareAsset | null> {
  const normalized = query.trim();
  if (normalized.length < 3 || normalized.length > 100 || /https?:|@|[\r\n]/.test(normalized))
    throw new Error('Use short public topic queries');
  const url = new URL('https://images-api.nasa.gov/search');
  url.search = new URLSearchParams({
    q: normalized,
    media_type: 'image',
    page_size: '8',
  }).toString();
  const response = await fetcher(url, {
    headers: HEADERS,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  const result = JSON.parse((await boundedBody(response, 300000)).toString('utf8'));
  for (const item of result.collection?.items || []) {
    const metadata = item.data?.[0];
    if (!metadata?.nasa_id || metadata.media_type !== 'image' || !metadata.center) continue;
    const description = text(metadata.description);
    const creator = text(metadata.secondary_creator || metadata.photographer);
    if (
      !/^(ARC|AFRC|GRC|GSFC|HQ|JPL|JSC|KSC|LaRC|MSFC|SSC|NASA)$/i.test(text(metadata.center)) ||
      String(metadata.nasa_id).length > 180 ||
      creator.length > 180
    )
      continue;
    if (
      /©|copyright|all rights reserved|getty|alamy|shutterstock/i.test(description + ' ' + creator)
    )
      continue;
    if (creator && !/^(NASA|JPL|GSFC|Goddard|Scientific Visualization Studio)/i.test(creator))
      continue;
    let imageUrl: URL;
    try {
      imageUrl = new URL(
        item.links?.find((link: Record<string, unknown>) => link.rel === 'preview')?.href,
      );
    } catch {
      continue;
    }
    if (
      imageUrl.protocol !== 'https:' ||
      imageUrl.hostname !== 'images-assets.nasa.gov' ||
      imageUrl.username ||
      imageUrl.password ||
      imageUrl.port
    )
      continue;
    const response = await fetcher(imageUrl, {
      headers: HEADERS,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!/^image\/(jpeg|png|webp)/.test(response.headers.get('content-type') || '')) continue;
    const bytes = await boundedBody(response, 4_000_000);
    const image = await sharp(bytes, { limitInputPixels: 16_000_000 })
      .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (image.info.width < 400 || image.info.height < 150 || image.data.length > 1_500_000)
      continue;
    return {
      id: 'nasa_' + createHash('sha256').update(image.data).digest('hex').slice(0, 20),
      src: 'data:image/jpeg;base64,' + image.data.toString('base64'),
      width: image.info.width,
      height: image.info.height,
      alt: (text(metadata.title) + ' — ' + description).slice(0, 240),
      source: `真实素材：NASA/${text(metadata.center)}${creator ? ' · ' + creator : ''} · https://images.nasa.gov/details/${encodeURIComponent(metadata.nasa_id)} · https://www.nasa.gov/nasa-brand-center/images-and-media/ · 教学用途；课件由AI生成，NASA未审阅或背书本课件。`,
    };
  }
  return null;
}

export async function searchCoursewareImage(
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<CoursewareAsset | null> {
  try {
    const commons = await searchCommonsCoursewareImage(query, fetcher);
    if (commons) return commons;
  } catch (error) {
    if (!(error instanceof TypeError) && (error as Error).name !== 'TimeoutError') throw error;
  }
  return searchNasaCoursewareImage(query, fetcher);
}
