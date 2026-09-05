# AI routing catalog

## Manifest ownership

The directory intentionally contains multiple YAML dialects. They are not one
combined schema.

- `core/NN-*.yaml` (`00-base.yaml` through `60-shared-backends.yaml`) are canonical
  `RoutingConfig` fragments consumed by `loadRoutingConfig()`.
- `projections/mihomo.yaml` is the Mihomo projection manifest and is validated by its own
  projection schema/loader.
- `projections/parity.yaml` is the shadow-profile parity contract.
- `catalogs/process-rules.yaml` is the process-rule catalog.

The core routing loader selects only numbered fragments in `core/`. Do not make the core
Zod schema permissive merely to accept sibling manifests; that would erase the
schema boundary and hide configuration mistakes.

`project.yaml` is the validated routing-project entrypoint. It binds the core
manifest, projections, shadow inputs, generated artifact directory, schema
output, supported profiles, and semantic artifact roles. Use `npm run
routing:validate`, `npm run routing:generate`, and `npm run routing:check`
through that project context rather than invoking individual artifact steps.


The catalog declares routing policy; Python compiles it into Mihomo/OpenClash and
subconverter outputs.

## Rule ownership

Each service may combine two layers:

1. `payload` — repository-owned local delta rules. These are emitted to the
   service's `AI_*_Classical.yaml` provider and are always matched first.
2. `upstreamRules` — externally maintained sources consumed after the local
   delta.

Local-first ordering is intentional: a narrow service rule can carve out an
endpoint before a broader upstream category or provider is evaluated.

### GEOSITE upstream

```json
{
  "kind": "geosite",
  "value": "openai"
}
```

The active `geosite.dat` configured by the generated Mihomo profile owns the
actual domain list.

### Remote upstream rule-provider

```json
{
  "kind": "remote",
  "providerKey": "Upstream_Example",
  "url": "https://example.com/rules.yaml",
  "behavior": "classical",
  "format": "yaml",
  "interval": 10800,
  "iniInterval": 28800
}
```

Remote URLs must use HTTPS. P7 intentionally accepts YAML only because the same
source must be consumable by both Mihomo `rule-providers` and subconverter.
`behavior` may be `classical` or `domain`.

## Scope rule

Do not attach a broad upstream category to a narrower service group merely
because it contains that service. The upstream source's match scope must be no
broader than the policy target.

For example, upstream `google-deepmind` includes Jules, Gemini, NotebookLM,
Google AI Studio and other Google AI endpoints. It therefore remains a shared
fail-closed guard instead of being routed directly to `🤖 Jules`. Jules keeps
exact local delta rules for `jules.google.com` and `jules.googleapis.com`.

## AdGuard Home projection

`profile.json#adguardHome.outputFile` declares the generated AdGuard Home DNS
blocklist output (currently `rule/host.txt`). Local `DOMAIN` / `DOMAIN-SUFFIX`
deltas are combined with the checked-in `adguard-upstream.json` snapshot. The
snapshot is refreshed explicitly from configured v2fly domain-list-community
roots; normal profile generation remains deterministic and offline.

The output uses AdGuard DNS filtering syntax rather than literal `/etc/hosts`
syntax so suffix and regular-expression semantics can be preserved. Subscribing
to this URL blocks matching DNS names; it does not reproduce OpenClash proxy
routing.

## Shared upstream source lock

External rule repositories that are consumed by the TypeScript routing projection
must not carry independent commit pins in `internal/config/ai-routing/projections/mihomo.yaml`.
`upstream-sources.json` is the single reproducibility lock for those sources.
The Mihomo projection references a source by `manifestSource`; its loader resolves
that reference before compiling rule-provider URLs.

The lock keeps two concepts separate:

- `trackingRef` says which upstream branch/ref scheduled maintenance follows.
- `revision` is the exact 40-hex commit used by production artifacts.

Normal generation never follows a moving branch. A scheduled refresh explicitly
runs `python internal/python/generate_ai_profiles.py --refresh-upstream-sources`, updates only
the locked revision when upstream moves, then regenerates the TypeScript routing
artifacts. Coverage audit treats a pinned URL as healthy when it matches the
shared lock and reports `ini-upstream-drift` only when materialized TS artifacts
and the lock disagree.

Repository-local rule sources remain inline because refreshing a self-reference
to the commit being generated is a separate bootstrapping/provenance problem.

Python `upstreamRules` can consume the same lock without copying a full URL:

```json
{
  "kind": "remote",
  "providerKey": "Upstream_OpenAI",
  "source": "vpsdance",
  "path": "rules/clash/openai.yaml",
  "behavior": "classical",
  "format": "yaml",
  "interval": 10800,
  "iniInterval": 28800
}
```

The catalog resolves this to `rawBaseUrl/revision/path`. The legacy explicit
`url` form remains accepted for independent sources that are not managed by the
shared lock.
