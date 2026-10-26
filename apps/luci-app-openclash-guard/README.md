# LuCI OpenClash Guard

Native LuCI configuration and diagnostics for OpenClash Guard.

This package is intentionally **not** a web wrapper around the `openclash-guard` CLI. LuCI edits the shared UCI model directly, while a narrow rpcd surface provides structured status and diagnostics plus an operator-authorized profile URL probe.

## Information architecture

The UI follows an operational-dashboard pattern similar to AdGuard Home: important state is visible before configuration details.

- **Overview** — summary cards for Guard, OpenClash, DNS, and fail-closed protection; 24-hour egress observations; per-service mini trends; recent events; routing intent; profile/distribution summary and quick links.
- **Profile** — one HTTPS custom-template INI URL, including Profile Service `/p/<opaque-token>.ini` URLs, with a router-side fetch/format probe.
- **Devices** — manual labels, catalog-defined roles, and built-in profile references, shown separately from tentative read-only suggestions. The edit dialog shows the stable Device ID used for forced SSH-key binding.
- **Routing** — direct/proxy region selection from the shared Region Registry and per-service route intent.
- **DNS** — backend, resolver-sync intent, and fail-closed policy.
- **Rules** — local direct/proxy rules and remote HTTPS rule-source URLs.
- **Monitoring** — optional background ChatGPT/Claude/Grok egress probes at 5/15/30/60-minute intervals. Monitoring is disabled by default.
- **Tests** — service cards for ChatGPT, Claude, and Grok using fixed router-side `/cdn-cgi/trace` probes. Results show public IP, country, Cloudflare edge, HTTP/TLS, expected route, a Region Registry-backed match/mismatch assessment, and recent history.

## Egress history

Probe history is deliberately bounded and volatile rather than a fake analytics database:

- stored only under `/tmp/openclash-guard/egress-history`;
- maximum 60 records per service and 180 records through the rpcd history view;
- success and fetch/validation failures are recorded;
- reboot clears the history naturally;
- routine metrics do not write persistent flash storage.

The optional procd monitor reuses the same fixed rpcd trace implementation. It cannot provide arbitrary probe URLs. The helper enforces a hard minimum interval of 300 seconds even if UCI is edited manually.

## Shared configuration

The existing Guard settings are stored in `/etc/config/openclash_guard`. Manual device labels are stored separately in `/etc/config/openclash_guard_devices`. Each record has a stable Device ID that does not change when its label changes; use the ID shown in the edit dialog when binding a forced SSH key. This metadata is advisory and does not change routing.

## Security boundaries

- fixed service trace URLs are allowlisted in rpcd;
- returned trace host identity is checked;
- arbitrary shell execution is not exposed;
- custom profile URL probes require the LuCI write ACL because they perform an operator-controlled outbound request;
- profile probes require HTTPS, reject embedded credentials/whitespace, and cap the response at 256 KiB;
- routing selectors and trace-region comparison reuse the packaged Region Registry rather than hardcoded country maps;
- CI enforces byte-for-byte parity between the packaged Region Registry and the canonical routing catalog;
- background monitoring is opt-in and only invokes the fixed ChatGPT/Claude/Grok probe identifiers.
- the Devices page reads catalog and suggestion data through a read-only RPC object; Save/Apply writes only the separate advisory UCI namespace;
- suggestions are never copied into manual roles or used to activate routes, and selected built-in profiles store catalog IDs rather than URLs or tokens;
- device kinds are catalog-defined manual labels. Mobile can be selected manually; this UI does not claim to install or use a mobile-app collector.

## Device role reports

The optional receiver accepts one bounded JSON report through manual import or a forced SSH command. Each key maps to a saved Device ID; the report cannot choose that ID. Incoming reports must match the pinned contract, be unexpired, and be newer than the cached report. The receiver limits input size and read time before atomically replacing the private cache entry.

Reports are advisory. Expired reports are omitted, and stale or unavailable windows expose metadata without role hints. Cache files live under volatile `/tmp` storage and disappear on reboot. See the [device profile guide](../../docs/endpoint-device-profiles.md) for enrollment, import commands, platform limits, and cache maintenance.

Router-origin egress probes are diagnostic evidence. They do not claim to prove the route of every forwarded LAN client when source-, mark-, or device-specific policy differs.
