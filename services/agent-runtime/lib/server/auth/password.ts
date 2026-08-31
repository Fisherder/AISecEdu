/**
 * Password hashing using Node.js built-in scrypt.
 * No external dependencies (no bcrypt needed).
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/** Hash a password with a random salt. Returns `salt:hash` (both hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Verify a password against a stored `salt:hash` string. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const testHash = scryptSync(password, salt, 64);
  const storedHash = Buffer.from(hash, 'hex');
  return testHash.length === storedHash.length && timingSafeEqual(testHash, storedHash);
}
