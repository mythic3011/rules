# Connection observations

The LuCI **Connections** view reads a local JSON snapshot from `clash-guard-agent`
in the separate endpoint-guard repository. Reports remain advisory: this view
does not apply profiles, alter firewall state, or change kill-switch decisions.

Run the endpoint CLI with your explicitly selected controller, for example:

```sh
clash-guard-agent snapshot --controller "$MIHOMO_LOOPBACK_ADDRESS" > endpoint-context.json
```

Use its Unix socket/core options instead when appropriate. Controller secrets
remain in the endpoint agent's environment; they must not be added to the file.
Open **Services → OpenClash Guard → Connections** and choose the fresh file.
The source contract is endpoint-guard's `src/endpoint.rs` (`ContextSnapshot`,
`ConnectionContext`, `Sources`, and `SnitchObservation`). This consumer accepts
version 1 and the existing observation-only authorization marker. That marker is
a format discriminator, not authentication or source verification.

The learning preview groups the current displayed records by reported process
path, route, rule type and attribution coverage. It retains no cross-snapshot
history, creates no allowlist and makes no enforcement recommendation from
frequency alone. Counts are records, not successful or unique lifetime flows.
Ambiguous and conflicting attribution stays visible rather than being promoted
to a verified application. Loading another snapshot replaces these patterns;
expiration and Clear observations discard them with the underlying metadata.

The view explains the reported route chain and matched rule type, and translates
socket-attribution gaps into readable reasons. A Mihomo connection record does
not prove delivery or a firewall allow. A missing record does not prove a block.
Router verdicts therefore remain explicitly unknown. Little Snitch aggregate
denied-attempt statistics appear separately and are never joined to individual
connections or presented as router decisions. A blocked collection source means
unavailable observations, not blocked traffic.

Files remain in the browser tab. The view makes no requests, uploads no metadata,
and writes no router or browser storage. It accepts at most 2 MiB and displays up
to 200 records from each collection. It clears expired observations on its
one-second poll, accepts no future timestamps, and caps display freshness at 30
seconds even if a file claims a longer TTL. Clock rollback also clears a loaded
snapshot. Clear observations discards current data and fences in-flight reads.
The original endpoint export remains on the operator's disk until deleted.
This is a manual local handoff, not a live router/endpoint telemetry service.

Automatic correlation with router verdicts requires a separate bounded event
source with explicit provenance, tuple/time matching, expiration, and collection
coverage. Existing role reports deliberately omit addresses and process details
and cannot supply that connection-level evidence. They retain their existing
restricted transport, retention, and advisory contract.
