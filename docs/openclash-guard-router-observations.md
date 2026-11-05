# Read-only Guard rule observations

The LuCI **Firewall observations** page calls the read-only
`luci.openclash-guard.getFirewallObservations` RPC. It collects a fresh
`nft -j list ruleset` snapshot only on page load or explicit refresh. The
existing read ACL grants this method; no write ACL or generic log access is
added. The helper accepts only `snapshot`, with no caller-supplied command,
path, table, or filter.

## Contract and ownership

`internal/config/openclash-guard/router-observations.v1.json` owns the limits,
local policy reference, and rule explanation catalog. Run
`mise exec -- python3 internal/python/generate_router_observations.py` to
update the packaged catalog. The normal deterministic generation pipeline
includes this generator. The response schema is
`internal/config/openclash-guard/router-observations.response.v1.schema.json`.
The packaged jq filter implements the runtime projection.

Version 1 is a **rule-counter snapshot**, not a connection event stream.
`authorization` is always `READ_ONLY_NO_ROUTING_AUTHORITY`. It returns only
Guard-owned rule references, chain and handle, a terminal hook decision,
packet/byte totals, and coverage metadata. It omits addresses, ports, raw
expressions, process identities and payloads. Rule comments identify catalog
references; they do not authenticate complete match semantics. Responses
explicitly set `ruleSemanticsVerified: false` and
`reasonBinding: catalog-reference-only`. A wrong chain or terminal verdict
produces `rule-shape-mismatch`, unknown decision and null counts.

The configured policy revision is read from the bounded local policy file.
It is not authenticated by this helper and is not proof that the live rules
were applied from that policy. `appliedRevision` remains null and `binding`
remains `unverified`. Endpoint reports remain separate advisory context;
there is no IP/process correlation or enforcement action in this phase.

## Limits, lifecycle and interpretation

Collection and policy input are capped at 2 MiB each. The nft producer and jq
projection each have a three-second deadline with a one-second forced-kill
grace. The response contains at most 128 recognized rules and reports
truncation. Producer failure, invalid JSON, missing policy/dependencies,
oversized data and timeouts return explicit errors, never empty success.
Private temporary files are removed after the request; no history is stored.
The browser expires observations after the remaining ten-second TTL, using
both wall and monotonic time, clears them on page departure, fences late
responses, and coalesces concurrent refreshes. Refresh failure clears previous
observations.

Counters measure packets and bytes since rule creation or reset. Reconcile
recreates rules and resets totals. There are no inferred rates, unique
connection counts, or deltas across handles or refreshes. Missing, invalid,
named, or JavaScript-unsafe counters are null/Unknown; an observed numeric zero
is displayed as zero. An accept means continuation at this Guard hook, not
successful end-to-end delivery. Reject/drop describe the observed rule's hook
verdict; catalog references do not prove complete rule semantics.

Coverage always remains partial. Observed flowtables and their hardware
`offload` flags are exposed as risk indicators. Absence of those indicators
does not prove that acceleration is disabled or that all traffic traverses
Guard. Counter instrumentation does not fix the reproduced offload bypass.
Strict offload lifecycle changes remain a separate operator decision.

## Unsigned counter candidate

At the operator's explicit request, the terminal rules emitted by
`shell/apps/openclash-guard/killswitch.sh`, including gaming rules using its
shared rule writer and resolver-sync rejects, now place an anonymous counter
after all match terms and before the verdict. Match expressions, hook
priorities, rule order and decisions are preserved. No per-packet logging,
queue, retained traffic database, or automatic allow/block is added. Counter
accounting has runtime cost; no router throughput improvement is claimed.

The distribution sequence advances from 8 to 9. The deterministic bundle,
manifest, checksum and release metadata are regenerated; the old detached
signature is removed because it cannot authenticate the new bytes. This is
an unsigned local candidate, not a deployed or signed release. LuCI helper
files are packaged separately from the four signed runtime artifact roles.

The protected signer requires generator/tool/dependency changes to match
trusted main. This branch adds a generator and development schema dependency,
so those implementation changes must first pass normal review and enter
trusted main. Then prepare/rebase a next-sequence candidate against the current
trusted sequence and qualify it with the trusted signer. Neither manual
dispatch nor this local candidate bypasses that gate. See
[release signing](openclash-guard-release-signing.md).

## Verification evidence

Focused collector checks cover real JSON projection, minimized output, missing
and invalid counters, unknown references, foreign tables, rule-shape mismatch,
producer failures, malformed/multiple JSON documents, byte/record/time limits,
and oversized integers. LuCI view checks cover text safety, unknown versus
observed-zero counts, hook-scoped decisions, refresh coalescing, error clearing,
expiry and late-response fencing.

An isolated Linux container with networking disabled used the actual shared
rule renderer and nftables kernel rules. Three matching rejected UDP packets
and two matching accepted packets produced counters of 3 and 2; four unmatched
packets did not increment them. A separate Linux collector replay of that
actual nft JSON returned the same totals. The replay is not a live router test.
The packet-test rule matches were synthetic; their catalog labels do not
establish match semantics. No production router, offload acceptance, complete
LuCI installation or endpoint correlation is claimed.

A headless Chromium DOM smoke test also rendered the new view, refreshed it
through a stubbed RPC, checked HTML text safety, cleared rows after RPC failure
and page departure, and observed zero network requests. This uses the real view
source with a minimal LuCI DOM/RPC harness, not a complete router LuCI runtime.

The final `mise run check` completed successfully: 768 Python tests, 189
profile-service Node tests and 16 LuCI view tests. Earlier checks exposed stale
pre-counter output expectations and two pre-existing 20-second harness
ceilings under host load. Output expectations were updated without removing
ordering/security assertions; the lifecycle and bundle-function harnesses now
reuse the existing shared 60-second CLI deadline. Explicit lock/watcher
deadlines and production timeouts are unchanged. Commit hooks regenerated
managed artifacts deterministically without additional output drift.
