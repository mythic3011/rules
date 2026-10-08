# OpenWrt provisioning reference for the hybrid security platform

**Status:** architecture cross-reference only; **no runtime integration or deployment**.
**Source:** a separately managed/private `linux_setup` OpenWrt builder workspace.
**Disclosure boundary:** this public RFC records architectural patterns only. Do not copy private deployment credentials, topology, identifiers, per-device addresses, inventory, local firewall rules, or operational logs into this repository.

## Separate the build plane from the security enforcement plane

| Plane | Responsibility | Expected owner |
| --- | --- | --- |
| Firmware/build plane | Build firmware from versioned intent, discover compatibility, plan immutable transformations, produce tested artifacts | `linux_setup/openwrt-builder/buildfw` |
| Device provisioning | Apply initial OpenWrt baseline and local management dependencies | `linux_setup/openwrt-builder/openwrt/uci-defaults` (subject to compatibility review) |
| Network enforcement | Runtime OpenClash/Mihomo routing, scoped DNS guard, gaming-direct exceptions, nft/fw4 reconciliation, kill switch | This repository's **OpenClash Guard**, unchanged |
| Fleet policy control (future) | Enrollment, signed intent distribution, read-only health collection, rollout approvals | **NOT IMPLEMENTED** — separate future service |
| Client/browser enforcement (future) | Portable OS controls, browser extension + authenticated companion; separate from gateway runtime | **NOT IMPLEMENTED** |

The firmware builder's `BuildRecipe` is **not** a security `PolicyIR`. Do not repurpose firmware build endpoints, Docker workers, or a WebUI as remotely privileged nftables policy executors. A future controller can *consume firmware provenance and capability evidence*, but runtime enforcement must remain with the Guard and OS-native enforcers.

## Reference patterns worth reusing

1. **Intent != observed facts != executable plan:** `BuildRecipe + BuildContext + compatibility rules => immutable BuildPlan` is a useful planning shape. For runtime security it becomes signed policy intent + trusted device capabilities + measured environment => validated *proposed* enforcement plan. Different schemas and permissions are required.
2. **Pure planning before side effects:** discovery/preflight/dry-run are read-only, and risky or unknown transformations do not auto-apply. Runtime policy deployment must have explicit authority, rollback, audit, and a fail-closed error branch.
3. **Capability-aware compatibility:** platform/kernel/package manager differ across devices, so detect actual interfaces and nft/fw4/OpenClash capabilities; never infer them from firmware version alone.
4. **Lifecycle provenance:** signed firmware/package artifacts and signed routing-policy distributions each need their own update authority and rollback/version semantics. The builder may produce a firmware image containing an approved version of the Guard, but may not silently override the Guard's separate signed policy or local runtime state.
5. **Isolated control and workers:** a firmware builder may need a Docker socket on its privileged host service. That privilege does not extend to a browser extension, telemetry ingester, or remote security-policy API.

## Integration hazards found in the reference tree

These are **code/design review observations**, not live incidents:

- First-boot network defaults currently set a fixed LAN address and configure generic WAN protocol defaults. A device's actual NIC/VLAN layout, management reachability, and WAN uplink must be resolved before any first-boot script can safely apply. **Never deploy a generic first-boot script as a routine policy reconcile.**
- A baseline firewall with ordinary `lan -> wan` forwarding and `output ACCEPT` is not a selective VPN-required kill switch. It must not be treated as proof of the Guard's protected direct-WAN invariant.
- One platform bootstrap path uses package-manager-specific operations. Build-time packages and platform capabilities must be verified across both supported OpenWrt packaging generations before upgrading devices.
- Service Compose files and the broader home-infrastructure specification describe intended services; they are **not** evidence that fleet enrollment, SIEM correlation, DNS leak controls, router policy synchronization, or production telemetry are deployed.
- Network and DNS first-boot scripts can conflict with Guard ownership or AdGuard/OpenClash configuration. Require an explicit owner map and non-destructive drift detection before integrating either project's install path.

## Required ownership and ordering

```text
Firmware Source / BuildRecipe
   -> buildfw discovery -> deterministic plan -> firmware build -> artifact verify
   -> first-boot provisioning (hardware-specific; separate release/approval)
   -> OpenWrt / fw4 / DNS / OpenClash readiness observations
   -> OpenClash Guard preflight + owned nftables reconcile
   -> readonly Guard status/doctor/capability evidence
   -> (future) fleet controller consumes evidence and proposes rollout
```

- **Image builder owns:** firmware packages, initial UCI defaults, image metadata, reproducible build records.
- **OpenClash Guard owns:** its tagged nftables table/rules/sets, live routing exceptions and current protected-service kill switch. Its existing signed-release and overlay gates stay authoritative.
- **Local operator owns:** real NIC/VLAN addressing, upstream credentials, network recovery access, and explicit high-risk deployment approvals.
- **Future controller owns:** device registration, policy distribution history and orchestration intents, **not** blind root-shell execution.

If both projects need to manage the same UCI key, reject the integration until an explicit authority/override contract defines who may write it and how conflicts are reported. A higher-level desired state does not authorize bypassing the local security floor.

## Integration acceptance for a future adapter

1. Probe firmware build identity and current package/feature capabilities **read-only**, without changing network or firewall.
2. Probe Guard `status --json` / `doctor` independently and preserve unavailable/stale evidence as unknown; do not reuse build success as enforcement proof.
3. Validate an owner map for UCI, nftables, fw4 includes, DNS, OpenClash hooks, interface names, and release state. Detect conflicts before mutation.
4. In an isolated OpenWrt namespace/VM, simulate provisioning and Guard restart/reconcile (including IPv4/IPv6, tunnel loss, DNS loss, LAN continuity, unknown NIC and interrupted apply).
5. Require signed-policy generation match and dynamic dataplane proof before reporting protected egress as verified; retain a manual recovery channel.
6. Do not modify first-boot scripts, live configuration, or generated Guard bundles from this RFC. Land any changes through separate implementation PRs and preserve existing test/release gates.

**Nonclaims:** No cross-repository API, shared schema, fleet enrollment, controller adapter, mobile agent, or live end-to-end integration is currently implemented or proven by this document.
