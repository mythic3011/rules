/**
 * Network Ops Core - Shared Utilities
 */

const URL_CONTROL_RE = /[\u0000-\u001F\u007F-\u009F]/;

export function fmt(n) {
  return new Intl.NumberFormat('en-US').format(n || 0);
}

export function safeUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return null;
  const trimmed = url.trim();
  // Fail closed: reject (never strip) embedded C0/C1 control characters.
  // Stripping can turn an invalid string into a different, valid-looking URL.
  if (URL_CONTROL_RE.test(trimmed)) return null;
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

const RULE_ASSET_PATH_RE =
  /^(?:dns|rule)\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const REPORT_CATEGORY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;

function resolveSiteFile(relativePath, pageUrl, allowedDirectory) {
  if (
    typeof pageUrl !== 'string' ||
    pageUrl.length > 4096 ||
    pageUrl.trim() !== pageUrl ||
    URL_CONTROL_RE.test(pageUrl)
  ) {
    return null;
  }

  try {
    const page = new URL(pageUrl);
    if ((page.protocol !== 'http:' && page.protocol !== 'https:') || page.username || page.password) {
      return null;
    }

    const siteRoot = new URL('./', page);
    const resolved = new URL(relativePath, siteRoot);
    const directoryPrefix = `${siteRoot.pathname}${allowedDirectory}/`;
    if (
      resolved.origin !== siteRoot.origin ||
      !resolved.pathname.startsWith(directoryPrefix) ||
      resolved.search ||
      resolved.hash
    ) {
      return null;
    }

    return resolved.href;
  } catch {
    return null;
  }
}

/** Resolve inventory paths only within the published dns/ and rule/ asset directories. */
export function resolveRuleAssetUrl(assetPath, pageUrl) {
  if (
    typeof assetPath !== 'string' ||
    assetPath.length > 512 ||
    URL_CONTROL_RE.test(assetPath) ||
    !RULE_ASSET_PATH_RE.test(assetPath)
  ) {
    return null;
  }
  const assetDirectory = assetPath.slice(0, assetPath.indexOf('/'));
  return resolveSiteFile(assetPath, pageUrl, assetDirectory);
}

/** Accept report category slugs and resolve them beneath the published reports directory. */
export function resolveReportSummaryUrl(category, pageUrl) {
  if (
    typeof category !== 'string' ||
    URL_CONTROL_RE.test(category) ||
    !REPORT_CATEGORY_RE.test(category)
  ) {
    return null;
  }
  return resolveSiteFile(`reports/${category}.summary.json`, pageUrl, 'reports');
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
