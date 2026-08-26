# OpenClash Profile Service

Self-hosted Cloudflare Worker + Web Builder for generating personalized **OpenClash/subconverter custom-template INI** profiles.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mythic3011/rules/tree/main/apps/profile-service)
[![Built with Cloudflare](https://workers.cloudflare.com/built-with-cloudflare.svg)](https://cloudflare.com)

The application is intentionally isolated inside `apps/profile-service/`, so Cloudflare's Deploy button can treat this directory as a standalone Worker project.

## What it does

Instead of exposing routing preferences in a long subscription query string, the builder stores a typed `ProfileSpec` and returns an opaque read-only custom-template URL:

```text
https://<your-worker-domain>/p/<opaque-read-capability>.ini
```

Paste that URL into OpenClash **Custom Template URL**.

```text
Browser UI
  -> POST /api/v1/resolve          preview only
  -> POST /api/v1/profiles         save ProfileSpec
       -> D1 saved state
       -> opaque read capability

OpenClash
  -> GET /p/<read-token>.ini
       -> ProfileSpec solver
       -> SubconverterPlan
       -> INI renderer
```

The public v1 profile schema stays deliberately small:

```json
{
  "schemaVersion": 1,
  "baseProfile": "ai-balanced",
  "disabledNodeRegions": ["hk"],
  "onlyNodeRegions": [],
  "preferredNodeRegions": ["jp", "sg"]
}
```

Arbitrary raw rules, regexes, provider URLs, and renderer directives are not accepted as public API fields.

## One-click deployment

Click the button at the top of this README.

Cloudflare will import this subdirectory as a standalone Worker project, provision the declared D1 database binding, run the repository's deploy script, apply D1 migrations, and deploy the Worker + static Web Builder.

The Worker also declares a write rate-limiter binding for anonymous create/update/rotate endpoints.

After deployment, open the Worker URL and generate your first profile. No separate frontend deployment is required; Workers Static Assets serves the builder from the same application.

## Manual deployment

Prerequisites: Node.js 22+ and a Cloudflare account.

The checked-in `wrangler.jsonc` uses Cloudflare automatic resource provisioning for D1. For a fresh standalone checkout:

```sh
npm run deploy
```

If you prefer to bind an already-created D1 database explicitly, the repository still provides the local helper:

```sh
npx wrangler@latest d1 create mythic-rules-profiles
node tools/configure-d1.mjs <database-id>

npx wrangler@latest d1 migrations apply DB --remote --config wrangler.local.jsonc
npx wrangler@latest deploy --config wrangler.local.jsonc
```

`wrangler.local.jsonc` is gitignored.

## Local development

The solver tests do not require a Cloudflare account:

```sh
npm test
```

For a local Worker with automatically provisioned local D1 state:

```sh
npx wrangler@latest d1 migrations apply DB --local
npm run dev
```

From the parent repository, Python owns the generated Worker runtime and parity fixtures:

```sh
python3 internal/python/generate_profile_service_runtime.py
npm run test:profile-service
```

Representative specs are hashed across the Python compiler and JavaScript Worker renderer; CI fails if the two projections drift.

## API

### `GET /api/v1/catalog`

Returns the public base-profile and Region Registry data required by the builder.

### `POST /api/v1/resolve`

Validates and previews a `ProfileSpec` without persistence.

### `POST /api/v1/profiles`

Creates a saved profile and returns separate read and management capabilities.

### `GET /p/<read-token>.ini`

Returns the generated subconverter custom-template INI. Query-string routing directives are ignored; routing comes only from the saved `ProfileSpec`.

### `GET|PUT /api/v1/profiles/<id>`

Reads or updates a saved profile with the management capability in `Authorization: Bearer ...`.

### `POST /api/v1/profiles/<id>/rotate-read-token`

Rotates only the read/subscription capability.

## Capability model

A saved profile creates two independent high-entropy capabilities:

- **read capability** — can fetch `/p/<token>.ini` only;
- **management capability** — can read/update the saved `ProfileSpec` and rotate the read token.

D1 stores only SHA-256 token hashes. The browser management URL places the management token in the URL fragment, then moves it into `sessionStorage` and clears the fragment so normal HTTP navigation does not transmit it.

A leaked subscription URL therefore does not grant profile mutation rights; it can also be revoked independently by rotating the read capability.

## Region constraint semantics

- `disabledNodeRegions`: exclude those regions from generated candidates.
- `preferredNodeRegions`: reorder remaining routable regions without broadening the candidate set.
- `onlyNodeRegions`: closed-world allowlist. Generic provider matching receives a positive allow filter, preventing unlisted/unknown-region nodes from leaking through catch-all groups.

Observation-only regions such as `hk` may be disabled but cannot be used as an `only` exit unless the Region Registry marks them routable.

## Cloudflare resources

| Binding | Purpose |
| --- | --- |
| `ASSETS` | Web Builder static assets |
| `DB` | Saved typed ProfileSpec state + capability hashes |
| `PROFILE_WRITE_LIMITER` | Anonymous write abuse guard |

D1 is authoritative for saved profiles. Generated INI is derived state and can always be rebuilt from the saved spec + repository runtime data.

## Security boundary

The Worker accepts a typed allowlisted schema. HTTP input never passes arbitrary text directly into the INI renderer. The subscription path is opaque, but the `.ini` extension is intentional because OpenClash/subconverter consumes a custom-template INI; the response format itself is not treated as a secret.
