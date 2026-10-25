# OpenClash Guard

OpenClash Guard is the repository's generated standalone POSIX shell application for interactive OpenWrt setup, policy refresh, diagnostics, and fail-closed reconciliation.

## Install and Open the Menu

<!-- BEGIN GENERATED OPENCLASH GUARD INSTALL -->
OpenClash Guard never auto-upgrades and the version checker never downloads or executes a new bundle. Network distribution is trusted only through signed release metadata.

### Trust anchor

Provision the trusted `usign` public key at `/etc/openclash-guard/trusted-release-key.pub` through a channel independent of the mirror/CDN being checked. Fetching the key from the same unauthenticated channel and immediately trusting it does not protect against MITM.

### Authenticated first install

Download metadata and signature first, authenticate them, then verify the bundle hash before local execution:

```sh
work=/tmp/openclash-guard-install
rm -rf "$work" && mkdir -p "$work" && cd "$work"
curl -fSLo release.json https://raw.githubusercontent.com/mythic3011/rules/refs/heads/main/dist/openclash-guard.release.json
curl -fSLo release.json.sig https://raw.githubusercontent.com/mythic3011/rules/refs/heads/main/dist/openclash-guard.release.json.sig
usign -V -q -m release.json -p /etc/openclash-guard/trusted-release-key.pub -x release.json.sig
bundle_sha=$(jsonfilter -i release.json -e '@.artifacts.guardBundle.sha256')
curl -fSLo openclash-guard.sh https://raw.githubusercontent.com/mythic3011/rules/refs/heads/main/dist/openclash-guard.sh
printf '%s  %s\n' "$bundle_sha" openclash-guard.sh | sha256sum -c -
/bin/sh -n openclash-guard.sh
/bin/sh ./openclash-guard.sh
```

The CDN may be substituted for the raw source without changing the trust decision because the authenticated metadata, not the transport endpoint, supplies the trusted hash:

```text
https://cdn.jsdelivr.net/gh/mythic3011/rules@main/dist/openclash-guard.release.json
https://cdn.jsdelivr.net/gh/mythic3011/rules@main/dist/openclash-guard.release.json.sig
https://cdn.jsdelivr.net/gh/mythic3011/rules@main/dist/openclash-guard.sh
```

### Read-only version check

```sh
openclash-guard version-check
openclash-guard --json version-check
```

This reads the local bundle hash, fetches only small signed release metadata plus its detached signature, verifies the local trust anchor, enforces the locally recorded highest release sequence, and compares hashes. It never installs, reconciles, refreshes, or executes fetched bytes.

After the first authenticated install/refresh, a lower signed release sequence is rejected as rollback and reuse of the same sequence with different signed content is rejected as equivocation. First use cannot prove freshness without an independent trusted time/state source; the trust anchor still prevents a network attacker from forging metadata.

### Local integrity receipt

```sh
openclash-guard integrity-check
openclash-guard --json integrity-check
```

This is network-free and compares the installed bundle, runtime policy, and template catalog against the hashes recorded after the last successful authenticated install/refresh. It detects local byte changes since that explicit operation but does not claim protection against a compromised local root account.
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
| `enforcement` | Resolved fail-closed **service-policy mode**, not whether a table-wide terminal reject is installed | `reject`, `allow-proxy`, `disabled`, `unavailable` |
| `firewall.table` | Whether the Guard nft table currently exists | `active`, `absent`, `unavailable` |
| `rules.activation` | Whether the OpenClash custom-overwrite overlay block is installed | `staged`, `active` |

`No staged custom rules.` from Action 7 / `rules list` is Guard-owned custom direct/proxy **data**. It is not `rules.activation` and not `firewall.table`.

After Apply, `runtime.source: local` with `distribution.selectedSource: github-raw` is expected: the installed files are local, and they were last fetched from GitHub.

The terminal `openclash-guard:kill-switch` forward reject is intentionally narrower than `enforcement: reject`. It is installed only when the global UCI kill switch is enabled and OpenClash itself is unhealthy. Service-policy degradation must not turn OpenClash's intentional kernel bypass paths, such as region/IP bypass, into unrelated LAN-wide outages.

## AdGuard Home Domain-Set Backend

Guard includes a bounded AdGuard Home resolver-sync producer. It reads query-log records through the structured control API, validates IPv4 and IPv6 answers, applies TTL-bounded timeouts, and updates Guard-owned nft sets. The producer runs through `openclash-guard rules sync watch`; it does not depend on OpenClash's process lifecycle.

Guard reports `adguardhome-resolver-sync` only when the producer state is fresh and matches the running selector revision, both owned timeout sets are present, and both exact direct-WAN consumer rules are visible. Missing or incomplete evidence keeps the backend `unavailable`; policies that require the backend remain degraded and fail closed. Capability verification is read-only.

The dnsmasq path continues to report `dnsmasq-nftset` when dnsmasq owns DNS. Guard does not edit dnsmasq configuration itself.

See [the resolver-sync capability contract](openclash-guard-resolver-sync-contract.md) for the state schema, set ownership, health checks, and read-only verification boundary.

## Public Surfaces

- `setup/openclash/install.sh` is the profile/bootstrap helper.
- `dist/openclash-guard.sh` is the generated standalone application.
- `cfg/runtime/openclash-guard.json` is the generated runtime policy.
- `dist/manifest.json` and `dist/openclash-guard.sha256` describe the built application.

The application is generated from modular sources under `shell/`; do not edit `dist/openclash-guard.sh` directly.
