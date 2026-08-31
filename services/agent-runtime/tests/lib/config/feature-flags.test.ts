import { describe, it, expect } from 'vitest';
import { resolveVocationalActive } from '@/lib/config/feature-flags';

describe('resolveVocationalActive', () => {
  it('is active for cybersecurity subject profile', () => {
    expect(resolveVocationalActive({ subjectProfile: 'cybersecurity' })).toBe(true);
  });

  it('is inactive without subject profile or task engine', () => {
    expect(resolveVocationalActive({})).toBe(false);
    expect(resolveVocationalActive(null)).toBe(false);
  });
});
