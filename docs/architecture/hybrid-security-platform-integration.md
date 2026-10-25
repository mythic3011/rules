# Hybrid security integration boundaries

**Status:** Proposal only. This note defines no API, platform commitment, or security guarantee.

## What this repository owns

This repository generates OpenClash/Mihomo profiles and runs OpenClash Guard on a router. Guard owns its local routing policy and firewall objects. The optional Profile Service creates subscription templates and converts proxy input; it is not a fleet controller or packet enforcer.

Sequence 7 is an unsigned candidate. Its UCI overlay parser/resolver and scoped runtime integration remain subject to the [UCI authority contract](../../internal/config/openclash-guard/uci-overlay-resolution.json), including its deferred gates. Source code, tests, and generated bundles do not prove that a router is enforcing the policy.

The firewall proof in [`ai-routing-firewall-proof.md`](../ai-routing-firewall-proof.md) is hermetic. It does not prove live nftables/fw4 behavior, boot-race safety, or protected egress on a router or endpoint.

## Proposed boundaries

- Signed local Guard policy remains the authority for router enforcement. A future service or endpoint may propose policy, but cannot widen that local floor.
- Browser UI and profile conversion are clients. They cannot claim OS firewall control or verify packet enforcement.
- Keep routing intent, DNS observations, device identity, and threat evidence as separate data. A shared CDN address or missing DNS observation is not proof that a particular application owns the flow.
- Preserve `unknown`, stale, and unavailable observations. Never report protected egress solely because a device is enrolled, a build succeeded, or a controller replied.
- If approved protected transport is unavailable, the proposed policy blocks protected traffic; it never silently falls back to direct WAN. Explicitly allowed direct traffic remains a separate policy choice.

Names such as `VPN_REQUIRED`, `DIRECT_ALLOWED`, `BLOCK`, and `UNKNOWN` are proposal vocabulary only. They are not fields in the current Guard runtime schema. Do not map them onto existing service or protection classes without a separately reviewed contract.

## Before implementing an adapter

1. Define a versioned contract with a read-only capability/status phase. Treat missing or stale evidence as unknown.
2. Preserve the Guard's signed policy floor and reject conflicts before changing firewall state.
3. Test failure cases in isolated router and endpoint environments, including tunnel and DNS loss, shared-CDN addresses, reboot, interrupted apply, and IPv4/IPv6.
4. Require platform-specific dataplane evidence before reporting protection as verified. A firmware build or browser status is not enforcement proof.

Any controller, endpoint agent, browser companion, telemetry service, or learning system described here is future work. This RFC does not select a host repository or authorize deployment. Keep implementation and release changes in separate reviewed work.

## Repository constraints

Keep `cfg/`, `rule/`, and `dns/` as stable public artifacts. Change generated files through their sources under `internal/config/` and the generators. Preserve the `.ini` subscription contract at `/p/<token>.ini` and the signed Guard release process.

For repository changes, run `mise run check`. For TypeScript routing changes, run `make bootstrap` and `mise run check-all`.
