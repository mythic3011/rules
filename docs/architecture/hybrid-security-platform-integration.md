# Hybrid security platform: integration boundary and implementation inventory

**Status:** design / integration RFC, not an implementation claim.
**Repository role:** `mythic3011/rules` owns the existing OpenClash/Mihomo rules and OpenClash Guard. It is **not** the fleet controller, endpoint agent, or browser extension.
**Baseline:** default branch `main`; open PRs are not production dependencies.

## 1. Verified repository inventory

| Capability | Status in this repository | Current reference / constraint |
| --- | --- | --- |
| Generated Mihomo/OpenClash profiles and rule providers | Source exists | `cfg/`, `rule/`, `internal/config/ai-routing/`, `internal/python/` |
| DNS/host lists and integration | Source exists | `dns/`, `shell/apps/openclash-guard/dns.sh` |
| Selective rules + Guard kill switch | Source exists | `shell/apps/openclash-guard/rules.sh`, `killswitch.sh`, `policy.sh` |
| Gaming scoped direct dataplane | Source and documented router observations exist | `gaming.sh`, `dataplane.sh`, `docs/openclash-guard-gaming-dataplane.md` |
| Resolver-derived direct-WAN denial | Source and tests exist; availability is capability-gated | `resolver-sync.sh`, `docs/openclash-guard-resolver-sync-contract.md` |
| Status, doctor, tunnel-health and signed distribution | Source exists | `main.sh`, `health.sh`, `tunnel-health.sh`, `docs/openclash-guard.md` |
| Runtime UCI overlay integration | **In open PR, not main baseline** | PR #130; keep its authority gates separate until merged |
| Hermetic firewall proof contract | **Not live firewall proof** | `docs/ai-routing-firewall-proof.md` explicitly excludes live nft/fw4 and boot-race claims |

These are *source-level observations*, not a statement that the latest bundle is installed or verified on the user's router. Do not turn planned or gated functionality into a "ready" status.

## 2. New platform capabilities — NOT IMPLEMENTED here

| Component | Status | Proposed owner |
| --- | --- | --- |
| Cross-device enrollment, device identity, revocation | NOT IMPLEMENTED | Fleet controller (separate service) |
| Signed policy distribution and durable device ACK | NOT IMPLEMENTED | Controller + endpoint/gateway adapters |
| Portable Android/iOS/desktop VPN and DNS enforcement agent | NOT IMPLEMENTED | Endpoint agent projects |
| Network roaming, cellular/Wi-Fi handover, captive-portal bootstrap | NOT IMPLEMENTED | Platform-specific endpoint transport adapters |
| Central SIEM/event ingestion and incident workflows | NOT IMPLEMENTED | Telemetry service |
| Learning, risk calibration, shadow policy testing | NOT IMPLEMENTED | Policy intelligence service |
| Ghost-Scout integration | NOT IMPLEMENTED | Evidence/intelligence provider adapter |
| Browser extension client + native companion + server model | NOT IMPLEMENTED | Separate extension and companion projects |
| Cross-platform production enforcement certification | NOT IMPLEMENTED | Per-OS and router integration test suites |

No `TODO` above should be interpreted as working code or an offered security guarantee.

## 3. Authority boundaries

```text
Browser extension (browser context + UX; not an enforcement authority)
    <-> Authenticated native companion (optional)
    <-> Local policy cache / endpoint agent
    <-> Controller API (enrollment, policy, telemetry; remote may be offline)

Endpoint agent ------> OS-level per-app / TUN / firewall enforcement
OpenWrt Guard --------> nftables / fw4 + OpenClash/Mihomo routing
Ghost-Scout ----------> versioned identity/exposure evidence, NOT an allow verdict
Learner --------------> policy proposals, NEVER a bypass permit
```

This repository should expose narrow **policy and status contracts** for future adapters. Do not migrate browser UI, credentials, agent fleet state, or private telemetry into public `cfg/`, `rule/`, or `dns/` artifacts.

The browser extension is a **client of local/server services**, not a standalone client-only security-policy renderer. It may render its own UI and enforce browser-scoped DOM/content rules. It must not claim to control packets, guarantee OS kill-switch behavior, or impersonate endpoint identity. Native IPC requires explicit caller authentication, command allowlists, and least-privilege access.

## 4. Canonical routing intent

Each flow has one effective routing intent, scoped to a trusted policy subject (device, application when truly observable, or network client):

| Intent | Healthy path | Transport unavailable |
| --- | --- | --- |
| `VPN_REQUIRED` | Approved protected egress | **DROP; never DIRECT** |
| `DIRECT_ALLOWED` | Explicit direct WAN | Remains direct if WAN works |
| `BLOCK` | DROP | DROP |
| `UNKNOWN` | Explicit policy-specific safe fallback | Never infer that UNKNOWN means DIRECT |

These are *proposed* cross-platform semantics, not a replacement for the existing Guard runtime schema. An `AI service`, `VPN-required`, `domain routing`, and `threat verdict` are separate types of policy; do not map them to one implicit risk score.

**Hard invariants:**

1. A protected flow must never escape to direct WAN because a proxy, DNS resolver, learner, controller, extension, or companion is down.
2. Unrelated explicitly direct-allowed flows must not be blocked solely because a protected transport is down, *when the OS/enforcer can preserve that separation*.
3. When an endpoint agent is absent or crashed, OS-level lockdown may block **all** traffic; selective domain direct access is **not** guaranteed in this state.
4. A domain-to-IP mapping is not authoritative when multiple domains share a CDN IP, apps bypass DNS, DNS records expire, or encrypted ClientHello hides names. For unresolved identity, use existing device/app policy; do not silently weaken protected paths.
5. Remote policy delivery may be unavailable: validate and retain the last-known-good local security floor.
6. Learner / reputation providers can suggest or enrich policies, not override signed / administrator-set enforcement invariants.
7. Reconciliation should be atomic, idempotent, scoped to owned nftables objects, and auditable. No write operation through a read-only status API.

## 5. DNS and roaming contracts (future work)

- DNS policy and transport health are independent. A protected DNS failure does **not** imply a VPN failure, nor permit a campus/local DNS fallback for a domain whose policy forbids it.
- Example: `a.example.com` => `VPN_REQUIRED`; `b.example.com` => `DIRECT_ALLOWED`. If approved transport is down: `a` drops, `b` remains direct *if the chosen enforcement layer can attribute the flows separately*.
- A protected path already on cellular may remain preferred while Wi-Fi capability is checked. Only migrate after a valid approved transport path is confirmed. Network handover success depends on OS APIs and is not guaranteed by keeping an Agent process alive.
- Bootstrap for captive portal / network sign-in is explicit, narrow and audited; no general "VPN down => bypass" branch.
- Failure states should distinguish `protected`, `degraded`, `lockdown`, and `unprotected`. "Unprotected" must not be shown as protected simply because an agent is enrolled.
- Personal devices and IoT may be gateway-managed; portable devices normally need endpoint enforcement. A stationary desktop may still require an endpoint component for per-process routing.

## 6. Minimal integration contract (proposed)

Future controllers must discover **read-only** capabilities before submitting any policy intent:

```json
{
  "schemaVersion": 1,
  "enforcer": "openclash-guard",
  "observation": {
    "policyVersion": "string",
    "rulesetGeneration": "string",
    "observedAt": "RFC3339 timestamp",
    "enforcement": "reject|allow-proxy|disabled|unavailable",
    "firewallTable": "active|absent|unavailable"
  },
  "capabilities": {
    "deviceOrVlanScope": "unknown",
    "domainAwareRouting": "unknown",
    "protectedDns": "unknown",
    "killSwitchProof": "unknown"
  }
}
```

This is a **draft envelope**, not an implemented CLI/API response. A controller adapter must translate from *actual* Guard `status --json` / `doctor` output after inspecting runtime schema. It must represent stale, absent, or unproven data as `unknown` / `unavailable`, never `healthy`.

The service MUST NOT accept external "kill switch verified" claims without local enforcement evidence. Do not reuse the hermetic Phase 4e proof as a production nftables attestation.

## 7. Implementation milestones (nothing below is implemented by this RFC)

| Step | Scope | Acceptance / proof |
| --- | --- | --- |
| 0 | Freeze inventory and integration boundary (this RFC) | Current/Planned status separate; no runtime modification |
| 1 | Read-only Guard adapter | Parse status/doctor; preserve unknown states; redact secrets; no mutations |
| 2 | Shared policy IR and validator | Deterministic validation of `VPN_REQUIRED`, `DIRECT_ALLOWED`, `BLOCK`, UNKNOWN; cross-policy conflicts rejected |
| 3 | Shadow compiler + kernel invariant tests | Test cases for shared-CDN IP, DNS unavailable, tunnel crash, boot, IPv4/IPv6, direct gaming |
| 4 | One endpoint prototype (Android recommended) | OS lockdown capability matrix with reboot/force-stop/roaming failures observed; no promises beyond tests |
| 5 | Self-hosted enrollment and signed policy channel | Device bound credentials; revocation/rotation; cache last-known-good; no remote secrets in rules repo |
| 6 | Browser extension client + companion + server | Browser capabilities isolated, explicit authentication; extension disabled cannot stop kernel enforcement |
| 7 | Learning mode (observe -> shadow -> proposal) | No automatic relaxation of protected routing; measure false positive, leak, availability |
| 8 | Production rollout | Staged canary, replay/rollback, platform capability attestations, live namespace test suite |

## 8. Repository compatibility and deployment rules

- Respect `AGENTS.md`: `cfg/`, `rule/`, `dns/` are public artifact APIs. Generated files originate from `internal/config/` and generators.
- Do not silently replace signed Guard policy or alter the release-signing workflow. In-flight PRs must be assessed against merged `main` before integration.
- New cross-platform components should live in a separate repository/workspace, with a versioned adapter protocol. This RFC does **not** choose or create that repository.
- The separate OpenWrt builder/provisioning workspace is an **infrastructure reference**, not a runtime policy authority: see [OpenWrt provisioning reference](openwrt-provisioning-reference.md). Do not copy private topology, credentials, or live UCI defaults into public release artifacts; Guard keeps ownership of its nft/firewall policy and signed distribution.
- Required acceptance for a future *code* PR: `make check`; TypeScript routing changes additionally `npm ci && make check-all`, plus environment-specific tests where applicable.

## 9. Deliberate nonclaims

No new agent, controller, SIEM, ML model, browser extension, enrollment service, network capability scanner, or roaming transport is built by this change. There is no assertion of live fail-closed proof on an actual phone, Mac, Windows laptop, or router.
