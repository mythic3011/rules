# OpenClash Guard UCI overlay integration

The current shell source uses one normalized Guard UCI snapshot for each prepared reconcile or status operation. The snapshot carries operator intent; Layer B computes candidate effective values only where an authoritative signed-policy or live-capability gate exists. Its routing and DNS results are currently preview-only because the policy and DNS renderers do not consume them. See the [runtime contract](openclash-guard-uci-runtime-contract.md), [`uci-runtime-contract.json`](../internal/config/openclash-guard/uci-runtime-contract.json), and [`uci-overlay-resolution.json`](../internal/config/openclash-guard/uci-overlay-resolution.json).

## Candidate status

Source wiring is present in the unsigned sequence-7 candidate. Source wiring and generated bundles do not establish a signed release, deployment, or live enforcement. [Issue #124](https://github.com/mythic3011/rules/issues/124) tracks the remaining runtime consumers and release qualification.

## Runtime flow

```text
Guard UCI read and validation (Layer A)
                 ↓
authoritative signed-policy load
                 ↓
runtime environment and DNS observation
                 ↓
authority calculation (Layer B; route/DNS results are preview-only)
                 ↓
geo/state preparation and current-snapshot validity gate
                 ↓
                 nft mutation
```

Reconcile validates known UCI values before any nft mutation. It loads the policy through `guard_policy_load()`, collects the live DNS backend observation, then calculates only the documented gates. If the overlay is invalid or resolution cannot complete, preparation refuses and leaves the existing nft table in place. The normalized values currently consumed by runtime are `main.enabled`, `main.kill_switch`, and `main.dns_kill_switch`. Layer B also calculates route-mode, fail-closed, and DNS-backend results, but current policy and DNS renderers do not consume them; they are preview-only and do not constitute completed end-to-end #124 integration.

Runtime consumers use `guard_uci_overlay_ensure_loaded()` so they reuse one snapshot during a preparation. `guard_preflight_run()` explicitly loads one fresh snapshot at preparation start, then installer validation reuses it. An explicit `guard_uci_overlay_load()` refreshes the snapshot after installer writes. Preflight UCI collection is read-only, though preflight may stage temporary geo or fetch data.

## Snapshot behavior

- Scalar values and lists are read with the UCI CLI and validated against the runtime contract. Missing options receive their contract defaults. A missing package is a valid empty configuration; a missing `uci` executable or failed package read makes the overlay unavailable and invalid.
- `uci show` is used only as a before-and-after coherence fingerprint. Each capture’s exit status is checked, and a changed fingerprint triggers a bounded retry. A failed field read rejects the candidate snapshot. This detects drift but is not a UCI transaction; an A→B→A change inside the read window can escape detection.
- Every known invalid value is an error. The complete snapshot must validate before reconciliation proceeds. Unknown options are ignored and reported without adding runtime authority.
- The installer retains two raw completeness checks: `main.dns_ownership=preserve` and `udp.protect_udp_443=1`. These prove setup state only; they cannot authorize routes or bypasses. `main.enabled` is read through the normalized snapshot.
- External observations such as `firewall.openclash_guard`, `network.*`, `openclash.*`, and `dhcp.*` remain outside the Guard policy snapshot. They describe live system state, not Guard-local intent.

## Resolution and deferred intent

The resolver consumes a validated Layer-A snapshot, a policy already accepted by the signed-runtime authority, and a real live DNS observation. Its local policy schema check is defense in depth; it does not authenticate policy provenance. Resolution is committed only after all required inputs and gates succeed. The table distinguishes the calculations from the current runtime consumers.

| Option | Layer-B calculation |
| --- | --- |
| `routing.chatgpt`, `routing.claude`, `routing.grok` | A requested `direct` mode resolves to `direct` only when the service protection class has signed `directAllowed=true`; otherwise it resolves to `proxy`. Region policy remains part of live route evaluation. The calculated UCI route mode is not consumed by the current policy renderer. |
| `dns.fail_closed` | The calculated value preserves the signed-policy floor; a policy requirement cannot be lowered by UCI. The current DNS renderer does not consume this Layer-B result. |
| `dns.backend` | `auto` resolves to the observed backend. An explicit backend resolves to that value only when it matches the observation; otherwise it resolves to `none`. The current DNS renderer does not consume this Layer-B result. |
| `routing.direct_region`, `routing.proxy_region` | Values are validated, but their signed-policy resolution gate is undefined. They remain deferred. |
| `dns.resolver_sync` | Resolver-sync capability semantics are undefined by this contract. It remains deferred. |
| `udp.enabled`, `udp.src_ip` | No authoritative signed-policy gate is defined. Scoped UDP direct-bypass exceptions are disabled; the values remain deferred intent and are never used as effective fallbacks. |

The contract also reserves `rules.direct_rule`, `rules.proxy_rule`, `rules.direct_source`, and `rules.proxy_source`. They remain unused because no grammar, canonicalization, conflict handling, or precedence is defined; they cannot authorize routes or bypasses.

Deferred values are diagnostic intent only. A `DEFERRED:<value>` accessor result is not an effective value and must not drive runtime policy. Deferred reasons name the missing authority or disabled behavior without echoing configured values.

## Status and privacy

`status --json` adds these stable fields:

```json
{
  "uciOverlay": {
    "available": true,
    "valid": true,
    "errors": [],
    "unknownOptions": []
  },
  "uciDeferredOptions": []
}
```

`errors` entries contain `{ "option", "reason" }`; `unknownOptions` entries contain `{ "option" }`; deferred entries contain `{ "option", "reason" }`. `available` distinguishes a readable or absent package from a missing UCI tool or failed package read. These UCI fields do not include raw configured values, URLs, credentials, or client addresses. `doctor` reports invalid option reasons, ignored unknown option names, and deferred reasons.

## Validation

Run from the repository root:

```sh
python3 -m json.tool internal/config/openclash-guard/uci-runtime-contract.json >/dev/null
python3 -m json.tool internal/config/openclash-guard/uci-overlay-resolution.json >/dev/null
git diff --check -- internal/config/openclash-guard/uci-runtime-contract.json internal/config/openclash-guard/uci-overlay-resolution.json docs/openclash-guard-uci-runtime-contract.md docs/openclash-guard-uci-overlay-integration.md
mise run check
```
