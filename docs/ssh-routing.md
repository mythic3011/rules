# SSH Routing

The AI profile generator creates three SSH companion rule files:
- `rule/SSH_Direct_Classical.yaml`
- `rule/SSH_Proxy_Classical.yaml`
- `rule/SSH_Process_Classical.yaml`

`SSH_Direct_Classical.yaml` is for exact, intentional direct routing only. Use a narrow `/32` endpoint after testing and do not add global `DST-PORT,22`. Broad provider subnets are intentionally excluded. `Cloudflare generate_204` checks proxy reachability only; it does not prove SSH-to-VPS path quality.

`SSH_Proxy_Classical.yaml` is for intentionally proxied SSH destinations. Keep entries narrow and explicit. `SSH_Process_Classical.yaml` exists only as a desktop compatibility surface. `PROCESS-NAME` only works when Mihomo or Clash runs on the same host as the process. OpenClash router TProxy mode normally cannot attribute LAN traffic back to a client process name.

Tailscale exit-node traffic needs more than rule-level `DIRECT`. Rule-level routing is not enough for WireGuard UDP encapsulation. Router deployments need firewall or `iptables`/`nftables`-level TProxy bypass for the Tailscale interface as well. Tailscale direct connectivity commonly uses UDP 41641. Tailscale STUN commonly uses UDP 3478. DERP relay sets change over time, so do not hardcode unverified Tailscale CIDR or DERP IP ranges into generated rules.
