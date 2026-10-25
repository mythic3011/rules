# SSH and Tailscale routing

The generator creates these SSH companion rule files:

- `rule/SSH_Direct_Classical.yaml` for exact intentional direct routes. Use a tested `/32`; do not add broad provider subnets or global `DST-PORT,22`.
- `rule/SSH_Proxy_Classical.yaml` for narrow destinations that should use the proxy.
- `rule/SSH_Process_Classical.yaml` for desktop-only compatibility. `PROCESS-NAME` cannot identify LAN client processes when OpenClash runs on the router.

Cloudflare `generate_204` checks proxy reachability only; it does not prove SSH-to-VPS path quality.

Tailscale exit-node traffic needs a router firewall or `iptables`/`nftables` TProxy bypass for the Tailscale interface. Rule-level `DIRECT` cannot inspect WireGuard UDP encapsulation. Tailscale direct connectivity commonly uses UDP 41641; DERP relay addresses change, so do not hardcode unverified ranges.

The privacy guard rejects captured traffic on UDP 3478 and TCP 3478, including STUN used for Tailscale discovery. This can reduce NAT traversal and affect peer discovery. The profile has no Tailscale STUN exception. Any interface-level firewall bypass is an explicit operator choice and changes the blocking guarantee for traffic covered by that bypass.
