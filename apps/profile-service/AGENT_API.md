# Profile service API for agents

Agents can use the service directly over HTTP or through the dependency-free
Node CLI at `tools/profile-agent.mjs`. The CLI prints one JSON value per
successful command to stdout; errors go to stderr with a nonzero exit status.

Run commands from the repository root. `--base-url` is required and should be
the Worker origin, such as `http://127.0.0.1:8787` for local development.

```sh
node apps/profile-service/tools/profile-agent.mjs --base-url http://127.0.0.1:8787 catalog
```

Use `GET /api/v1/catalog` as the authority for registered templates, regions,
services, routes, defaults, and limits. In particular, honor the returned
`profileSpecLimits.maxJsonBytes` request limit and
`customRuleProviderLimits.maxProviders` and
`customRuleProviderLimits.maxUrlLength` values for custom rule providers. Do
not copy those limits into an agent-side schema. The service validates the
canonical `ProfileSpec`; unknown fields are rejected.

A minimal profile can include optional custom rule provider and adblock
settings. For example:

```json
{
  "schemaVersion": 1,
  "baseProfile": "ai-balanced",
  "language": "en",
  "adblock": true,
  "customRuleProviders": [
    {
      "url": "https://example.org/rules.yaml",
      "behavior": "domain",
      "target": "reject"
    }
  ]
}
```

The URL above is illustrative; supply a reachable rules URL allowed by the
catalog's provider limits. Other supported profile choices include
`disabledNodeRegions`, `onlyNodeRegions`, `preferredNodeRegions`,
`disabledServices`, `preferredServices`, `allowDirect`, `failClosed`,
`language`, and `serviceGroups`. Use IDs and values from the catalog or an
existing exported spec. For service group edits, start from the catalog's
`serviceGroups` entries and preserve protected account membership.

The CLI accepts a JSON file or `-` for stdin. `resolve` and `create` accept
either a `ProfileSpec` directly or an object wrapped as `{ "spec": ProfileSpec
}`. They call `POST /api/v1/resolve` and `POST /api/v1/profiles` respectively.
For example:

```sh
node apps/profile-service/tools/profile-agent.mjs --base-url http://127.0.0.1:8787 resolve ./profile-spec.json
cat ./profile-spec.json | node apps/profile-service/tools/profile-agent.mjs --base-url http://127.0.0.1:8787 create -
```

The resolve response is `{ "spec": ..., "summary": ..., "ini": ... }` and
does not save a profile. Create returns `{ "id", "readToken", "manageToken",
"revision" }`; both tokens are capabilities and must be stored privately.
The management token is returned only on creation.

For managed reads and updates, provide `PROFILE_MANAGE_TOKEN` through the
agent's secret environment. Do not put it in command arguments or profile JSON.
`get` calls `GET /api/v1/profiles/{id}` and returns the current spec and
revision. `update` calls `PUT /api/v1/profiles/{id}`, validates the submitted
spec, and increments the revision.

```sh
node apps/profile-service/tools/profile-agent.mjs --base-url http://127.0.0.1:8787 get PROFILE_ID
node apps/profile-service/tools/profile-agent.mjs --base-url http://127.0.0.1:8787 update PROFILE_ID ./profile-spec.json
```

For direct HTTP clients, catalog is a JSON `GET`. Resolve and create accept a
`ProfileSpec` either directly or under `spec`. Managed writes use the `spec`
envelope and a bearer management token:

```sh
curl -sS "$BASE_URL/api/v1/catalog"
curl -sS "$BASE_URL/api/v1/resolve" -H 'content-type: application/json' \
  --data '{"spec":{"schemaVersion":1,"baseProfile":"ai-balanced"}}'
curl -sS "$BASE_URL/api/v1/profiles" -H 'content-type: application/json' \
  --data '{"spec":{"schemaVersion":1,"baseProfile":"ai-balanced"}}'
```

For managed HTTP calls, set `Authorization: Bearer <manageToken>` from the
client's secret environment at request time. Avoid shell commands that expand
the token into a command argument, where process listings or command logs may
expose it.

The catalog endpoint returns the catalog JSON object. Resolve returns the
resolved spec, summary, and rendered INI. Create returns the profile ID and
read/manage tokens. Managed GET returns the ID, revision, spec, summary, and
updated time; managed PUT returns the ID, incremented revision, and saved spec.
Errors return JSON with an `error` code and may include a message. Clients
should branch on the code and avoid logging credentials or capability tokens.

The read token is used in the existing OpenClash subscription contract:
`GET /p/<opaque-token>.ini` returns the custom-template INI text. `GET
/p/<opaque-token>` redirects to that `.ini` URL. This profile service does not
expose a YAML subscription endpoint.

The CLI limits JSON input to 300,000 bytes and times out service requests after
30 seconds. It does not print management credentials in errors, but command
logging or shell tracing may capture environment values; inject credentials
through the host's secret environment mechanism.
