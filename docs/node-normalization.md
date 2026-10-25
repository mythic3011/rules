# Node and traffic privacy

## Node normalization

`internal/python/generate_ai_profiles.py` owns provider filters, visible group names, and region groups. YAML filters provider metadata nodes such as traffic and expiry notices with `exclude-filter`. INI cannot express the same provider option, so its manual group uses the maintained node filter and documents that limitation.

Node selection is manual. This prevents health checks from switching nodes; a stable public IP also requires the selected proxy to provide a fixed exit address.

Gaming CDN routing uses narrow game-service domains; it does not make every gaming flow direct. `ea.com` stays excluded because it can include account, authentication, and login endpoints. See [SSH routing](ssh-routing.md) for Tailscale interface handling.

## STUN, DNS, and address leaks

The canonical `Privacy_Guard_Classical` rule set routes to `REJECT` before private, AI, gaming, custom, client, and geo-routing rules in generated YAML and INI profiles. It blocks destination ports 53 and 853, the standard STUN/TURN ports 3478 and 5349, and the configured Google WebRTC STUN range 19302–19309. Google's WebRTC source uses `stun.l.google.com:19302` as a default endpoint ([source](https://chromium.googlesource.com/external/webrtc/stable/talk/+/master/p2p/client/connectivitychecker.cc)). `DOMAIN-KEYWORD,stun` catches named STUN hosts on other ports; it is a heuristic and can match unrelated hostnames containing `stun`. There is no broad `turn` keyword rule.

`IP-CIDR6,::/0,no-resolve` rejects all IPv6 destinations visible to the profile. This also blocks literal IPv6 addresses that bypass DNS matching, and can break IPv6-only services. The guard covers traffic that reaches the profile; it cannot identify STUN/TURN on arbitrary ports with unrelated hostnames or guarantee that all WebRTC is blocked.

Router deployments still need packet capture and firewall enforcement. Configure the OpenClash TUN/TProxy path to capture client TCP and UDP, redirect client DNS over both TCP and UDP port 53 to the intended resolver, and prevent LAN clients from forwarding around that path over IPv4 or IPv6. The port-53 rule is a backstop after DNS redirection handles legitimate queries. Verify the live router path with DNS and IPv4/IPv6 leak checks; a generated profile alone does not prove router enforcement.

DoT on port 853 is rejected. DoH over port 443 remains allowed because it shares HTTPS with ordinary web traffic. Keep any resolver bootstrap path explicit and limited to the configured resolvers; do not treat a bootstrap exception as a general direct route.

The configured STUN/TURN ports are based on [RFC 8489](https://www.rfc-editor.org/rfc/rfc8489.html) and [RFC 8656](https://www.rfc-editor.org/rfc/rfc8656.html). Mihomo's [classical provider format](https://wiki.metacubex.one/en/config/rule-providers/content/) supports destination-port and CIDR rules, so a destination-port rule also catches those ports when the application uses a literal IP address.
