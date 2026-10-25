# Endpoint device profiles

Device profiles keep operator labels and choices separate from endpoint observations. Reports are advisory only: they never set manual roles, choose a profile, or change routing.

## Add or edit a device

1. In LuCI, open **Services → OpenClash Guard → Devices** and add a manual device.
2. Set its label and kind. Optionally choose manual roles and a built-in profile reference.
3. Save the device, then reopen it and copy the **Device ID** for report enrollment or manual import.

The Device ID is the stable UCI section name in the separate `openclash_guard_devices` package. Renaming the label does not change it. Bind each SSH key to one already-saved Device ID; reports do not contain that ID. Profile references are catalog IDs, not credentials or subscription tokens, and this device feature does not apply profiles or change routing.

Manual roles and observed role hints are shown separately. Review a hint and set any desired manual role yourself. LuCI never copies hints into routing settings.

## Collect and submit one report

On a supported endpoint, `clash-guard-agent role-report` creates one privacy-minimized JSON report. Its local heuristic uses the `heuristic_low` confidence and can suggest Browser, Communication, Gaming, Media, Cloud sync, or Developer roles. The report omits raw IP addresses, domains, process paths, PIDs, and application names. It contains aggregate role suggestions and observation status only.

For manual JSON ingestion, validate the report on the endpoint, transfer the resulting file through an approved administrative channel, then import it on the router:

```sh
clash-guard-agent role-report | clash-guard-submit manual > role-report.json
openclash-guard-devices ingest "$DEVICE_ID" < role-report.json
```

Set `DEVICE_ID` to the value saved in LuCI. The report itself cannot select a device.

For restricted SSH submission, create a JSON v1 client config containing `host`, `user`, a nonzero `port`, and absolute `identity_file` and `known_hosts_file` paths. Keep that config and its private key outside this repository. Then run:

```sh
clash-guard-agent role-report | clash-guard-submit ssh --config "$SSH_CONFIG"
```

In `/etc/dropbear/authorized_keys`, bind each endpoint public key to exactly one configured Device ID. Use a fixed receiver command and the standard forwarding restrictions:

```text
command="/usr/libexec/openclash-guard-devices receive <SAVED_DEVICE_ID>",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty <KEY_TYPE> <PUBLIC_KEY> <COMMENT>
```

Replace every placeholder before installing the line. The endpoint must request the fixed command `openclash-guard-role-report-v1`; the receiver rejects other commands and checks that the bound Device ID is configured. The first release accepts manual JSON or restricted SSH. HTTPS is reserved and unsupported; no transport fallback is attempted.

## Report limits and cache lifetime

Reports cover at most one minute in ten-second buckets and expire after 60 seconds. Only the latest report for each device is cached, under volatile `/tmp` storage. A read of the LuCI device list does not prune files: expired observations are omitted from role hints. The maintenance service removes expired entries and waits for the catalog-configured interval between sweeps. The cache clears on reboot.

The maintenance service only runs the fixed cache-prune command. It does not access the network, read keys, write UCI, or change nftables. A catalog or prune error emits a static diagnostic and stops the service for operator inspection.

To enable periodic cleanup on the router:

```sh
/etc/init.d/openclash-guard-device-cache enable
/etc/init.d/openclash-guard-device-cache start
```

Collection can be partial. macOS and Linux may miss activity due to permissions; Windows collection is TCP-only and has no executable paths; Android and iOS cross-app collection are unsupported, so use manual labels there. Unsupported or blocked reports carry no role suggestions.

These reports are unsigned observations, not policy, identity proof, or enforcement evidence. No native endpoint or live-router acceptance is claimed. A build, report, or fresh timestamp does not prove protected traffic is using an approved route.
