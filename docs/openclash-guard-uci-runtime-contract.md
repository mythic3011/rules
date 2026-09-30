# OpenClash Guard UCI runtime overlay contract

This document defines the hand-off between the native LuCI configuration model and the signed OpenClash Guard runtime.

The contract was originally drafted as a preparatory (unwired) slice pending the authenticated sequence-6 candidate (#98). Sequence 7 has since **landed the production wiring**: `dist/openclash-guard.sh` has been regenerated to include both overlay modules and `dist/manifest.json`/`dist/openclash-guard.sha256` have been refreshed. Runtime policy bytes are unchanged. Critically, the sequence-7 candidate is **published unsigned** — `dist/manifest.json` deliberately carries no `releaseSignature` and no `dist/openclash-guard.sig` exists yet; signing is deferred to the protected release-signing chain (`.github/workflows/sign-openclash-guard-release.yml`) which consumes a verified generator run.

## REUSE

- `/etc/config/openclash_guard` from `luci-app-openclash-guard` remains the single local operator configuration store.
- The existing signed runtime JSON remains authoritative for service classes, allowed regions/capabilities, nft ownership, protected UDP ports, and fail-mode semantics.
- The existing Region Registry remains the source of valid region IDs. `regions` is the full observation catalog; `primaryOrder` is the routable proxy-exit set.
- Current runtime-effective UCI controls remain unchanged: Guard enablement, global kill switch, router DNS kill switch, scoped UDP enablement, and explicit scoped UDP source IPs.

## EXTEND

`internal/config/openclash-guard/uci-runtime-contract.json` is the machine-readable schema for the next runtime integration release.

It classifies every LuCI UCI option by:

- data type and default;
- whether it is already runtime-effective, intended for the next release, or LuCI-only;
- which authority gates it (`uci-runtime`, `signed-policy-gated`, `live-capability-gated`, and so on);
- enum values shared by LuCI and future runtime parsing;
- region scope where a region reference is used.

`routing.direct_region` may reference the full Region Registry because it describes the expected direct/WAN egress region. `routing.proxy_region` must reference `primaryOrder`, because only those IDs correspond to generated routable proxy exits.

CI verifies that the packaged UCI defaults and LuCI enum choices do not drift from this contract, and that proxy-region defaults remain inside the routable set.

## NEW trust rules

The UCI overlay is local intent, not a second policy authority.

1. UCI must never widen a capability denied by signed runtime policy.
2. A service request for `direct` must still satisfy the signed service/protection-class rules and region constraints.
3. Local direct rules and remote direct-rule sources must not bypass protected-service policy or global fail-closed state.
4. `dns.fail_closed=0` cannot lower a fail-closed floor required by signed policy.
5. DNS backend and resolver-sync preferences remain gated by observed live capabilities.
6. Invalid known runtime values reject reconciliation instead of silently falling back to a weaker behavior.
7. Unknown options are ignored for forward compatibility but reported as ignored configuration; they do not become runtime inputs without a contract update.
8. Monitoring settings remain owned by the LuCI/procd monitor and are not Guard core policy.

## Release sequencing

Sequence 7 has landed the runtime wiring of this contract. The following commitments from the draft are now in effect:

- one shared UCI overlay reader/validator (`shell/apps/openclash-guard/uci-overlay.sh`) instead of scattered `uci get` calls through policy modules — added;
- normalized validated values resolved into runtime state once per reconcile (`_guard_prepare()` runs `guard_uci_overlay_load` + `guard_uci_overlay_resolve`) — done;
- signed JSON kept as the capability ceiling/floor (Layer B never widens signed policy) — done;
- invalid values and ignored unknown options surfaced through `status --json` (`guard_status_json_extra`) and `doctor` — done;
- fixture tests for malformed booleans, enums, region IDs, URLs, IP lists, and attempted policy widening — done;
- regenerated `dist/openclash-guard.sh` — done; the resulting Guard bundle is published as an **unsigned** seq7 candidate with `releaseSignature` intentionally absent, to be signed by the protected release chain.

The remaining follow-up (consumer thin-migration of legacy `uci get` callers to `guard_uci_overlay_effective`) is additive cleanup and does not block the atomicity guarantees already in force.
