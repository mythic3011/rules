# OpenClash Guard

OpenClash Guard is the repository's generated standalone POSIX shell application for interactive OpenWrt setup, policy refresh, diagnostics, and fail-closed reconciliation.

## Install and Open the Menu

<!-- BEGIN GENERATED OPENCLASH GUARD INSTALL -->
Use the stable human-facing bootstrap alias:

```sh
curl -fsSL https://analytics.mythic3011.com/q/qdf9961KN | sh
```

With no arguments and a controlling terminal, the generated guard opens its interactive menu and reads input from `/dev/tty`. The alias is only an onboarding redirect; runtime refresh does not depend on it.

### Direct Sources / Fallback

Raw GitHub and CDN commands are generated from the canonical distribution catalog:

```sh
curl -fsSL https://raw.githubusercontent.com/mythic3011/rules/refs/heads/main/dist/openclash-guard.sh | sh
curl -fsSL https://cdn.jsdelivr.net/gh/mythic3011/rules@main/dist/openclash-guard.sh | sh
```

For a one-shot headless command:

```sh
curl -fsSL https://analytics.mythic3011.com/q/qdf9961KN | sh -s -- status
```
<!-- END GENERATED OPENCLASH GUARD INSTALL -->

## Installed Commands

Running `openclash-guard` opens the menu. Direct subcommands remain available for automation:

```text
openclash-guard status
openclash-guard doctor [SERVICE]
openclash-guard health-check [--json]
openclash-guard refresh [--source auto|github-raw|jsdelivr]
openclash-guard apply
openclash-guard reconcile
openclash-guard template list|suggest|show|apply
openclash-guard geo direct|route ROUTE
openclash-guard remove
openclash-guard uninstall [--yes] [--purge-rules]
```

Global automation flags include `--json`, `--yes`, `--dry-run`, and `--policy-file FILE`. Output mode never bypasses destructive confirmation; use `--yes` explicitly in trusted automation.

## Custom Rules and GitHub Sync

Guard keeps user rules in its own runtime directory (`/etc/openclash-guard/rules`) and never edits this repository's `rule/Custom_*` sources or generated artifacts. Local rules are validated and staged with:

```text
openclash-guard rules add-direct DOMAIN-SUFFIX,example.com
openclash-guard rules add-proxy IP-CIDR,203.0.113.0/24
openclash-guard rules list [direct|proxy]
openclash-guard rules remove-direct DOMAIN-SUFFIX,example.com
openclash-guard rules remove-proxy IP-CIDR,203.0.113.0/24
```

Remote sources must be raw GitHub repository or Gist URLs on HTTPS. Guard treats responses only as data, rejects responses larger than 256 KiB, accepts only `DOMAIN`, `DOMAIN-SUFFIX`, `DOMAIN-KEYWORD`, and `IP-CIDR`, and preserves the complete last-good provider set when any configured source fails.

```text
openclash-guard rules sync add-direct https://raw.githubusercontent.com/OWNER/REPO/REF/PATH
openclash-guard rules sync add-proxy https://gist.githubusercontent.com/OWNER/GIST/raw/REVISION/PATH
openclash-guard rules sync list
openclash-guard rules sync run
openclash-guard rules sync remove-direct URL
openclash-guard rules sync remove-proxy URL
```

Staging alone does not change live routing. `openclash-guard rules activate --yes` installs one uniquely marked, reversible block in OpenClash's documented custom-overwrite hook. The block replaces only the four reserved `Custom_Direct_*` and `Custom_Proxy_*` provider definitions with validated `type: file` overlays. Hook updates are backed up, syntax-checked, atomic, and fail closed when the expected hook or provider shape is missing. Restart OpenClash after activation or deactivation. Uninstall removes only this marked block and preserves staged rule data unless `--purge-rules` is explicitly requested.

## Status Field Semantics

These fields are independent. Status does not force them to match.

| Field | Meaning | Typical values |
| --- | --- | --- |
| `runtime.source` | Current preflight materialization: which policy/template pair this process is validating/using now | `local`, `github-raw`, `jsdelivr`, `override`, `none` |
| `distribution.selectedSource` | Persisted provenance of the last successful refresh/install from `distribution-state` | `github-raw`, `jsdelivr`, `local`, `override`, `none` |
| `enforcement` | Resolved fail-closed **policy mode**, not whether nft rules are installed | `reject`, `allow-proxy`, `disabled`, `unavailable` |
| `firewall.table` | Whether the Guard nft table currently exists | `active`, `absent`, `unavailable` |
| `rules.activation` | Whether the OpenClash custom-overwrite overlay block is installed | `staged`, `active` |

`No staged custom rules.` from Action 7 / `rules list` is Guard-owned custom direct/proxy **data**. It is not `rules.activation` and not `firewall.table`.

After Apply, `runtime.source: local` with `distribution.selectedSource: github-raw` is expected: the installed files are local, and they were last fetched from GitHub.

## AdGuard Home Domain-Set Backend

Guard currently reports `dns.domainSetBackend: unavailable` whenever AdGuard Home owns DNS. That is intentional. Resolver-sync is not implemented, so dest-set protection is not claimed, and fail-closed policy stays `state: degraded` / `enforcement: reject` when protection classes require it.

Do not treat this degraded state as a display bug.

The dnsmasq path only claims `dnsmasq-nftset` because OpenWrt dnsmasq can populate nft sets with `nftset=/domain/...` as DNS answers arrive. Guard does not currently write those dnsmasq lines itself; it refuses to pretend AdGuard Home has the same capability.

A correct AdGuard Home backend would need a dedicated resolver-sync helper, not a shell-only hook:

1. **Data to synchronize:** destination IPs for domains that Guard fail-closed classes protect.
2. **nft sets that need DNS-derived addresses:** per-family dest sets owned by Guard (`inet openclash_guard`), not OpenClash disposable chains.
3. **Set ownership:** Guard must create, replace, and delete only its own sets/comments.
4. **Create/refresh/expire:** insert on a validated resolved answer; refresh on later answers; expire on TTL or an explicit bounded timeout. Permanent entries are forbidden.
5. **IPv4 and IPv6:** separate sets and validation. Never coerce families.
6. **AdGuard Home restart:** helper must resubscribe/rebuild from a known-empty or last-good snapshot and keep enforcement fail-closed until sets are functional again.
7. **OpenClash restart:** Guard nft table is independent; helper must not assume OpenClash chains still exist.
8. **Stale DNS results:** TTL/timeout eviction; never leave addresses that outlive the answer that created them.
9. **Existing AGH mechanism:** AdGuard Home has query-log/API surfaces, not a dnsmasq-equivalent `nftset=` injector. Using the API from POSIX `sh` as the live datapath is unsafe (injection, races, unbounded logs).
10. **Where it should live:** a separate daemon/helper with structured parsing, IP validation, atomic nft updates, and fail-closed health. Shell-only sync is not acceptable.

Until that helper exists, keep `domain-set-backend-unavailable`. Never mark the backend healthy unless dest-set protection is actually functional.

## Public Surfaces

- `setup/openclash/install.sh` is the profile/bootstrap helper.
- `dist/openclash-guard.sh` is the generated standalone application.
- `cfg/runtime/openclash-guard.json` is the generated runtime policy.
- `dist/manifest.json` and `dist/openclash-guard.sha256` describe the built application.

The application is generated from modular sources under `shell/`; do not edit `dist/openclash-guard.sh` directly.
