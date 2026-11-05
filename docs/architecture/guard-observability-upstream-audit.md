# Upstream observability design audit

Source audit date: 2026-11-05. Scope: connection/event representation, rule
explanation, collection gaps, buffering, browser lifecycle and advisory learning.
This is a bounded design audit, not a repository-wide vulnerability scan or
deployment acceptance. Upstream source was cloned into isolated local directories
and left unchanged. No upstream package, daemon, logging rule or browser service
was installed or activated.

## Pinned sources

| Project | Audited commit | License observed |
| --- | --- | --- |
| [fwlive](https://github.com/lucas-albers-lz4/fwlive/tree/6b1b1f8e4342f675ed04a137998b95a7b7e93e3e) | `6b1b1f8e4342f675ed04a137998b95a7b7e93e3e` | Apache-2.0 |
| [OpenSnitch](https://github.com/evilsocket/opensnitch/tree/a1353848ba1b660320e90cefea782c3fba272c00) | `a1353848ba1b660320e90cefea782c3fba272c00` | GPL-3.0 license text |
| [Portmaster](https://github.com/safing/portmaster/tree/bffef134cd709d2a74295cd8450cf0c6231bd60d) | `bffef134cd709d2a74295cd8450cf0c6231bd60d` | GPL-3.0 license text |

These licenses identify the reviewed repositories, not a blanket permission to
copy every file. This work copies no upstream implementation. Any future code
reuse needs file-level provenance, license and attribution review.

## Findings and adaptation decisions

### 1. Keep decision, explanation and evidence scope together

OpenSnitch's event contains a connection, applied rule and timestamp;
serialization preserves those associations. Its rule includes action, name,
description and duration. This is a useful drill-down model for answering which
rule matched rather than displaying only a generic connection status.
Evidence: [event.go:11](https://github.com/evilsocket/opensnitch/blob/a1353848ba1b660320e90cefea782c3fba272c00/daemon/statistics/event.go#L11),
[ui.proto:155](https://github.com/evilsocket/opensnitch/blob/a1353848ba1b660320e90cefea782c3fba272c00/proto/ui.proto#L155).

Portmaster additionally couples verdict reasons to the responsible setting and
profile. `SetVerdict` updates the verdict and reason context together, resets the
previous setting reference and resolves the applicable profile for the new
reason. Its `DataIsComplete` flag gates saving/publishing incomplete connection
data. Evidence:
[Reason:257](https://github.com/safing/portmaster/blob/bffef134cd709d2a74295cd8450cf0c6231bd60d/service/network/connection.go#L257),
[SetVerdict:763](https://github.com/safing/portmaster/blob/bffef134cd709d2a74295cd8450cf0c6231bd60d/service/network/connection.go#L763),
[Save:820](https://github.com/safing/portmaster/blob/bffef134cd709d2a74295cd8450cf0c6231bd60d/service/network/connection.go#L820).

**Guard adaptation:** an eventual router event must reference a Guard-owned rule
and the policy generation that produced it. Present a readable reason and the
relevant setting. Keep endpoint attribution, reported Mihomo route, Guard hook
decision and end-to-end delivery separate. A Guard accept only permits further
processing; it is not proof that later hooks or the remote server accepted it.

### 2. A log action label is an observation, not enforcement proof

fwlive parses verdict words from log text; when there is no verdict word it
preserves `UNKNOWN`. Its source explicitly notes that nft `log` does not print
the verdict. The root RPC fetches bounded existing logd entries, filters them and
reports failures; it does not directly observe every firewall packet. Evidence:
[detectAction:228](https://github.com/lucas-albers-lz4/fwlive/blob/6b1b1f8e4342f675ed04a137998b95a7b7e93e3e/core/fwlive-log.js#L228),
[inferActionRaw:332](https://github.com/lucas-albers-lz4/fwlive/blob/6b1b1f8e4342f675ed04a137998b95a7b7e93e3e/core/fwlive-log.js#L332),
[fetch_firewall_logs:762](https://github.com/lucas-albers-lz4/fwlive/blob/6b1b1f8e4342f675ed04a137998b95a7b7e93e3e/openwrt-feed/luci-app-fwlive/root/usr/libexec/rpcd/fwlive#L762).

**Guard adaptation:** use stable owned rule identifiers tied to the rule that
makes the decision. Arbitrary log prefixes or endpoint-supplied verdict labels
cannot self-declare trusted enforcement evidence. Empty, unlogged, sampled,
accelerated or unavailable traffic remains unknown. Keep packet/log counters and
connection counts distinct.

### 3. Bounded collection needs explicit loss accounting

OpenSnitch removes the oldest buffered event when `maxEvents` is reached. Its
per-dimension statistics remove a low-hit key at capacity. Its eBPF reader can
discard queued records when workers cannot keep up. These are valid resource
tradeoffs, but a Guard learning view cannot treat that stream as a complete
history. Evidence:
[stats.go:154](https://github.com/evilsocket/opensnitch/blob/a1353848ba1b660320e90cefea782c3fba272c00/daemon/statistics/stats.go#L154),
[stats.go:222](https://github.com/evilsocket/opensnitch/blob/a1353848ba1b660320e90cefea782c3fba272c00/daemon/statistics/stats.go#L222),
[events.go:164](https://github.com/evilsocket/opensnitch/blob/a1353848ba1b660320e90cefea782c3fba272c00/daemon/procmon/ebpf/events.go#L164).

**Guard adaptation:** bound records, bytes, update frequency and retention at
their owning collection operation. Expose truncation, collection outages,
queue loss and offload coverage. A missing observation must not create a
negative learning example or imply that a destination was unused/safe.
In particular, OpenSnitch's `Dropped` statistics field counts non-allow/missed
connection decisions in `onConnection`; it is not an event-queue-loss counter.
Guard must give denied traffic and lost telemetry distinct names and displays.

### 4. Learn UI lifecycle handling before adding a live transport

fwlive serializes requests, coalesces refreshes, increments an epoch on visibility
changes and invalidates work on disposal. The runner must check its epoch before
applying results. That pattern prevents a late response from repainting cleared
or superseded state. Evidence:
[poll-coordinator.js:19](https://github.com/lucas-albers-lz4/fwlive/blob/6b1b1f8e4342f675ed04a137998b95a7b7e93e3e/openwrt-feed/luci-app-fwlive/htdocs/luci-static/resources/fwlive/poll-coordinator.js#L19),
[visibility:118](https://github.com/lucas-albers-lz4/fwlive/blob/6b1b1f8e4342f675ed04a137998b95a7b7e93e3e/openwrt-feed/luci-app-fwlive/htdocs/luci-static/resources/fwlive/poll-coordinator.js#L118),
[dispose:141](https://github.com/lucas-albers-lz4/fwlive/blob/6b1b1f8e4342f675ed04a137998b95a7b7e93e3e/openwrt-feed/luci-app-fwlive/htdocs/luci-static/resources/fwlive/poll-coordinator.js#L141).

**Applied locally:** the current Connections view already fences file reads
after Clear. Three new regression cases exposed wall-clock lifetime extension,
stale data on tab return and retained data/late reads after leaving the page.
The independent local implementation now bounds remaining snapshot life with
`performance.now()`, rechecks expiry on visibility changes and clears/fences
reads on `pagehide`. No upstream code or dependency was copied.

### 5. Separate viewing from firewall administration

fwlive's ACL exposes read-only `rules`, `poll`, `resolve`, and `logging_status`
separately from write methods that enable/disable WAN logging. The browser does
not receive general `log.read` access. OpenSnitch's broader notification protocol
can enable interception, change rules and reload the firewall; that whole control
surface is outside the endpoint advisory contract. Evidence:
[fwlive ACL](https://github.com/lucas-albers-lz4/fwlive/blob/6b1b1f8e4342f675ed04a137998b95a7b7e93e3e/openwrt-feed/luci-app-fwlive/root/usr/share/rpcd/acl.d/luci-app-fwlive.json#L1),
[OpenSnitch Action](https://github.com/evilsocket/opensnitch/blob/a1353848ba1b660320e90cefea782c3fba272c00/proto/ui.proto#L168).

**Guard adaptation:** add a narrow read capability for a future normalized event
feed. Learning and endpoint context get no routing writes, generic command
execution, arbitrary log access or controller-configuration capability.

### 6. Do not turn correlation heuristics into automatic permission

Portmaster's auto-permit checks a relation between process paths/names and
domain components using a similarity threshold. Its source states that this
is an experience feature, not a mechanism intended to thwart intentional malware.
That behavior conflicts with the selected advisory-only learning scope.
Evidence:
[checkAutoPermitRelated:531](https://github.com/safing/portmaster/blob/bffef134cd709d2a74295cd8450cf0c6231bd60d/service/firewall/master.go#L531),
[checkRelation:553](https://github.com/safing/portmaster/blob/bffef134cd709d2a74295cd8450cf0c6231bd60d/service/firewall/master.go#L553).

**Guard adaptation:** group observed patterns and show attribution confidence,
collection coverage and the current reported rule. Frequency, process basename,
shared CDN IP or a familiar-looking domain cannot authorize traffic. Any future
policy suggestion stays a reviewable draft until the operator accepts it through
the existing policy-generation/signing workflow.

## Proposed next implementation sequence

1. Keep the local snapshot view and learning preview usable, with bounded
   lifetime and no retained history. The lifecycle refinement above is included
   in this audit's local changes.
2. Review a versioned router-event contract under `internal/config/`, with a
   canonical owner for identifiers, reasons, coverage, bounds and expiry. Bind
   event identity to rule/policy generation, direction, time and tuple. This
   document proposes requirements; it does not introduce an active schema.
3. Implement a bounded router collector and read-only RPC. Validate sampling,
   truncation, restarts, clock changes and collector failure before adding live
   endpoint transport. Observation failure cannot alter packet decisions.
4. Add endpoint enrichment only when tuple/time/namespace evidence matches;
   keep ambiguous, NAT/fake-IP and stale cases unmatched. Existing role reports
   remain unchanged because they intentionally omit connection-level metadata.
5. Add grouped learning recommendations and policy-diff preview. Applying a
   policy remains an explicit operator action. Strict offload handling remains
   a separate lifecycle decision from learning or observability.

## Validation and limits

Eight selected fwlive test modules passed in a network-disabled, read-only Linux
container: schema, parser/filter, classifier corpus, poll coordinator, staleness,
render scheduler, pause/resume buffer and Clear behavior. The image was pinned to
`sha256:ca36a29ecce0c0367e782b4865026a2b606631b367c76b4ebb1eef6a42e8f1b8`.
These are upstream model/unit tests, not browser or live OpenWrt proof.
OpenSnitch and Portmaster observations here are static source evidence; their
daemons and platform drivers were not built or run.

The local regression suite first failed the three lifecycle cases against the
previous view, then passed all eight after the refinement. The existing
Chromium harness also passed render, hostile-text handling, clear, expiry and pagehide
with zero network requests. It exercises the view with synthetic data rather
than a complete LuCI installation. The complete required `mise run check`
passed with exit code 0: 758 Python tests in 422.404 seconds, 189 profile-service
Node tests and 12 LuCI tests. The signed Guard implementation and distribution
bytes are unchanged. This work has not been pushed, merged or installed on a
router.
