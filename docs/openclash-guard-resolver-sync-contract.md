# OpenClash Guard resolver-sync capability contract

This document defines the read-only evidence contract used by OpenClash Guard before it may report an AdGuard Home domain-set backend as available.

It does **not** implement the resolver-sync daemon. Until a separate helper and nft consumer satisfy this contract, AdGuard Home deployments continue to report `dns.domainSetBackend: unavailable` and retain the existing fail-closed degraded state.

## Trust decision

A marker file by itself is not capability evidence. Guard reports `adguardhome-resolver-sync` only when all of the following are true at the same observation point:

1. the state document is a regular, non-symlink JSON file using schema version 1;
2. `helper`, `backend`, and `status` exactly identify the expected ready helper;
3. the recorded PID is numeric, greater than 1, and responds to `kill -0`;
4. `updatedAtEpoch` is not in the future and is no older than the bounded health window (120 seconds by default, maximum configurable value 3600 seconds);
5. the state document declares the exact fixed Guard-owned nft identifiers below and records the independently discovered direct WAN interface;
6. both fixed nft sets exist with the expected address family, `timeout` flag, and Guard ownership comment;
7. the fixed Guard `forward` chain contains the expected IPv4 and IPv6 consumer rules, each referencing the corresponding set, rejecting only traffic whose output interface is the independently discovered direct WAN interface, and carrying the exact Guard ownership comments.

Any missing, malformed, stale, future-dated, contradictory, or incomplete evidence returns `unavailable`.

The state document never supplies nft command arguments. Guard compares declared fixed identifiers against constants first. The direct interface is independently discovered from live network state (or an explicit trusted operator override) and is validated before it is used or compared with state. This prevents a compromised or malformed state document from redirecting the verifier to arbitrary tables, chains, sets, or interfaces.

The direct-interface condition is part of the security contract, not an optimization. An unconditional `ip daddr @resolver_sync_v4 reject` / `ip6 daddr @resolver_sync_v6 reject` rule could also reject traffic that OpenClash is correctly proxying. Resolver-sync consumers therefore reject only the direct-WAN path and must not turn protected destination sets into a blanket service outage.

## State document

Default path:

```text
/var/run/openclash-guard/resolver-sync.json
```

Test or packaged deployments may override the path with `GUARD_RESOLVER_SYNC_STATE_FILE`.

Schema:

```json
{
  "schemaVersion": 1,
  "helper": "openclash-guard-resolver-sync",
  "backend": "adguardhome-resolver-sync",
  "status": "ready",
  "pid": 1234,
  "updatedAtEpoch": 1790017000,
  "nft": {
    "family": "inet",
    "table": "openclash_guard",
    "chain": "forward",
    "ipv4Set": "resolver_sync_v4",
    "ipv6Set": "resolver_sync_v6",
    "directInterface": "wan"
  }
}
```

`updatedAtEpoch` is a heartbeat/health timestamp, not a substitute for DNS-record TTL enforcement. The live helper still has to expire DNS-derived addresses according to record TTL or a stricter bounded timeout.

## Fixed nft ownership

| Object | Required identifier / evidence |
| --- | --- |
| family | `inet` |
| table | `openclash_guard` |
| consumer chain | `forward` |
| IPv4 set | `resolver_sync_v4`, type `ipv4_addr`, `flags timeout`, comment `openclash-guard:resolver-sync-v4-set` |
| IPv6 set | `resolver_sync_v6`, type `ipv6_addr`, `flags timeout`, comment `openclash-guard:resolver-sync-v6-set` |
| IPv4 consumer | `oifname "<direct WAN>" ip daddr @resolver_sync_v4 reject`, comment `openclash-guard:resolver-sync-v4` |
| IPv6 consumer | `oifname "<direct WAN>" ip6 daddr @resolver_sync_v6 reject`, comment `openclash-guard:resolver-sync-v6` |

Checking both the producer state and the nft consumer prevents a false-green state where a helper is alive and sets exist but no firewall rule actually consumes them. Scoping the consumer to the live direct WAN interface also prevents a false fail-closed implementation from rejecting traffic already routed through the OpenClash proxy path.

## Read-only boundary

Capability verification may:

- read the JSON state document;
- call `kill -0` for the declared PID;
- read the current epoch;
- discover and validate the current direct WAN interface from trusted local network state;
- use `nft list set` and `nft -a list chain`.

It must not create or flush tables, add/delete sets or rules, restart DNS/OpenClash services, rewrite helper state, or scrape the AdGuard Home query log.

## Live helper follow-up

The separate resolver-sync implementation must provide the producer side of this contract with structured parsing, strict IPv4/IPv6 validation, TTL/bounded-timeout expiry, atomic nft updates, AdGuard Home restart recovery, OpenClash-independent lifecycle handling, direct-path-only consumers, and fail-closed health reporting.

The live producer also owns domain-coverage semantics. A healthy process and correctly-shaped nft objects are insufficient if the producer cannot prove that it is synchronizing the intended protected-domain inventory. Shared third-party hosts and path-scoped dependencies must not be broadened into global destination-IP rejects merely to make the backend appear healthy.

Until that implementation is deployed and all consumer evidence verifies, `dns.domainSetBackend` remains `unavailable`.
