# rules

Generated OpenClash/Mihomo profiles, routing rules, DNS integrations, and a fail-closed OpenClash Guard for region-aware AI and service traffic.

## Quick Start

<!-- BEGIN GENERATED OPENCLASH GUARD QUICK START -->
OpenClash Guard deliberately does **not** support remote pipe-to-shell installation or automatic upgrades. Provision the trusted release public key out-of-band first, then authenticate signed release metadata before executing any downloaded bytes.

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

A checksum fetched beside an artifact is not a trust anchor. The `usign` signature authenticates the metadata that contains the SHA-256 values; the SHA-256 then authenticates the downloaded artifact, following the same trust-chain shape used by OpenWrt package metadata and APT repository metadata.
<!-- END GENERATED OPENCLASH GUARD QUICK START -->

## What It Provides

- Interactive OpenClash Guard setup and operations
- Generated OpenClash profiles and rule providers
- AI/service region-aware routing
- DNS and AdGuard Home integration
- Gaming-safe routing controls
- Fail-closed protection for sensitive services

## Common Commands

```sh
openclash-guard
openclash-guard status
openclash-guard doctor
openclash-guard refresh
```

See the [OpenClash Guard guide](docs/openclash-guard.md) for installation, direct-source fallback, automation, and the complete CLI reference.

The optional [Profile Builder](apps/profile-service/README.md) creates personalized subscription templates.

[![Deploy Profile Builder](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mythic3011/rules/tree/main/apps/profile-service)

## Generated Outputs

- `cfg/` — OpenClash/Mihomo profiles and templates
- `rule/` — rule providers
- `dns/` — DNS and hosts outputs
- `dist/` — standalone generated applications and build metadata

See [AI profile generation](docs/ai-profile-generator.md) and [repository layout](docs/repository-layout.md) for ownership and build details.

## Documentation

| Topic | Guide |
| --- | --- |
| Installation and usage | [OpenClash Guard](docs/openclash-guard.md) · [Getting started](docs/getting-started.md) |
| Configuration | [AI routing configuration](internal/config/ai-routing/README.md) |
| Architecture | [Routing schema](docs/ai-routing-schema-foundation.md) · [Firewall proof](docs/ai-routing-firewall-proof.md) |
| Development | [Repository layout](docs/repository-layout.md) · [Python tooling](internal/python/README.md) |
| Generated artifacts | [AI profile generator](docs/ai-profile-generator.md) |
| CI and workflows | [GitHub Actions](.github/workflows/README.md) |

## License

[MIT](LICENSE)
