# AI routing schema foundation (Phase 1 + compiler preview)

This is a validation-only migration foundation. It does not generate, modify,
or consume `cfg/`, `rule/`, or `internal/python/generate_ai_profiles.py` output.

## Authority boundary

- `internal/config/ai-routing/core/*.yaml` is the canonical declarative input for the future AI
  routing compiler.
- `internal/typescript/routing/schema.ts` owns document shape and is exported to
  `internal/schemas/routing-config.schema.json` for CI and editor support.
- `internal/typescript/routing/semantic-validator.ts` owns cross-manifest references and policy
  invariants. A valid Zod document is not necessarily a safe routing policy.
- The existing Python generator remains the authority for current generated
  OpenClash profiles until an explicit later migration connects it through an
  adapter.
- `internal/typescript/routing/compiler.ts` produces a checked, deterministic policy preview
  only. `internal/generated/ai-routing/hk.plan.json` is advisory and non-runtime; it
  does not configure Mihomo, select a node, or arm an account-protected service.

The loader merges top-level record sections from multiple YAML manifests and
rejects duplicate keys; it never lets a later file silently overwrite one.
Phase 1 RouteTarget variants are terminal (there is no route-to-route child
field), so closure analysis currently resolves selector, service, and profile
references to terminal targets. If a composed route kind is introduced later,
its child references must enter the same visited-set analysis before rendering.

## Policy model

`routeTargets` describe behaviours, not AI categories. The Hong Kong access
profile is a service-to-route matrix; it is not a Hong Kong proxy-node group.
Each normal service has a selector that references route target groups rather
than raw subscription nodes.

Account-protected services are fail closed. They default to the `reject` route,
use an explicit-node selector, admit only `reject` or non-dynamic
`pinned-egress` routes, and require proxy-only DNS which refuses rather than
falling back. Pinned egress lists exact approved nodes and must remain nonempty.

Rule order is intentionally represented by a validation interface only in this
phase: protected rules, protected terminal rejects, specific services, AI all,
category AI, then MATCH. Rendering those rules is deferred.

## Compiler preview (Phase 2a)

`compileRoutingProfile()` accepts an already parsed configuration, validates its
semantic contract again, and emits a deterministic plan for one access profile
and DNS profile. Normal profile-aware selectors contain route groups only.
Account-protected selectors always compile to `REJECT` as the effective route;
their exact approved nodes are merely choices requiring a future explicit
runtime selection. The preview never performs that selection.

## Mihomo fragment projection (Phase 2b)

`internal/config/ai-routing/projections/mihomo.yaml` is a separate, strict renderer-mechanics
manifest. It owns data-labelled, pinned rule sources, normalized relative
provider paths, external proxy-provider references, region filters, and guard
mapping; none of those fields are canonical routing policy. Provider URLs are
constructed only as `rawBaseUrl/revision/path`, and source credentials,
queries, fragments, missing source references, absolute paths, and dot
segments are rejected. Rule-provider paths use a portable forward-slash grammar;
backslashes, percent escapes, queries, and fragments are rejected before URL
construction. The checked `internal/generated/ai-routing/*.mihomo-fragment.yaml`
artifacts are explicitly non-standalone:
it contains only owned sections, names its external provider dependencies in
provenance comments, and omits `MATCH`. The existing Python generator remains
the owner of global profile layout and global MATCH behaviour.

All filtered region groups emit `empty-fallback: REJECT`; `COMPATIBLE` is never
an acceptable empty fallback because it is equivalent to DIRECT. Account
groups are REJECT-first and do not contain DIRECT or dynamic route groups.

## Phase 2c catalog and access matrices

The catalog has one observed ruleset endpoint per service: ChatGPT, Copilot,
Claude, Gemini, NotebookLM, Perplexity, Grok, Poe, Windsurf, and Hugging Face.
Gemini and NotebookLM deliberately use the repository's already-generated rule
files through a separate pinned source; the compiler does not invent a combined
Google AI provider or endpoint-role splits.

`hk`, `us`, `sg`, and `jp` are access-profile matrices, not node groups. The HK
matrix is an explicit new canonical policy: Copilot, Gemini, NotebookLM,
Perplexity, and Grok resolve to DIRECT; ChatGPT, Poe, Windsurf, and Hugging Face
resolve to US Stable; Claude remains REJECT until an approved node is selected.
This is not asserted as legacy-generator parity. In particular, the old
`direct_relaxed` metadata merely exposed DIRECT as a selector choice and did
not establish observed HK reachability. The new HK projection deliberately maps
`AI_All` and `category-ai` to DIRECT to prevent the relaxed-profile guard from
rejecting otherwise unclassified AI traffic; legacy generated configurations
kept that guard at REJECT.

Regional profiles map their default to the matching stable region. Account
protection remains higher priority than every access profile. Stable-session
services never expose an automatic route.

Region filters are data-owned and borrow the generator's boundary-aware country
and city-code terms. In particular, bare `US`, `SG`, and `JP` substring
matches are not used, so a name such as `Australia` cannot enter the US pool.

## Commands

```bash
npm ci
npm run validate:routing
npm run test:routing
npm run export:routing-schema
git diff --exit-code internal/schemas/routing-config.schema.json
npm run export:routing-plan
npm run check:routing-plan
npm run export:mihomo-fragment
npm run check:mihomo-fragment
npm run export:routing-artifacts
npm run check:routing-artifacts
```

`check:routing-artifacts` is read-only. It compares the exact expected profile
artifact inventory and byte content, rejecting missing, stale, non-file, or
changed output. It never creates, overwrites, or deletes an artifact; use the
explicit export command when regeneration is intended.

## Phase 3a shadow full-profile candidate

`internal/generated/ai-routing/hk.full-profile-candidate.yaml` is a non-production
shadow candidate only. It is formatted by
`internal/templates/ai-routing/full-relaxed-shadow.yaml.tpl`, whose named section slots
are validated strictly. The checked-in Python relaxed YAML remains the sole
production/reference authority; no `cfg/`, `rule/`, strict YAML, INI, or
generator authority is changed.

The adapter preserves the legacy base's global/static settings, proxy
providers, non-AI groups/providers/rules, DNS keys, and terminal MATCH. Its
parity manifest is a closed four-operation contract: an exact proxy-group
replace-set, an exact rule-provider replace-key-set, an exact anchored rule
interval replacement, and one Claude DNS add-map-entry. It rejects collisions
with preserved names, already-present DNS entries, malformed fragments, stale
allowances, and any unmatched change. `check:shadow-profile` is read-only and
rejects missing, stale, or changed shadow outputs.

## Phase 4a runtime-contract preview

`controller-plan.json` and `firewall-semantic-plan.yaml` are deterministic,
non-executable compiler artifacts. The controller plan maps every HK/US/SG/JP
access profile to hidden `@profile/*` selectors and records account-protected
metadata; the firewall plan intentionally contains semantic requirements only.
Neither artifact configures a router.

Router-local documents are deliberately separate from canonical policy:

- `internal/examples/ai-routing/router-local/` contains non-deployable examples only;
  it has no usable node name, device identifier, address, or secret.
- `internal/typescript/routing/router-local.ts` validates a loopback controller endpoint, a
  non-empty secret path, policy-version agreement, protected source boundary,
  and a one-to-one local mapping from canonical pinned IDs to locally observed
  node names.
- Canonical policy owns pinned identities; router-local data owns only their
  local materialization. A cutover must additionally prove that the
  materialized account group graph reaches only `REJECT` or exact approved
  nodes—never DIRECT, COMPATIBLE, auto, fallback, URL-test, or load-balance.

The first runtime state is always `REJECT`. A remembered account selection is
accepted only when it is still an exact current binding and carries matching
policy/node verification; stale policy, missing, or revoked nodes produce a
deterministic reset decision to `REJECT`. No controller function auto-selects
an approved account node.

`setup/openclash/scripts/ai-routing-controller.sh` is deliberately a non-mutating stub. Its
`--dry-run` performs no API call and reads no deployment, secret, state, or
local-egress input; `--reconcile` fails before any file or API access. A POSIX
shell cannot safely turn mutable local plan/egress documents into an authority
to lock or select account traffic. A future adapter needs a separately
validated immutable live-proof artifact before it can issue even a `REJECT`
lock request.

## Phase 4b guarded adapter foundation

The generated controller plan remains a typed planning artifact, not a shell
execution authority. It records the only permitted account lock value as
`REJECT` and precomputes canonical percent-encoded one-segment Mihomo paths,
but the shipped entrypoint does not trust those mutable on-router files or
write through them. This removes the former plan-tampering and raw-JSON
execution surface rather than attempting to repair it with shell parsing.

The typed effective-cutover proof is locked-pre-release only: account `now` is
`REJECT`, `REJECT` is first, and the remaining selector members exactly match
the local approved-node mapping. It also records runtime Mihomo version,
selector `type/all/now/udp`, running-config DNS selector/no-fallback evidence,
the startup gate, and the frozen or superseded status of legacy shell
enforcement.

`runtime-topology.ts` compiles a guarded firewall review plan from exact
dual-stack host sources, DNS addresses, interfaces/VLANs, WAN interfaces, and
discovered Mihomo chains/mark/proxy endpoints. It deliberately emits
`insufficient-pending-live-fw4-openclash-proof`, not executable nftables:
an independent late forward hook can be bypassed by fw4 established/offload
handling and is not a kill switch. A later live adapter must prove an earlier
fw4/OpenClash path that default-denies all remaining protected-source WAN
IPv4/IPv6 traffic after verified interception/proxy endpoint exceptions.

## Phase 4c private materializer

`materialize-private` is an off-router CLI path that first independently
recomposes and checks the canonical HK shadow artifact, then verifies the input
candidate's SHA-256 against that deterministic content. It accepts only that
canonical candidate path and writes only beneath the explicit ignored
repository root `local/ai-routing/`. A trusted repository root is supplied as
a separate authority boundary; every lexical component from it to the allowed
root is `lstat`-checked before creation, so a pre-existing `local` symlink
cannot escape. The root and every created descendant are owner-only,
symlink-free directories; realpath containment is checked before the atomic
mode-0600 write. Secret handling opens an owner-only regular file through
`O_NOFOLLOW` and validates metadata on the opened descriptor.

It rejects example documents, placeholder secrets, unauthorized providers,
unsafe node names, group-shape drift, and any binding which is not an exact
canonical `approvedId → provider` projection mapping. The public candidate
remains exactly REJECT-only. The generic, non-authoritative
`internal/python/local_profile_compose.py` helper blocks replacement of structurally locked
selectors, but the validated TypeScript materializer remains the sole
account-private writer.

The private delta is limited to an account selector's `use` provider list and
an anchored regexp2 literal-safe filter derived from approved local node names,
plus the loopback controller and secret. It never auto-selects a node; the
store-selected startup race remains gated. A live proof still needs the private
materialized effective config, Mihomo API/runtime evidence, and the earlier
fw4/OpenClash interception proof described above.

## Phase 4d hermetic controller transaction gate

The routing validation and test scripts use `node --import tsx`, rather than
the `tsx` CLI, so they do not depend on the CLI IPC transport. The hermetic
suite currently has 61 tests.

`runtime-controller.ts` remains test-only, but its transaction primitive now
requires an injected `StartupGate` before it may call `ControllerApi`. The
only verified sequence is:

```text
prove protected path closed
→ lock every account selector to REJECT
→ read back every account selector as REJECT
→ for each hidden @profile/* selector: snapshot, update, read back
```

Account selectors are never rolled back. If a hidden selector fails after a
write or its read-back mismatches, only recorded hidden snapshots are restored
in reverse order; the account locks remain `REJECT`. Failures surface as
redacted structured transaction errors, so gate/API/node details are not
retained in the operator diagnostic.

This is a hermetic sequencing proof only. There is no HTTP/Mihomo wire adapter,
no UCI/nft/procd integration, and no live firewall proof: the injected startup
gate is an interface boundary, not evidence that an OpenWrt firewall path is
actually closed. `setup/openclash/scripts/ai-routing-controller.sh --reconcile` remains disabled
before it reads router-local inputs or makes an API call.

## Phase 4e-a firewall-proof contract

`docs/ai-routing-firewall-proof.md` records the separate hermetic proof and
containment boundary: generation-bound static and dynamic evidence, freshness,
snapshot/freeze TOCTOU protection, and redacted dual-capability containment.
It is not a live firewall adapter or router proof; its explicit nonclaims and
deferred privileged namespace-lab boundary remain part of the contract.

## Phase 1 gaps

- No standalone or production Mihomo profile is emitted, and this projection has not cut over authority from the existing Python generator.
- No live runtime controller, OpenClash API write integration, firewall
  adapter, DNS enforcement, service installation, or router mutation is
  installed. `runtime-controller.ts` is test-only and cannot be wired to a
  live Mihomo API without a separately validated immutable plan proof. Phase
  4a artifacts and dry-run code are cutover prerequisites, not a live safety
  claim.
- The migration adapter maps current Python service identity strings only; it
  deliberately has no import or side effect on the Python generator.
