# OpenClash Guard UCI runtime overlay contract

This document defines the hand-off between the native LuCI configuration model and the signed OpenClash Guard runtime.

The contract is intentionally split from runtime wiring. The current release line already has a signed sequence-6 candidate pending in #98, so this preparatory change must not alter `dist/openclash-guard.sh`, runtime policy bytes, release metadata, or detached signatures.

## REUSE

- `/etc/config/openclash_guard` from `luci-app-openclash-guard` remains the single local operator configuration store.
- The existing signed runtime JSON remains authoritative for service classes, allowed regions/capabilities, nft ownership, protected UDP ports, and fail-mode semantics.
- The existing Region Registry remains the source of valid region IDs.
- Current runtime-effective UCI controls remain unchanged: Guard enablement, global kill switch, router DNS kill switch, scoped UDP enablement, and explicit scoped UDP source IPs.

## EXTEND

`internal/config/openclash-guard/uci-runtime-contract.json` is the machine-readable schema for the next runtime integration release.

It classifies every LuCI UCI option by:

- data type and default;
- whether it is already runtime-effective, intended for the next release, or LuCI-only;
- which authority gates it (`uci-runtime`, `signed-policy-gated`, `live-capability-gated`, and so on);
- enum values shared by LuCI and future runtime parsing.

CI verifies that the packaged UCI defaults and LuCI enum choices do not drift from this contract.

## NEW trust rules

The UCI overlay is local intent, not a second policy authority.

1. UCI must never widen a capability denied by signed runtime policy.
2. A service request for `direct` must still satisfy the signed service/protection-class rules and region constraints.
3. Local direct rules and remote direct-rule sources must not bypass protected-service policy or global fail-closed state.
4. `dns.fail_closed=0` cannot lower a fail-closed floor required by signed policy.
5. DNS backend and resolver-sync preferences remain gated by observed live capabilities.
6. Invalid known runtime values reject reconciliation instead of silently falling back to a weaker behavior.
7. Unknown options are ignored for forward compatibility; they do not become runtime inputs without a contract update.
8. Monitoring settings remain owned by the LuCI/procd monitor and are not Guard core policy.

## Release sequencing

Runtime wiring is deliberately deferred. After the authenticated sequence-6 diagnostics release becomes the `main` baseline, the next Guard release can consume this contract while advancing the release sequence once. That release should:

- add one shared UCI overlay reader/validator instead of scattering `uci get` calls through policy modules;
- normalize validated values into runtime state once per reconcile;
- keep signed JSON as the capability ceiling/floor;
- expose validation failures through `status --json` and `doctor`;
- add fixture tests for malformed booleans, enums, region IDs, URLs, IP lists, and attempted policy widening;
- regenerate and sign the resulting Guard bundle through the protected release chain.

Until that release lands, entries marked `next-release` are configuration intent only.
