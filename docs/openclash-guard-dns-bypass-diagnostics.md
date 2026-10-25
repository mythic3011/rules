# OpenClash Guard DNS bypass diagnostics

OpenClash Guard treats DNS firewall exceptions as observable runtime facts. It does not delete, rewrite, or reconcile third-party firewall rules.

The detector reads the live `inet fw4` ruleset and reports explicit DNS escape paths:

- a port-53 and/or port-853 rule in `forward_lan` that jumps to `accept_to_wan`;
- a port-53 rule in `dstnat` that returns before normal DNS hijack processing.

A generic LAN-to-WAN accept rule is not enough to trigger the detector. Each reported rule must contain the relevant destination port and action. A literal IPv4 address, IPv6 address, or valid CIDR is included in the unique client list. Set references such as `ip saddr @dns_bypass_clients`, missing source selectors, and other complex expressions are not guessed or expanded; each such rule increments `unknownSourceRules`.

`openclash-guard status --json` exposes the observation under `dns.clientBypass`:

```json
{
  "dns": {
    "clientBypass": {
      "available": true,
      "count": 1,
      "clients": ["10.0.0.169"],
      "port53": true,
      "dot853": true,
      "hijack53": true
    }
  }
}
```

`available: false` means Guard could not read both required fw4 chains. It must not be interpreted as proof that no bypass exists.

`openclash-guard doctor` reports rule counts separately from the compatible status JSON fields:

| Doctor field | Meaning |
| --- | --- |
| `dns.clientBypass.rules` | Direct-WAN forward rules matching port 53 and/or 853 |
| `dns.clientBypass.port53Rules` | Matching direct-WAN rules for port 53 |
| `dns.clientBypass.dot853Rules` | Matching direct-WAN rules for port 853 |
| `dns.clientBypass.hijackBypassRules` | Port-53 `dstnat` return rules |
| `dns.clientBypass.unknownSourceRules` | Matching rules whose client selector is missing or not a literal address/CIDR |
| `dns.clientBypass.unknownDportRules` | Forward or `dstnat` rules whose destination-port selector is unsupported or ambiguous |
| `dns.clientBypass.clients.count` | Number of unique literal client addresses/CIDRs |
| `dns.clientBypass.clients.items` | The unique literal client list, when non-empty |

The detector understands numeric ports, nft brace lists, numeric ranges, and numeric equality/inequality comparisons. It reports unsupported selectors through `unknownDportRules` and warns that it cannot rule out port 53/853. The scan can be available while `unknownSourceRules` is non-zero. In that case, the listed clients are only the literal sources Guard could identify; they are not a complete list of clients covered by the matching rules.

## Non-goals

This detector does not attempt to identify browser or application DoH over TCP/443, Android Private DNS policy, VPN-internal resolver behavior, or resolver POP geolocation. Those require different observation points and must not be inferred from port-53/853 firewall state.

The detector also does not infer intent from nftables comments. Comments may help an operator locate a rule, but the diagnostic result is based on rule semantics rather than names such as `Pixel-8-Pro-DNS-bypass`.
