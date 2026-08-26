/**
 * Compatibility surface for the read-only proof boundary. Permit creation is
 * intentionally implemented inside firewall-proof.ts, beside its opaque brand.
 */
export {
  FirewallProofAdapter,
  FirewallProofAdapterError,
} from "./firewall-proof.js";
export type {
  FirewallEvidenceSource,
  FirewallProofClock,
} from "./firewall-proof.js";
