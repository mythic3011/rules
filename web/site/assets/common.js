/**
 * Network Ops Core - Shared Utilities
 */

export function fmt(n) {
  return new Intl.NumberFormat('en-US').format(n || 0);
}

export function safeUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (/[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function isIPv4(input) {
  const parts = input.trim().split('.');
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d+$/.test(part) &&
        (part === '0' || !part.startsWith('0')) &&
        Number(part) >= 0 &&
        Number(part) <= 255
    )
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
