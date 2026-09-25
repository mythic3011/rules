# OpenClash Guard UCI overlay integration design (#124)

Status: **preparatory slice** — unwired architecture + tests + guardrails.
Released wiring intentionally deferred while the sequence-6 candidate (#98) is
open. This document is the design contract for the seq7 integration.

## Goal

Converge the Guard runtime's scattered local `openclash_guard.*` UCI reads onto
**one normalized, validated snapshot**, separating *operator intent* (raw) from
*effective runtime state* (resolved). Signed policy stays the capability
ceiling/floor; UCI can only narrow, never widen.

## Target pipeline

```
raw local UCI intent
        ↓
local syntax/type validation          (uci-overlay.sh, Layer A)
        ↓
authenticated signed policy           (guard-policy; ceiling/floor)
        ↓
external/live capability observation  (guard-environment / guard-dns)
        ↓
authority resolution                  (uci-overlay-resolve.sh, Layer B)
        ↓
one effective normalized snapshot
        ↓
render / reconcile
```

Signed-policy gating happens **before** any consumer uses an effective value.
Known-invalid input makes the overlay invalid and is surfaced to reconcile/
apply, which must refuse **before** any nft mutation (atomicity).

## Modules

### `shell/apps/openclash-guard/uci-overlay.sh` (Layer A — raw + validate)

Single authority for reading `/etc/config/openclash_guard`. Self-contained, no
manifest dependencies (so it can be wired without cycles). Responsibilities:

- `guard_uci_overlay_load` — enumerate `uci show openclash_guard`, strictly
  validate every **known** option against the #122 contract, apply contract
  defaults for absent options, and record **unknown** options for reporting.
  Returns non-zero when any known option is invalid.
- `guard_uci_overlay_valid` / `guard_uci_overlay_errors` /
  `guard_uci_overlay_unknown_options` — diagnostics state.
- `guard_uci_overlay_available` — whether the local UCI store was read (1) or
  is missing/read-failed (0). See "Availability" below.
- `guard_uci_overlay_get` / `guard_uci_overlay_get_raw` — normalized vs raw reads.
- `guard_uci_overlay_json` — redacted diagnostics document:
  `{"uciOverlay":{"valid":bool,"errors":[{option,reason}],"unknownOptions":[{option}]}}`.

Trust semantics baked in:

| situation                     | behavior                                            |
| --------------------------- | --------------------------------------------------- |
| known option, invalid value | hard error; overlay invalid; reconcile must refuse; **never** falls back to a weaker state |
| unknown option              | ignored-and-reported; no runtime authority; never invalidates an otherwise-valid config |

This strictness applies to **all** contract-covered options, including the
currently-effective legacy controls (`main.enabled`, `main.kill_switch`,
`main.dns_kill_switch`, `udp.enabled`, `udp.src_ip`). The compatibility
boundary is "valid old config → same effective behavior", not "malformed known
value silently accepted". This corrects the earlier permissive
typo-to-default reading.

Validation types: `boolean`, `enum` / `integer-enum`, `service-route-mode`,
`region-ref` (`direct_region` → full Region Registry; `proxy_region` →
`primaryOrder` only), `https-url-or-empty` (HTTPS-only, rejects credentials /
whitespace / malformed, **redacts** — diagnostics name the problem, never the
URL), `ipv4-list` (every item validated; whole option rejected on any bad item;
deterministic duplicate normalization, first occurrence wins).

The option table is a manual twin of
`internal/config/openclash-guard/uci-runtime-contract.json`; POSIX shell cannot
parse that JSON, so `tests/test_openclash_guard_uci_overlay.py` asserts parity
(options, types, defaults) and the Region Registry twin. Change both together.

### Availability semantics

The loader distinguishes three situations, never conflating them:

| UCI state | result |
| --------- | ------ |
| `uci` binary missing, or package read fails unexpectedly | overlay **unavailable** (`guard_uci_overlay_available=0`) AND **invalid**; `load` returns non-zero; **no quiet defaulting** |
| package read succeeds, option legitimately absent | contract **default** applies; valid; available |
| package absent entirely (`uci show` → "Entry not found") | valid **empty config**; defaults apply; `load` returns 0 |

The loader captures `uci show` / `uci get` exit statuses **before** any
`sort`/`sed`/`tr` processing so an upstream `uci` error is never hidden by the
parse pipeline. `uci show` output includes section *declarations*
(`openclash_guard.main=openclash_guard`) as well as option lines; only
two-component `section.option` left-hand sides are treated as options, so
declarations never surface as unknown options, while genuine unknown options
are still ignored-and-reported.

### `shell/apps/openclash-guard/uci-overlay-resolve.sh` (Layer B — authority resolution)

Reads the **validated** snapshot + the signed runtime policy JSON + live DNS
capability, and computes effective values **only** where an authoritative source
today defines the gate. UCI never widens signed policy. Contract:
`internal/config/openclash-guard/uci-overlay-resolution.json`.

Gate discipline: `guard_uci_overlay_resolve()` **refuses** (non-zero) when the
Layer-A snapshot is unloaded or invalid, and presents no effective state as
usable.

**Snapshot coherence (Layer A, not atomic).** One logical snapshot must not be
assembled from multiple live UCI generations. `load` captures the full
`uci show` catalog **once** and derives both option paths and per-option values
from that single captured representation (no second `uci show` for path
enumeration, no per-option `uci get` re-reads that would mix generations).
Because capture and validation are not a true atomic operation, the catalog is
re-captured afterward and compared; if the package changed mid-read, the
candidate is **discarded** (nothing becomes observable) and the read retries
(bounded by `GUARD_UCI_OVERLAY_MAX_ATTEMPTS`, default 2). A persistent change
fails with "snapshot not coherent" rather than publishing a mixed-generation
snapshot. Residual guarantee: **before/after change detection with
discard-on-drift** — not a claim that the captured window itself was atomic and NOT
an unsafe `eval`-parse of UCI output.

**Authority inputs (trust boundary).** The normal resolver requires ALL:
validated UCI intent, an **authenticated signed policy**, and an **observed
live capability**. `_GUARD_UCO_RESOLVED=1` is set only when every authority
input is valid.

- *Signed policy:* must be present, well-formed JSON, with `services` and
  `protectionClasses`, every service referencing an existing class, and
  `directAllowed`/`firewallKillSwitch` boolean. Missing/malformed policy MUST
  NOT degrade into permissive defaults (an empty services list would hide the
  fail-closed floor). At production wiring the resolver is expected to consume
  `guard_policy_load`-validated state; the focused check here covers the
  resolver-consumed policy surface so the trust contract is identical.
- *Live DNS observation:* must be a real observed value
  (`adguardhome`|`dnsmasq`|`none`). An empty/unset/unexpected value is **not**
  the observed value `none`; it means the observation is unavailable and makes
  the whole resolution refuse.

Any unavailable authority input → resolution refuses (rc 3, resolved state
stays 0, gated effective values unavailable). Diagnostics reports
`authorityInputs` availability without mutating resolved state.

**Resolution commit atomicity.** The internal commit is atomic:
`guard_uci_overlay_invalidate_resolved_state()` first; only if
`_guard_uci_overlay_resolve_apply()` **succeeds** is `_GUARD_UCO_RESOLVED` set
to `1`, otherwise state is invalidated again and resolution returns non-zero.
Explicit handling, not `set -e` reliance inside functions — a partial
computation can never leave partial effective globals behind or mark the state
resolved.

**Resolved-state lifecycle.** Layer-B keeps an explicit flag
`_GUARD_UCO_RESOLVED` (default `0`). Every overlay `load` invalidates all
prior resolved state (clears every `_GUARD_UCO_EFFECTIVE_*` and the notes,
flag → `0`) **before** a new snapshot is observable, so a stale effective value
can never leak across snapshots. The flag becomes `1` only after the full
normal resolution path succeeds.

- `guard_uci_overlay_resolve_state_valid()` means *loaded* ∧ *Layer-A valid* ∧
  *Layer-B resolution completed* — **not** merely "loaded + valid". It returns
  false again after any re-load until re-resolved.
- `guard_uci_overlay_effective()` for a resolved gated option (`routing.<svc>`,
  `dns.fail_closed`, `dns.backend`) **refuses** (non-zero) when no completed
  resolution exists for the current snapshot — it never falls back to the
  normalized UCI value. Deferred options keep their `DEFERRED:` representation;
  non-gated options return the normalized value directly.
- `guard_uci_overlay_resolve_diagnostics()` is read-only: inference runs in a
  subshell so it cannot mutate `_GUARD_UCO_RESOLVED`, `_GUARD_UCO_EFFECTIVE_*`,
  or the notes in the caller.

**Computed (authoritative today):**

- Route-mode ceiling (`routing.chatgpt/claude/grok`): a requested `direct` is
  honoured only when the service's protection class has `directAllowed=true`;
  otherwise effective falls back to `proxy`. Region constraints are **not**
  part of this config-time gate — `allowedRegions` gates *live route
  evaluation* in `guard_policy_region_allowed`, not the snapshot.
- Fail-closed floor (`dns.fail_closed`): mirrors
  `guard_policy_needs_failclosed` — any class with `firewallKillSwitch=true`
  or `directAllowed=false` requires fail-closed, and an operator `0` cannot
  lower the floor (effective stays `1`).
- DNS backend (`dns.backend`): mirrors `guard_dns_backend()` detection
  (`adguardhome`/`dnsmasq`/`none`). `auto` resolves to the detected backend or
  `none`; an explicit request is honoured only when it equals the detected
  backend, else `none` (a preference cannot install capability). Downstream
  consumers key off this **effective** backend, not the raw live input — fixing
  the earlier bug where resolver-sync derived from the raw `_GUARD_UCOR_DNS_BACKEND`.

**Deferred (contract gap — do not invent semantics):** these options are
contract-marked gated but have **no authoritative Layer-B resolution defined
today**. They are surfaced by `guard_uci_overlay_effective()` as
`DEFERRED:<normalized>` (explicitly flagged, never a usable effective value)
and listed by `guard_uci_overlay_deferred_options()`:

- `dns.resolver_sync` — no contract defines resolver-sync capability. It is
  **not** a simple "backend is capable" flag: `guard_dns_domain_set_backend`
  maps `dnsmasq→dnsmasq-nftset`, and `adguardhome` only promotes via the
  separate `guard_resolver_sync_backend` capability verification.
- `routing.direct_region` / `routing.proxy_region` — only the Layer-A
  *validation* (full registry vs `primaryOrder`) is defined; no signed-policy
  resolution gate exists.
- `udp.enabled` / `udp.src_ip` — no authoritative signed-policy gate ties them
  to a policy field.

Reasons are **redacted** (name the constraint, never URLs/tokens/credentials).

## Manifest wiring plan (deferred)

When wiring into `shell/manifest.json` for the seq7 release:

- `guard-uci-overlay` (Layer A): `depends: []` (self-contained).
- `guard-uci-overlay-resolve` (Layer B): `depends: [json, guard-uci-overlay]`,
  and consumers come after `guard-policy`/`guard-environment`.
- Separate raw-load/validation (Layer A) from policy/live resolution (Layer B)
  so the dependency graph stays acyclic: A has no guard-* deps; B depends on A.

## Atomicity

Full reconcile target:

```
load → validate → policy-resolve → capability-resolve → render complete
intended state → apply
```

The overlay validator returns failure and `guard_uci_overlay_valid=0` when any
known option is malformed. The reconcile/apply path MUST check validity and
refuse **before** any `nft` mutation (i.e. before `guard_kill_apply_batch` and
friends). It must NOT "apply half → discover bad option → fail".

## Diagnostics integration

`guard_uci_overlay_json` is the canonical document. Wire it into:

- `status --json`: append the `uciOverlay` object to the status payload via the
  `guard_status_json_extra` slot (a stable insertion point that keeps the
  trailing `guard_doctor_json_extra` intact).
- `doctor`: human-readable per-option line `path: reason` derived from
  `guard_uci_overlay_errors`, and a `unknown option ignored: path` note for
  ignored-and-reported options.

Never expose opaque profile tokens, credentials, secret query parameters, or
sensitive complete URLs — redaction is enforced at the validator (URL reasons
never echo the URL).

## Migration map

These existing scattered reads are scheduled to become thin consumers of the
normalized snapshot (VALID configs stay behaviorally identical; env-var
override precedence — `GUARD_GAMING_BLANKET`, `GUARD_DIRECT_REGION`,
`GUARD_PROXY_REGION`, `GUARD_GEO_ROUTE` — stays last-win):

| file | current read | target |
| ---- | ------------ | ------ |
| `killswitch.sh` | `main.enabled/mode/kill_switch/dns_kill_switch` | snapshot |
| `gaming.sh` | `udp.enabled`, `udp.src_ip` | snapshot |
| `environment.sh` | `udp.src_ip`, `udp.blanket_udp_bypass` | snapshot |
| `dataplane.sh` | `udp.direct_iface` | snapshot |
| `main.sh` | `main.enabled` | snapshot |
| `preflight.sh` | `main.enabled` | snapshot |

Out of scope for migration (kept direct by design):

- Installer/template **write** paths (`install.sh`, `template.sh`) — they write
  and assert their own writes.
- External observation: `firewall.openclash_guard`, `network.*`, `openclash.*`,
  `dhcp.*` — live external state, not Guard-local intent.

The structural guardrail
(`tests/test_openclash_guard_uci_read_guardrail.py`) locks this: any NEW direct
runtime read of `openclash_guard.*` outside the minimal allowlist fails CI.

## Contract gaps — NOT implemented (do not guess)

`rules.direct_rule`, `rules.proxy_rule`, `rules.direct_source`,
`rules.proxy_source` are declared in the contract but have **no defined
grammar, canonicalization, duplicate handling, conflict handling, or
direct-vs-proxy precedence**. Per the brief, these are intentionally NOT
validated, NOT normalized, and gain **no** runtime authority in this slice.
They are surfaced only as opaque raw intent (unknown-option reporting still
applies if absent from the contract). Defining these semantics is a contract
update, not an implementation detail.

Also observed (not a live gap, documented for completeness): the runtime
installer writes some options (`main.mode`, `main.dns_ownership`,
`main.policy_refresh`, `main.policy_url`, `udp.blanket_udp_bypass`,
`udp.protect_udp_443`) that the contract does not currently model. None of
these are read as runtime policy outside installer/template assertions, so no
live-read drift exists; but the contract and this overlay intentionally model
only the contract's option set.

## Deferred until authenticated seq6 baseline on main

- `shell/manifest.json` runtime wiring of the overlay modules
- killswitch/gaming/environment/dataplane/main/preflight consumer migration
- `_guard_prepare()` production pipeline reorder
- nft-coupled runtime integration (atomicity enforcement at apply)
- `make generate` / regenerated `dist/openclash-guard.sh`
- sequence-7 metadata / signing

**BLOCKER:** runtime/release integration waits for the authenticated seq6 main
baseline (#98). This slice deliberately lands only: the unwired Layer A/B
modules, the resolution contract, parser + validator + resolver tests, the
structural guardrail, the migration map, and this design doc.
