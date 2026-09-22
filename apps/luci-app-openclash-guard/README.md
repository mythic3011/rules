# LuCI OpenClash Guard

Native LuCI configuration and diagnostics for OpenClash Guard.

This package is intentionally **not** a web wrapper around the `openclash-guard` CLI. LuCI edits the shared UCI model directly, while a narrow rpcd surface provides structured read-only status and diagnostics plus an operator-authorized profile URL probe.

## Information architecture

The UI follows an operational-dashboard pattern similar to AdGuard Home: important state is visible before configuration details.

- **Overview** — summary cards for Guard, OpenClash, DNS, and fail-closed protection; routing intent for ChatGPT/Claude/Grok; profile/distribution summary and quick links.
- **Profile** — one HTTPS custom-template INI URL, including Profile Service `/p/<opaque-token>.ini` URLs, with a router-side fetch/format probe.
- **Routing** — direct/proxy region selection from the shared Region Registry and per-service route intent.
- **DNS** — backend, resolver-sync intent, and fail-closed policy.
- **Rules** — local direct/proxy rules and remote HTTPS rule-source URLs.
- **Tests** — service cards for ChatGPT, Claude, and Grok using fixed router-side `/cdn-cgi/trace` probes. Results show public IP, country, Cloudflare edge, HTTP/TLS, expected route, and a Region Registry-backed match/mismatch assessment.

Historical graphs are deliberately omitted until the backend owns persisted metrics. The UI should not invent charts from instantaneous state.

## Shared configuration

The app writes `/etc/config/openclash_guard` directly. Guard runtime integration should consume the same UCI model instead of scraping CLI output or maintaining a second configuration store.

## Security boundaries

- fixed service trace URLs are allowlisted in rpcd;
- returned trace host identity is checked;
- arbitrary shell execution is not exposed;
- custom profile URL probes require the LuCI write ACL because they perform an operator-controlled outbound request;
- profile probes require HTTPS, reject embedded credentials/whitespace, and cap the response at 256 KiB;
- routing selectors and trace-region comparison reuse the packaged Region Registry rather than hardcoded country maps.

Router-origin egress probes are diagnostic evidence. They do not claim to prove the route of every forwarded LAN client when source-, mark-, or device-specific policy differs.
