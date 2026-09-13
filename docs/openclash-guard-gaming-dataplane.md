# OpenClash Guard gaming dataplane reconciliation

## Problem

OpenClash Guard can authorize a narrowly scoped gaming flow before its final fail-closed reject, but that alone does not guarantee the flow is routed directly. OpenClash may already have marked generic UDP traffic for its TUN path before the Guard forward hook sees it.

A direct-gaming policy therefore has two coupled parts:

1. **Dataplane interception exemption** — matching gaming UDP must return before OpenClash's generic UDP interception/marking rule.
2. **Guard egress authorization** — the same policy must be accepted before the terminal Guard kill-switch, constrained to the resolved direct-WAN egress interface.

Both halves must be present. Either half on its own is incomplete.

## Required invariants

- Never persist nftables numeric handles; discover current handles after every OpenClash/fw4 reload.
- Never create a source-host + any-UDP bypass.
- Preserve protected destination UDP ports, including UDP/443, as fail-closed boundaries.
- Keep game/application-specific ports out of shell implementation code; the runtime gaming policy remains the source of truth.
- Keep OpenClash-specific nftables details isolated from `gaming.sh` in a dedicated adapter module.
- Require a trusted gaming client and an explicit configured source or destination UDP port before installing a dataplane bypass.
- Resolve the direct WAN interface dynamically or through an explicit override; if it cannot be resolved, fail closed and do not authorize direct egress.
- Removal/reconcile must be idempotent and only touch rules owned by OpenClash Guard, identified by stable comments.
- If OpenClash is unhealthy or its expected interception chain cannot be validated, do not install a direct bypass.

## Implemented module boundary

`gaming.sh` remains policy-oriented:

- trusted gaming source IPs;
- directional UDP source/destination ports;
- protected destination ports;
- optional destination CIDRs;
- rendering the Guard-side scoped accept.

`shell/apps/openclash-guard/dataplane.sh` owns the OpenClash-specific integration:

- validate the active OpenClash UDP interception chain;
- rediscover the current insertion point after every reconcile;
- resolve the direct WAN egress (`GUARD_DIRECT_WAN_IFACE`, UCI override, ubus `wan` l3 device, or main default route fallback);
- reconcile Guard-owned source-port and destination-port direct-return rules in a dedicated fw4 chain;
- constrain the Guard-side authorization to the same resolved `oifname`;
- remove stale Guard-owned jump state before replacing it;
- remove Guard-owned dataplane state when Guard is disabled or removed.

Known OpenClash defaults (`inet fw4`, `openclash_mangle`, `jump openclash_upnp`) are isolated in this adapter and remain overridable. The adapter never persists a numeric nft handle.

## Reconcile ordering

The current render path is:

```text
load + validate runtime policy
        ↓
resolve trusted gaming clients + directional UDP policy
        ↓
inspect current fw4/OpenClash target + current handles
        ↓
resolve direct WAN egress
        ↓
render Guard table with protected-port reject
        ↓
render oif-constrained gaming accepts
        ↓
render dataplane cleanup + replacement before generic UDP interception
        ↓
render terminal Guard kill-switch
        ↓
apply as one nft batch
```

If dataplane validation or WAN resolution fails, no new gaming accept or direct jump is rendered. Stale Guard-owned jump state is removed when discoverable and the terminal kill-switch remains authoritative.

When Guard is disabled or removed, `guard_kill_delete_table()` first calls the Guard-owned dataplane cleanup routine so a stale direct-routing exemption is not left behind.

## Target rule semantics

Conceptually, destination-port policy becomes:

```text
trusted gaming client
+ configured UDP destination port
+ optional destination CIDR
    → return before OpenClash generic UDP interception
```

and Guard authorization becomes:

```text
trusted gaming client
+ configured UDP destination port
+ optional destination CIDR
+ resolved direct-WAN egress
    → accept before terminal kill-switch
```

Directional source-port policy follows the same model with `udp sport`.

The adapter uses an owned regular chain and owned sets inside `fw4`. The only mutation to `openclash_mangle` is a stable-comment-owned jump inserted before the freshly rediscovered generic UDP interception rule. Foreign rules are not flushed or rewritten.

## Regression coverage

The PR now includes focused tests for:

- no embedded numeric nft handle;
- no game-specific ports or hardcoded fwmark in the adapter;
- OpenClash-specific internals absent from `gaming.sh`;
- current anchor handle rediscovery;
- stale Guard-owned jump replacement while foreign rules are preserved;
- unresolved direct WAN failing closed;
- unhealthy OpenClash failing closed;
- existing Guard-owned objects being flushed/reused instead of duplicated;
- Guard-side source/destination rules carrying the resolved `oifname` constraint;
- disable/remove path invoking dataplane cleanup;
- shell syntax coverage for the new adapter.

## Remaining merge gates

This PR stays draft until all of the following are verified on the exact head:

- focused dataplane + gaming contract tests pass;
- shell bundle generation includes the new module;
- generated `dist/openclash-guard.sh`, manifest, and checksum are refreshed and clean;
- full `make ci` passes;
- router A/B confirms the generated rules match the live proven shape;
- established-flow behavior is checked under WAN/interface failover so the direct-egress constraint is not weakened after conntrack establishment.

The last item is deliberately still open: the Guard base chain currently accepts `ct state established,related` before the gaming-specific rule. The new `oifname` constraint therefore proves the first-packet authorization path, but WAN failover for an already-established conntrack entry needs an explicit router test before the PR can claim strict per-packet egress pinning.

## Scope boundary

This follow-up does not add a game-specific default such as Deadlock or Warframe ports. It supplies the generic synchronization mechanism so configured directional gaming policy can control both the OpenClash pre-TUN dataplane and the Guard fail-closed enforcement plane without broadening the security boundary.
