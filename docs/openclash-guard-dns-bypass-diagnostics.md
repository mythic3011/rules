# OpenClash Guard DNS bypass diagnostics

OpenClash Guard treats DNS firewall exceptions as observable runtime facts. It does not delete, rewrite, or reconcile third-party firewall rules.

The detector reads the live `inet fw4` ruleset and reports only explicit client-scoped DNS escape paths:

- a source IPv4 address with destination port 53 accepted directly to WAN;
- a source IPv4 address with destination port 853 accepted directly to WAN;
- a source IPv4 address whose destination-port-53 traffic returns from `dstnat` before normal DNS hijack processing.

A generic LAN-to-WAN accept rule is not enough to trigger the detector. The rule must contain both a concrete `ip saddr` selector and the relevant DNS destination port.

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

## Non-goals

This detector does not attempt to identify browser or application DoH over TCP/443, Android Private DNS policy, VPN-internal resolver behavior, or resolver POP geolocation. Those require different observation points and must not be inferred from port-53/853 firewall state.

The detector also does not infer intent from nftables comments. Comments may help an operator locate a rule, but the diagnostic result is based on rule semantics rather than names such as `Pixel-8-Pro-DNS-bypass`.
