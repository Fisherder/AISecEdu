import type { VisualGenerationIntent } from '@/lib/cinematic/capabilities';

export type TeachingDemoProfileId = 'rsa' | 'dh' | 'aes-128' | 'sha256' | 'hmac-sha256';
export type TeachingDemoProfile = {
  id: TeachingDemoProfileId;
  title: string;
  inputs: Record<string, string>;
  outputs: string[];
  requirements: string;
};

const profiles: TeachingDemoProfile[] = [
  {id: 'rsa', title: 'RSA 密钥生成与加解密',
    inputs: {p: '61', q: '53', e: '17', message: '65'},
    outputs: ['n', 'phi', 'd', 'ciphertext', 'recovered'],
    requirements: '以 BigInt 实现模幂与扩展欧几里得求逆。检查不同素数、1<e<phi、互素和0<=message<n；输入长度最多6位。展示参数依赖、公私钥与消息路径。教材样例 n=3233,phi=3120,d=2753,ciphertext=2790,recovered=65。实验只改变message；包含0、1及无效输入，不将错误密钥偶然还原判为数学不可能。小参数与裸RSA只作教学，说明OAEP与混合加密。'},
  {id: 'dh', title: 'Diffie–Hellman 密钥交换',
    inputs: {p: '23', g: '5', a: '6', b: '15'}, outputs: ['A', 'B', 'aliceSecret', 'bobSecret'],
    requirements: '以BigInt实现模幂，教学素数p最多4位，2<=g<p，1<=a,b<p。展示双方本地秘密与公开消息交换；默认 A=8,B=19,aliceSecret=bobSecret=2。实验只改变a并真实重算双方。明确原始DH不认证身份、不直接加密消息，共享秘密须经KDF，小群不用于实际安全。'},
  {id: 'aes-128', title: 'AES-128 分组加解密',
    inputs: {key: '000102030405060708090a0b0c0d0e0f', plaintext: '00112233445566778899aabbccddeeff'},
    outputs: ['ciphertext', 'recovered'],
    requirements: '实现完整AES-128和逆变换，不依赖crypto.subtle；输入为32个十六进制字符。状态列优先，10轮，末轮没有MixColumns；显示实际轮密钥及中间矩阵。默认密文69c4e0d86a7b0430d8cdb78070b4c55a，解密恢复原分组。实验只翻转明文一位。不要把一次位差称为安全性证明；区分分组密码、模式与认证。'},
  {id: 'sha256', title: 'SHA-256 消息摘要', inputs: {message: 'abc'}, outputs: ['digest'],
    requirements: '实现完整SHA-256，UTF-8编码、512位分组、大端长度、32位无符号运算；不依赖crypto.subtle。显示填充、消息扩展、压缩和链接状态，结果为小写十六进制。abc摘要ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad。实验只改message，包含空串和中文。哈希不可逆，不自动提供身份认证。'},
  {id: 'hmac-sha256', title: 'HMAC-SHA256 消息认证',
    inputs: {keyHex: '0b'.repeat(20), message: 'Hi There'}, outputs: ['tag'],
    requirements: '实现完整SHA-256与HMAC；keyHex为偶数个十六进制字符，最多256字节。块长64字节，长密钥先哈希，短密钥补零，内层摘要按字节进入外层；不依赖crypto.subtle。默认tag=b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7。展示内外层真实数据。实验只改message，保留基准标签展示验证失败；说明认证不隐藏消息。'},
];

export function teachingDemoProfile(id: string): TeachingDemoProfile | undefined {
  return profiles.find(profile => profile.id === id);
}

function requiresOaepGeneration(request: string) {
  return request.split(/[。；\n]/).some(clause => {
    if (!/\bOAEP\b/i.test(clause)) return false;
    if (/RSA-OAEP|(?:实现|计算|编码|解码|演示|交互).{0,18}OAEP|OAEP.{0,18}(?:实现|计算|编码|解码|加解密|加密|解密|演示)/i.test(clause)) return true;
    return !/(?:实际|真实|安全|边界).{0,100}(?:需要|需|必须|应|配合|采用|使用).{0,80}OAEP/i.test(clause);
  });
}

export function selectTeachingDemoProfile(request: string, intent: VisualGenerationIntent, mode = process.env.AISECEDU_TEACHING_DEMO_ENGINE): TeachingDemoProfile | undefined {
  if (mode !== 'html-v1' || intent.mode !== 'interactive-2d' || intent.twoDimensionalFormat !== 'simulation') return;
  if (/签名|椭圆|ECDSA|ECDH|RSA-PSS|AES-?(?:192|256)|SHA-?(?:1|224|384|512)|MD[245]|SHA-?3|SHAKE|SM[234]|BLAKE|\b(?:DES|CBC|GCM|CTR|CFB|OFB)\b|Feistel/i.test(request)) return;
  if (requiresOaepGeneration(request)) return;
  const matches: TeachingDemoProfileId[] = [];
  if (/\bRSA\b/i.test(request)) matches.push('rsa');
  if (/Diffie|Hellman|\bDH\b|迪菲/i.test(request)) matches.push('dh');
  if (/\bAES(?:-?128)?\b|高级加密标准/i.test(request)) matches.push('aes-128');
  if (/HMAC/i.test(request)) matches.push('hmac-sha256');
  else if (/SHA-?256|哈希|散列|摘要/i.test(request)) matches.push('sha256');
  return matches.length === 1 ? teachingDemoProfile(matches[0]) : undefined;
}
