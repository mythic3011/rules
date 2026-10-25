# OpenWrt build and provisioning boundaries

**Status:** Design reference only. No shared API, provisioning change, runtime integration, or deployment is proposed here.

## Separate the responsibilities

- **Firmware builder:** discovers platform capabilities and plans selected image transformations. Its migration is partial: the existing CI build script still applies transformations, while the build framework's plan step validates the proposed plan.
- **First-boot setup:** applies a device's initial network and package defaults. Operators must confirm the device's hardware, WAN/LAN layout, and recovery access before using those defaults.
- **OpenClash Guard:** owns its signed routing policy and tagged nftables/fw4 objects. Firmware provisioning must not replace or weaken that policy.
- **Local operator:** owns device addressing, upstream credentials, maintenance access, and approval of risky changes.
- **Future fleet service:** may collect read-only evidence and propose rollouts. It is not implemented here and must not run privileged shell commands on a router.

A firmware recipe or build plan is not a security policy. There is no shared provisioning-to-Guard API or authority contract today.

## Compatibility and release limits

Build tooling models both OPKG and APK, but at least one existing bootstrap path uses OPKG-specific commands. That path is not evidence of APK compatibility; verify the actual device and package manager before applying a provisioned image.

This document does not claim that the builder packages or signs OpenClash Guard firmware. If signed firmware distribution is introduced later, it needs a separate signer, verification policy, versioning, and rollback contract from Guard's signed policy release.

Generic first-boot network or firewall defaults are not a selective VPN kill switch. A successful image build or setup run does not prove that Guard's protected traffic cannot leave over direct WAN.

## Gates for future integration

1. Discover hardware, package, network, DNS, fw4, and OpenClash capabilities without changing the device.
2. Map ownership for UCI, firewall, DNS, and OpenClash settings. Reject conflicting writers before mutation.
3. Exercise provisioning and Guard recovery in an isolated router environment, including unknown interfaces, DNS or tunnel loss, IPv4/IPv6, and interrupted apply. Keep a manual recovery path.
4. Verify the signed policy generation and live dataplane before reporting protected egress as active.

Keep future integration in separate implementation and release reviews. Do not copy private topology, device identifiers, credentials, or live defaults into this repository.
