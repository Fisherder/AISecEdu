import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditLabSolvability, ensureLabSolvability } from '@/lib/security/lab-solvability';

const EXPECTED_HASH = '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881';

function labWithHiddenHash(): string {
  return `<!doctype html>
  <html><body>
    <label for="malwareHash">恶意程序的 Hash 值</label>
    <input id="malwareHash" data-graded-input placeholder="填写 SHA-256">
    <button onclick="checkAnswer()">验证并完成</button>
    <div id="result">完成后显示 FLAG</div>
    <script>
      const expectedHash = '${EXPECTED_HASH}';
      function checkAnswer() {
        if (document.getElementById('malwareHash').value === expectedHash) {
          document.getElementById('result').textContent = 'FLAG{done}';
        }
      }
    </script>
  </body></html>`;
}

describe('lab solvability audit', () => {
  it('detects a hash answer that exists only inside checker JavaScript', () => {
    const report = auditLabSolvability(labWithHiddenHash());

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_HASH_EVIDENCE', severity: 'error' }),
      ]),
    );
  });

  it('surfaces the exact checker value in a learner-visible evidence card', () => {
    const result = ensureLabSolvability(labWithHiddenHash());

    expect(result.report.passed).toBe(true);
    expect(result.report.autoRepaired).toBe(true);
    expect(result.report.repairs.join('')).toContain('Hash');
    expect(result.html).toContain('<details open id="openmaic-solvability-hash-evidence"');
    expect(result.html).toContain('data-openmaic-solvability-repair="missing-hash-evidence"');
    expect(result.html).toContain(EXPECTED_HASH);
    expect(auditLabSolvability(result.html).passed).toBe(true);
  });

  it('is idempotent when an already repaired lab is checked again', () => {
    const once = ensureLabSolvability(labWithHiddenHash());
    const twice = ensureLabSolvability(once.html);

    expect(twice.html).toBe(once.html);
    expect(twice.report.autoRepaired).toBe(false);
    expect(twice.report.passed).toBe(true);
  });

  it('flags a broken declarative answer-source link', () => {
    const report = auditLabSolvability(`
      <html><body>
        <input id="answer" data-graded-input data-answer-source="missing-evidence">
        <button>验证完成</button>
      </body></html>
    `);

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: 'BROKEN_ANSWER_SOURCE', field: 'answer' }),
    );
  });

  it('accepts the canonical ransomware lab because its displayed hash and checker agree', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'lib/security/templates/ransomware-simulation-lab.html'),
      'utf8',
    );
    const report = auditLabSolvability(html);

    expect(report.passed).toBe(true);
    expect(report.stats.hashInputs).toBeGreaterThanOrEqual(1);
    expect(report.stats.visibleHashValues).toBeGreaterThanOrEqual(1);
    expect(html.match(new RegExp(EXPECTED_HASH, 'g'))).toHaveLength(2);
  });
});
