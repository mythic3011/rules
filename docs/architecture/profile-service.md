# Profile Service Architecture

## Goal

Expose the existing routing compiler as a safe, non-technical OpenClash profile builder without turning HTTP input into a second configuration language.

The consumer artifact is a **subconverter custom-template INI**, not the final Mihomo YAML:

```text
Web Builder / saved ProfileSpec
        |
        v
Cloudflare Worker resolver
        |
        v
SubconverterPlan IR
        |
        v
/p/<opaque-read-capability>.ini
        |
        v
OpenClash subscription conversion
        |
        v
subconverter -> final Mihomo YAML
```

## Ownership

```text
GitHub registry        canonical service/region/policy definitions
Python compiler        canonical SubconverterPlan semantics
runtime-data.mjs       generated Worker projection + parity fixtures
Worker solver          applies typed per-profile constraints
D1                     canonical saved ProfileSpec only
Static Web Builder     human-friendly editor
```

The Worker runtime data is generated from the Python compiler. Representative profile specs are rendered by Python during generation and stored as SHA-256 parity fixtures. Node tests render the same specs through the Worker implementation and require the `[custom]` body hashes to match.

## ProfileSpec v1

Only region constraints are public in v1:

```json
{
  "schemaVersion": 1,
  "baseProfile": "ai-balanced",
  "disabledNodeRegions": ["hk"],
  "onlyNodeRegions": [],
  "preferredNodeRegions": ["jp", "sg"]
}
```

Semantics:

- `disabledNodeRegions`: remove those region groups and block matching provider nodes from generic selectors.
- `onlyNodeRegions`: closed-world mode; only listed routable regions remain and the unknown/other region group is removed.
- `preferredNodeRegions`: reorder surviving region candidates without creating new routes.
- observation-only regions such as `hk` can be disabled but cannot be the sole routing exit until promoted into the routable registry.

Constraints are canonicalized through the Region Registry. Aliases such as `Hong Kong`, `香港`, and `HK` resolve to one ID.

## Security boundary

There is deliberately no endpoint like:

```text
/v1/profile/ai.ini?disable=hk&raw-rule=...
```

Preview uses an allowlisted JSON POST. Saved subscriptions use an opaque read capability:

```text
POST /api/v1/resolve             preview, no persistence
POST /api/v1/profiles            save canonical ProfileSpec
GET  /p/<read-token>.ini         read-only subscription
GET  /api/v1/profiles/<id>       management capability required
PUT  /api/v1/profiles/<id>       management capability required
POST /api/v1/profiles/<id>/rotate-read-token
```

Read and management capabilities are independently generated from 256 bits of randomness. D1 stores only SHA-256 hashes. Routing preferences therefore do not appear in the long-lived subscription URL.

The Worker rejects unknown ProfileSpec fields. Arbitrary regex, shell, raw rule, provider URL, or renderer directives cannot cross the HTTP boundary.

## Region solver invariants

A disabled region must not remain reachable through another group. The solver therefore handles all of these together:

1. automatic region groups,
2. stable region groups,
3. service selector group references,
4. global/manual fallback ordering,
5. generic provider node regex filters,
6. unknown/other region behavior in closed-world mode.

A solve fails if it creates a dangling group reference, removes every routable region, prefers an inactive region, or asks `onlyNodeRegions` to use an observation-only region.

## Cloudflare deployment

Workers Static Assets serves the zero-build Web Builder from `apps/profile-service/public/`; `run_worker_first` is limited to `/api/*` and `/p/*`. D1 is bound as `DB` when saved profiles are enabled.

The static UI and resolver can be deployed without introducing React/Vite into the repository. The runtime uses standard Web APIs, so the core solver/renderer tests run directly under Node.
