# luci-app-openclash-guard

Native LuCI configuration and observability for OpenClash Guard.

This app is intentionally **not** a web wrapper around the CLI. LuCI edits a stable UCI model directly and uses a small rpcd surface only for read-only probes and status data. The Guard CLI/runtime can consume the same UCI model for automation.

## UX model

- **Overview** — installed/runtime state and active profile URL.
- **Profile** — one HTTPS custom-template INI URL, including opaque Profile Service URLs such as `https://host/p/<token>.ini`.
- **Routing** — direct/proxy regions and per-service route intent.
- **DNS** — backend, resolver-sync intent, and fail-closed policy.
- **Rules** — local direct/proxy rules and remote rule-source URLs.
- **Tests** — router-side egress probes for ChatGPT, Claude, and Grok using fixed `/cdn-cgi/trace` endpoints.

The trace tests run on the router through rpcd, not in the browser, so the observed public IP and Cloudflare edge describe the router request path rather than the administrator's workstation browser path.

## Shared config

The package owns `/etc/config/openclash_guard`. UI state is declarative; saving the LuCI form does not execute arbitrary shell commands or mutate OpenClash configuration behind the user's back.

Runtime reconciliation from this UCI model is a separate integration boundary. That keeps UI configuration, policy compilation, and side effects independently testable.
