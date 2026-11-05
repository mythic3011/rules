# Guard firewall performance and observation audit

Audited on 2026-11-05 against signed PR #164 head
`2c21d4ab46f6fb9e271e37e56eaa63a0ee4a7765`. This report does not authorize
installation, merge, or changes to a router's acceleration settings.

## Confirmed offload coverage gap

Guard renders its main forward hook at priority `-150` and gaming validation at
`-151`. These precede fw4's ordinary forward chain, but an existing flowtable hit
bypasses the forward hooks entirely. Guard has no source handling for offload
discovery, exclusion, or invalidation. Consequently the PR's established-flow
fix cannot establish strict coverage for flows already admitted to a flowtable.

The [Linux flowtable documentation](https://docs.kernel.org/networking/nf_flowtable.html)
describes this bypass. The
[fw4 ruleset template](https://github.com/openwrt/firewall4/blob/d961882bafe856240344f5856f5f6a39597aaf90/root/usr/share/firewall4/templates/ruleset.uc)
places the flowtable on ingress and its offload action in the ordinary forward
chain. A later `chain-prepend` include alone is therefore not sufficient to
implement selective offload exclusions ahead of that action.

An isolated synthetic Linux reproduction used a network-disabled container,
two endpoint namespaces and a router namespace with veth links. Software
flowtable forwarding warmed a bidirectional UDP flow. A new unconditional
counter/reject rule at forward priority `-150` then produced:

| Phase | Result |
| --- | --- |
| Warm-up | 12/12 UDP echoes received |
| Existing flowtable plus new forward reject | 5/5 echoes received; reject counter remained 0 |
| Test flowtable removed | 3/3 attempts blocked |

The test used nftables 1.0.9 and kernel
`7.2.12-orbstack-00394-gbecdd6130068`, with image ID
`sha256:5d3fe8de1c0abcf232ebcd2e5254565c7aa7400bc7830094f213a23854a72685`.
The probe models Guard's hook and does not run a complete OpenClash deployment.
It does not prove the target router has acceleration enabled, reproduce hardware
offload, or establish live OpenWrt acceptance. Its temporary source is
`/private/tmp/guard-flowtable-probe-20261105.py` on the audit machine.

## Fresh control-plane measurements

Three serial samples loaded and filtered the same 353-port policy on macOS,
comparing trusted baseline `24126d9b` with the signed head. A counting wrapper
measured subprocesses separately from uninstrumented timing runs.

| Measurement | Baseline | Signed head |
| --- | ---: | ---: |
| Filter AWK processes | 355 | 2 |
| Median load plus filter | 4.0457 s | 0.6538 s |
| Filter output | 353 lines / 2118 bytes | 353 lines / 2118 bytes |

Both outputs have SHA-256
`affbaa480d59372acaf4a9455a386ba9166b7ff7c0c98444d533b869c7c7b0ea`.
These timings measure host parser/filter cost, not router packet throughput,
full reconcile latency, or enabled-gaming rendering. The remaining shell loop
still performs linear protected-port membership scans. A set-based batched
filter could be evaluated with larger protected inventories, but this audit
does not demonstrate a need for that additional change.

## Proposed modern fw4 support

Two alternatives need an explicit firewall lifecycle decision:

1. Strict preflight requires operator-disabled acceleration. Check configured
   acceleration and actual live flowtables; unavailable inspection is not proof
   of absence. Changing UCI alone does not establish removal of existing
   accelerated flows. Refusal must leave the existing policy intact and explain
   the unsupported condition. Measure router throughput before accepting the
   tradeoff.
2. Selective fw4 integration prevents protected flows from entering offload and
   invalidates previously offloaded protected flows when membership or policy
   changes. It must handle IPv4/IPv6, software/hardware acceleration, boot,
   OpenClash/fw4 reload, interface changes, and rollback. Do not clear foreign
   connection state or rewrite foreign flowtables without an ownership contract.

Moving the same forward hook earlier, adding counters, or learning from endpoint
reports cannot solve an ingress fastpath bypass. A rule counter of zero is not
proof that no matching traffic passed.

## Observation and learning boundaries

The endpoint agent already owns PID/socket correlation, Mihomo route chains,
rule type and collection coverage. Its role-report transport deliberately omits
connection tuples and cannot serve as a per-connection verdict feed. The local
[Connections view](openclash-guard-connection-observations.md) reuses the existing
version-1 context snapshot as an advisory browser-only handoff. It displays
unknown firewall verdicts, keeps aggregate denied-attempt statistics separate,
and provides a transient pattern-learning preview without allowlist writes.

For actual router explanations, emit a stable Guard-owned decision identifier
at the same rule that makes the decision, and bind it to policy generation,
direction, tuple, time and collection coverage. A Guard accept means only that
this hook allowed continuation; a later firewall hook may still drop the packet.
Keep that distinction in the event schema and user-facing wording. Rate limits,
queue drops, collector outages and acceleration gaps must remain visible.

## Open-source design references

These are design inputs, not installed dependencies or verified integrations.
The subsequent [pinned source audit](architecture/guard-observability-upstream-audit.md)
records direct code evidence and the applied browser-lifecycle refinement.

| Project | Relevant design | Application to Guard |
| --- | --- | --- |
| [OpenSnitch events](https://github.com/evilsocket/opensnitch/wiki/The-Events-window) and [protocol](https://github.com/evilsocket/opensnitch/blob/master/proto/ui.proto) | Event links a connection to its applied rule; UI filters by action, app, host and node | Use stable event/rule references and drill-down. Preserve advisory endpoint attribution. Its protocol also carries process arguments/environment; Guard should continue omitting those. |
| [Safing Portmaster](https://docs.safing.io/portmaster/settings) and [connection source](https://github.com/safing/portmaster/blob/development/service/network/connection.go) | Per-app policy, verdict plus reason/context and originating setting, explicit prompts, and optional history retention | Separate observed routes, policy precedence and operator decisions. Its auto-allow heuristic is outside the approved advisory-only scope. |
| [fwlive](https://github.com/lucas-albers-lz4/fwlive) and [architecture](https://github.com/lucas-albers-lz4/fwlive/blob/master/docs/developer/architecture.md) | LuCI log-event table, read/write ACL separation, adaptive polling and bounded reads | Closest router UI reference. Its logd input only sees logged events; action classification and empty tables cannot establish complete enforcement coverage. |
| [banIP](https://github.com/openwrt/packages/blob/master/net/banip/README.md) | Native nftables sets and set-level reporting | Reuse the pattern of compact set statistics and explicit router lifecycle integration. Set statistics cannot identify an endpoint application. |
| [ulogd2](https://www.netfilter.org/projects/ulogd/) | Netfilter packet/flow accounting and pluggable outputs | Evaluate as an optional event collector against a small Guard-specific collector; measure queue loss, CPU and memory. Avoid per-packet persistent logging by default. |

OpenSnitch and Portmaster repository metadata reports GPL-3.0; banIP declares
GPL-3.0-or-later in its package Makefile. fwlive declares Apache-2.0. This audit
copies no implementation code. Review exact file licenses and pin source
revisions before any later code reuse. No upstream's deployment or compatibility
claims are treated as acceptance for this repository.

The suggested design combines a small router event source and fwlive-style
bounded LuCI presentation with OpenSnitch-style connection/rule drill-down.
Endpoint context enriches explanations; it never supplies routing authority.
Learning groups observed behavior for operator review, with explicit expiration
and incomplete-coverage markers. A live transport and retention contract remain
separate work from the current manual snapshot view.

## Validation status of the local observation changes

After the shared integration-timeout correction, the complete required
`mise run check` passed with exit code 0: 758 Python tests in 405.040 seconds,
189 profile-service Node tests and 9 LuCI rendering tests. The earlier failed
runs below explain the correction; they are superseded by this full successful
run. No production Guard or signed release bytes changed.

The supplemental branch is `feat/guard-connection-observations-20261105` and
does not change the signed Guard implementation or distribution files.
All 198 combined profile-service/LuCI Node tests passed, including five new
observation tests covering text safety, expiration, invalid input, snapshot-only
learning and fencing a pending file read after Clear observations. A headless
Chromium harness exercised the actual view with a synthetic endpoint snapshot:
render, hostile text, clear and expiration passed with zero network requests.
This is a browser harness, not a complete LuCI/router acceptance test.

The required `mise run check` was run. One local pass completed all 758 Python
tests before failing on absent Node dependencies in the new worktree. Locked
dependencies were then installed offline and the combined Node suites passed.
A full retry subsequently failed with four failures and ten errors in the
pre-existing Guard CLI tests, including ten-second subprocess and interactive
timeouts. The untouched signed worktree also exhibited CLI timeouts in this
session. A focused traced retry of the AdGuard/no-dnsmasq-restart case passed,
with CLI calls taking 3.565 and 2.400 seconds. The timeout cause remains
unresolved in that initial audit; the full required check was not reported as
green. A follow-up traced retry completed apply/status in 7.637 and 6.956
seconds, close to the ten-second integration deadline. The shared CLI fixture
now uses a bounded 60-second deadlock timeout, and interactive Setup uses two
CLI budgets (120 seconds). The template/install suite imports that same CLI
budget. Unit-test deadlines and all behavioral assertions remain unchanged;
these end-to-end bounds are not router performance guarantees.
