export function fmt(value?: number | bigint | null): string;
export function safeUrl(value: unknown): string | null;
export function isIPv4(value: unknown): value is string;
export function ipv4ToInt(ip: string): number;
export function parseCidrLine(line: string): string | null;
export function cidrContains(ipInt: number, cidr: string): boolean;
export function buildSkippedReason(asset: { asset_class?: string }):
  "mixed_not_enabled" | "domain_only_asset" | "unsupported_type";
