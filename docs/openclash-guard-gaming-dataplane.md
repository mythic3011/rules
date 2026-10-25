# OpenClash Guard gaming dataplane reconciliation

## Problem

A Guard-side scoped `accept` is not sufficient to make gaming UDP DIRECT. OpenClash can intercept or mark generic UDP before the Guard forward hook sees it.

The working design therefore couples two planes:

1. **Pre-TUN dataplane exemption** — eligible gaming UDP returns directly from the live `openclash_mangle` parent chain before OpenClash's generic UDP interception/marking anchor.
2. **Fail-closed Guard authorization** — the same flow must carry the Guard capability mark and leave through the resolved direct-WAN interface before the terminal kill-switch permits it.

Both halves are required.

## Required invariants

- Never persist nftables numeric handles. Rediscover the current OpenClash insertion anchor after every fw4/OpenClash rebuild.
- Never create a trusted-client + any-UDP bypass.
- Keep game/application-specific ports in runtime policy, not shell implementation code.
- Treat protected remote UDP ports, including UDP/443, as fail-closed boundaries in both the pre-TUN and Guard planes.
- Reject configured gaming candidates that are missing the dataplane capability mark or are leaving through the wrong interface before the normal established/related accept.
- Clear the capability mark only when the Guard-side scoped DIRECT accept succeeds.
- Resolve direct WAN dynamically or from an explicit override; if it cannot be resolved, fail closed.
- Preserve foreign OpenClash/fw4 rules and only remove Guard-owned rules identified by stable comments.
- Keep lifecycle recovery idempotent across OpenClash restart, fw4 reload, install, disable, and removal.

## Current dataplane design

`shell/apps/openclash-guard/dataplane.sh` owns all OpenClash-specific integration. The adapter discovers the current generic UDP anchor in `inet fw4 openclash_mangle`, resolves direct WAN, maintains Guard-owned sets, and inserts scoped DIRECT verdicts into the **parent** `openclash_mangle` chain immediately before the live anchor.

The parent-chain placement is deliberate. An earlier implementation jumped into an owned child chain and returned from there, but nftables `return` from a jumped child resumes at the next rule in the caller. That still allowed the later OpenClash generic UDP mark to run. The reconciler now migrates away from that legacy child chain by deleting the owned jump and child chain, then installs direct verdicts in the parent chain itself.

Conceptually, source-port policy becomes:

```text
meta mark 0
+ trusted gaming client
+ protected destination port excluded
+ configured UDP source port
    -> set capability mark
    -> return from openclash_mangle
```

Destination-port policy follows the same shape with `udp dport`.

The default capability mark is `0x40000000`. It was selected only after the target router was audited and found to have OpenClash policy routing on exact fwmark `0x162` with no conflicting mark consumer. The mark remains configurable and must not be generalized to an unaudited router.

## Guard-side enforcement

`gaming.sh` creates a dedicated `gaming_egress` base chain at forward priority `-151`, before the main Guard chain at `-150`.

Configured gaming candidates are rejected at `-151` when:

- the dataplane capability mark is missing; or
- the capability mark is present but the packet is not leaving through the resolved direct-WAN interface.

The normal gaming accepts at `-150` additionally require:

- trusted client scope;
- configured directional UDP source or destination port;
- protected remote UDP ports excluded;
- capability mark present; and
- correct direct-WAN `oifname`.

A successful gaming accept clears the capability mark and accepts the packet. Protected UDP rejection remains ahead of gaming accepts, and the terminal Guard kill-switch remains last.

This ordering also covers already-established flows: a stale conntrack entry cannot silently survive a route/interface change because the wrong-egress check executes before the generic established/related accept.

## Lifecycle recovery

The installer registers both lifecycle paths used on the validated router:

- a named fw4 UCI include pointing at `/etc/openclash-guard/fw4.include`; and
- a managed block in OpenClash's official custom firewall hook that calls `/usr/lib/openclash-guard/on-openclash-restart`.

During a live OpenClash restart the dataplane can temporarily disappear while stale Guard rules remain. That state is still fail closed because no new packet receives the capability mark. Reconciliation restores the parent-chain rules after the OpenClash target reappears.

## Canonical gaming policy

Canonical `internal/config/openclash-guard/gaming.yaml` supports inclusive `udpSourcePortRanges` and `udpDestinationPortRanges` as authoring sugar. Generation deterministically expands them into schema-v1 integer arrays; the deprecated runtime `udpPorts` field remains a destination-only compatibility projection.

The checked-in policy records only live-proven cases:

- **Warframe** — UDP source ports `4950` and `4955`.
- **Overwatch** — remote UDP destination range `26500-26600` plus destination port `29523`.
- **Steam/Deadlock** — remote UDP destination range `27000-27250`.

Protected UDP/443 remains excluded from the DIRECT destination set.

### Overwatch live evidence

Initial exact-port probing observed gameplay/service traffic across `26503-26509`, then `26523` and `26556`, showing that the `265xx` destination is dynamically assigned rather than one stable port. A temporary `26500-26600` range plus `29523` restored the game.

Subsequent lightweight tracking at priority `-152` observed sustained capability-marked DIRECT traffic in the `26500-26600` range. A representative gameplay flow used destination port `26515`, was bidirectional and `ASSURED`, and left conntrack with `mark=0` after the Guard accept cleared the capability mark. No meaningful gaming blocker outside the validated range was observed. Port `29523` had been proven earlier with multiple bidirectional `ASSURED` direct flows, although it was not active during the later sustained gameplay sample.

## Regression coverage

The PR covers:

- directional source/destination gaming policy;
- canonical range validation and deterministic expansion;
- no game-specific ports in `gaming.sh` or the OpenClash dataplane adapter;
- no hardcoded OpenClash fwmark;
- live-anchor handle rediscovery;
- protected-port exclusion;
- unresolved WAN and unhealthy OpenClash fail-closed behavior;
- legacy child-chain cleanup and parent-chain direct-rule insertion;
- capability-mark enforcement;
- wrong-egress rejection before established/related acceptance;
- lifecycle recovery hooks;
- generated runtime drift detection.

## Verified router behavior

The validated router uses direct WAN `eth1`. Router testing has confirmed:

- parent-chain gaming DIRECT rules are restored after OpenClash restart;
- transient absence of the dataplane remains fail closed;
- synthetic wrong-egress traffic is rejected;
- an established/ASSURED wrong-egress flow is rejected before the established accept;
- protected UDP/443 still wins;
- the terminal kill-switch still catches unrelated traffic;
- Deadlock remains unmarked on the OpenClash policy-routing path and exits direct WAN;
- Overwatch works with the validated `26500-26600` / `29523` destination policy.

## Remaining merge gates

This PR remains draft. Before merge:

- generated outputs and CI must be green on the latest head;
- stacked dependency #52 must merge first;
- this PR must then be retargeted/rebased to `main` and CI rerun on that exact tree.

The current health-check surface still does not independently prove that the live parent-chain dataplane rules are present; that is a follow-up hardening item rather than a reason to weaken the fail-closed packet path.
