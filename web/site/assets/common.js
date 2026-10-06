/**
 * Network Ops Core - Shared Utilities
 */

export function fmt(n) {
  return new Intl.NumberFormat('en-US').format(n || 0);
}

export function safeUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return null;
  const trimmed = url.trim();
  // Fail closed: reject (never strip) embedded C0/C1 control characters.
  // Stripping can turn an invalid string into a different, valid-looking URL.
  if (/[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    // Return the canonical form the parser validated, not the raw input.
    const href = parsed.href;
    return href.length > 2048 ? null : href;
  } catch {
    return null;
  }
}

export function isIPv4(input) {
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed.length > 15) return false;
  const parts = trimmed.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^(0|[1-9]\d*)$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}

export function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0) >>> 0;
}

export function parseCidrLine(line) {
  const match = line.match(/(\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2})/);
  return match ? match[1] : null;
}

export function cidrContains(ipInt, cidr) {
  const [base, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32 || !isIPv4(base)) {
    return false;
  }
  const baseInt = ipv4ToInt(base);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function buildSkippedReason(asset) {
  if (asset.asset_class === 'mixed') return 'mixed_not_enabled';
  if (asset.asset_class === 'domain') return 'domain_only_asset';
  return 'unsupported_type';
}
