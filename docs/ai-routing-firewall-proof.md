# AI routing firewall-proof contract (Phase 4e-a)

Phase 4e-a is a hermetic, fail-closed startup contract. It defines how a
future controller may receive a proof permit; it does not make the router,
Mihomo, or OpenClash path live.

## Decision model

Firewall evidence has exactly three states:

- `closed`: static evidence, dynamic probes, generation continuity, and
  freshness all agree. Only this state may produce an opaque permit.
- `open`: a protected direct path was observed as allowed.
- `unknown`: evidence is absent, stale, future-dated, unavailable, incomplete,
  malformed, or generation-drifted.

`open` and `unknown` are both non-permitting. There is no “best effort” or
DIRECT fallback when proof cannot close.

## Trusted generation binding

`FirewallGenerationAuthority` is read-only. For the actual controller plan it
returns a sealed expectation containing:

- policy version;
- deterministic digest of the actual controller plan snapshot;
- public artifact, private materialization, and topology digests;
- deterministic digest of normalized static firewall evidence; and
- a positive maximum evidence age.

The startup orchestrator does not accept a caller-supplied expectation. Before
the first await it takes canonical deep-cloned, recursively frozen snapshots
of the controller plan, router deployment, and runtime state. It derives the
account lock set and controller-plan digest from that plan snapshot, gives only
that frozen plan to the authority, and executes the controller transaction only
with the snapshots. This is the TOCTOU boundary: an authority, startup gate, or
other asynchronous collaborator cannot alter later execution by mutating the
original request objects.

Permits are opaque branded values issued inside the proof adapter after it has
read evidence and matched the trusted expectation. There is no public factory
that turns an arbitrary “closed” object into a permit.

## Evidence contract

Static evidence describes the protected sources, both IP families, all required
blocked path classes, allowed proxy/DNS destinations, and a ruleset generation.
It is strictly normalized and SHA-256 digested; that digest must equal the
sealed generation value.

Dynamic evidence probes direct IPv4/IPv6, external DNS/DoT, direct QUIC, and
the permitted proxy and router-DNS paths. Its generation before and after the
probe must both equal the static ruleset generation. This prevents a proof from
straddling a ruleset change. `checkedAt` must be neither future-dated nor older
than the sealed maximum age; either condition returns `stale-evidence` and is
non-permitting.

The initial permit, startup-gate revalidation, and every normal controller API
operation all revalidate the same generation and ruleset continuity.

## Startup and containment lifecycle

The normal sequence is:

```text
snapshot and freeze inputs
→ read and validate trusted generation
→ issue initial closed-only permit
→ revalidate
→ Phase 4d startup gate
→ revalidate before every controller read/write
→ lock account selectors, then update hidden profile selectors
```

Containment starts for an authority/plan/proof failure, proof invalidation,
startup-gate failure, or account lock/read-back failure. It has two separate
capabilities:

- `EmergencyDeny` denies the protected sources.
- `EmergencyRejectLock` locks only the exact account-protected visible groups
  derived from the frozen controller plan, and only to `REJECT`.

Both calls are deferred and settled independently. A synchronous or asynchronous
failure of either collaborator cannot prevent attempting the other. Containment
is idempotent, so later failures reuse the first containment result and no
normal controller API call follows it. Diagnostics expose only a phase, a
non-closed reason code, and aggregate `denyFailed` / `rejectLockFailed` flags;
they do not retain raw evidence, nodes, credentials, or underlying errors.

## Explicit nonclaims and deferred work

This phase makes no live claim about nftables, fw4, OpenClash, Mihomo, or an
account's permitted region. It does **not** inspect or mutate live nft/fw4 or
OpenClash state; implement HTTP controller, procd, UCI, or production reconcile
code; prove boot-race safety; or guarantee that a chosen egress satisfies any
service account or region policy.

Phase 4e-b is deferred until a real router adapter exists. It must be a
privileged, deterministic nft namespace laboratory job that produces trusted
adapter evidence against an isolated firewall namespace. It is not a normal PR
test and must remain a separate trusted job with explicit environment and
artifact authority.
