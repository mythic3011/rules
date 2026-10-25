# OpenClash Guard resolver-sync capability contract

This document defines the evidence contract used by OpenClash Guard before it may report an AdGuard Home domain-set backend as available.

The resolver-sync producer is implemented inside the signed OpenClash Guard bundle and is driven by the Guard-owned `rules sync watch` lifecycle. Capability verification remains read-only: the producer may update Guard-owned timeout sets and state, but `dns.domainSetBackend` is promoted to `adguardhome-resolver-sync` only when the independent evidence checks below all pass.

## Trust decision

A marker file by itself is not capability evidence. Guard reports `adguardhome-resolver-sync` only when all of the following are true at the same observation point:

1. the state document is a regular, non-symlink JSON file using schema version 1;
2. `helper`, `backend`, and `status` exactly identify the expected ready producer;
3. the recorded PID is numeric, greater than 1, and responds to `kill -0`;
4. `updatedAtEpoch` is not in the future and is no older than the bounded health window (120 seconds by default, maximum configurable value 3600 seconds);
5. `sourceRevision` exactly matches the selector inventory embedded in the running signed Guard bundle;
6. the state document declares the exact fixed Guard-owned nft identifiers below and records the independently discovered direct WAN interface;
7. both fixed nft sets exist with the expected address family, `timeout` flag, and Guard ownership comment;
8. the fixed Guard `forward` chain contains the expected IPv4 and IPv6 consumer rules, each referencing the corresponding set, rejecting only traffic whose output interface is the independently discovered direct WAN interface, and carrying the exact Guard ownership comments.

Any missing, malformed, stale, future-dated, contradictory, or incomplete evidence returns `unavailable`.

The state document never supplies nft command arguments. Guard compares declared fixed identifiers against constants first. The direct interface is independently discovered from live network state (or an explicit trusted operator override) and is validated before it is used or compared with state. This prevents a compromised or malformed state document from redirecting the verifier to arbitrary tables, chains, sets, or interfaces.

The direct-interface condition is part of the security contract, not an optimization. An unconditional `ip daddr @resolver_sync_v4 reject` / `ip6 daddr @resolver_sync_v6 reject` rule could also reject traffic that OpenClash is correctly proxying. Resolver-sync consumers therefore reject only the direct-WAN path and must not turn protected destination sets into a blanket service outage.

## State document

Default path:

```text
/var/run/openclash-guard/resolver-sync.json
```

Test or packaged deployments may override the path with `GUARD_RESOLVER_SYNC_STATE_FILE`.

Schema example:

```json
{
  "schemaVersion": 1,
  "helper": "openclash-guard-resolver-sync",
  "backend": "adguardhome-resolver-sync",
  "status": "ready",
  "pid": 1234,
  "updatedAtEpoch": 1790017000,
  "reason": "ok",
  "sourceRevision": "d07cac190c33e7914ba7adaf7e7c14298fba7024",
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

`updatedAtEpoch` is a heartbeat/health timestamp, not a substitute for DNS-record TTL enforcement. DNS-derived addresses expire according to their observed TTL or a stricter configured bound. The producer conservatively subtracts elapsed polling time before publishing a timeout, so an answer whose TTL is already exhausted is never inserted.

`sourceRevision` binds persistent cache provenance to the selector inventory compiled into the signed bundle. A stopped producer may retain a `degraded` state only for that provenance purpose; degraded or stopped state never satisfies the ready capability contract.

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

Checking both the producer state and the nft consumer prevents a false-green state where a producer is alive and sets exist but no firewall rule actually consumes them. Scoping the consumer to the live direct WAN interface also prevents a false fail-closed implementation from rejecting traffic already routed through the OpenClash proxy path.

## Read-only verification boundary

Capability verification may:

- read the JSON state document;
- call `kill -0` for the declared PID;
- read the current epoch;
- discover and validate the current direct WAN interface from trusted local network state;
- use `nft list set` and `nft -a list chain`.

It must not create or flush tables, add/delete sets or rules, restart DNS/OpenClash services, rewrite producer state, or scrape the AdGuard Home query log.

## Producer behavior

The producer side of this contract:

- reads AdGuard Home query-log data through its structured control API rather than shell-scraping query-log files;
- validates IPv4 and IPv6 answers separately and ignores family-mismatched values;
- applies DNS TTLs with a bounded maximum and elapsed-poll-time subtraction;
- updates both Guard-owned timeout sets in one nftables batch before publishing cache/cursor state;
- treats malformed or unavailable query-log data, missing consumers, and nft update failures as degraded capability;
- returns to a warming baseline after query-log restart or cursor reset instead of replaying unknown history;
- runs under the Guard-owned rule-sync lifecycle and does not depend on the OpenClash process lifecycle;
- preserves only current-revision degraded provenance across a clean stop so still-valid cache entries can be restored after a Guard table rebuild without advertising a ready backend.

`dns.domainSetBackend` remains `unavailable` whenever the producer is warming, degraded, stopped, stale, or its nft consumer evidence does not verify.
