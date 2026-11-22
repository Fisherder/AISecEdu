export function containsRestrictedTeachingSecret(value: string): boolean {
  return /\bflag\s*\{|pwn\.college\s*\{|-----BEGIN [^-]+ KEY-----|\bBearer\s+\S+/iu.test(value);
}

export function isOrdinaryTeachingProse(value: string): boolean {
  return (
    !containsRestrictedTeachingSecret(value) &&
    !/<\/?[a-z][^<>]*>|<!--|<!doctype\b|`{3,}|~{3,}|Traceback \(most recent call last\)|攻击复现|漏洞利用复现|实战攻击步骤|执行攻击载荷|利用载荷|终端日志|命令输出/iu.test(value)
  );
}
