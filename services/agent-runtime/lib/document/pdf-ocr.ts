import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_OCR_PAGES = 200;

/** Read scanned PDF pages locally when the normal text extractor finds no text layer. */
export async function ocrScannedPdf(buffer: Buffer): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aisecedu-pdf-ocr-'));
  try {
    const pdfPath = path.join(directory, 'source.pdf');
    await writeFile(pdfPath, buffer, { mode: 0o600 });
    const { stdout: info } = await execFileAsync('pdfinfo', [pdfPath], {
      timeout: 15_000,
      maxBuffer: 256_000,
    });
    const pages = Number(/^Pages:\s*(\d+)\s*$/im.exec(info)?.[1]);
    if (!Number.isInteger(pages) || pages < 1) throw new Error('PDF page count is unavailable');
    if (pages > MAX_OCR_PAGES) {
      throw new Error(`Scanned PDF has ${pages} pages; split it into files of at most ${MAX_OCR_PAGES} pages for OCR`);
    }

    const prefix = path.join(directory, 'page');
    await execFileAsync('pdftoppm', [
      '-f', '1', '-l', String(pages), '-scale-to', '1800', '-gray', '-png', pdfPath, prefix,
    ], { timeout: 240_000, maxBuffer: 256_000 });
    const images = (await readdir(directory))
      .filter((name) => /^page-\d+\.png$/u.test(name))
      .sort();
    if (images.length !== pages) throw new Error('PDF OCR rendering did not produce every page');

    const recognized = new Array<string>(pages);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, pages) }, async () => {
      while (cursor < pages) {
        const index = cursor++;
        const { stdout } = await execFileAsync(
          'tesseract',
          [path.join(directory, images[index]), 'stdout', '-l', 'chi_sim+eng'],
          { timeout: 90_000, maxBuffer: 2_000_000 },
        );
        recognized[index] = stdout.trim();
      }
    });
    await Promise.all(workers);
    if (!recognized.some((text) => text)) throw new Error('Scanned PDF OCR found no readable text');
    return recognized.map((text, index) => `第 ${index + 1} 页\n${text}`).join('\n\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
