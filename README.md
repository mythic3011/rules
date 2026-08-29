# rules

Generated OpenClash/Mihomo profiles, routing rules, DNS integrations, and a fail-closed OpenClash Guard for region-aware AI and service traffic.

## Quick Start

<!-- BEGIN GENERATED OPENCLASH GUARD QUICK START -->
```sh
curl -fsSL https://analytics.mythic3011.com/q/qdf9961KN | sh
```

Opens the interactive OpenClash Guard menu, auto-detects the router environment, and guides first-time setup. See the [OpenClash Guard guide](docs/openclash-guard.md) for direct-source fallback and headless use.
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
