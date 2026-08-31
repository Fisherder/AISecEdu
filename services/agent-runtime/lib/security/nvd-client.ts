import { createLogger } from '@/lib/logger';

const log = createLogger('NVDClient');
const NVD_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface NvdCacheEntry {
  fetchedAt: number;
  data: { id: string; desc: string; cvss: number | null; severity: string | null; refs: string[] } | null;
}

const memoryCache = new Map<string, NvdCacheEntry>();

/** Fetch a CVE from NVD API (with memory cache, 24h TTL). Returns null on error. */
export async function fetchCveFromNvd(cveId: string): Promise<{
  id: string;
  desc: string;
  cvss: number | null;
  severity: string | null;
  refs: string[];
} | null> {
  const id = cveId.toUpperCase();

  // Check cache
  const cached = memoryCache.get(id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `${NVD_BASE}?cveId=${id}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      log.warn(`NVD API returned ${res.status} for ${id}`);
      memoryCache.set(id, { fetchedAt: Date.now(), data: null });
      return null;
    }
    const json = await res.json();
    const vuln = json.vulnerabilities?.[0]?.cve;
    if (!vuln) {
      memoryCache.set(id, { fetchedAt: Date.now(), data: null });
      return null;
    }

    // Extract English description (prefer translated zh if available)
    const descEn = vuln.descriptions?.find((d: { lang: string }) => d.lang === 'en')?.value || '';
    const metrics = vuln.metrics?.cvssMetricV31?.[0] || vuln.metrics?.cvssMetricV2?.[0];
    const cvss = metrics?.cvssData?.baseScore ?? null;
    const severity = metrics?.cvssData?.baseSeverity ?? null;
    const refs = (vuln.references || []).slice(0, 3).map((r: { url: string }) => r.url);

    const data = { id, desc: descEn, cvss, severity, refs };
    memoryCache.set(id, { fetchedAt: Date.now(), data });
    return data;
  } catch (e) {
    log.warn(`NVD fetch failed for ${id}:`, e instanceof Error ? e.message : String(e));
    memoryCache.set(id, { fetchedAt: Date.now(), data: null });
    return null;
  }
}

/** Fetch multiple CVEs in parallel (respects NVD rate limits). */
export async function fetchCvesFromNvd(cveIds: string[]): Promise<NonNullable<Awaited<ReturnType<typeof fetchCveFromNvd>>>[]> {
  const results = await Promise.all(cveIds.map((id) => fetchCveFromNvd(id)));
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}
