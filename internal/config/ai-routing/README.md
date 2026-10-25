# AI routing configuration

This directory is the source for AI service and profile routing policy. Python compiles these declarations into the published Mihomo/OpenClash and subconverter outputs. Use the [policy maintenance guide](../../../docs/policy-maintenance.md) for routine add, edit, remove, and group changes.

## Source ownership

| Files | Owns |
| --- | --- |
| `core/00-*.yaml` through `core/60-*.yaml` | Canonical typed routing configuration loaded by the core TypeScript schema. |
| `profile.json` | Python profile groups, DNS policy, account selectors, and foundation routes. |
| `dns.json` | DNS resolver routing and output settings. |
| `catalogs/services.json` | Service identities, service-specific rules, and reusable routing policies. |
| `catalogs/companion-rules.json` | SSH, gaming, finance, privacy, and process companion rules. |
| `catalogs/regions.source.json` | Authored region definitions. |
| `catalogs/regions.json` | Generated v1 region projection for the Python loader; do not hand-edit it. |
| `projections/mihomo.yaml`, `projections/parity.yaml` | Mihomo projection and shadow-profile parity contract. |
| `project.yaml` | Validated project entrypoint binding manifests, projections, generated artifacts, and supported profiles. |

The core loader reads only numbered files under `core/`. Keep sibling catalog and projection schemas separate; do not loosen the core schema to accept them. After `make bootstrap`, run routing validation, generation, and checks through `project.yaml` with `mise exec -- pnpm run routing:validate`, `mise exec -- pnpm run routing:generate`, and `mise exec -- pnpm run routing:check`.

## Service and upstream policy

A service can reference a shared `policy` alongside its own identity, local `payload`, DNS settings, and `upstreamRules`. Shared policies define common routing behavior; services that need different groups, regions, direct access, or INI clustering need separate policies. Local payload rules precede upstream rules so narrow service-specific behavior can take precedence.

Use upstream sources only when their match scope fits the destination group. For example, a broad Google AI category belongs in a shared fail-closed guard, not in one narrower service group. Remote providers must use HTTPS and declare `classical` or `domain` behavior.

`sources/upstream-sources.json` is the single revision lock for external rule repositories referenced by the TypeScript projection. Normal generation uses the pinned revision and remains offline. `make refresh` explicitly follows the configured tracking ref, updates the lock or snapshot, and should be followed by generation and checks. Repository-local sources stay inline because refreshing a self-reference creates a provenance loop.

## DNS output

`profile.json#adguardHome.outputFile` declares the generated AdGuard Home list (`rule/host.txt`). It combines local domain rules with the checked-in upstream snapshot. The output uses AdGuard DNS filtering syntax and blocks matching names at resolution time; it does not reproduce proxy routing. Snapshot refresh is separate from deterministic generation.
