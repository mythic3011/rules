# Rule Asset Matching Contract

## 1. Purpose

This document defines the contract for any future "check domain / IP on rules/list" feature.

The goal is to prevent a lazy global grep-style implementation that scans every artifact for every input type.

The contract is strict:

- IP input must only route to IP-capable assets
- domain input must only route to domain-capable assets
- asset capability must be classified before matcher code or UI code is written

This is not optional implementation detail. It is the boundary that preserves operational value.

---

## 2. Input Types

Supported logical input types:

- `domain`
- `ip`

Anything else is out of scope for the first matcher version.

Input detection rules:

- if input parses as IPv4 or IPv6 address, treat as `ip`
- otherwise treat as `domain`
- do not attempt mixed fallback in the same query path

Examples:

- `1.1.1.1` -> `ip`
- `2606:4700:4700::1111` -> `ip`
- `example.com` -> `domain`

---

## 3. Asset Classification Layer

Every searchable artifact must be classified before it can participate in matching.

Allowed asset classes:

- `domain`
- `ip_exact`
- `cidr`
- `ip_range`
- `mixed`
- `unsupported`

Definitions:

- `domain`: contains domain rules only
- `ip_exact`: contains standalone IP entries only
- `cidr`: contains subnet-style rules such as `1.2.3.0/24`
- `ip_range`: contains explicit IP range rules
- `mixed`: contains both domain and IP rule semantics
- `unsupported`: binary, opaque, or not safely searchable for the current matcher

The matcher must never infer capability at query time by guessing from content alone.
Capability must come from an explicit inventory.

---

## 4. Current Repo Classification Baseline

This section records the current intended baseline classification for representative assets in this repository.

### 4.1 Domain-only assets

- `dns/*.hosts.txt` -> `domain`
- `dns/*.dnsmasq.conf` -> `domain`
- `rule/*_Domain.yaml` -> `domain`
- `rule/*.list` where the source is domain-oriented -> `domain`
- generated adblock pipeline outputs (`adblock`, `tracking`, `telemetry`, `malware`) -> `domain`

Reason:

- these assets contain domains rendered in hosts / dnsmasq / domain provider formats
- they are not valid IP containment targets

### 4.2 IP-capable assets

- `rule/*_IP.yaml` -> `cidr`
- `rule/*_Classical_IP.yaml` -> `cidr`

Reason:

- these contain `IP-CIDR` or CIDR-style payloads
- exact IP lookup is a subset of CIDR lookup via `/32` or `/128`

### 4.3 Mixed assets

- `rule/*_Classical.yaml` -> `mixed`

Reason:

- they may contain both domain and IP semantics
- matcher must parse and route by record type, not treat them as domain-only

### 4.4 Unsupported assets

- `rule/*.mrs` -> `unsupported` for the first version

Reason:

- binary format
- searchable only after a dedicated decoder/parser is added

---

## 5. Matcher Routing Contract

### 5.1 IP input

IP input must route only to:

- `ip_exact`
- `cidr`
- `ip_range`
- `mixed` assets with explicitly extracted IP-capable records

IP input must never route to:

- `domain`
- `unsupported`

This means:

- do not scan `dns/*.hosts.txt`
- do not scan `dns/*.dnsmasq.conf`
- do not scan pure domain rule providers for IP containment

### 5.2 Domain input

Domain input must route only to:

- `domain`
- `mixed` assets with explicitly extracted domain-capable records

Domain input must never route to:

- pure IP assets
- `unsupported`

---

## 6. IP Matching Semantics

The first IP matcher version is intentionally aggressive, but only inside IP-capable assets.

Required checks:

- exact IP match
- CIDR containment
- IP range containment

Required response behavior:

- return all matches
- rank: `exact` > `cidr` > `range`
- include:
  - `matched_by`
  - `matched_network`
  - `rule_source`

Recommended response schema:

```json
{
  "input": "1.1.1.1",
  "input_type": "ip",
  "matches": [
    {
      "match_type": "cidr",
      "matched_by": "cidr_containment",
      "matched_network": "1.1.1.1/32",
      "rule_source": "rule/Encrypted_DNS_Classical_IP.yaml",
      "asset_class": "cidr"
    }
  ]
}
```

---

## 7. Domain Matching Semantics

The first domain matcher version should stay conservative.

Allowed domain semantics:

- exact domain
- domain suffix
- domain keyword only when the asset format explicitly represents keyword rules

The matcher must not fabricate IP-style containment against domain assets.

Specifically forbidden:

- treating hosts outputs as IP match targets
- treating dnsmasq domain lines as CIDR/range searchable assets
- attempting reverse lookup style behavior inside the same query path

---

## 8. Inventory Before UI

Implementation order is mandatory:

1. build rule asset inventory
2. assign asset classes
3. define matcher contract
4. implement matcher
5. then expose it in Pages UI

Do not skip inventory.

Without inventory, the UI will:

- scan irrelevant files for the wrong input type
- produce noisy matches
- destroy trust in the checker

---

## 9. First-Version Scope Recommendation

Recommended first searchable set:

- IP:
  - `rule/*_IP.yaml`
  - `rule/*_Classical_IP.yaml`
- Domain:
  - `dns/*.hosts.txt`
  - `dns/*.dnsmasq.conf`
  - `rule/*_Domain.yaml`
  - selected `rule/*_Classical.yaml` after explicit parsing support is added

Deferred:

- `rule/*.mrs`
- cross-type fallback
- reverse-DNS enrichment
- ASN / GeoIP interpretation

---

## 10. Design Rule

The permanent rule is:

- "search IP-capable rule files only" is a contract, not a convenience

Any future implementation that performs global untyped search across all artifacts violates this design.
