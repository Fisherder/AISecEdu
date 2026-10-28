import {createCipheriv, createDecipheriv, createHash, createHmac} from 'node:crypto';

const pow = (base, exponent, modulus) => {
  let value = 1n;
  for (let e = exponent, b = base % modulus; e > 0n; e >>= 1n, b = b * b % modulus)
    if (e & 1n) value = value * b % modulus;
  return value;
};
const inverse = (value, modulus) => {
  let a = value, b = modulus, x = 1n, y = 0n;
  while (b) { const q = a / b; [a, b] = [b, a % b]; [x, y] = [y, x - q * y]; }
  if (a !== 1n) throw Error('Invalid oracle input');
  return (x % modulus + modulus) % modulus;
};

export function teachingDemoExpected(profile, inputs) {
  if (profile === 'rsa') {
    const p = BigInt(inputs.p), q = BigInt(inputs.q), e = BigInt(inputs.e), message = BigInt(inputs.message);
    const n = p * q, phi = (p - 1n) * (q - 1n), d = inverse(e, phi), ciphertext = pow(message, e, n);
    return Object.fromEntries(Object.entries({n, phi, d, ciphertext, recovered: pow(ciphertext, d, n)}).map(([key, value]) => [key, String(value)]));
  }
  if (profile === 'dh') {
    const {p, g, a, b} = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, BigInt(value)]));
    const A = pow(g, a, p), B = pow(g, b, p);
    return {A: String(A), B: String(B), aliceSecret: String(pow(B, a, p)), bobSecret: String(pow(A, b, p))};
  }
  if (profile === 'aes-128') {
    const cipher = createCipheriv('aes-128-ecb', Buffer.from(inputs.key, 'hex'), null);
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(inputs.plaintext, 'hex')), cipher.final()]);
    const decipher = createDecipheriv('aes-128-ecb', Buffer.from(inputs.key, 'hex'), null);
    decipher.setAutoPadding(false);
    return {ciphertext: encrypted.toString('hex'), recovered: Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('hex')};
  }
  if (profile === 'sha256') return {digest: createHash('sha256').update(inputs.message, 'utf8').digest('hex')};
  if (profile === 'hmac-sha256') return {tag: createHmac('sha256', Buffer.from(inputs.keyHex, 'hex')).update(inputs.message, 'utf8').digest('hex')};
  throw Error('Unsupported teaching demo profile');
}

export function teachingDemoCases(profile) {
  if (profile === 'rsa') {
    const base = {p: '61', q: '53', e: '17', message: '65'};
    return {valid: [base, {...base, message: '42'}, {...base, message: '0'}, {...base, message: '1'},
      {...base, message: '53'}, {p: '11', q: '13', e: '7', message: '42'}],
    invalid: [{...base, q: '61'}, {...base, e: '2'}, {...base, message: '3233'}]};
  }
  if (profile === 'dh') {
    const base = {p: '23', g: '5', a: '6', b: '15'};
    return {valid: [base, {...base, a: '7'}, {...base, a: '1'}, {...base, b: '1'}],
      invalid: [{...base, p: '21'}, {...base, a: '23'}, {...base, g: '1'}]};
  }
  if (profile === 'aes-128') {
    const base = {key: '000102030405060708090a0b0c0d0e0f', plaintext: '00112233445566778899aabbccddeeff'};
    return {valid: [base, {...base, plaintext: '01' + base.plaintext.slice(2)},
      {key: '00'.repeat(16), plaintext: '00'.repeat(16)}, {key: 'ff'.repeat(16), plaintext: 'ff'.repeat(16)}],
      invalid: [{...base, key: '00'}, {...base, plaintext: 'zz'.repeat(16)}]};
  }
  if (profile === 'sha256') return {valid: [{message: 'abc'}, {message: 'abd'}, {message: ''}, {message: '密码学 🔐'}], invalid: []};
  if (profile === 'hmac-sha256') {
    const base = {keyHex: '0b'.repeat(20), message: 'Hi There'};
    return {valid: [base, {...base, message: 'Hi There!'}, {...base, message: ''},
      {keyHex: 'aa'.repeat(80), message: '密码学 🔐'}], invalid: [{...base, keyHex: 'zz'}, {...base, keyHex: 'a'}]};
  }
  throw Error('Unsupported teaching demo profile');
}
