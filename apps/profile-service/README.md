# OpenClash Profile Service

A self-hosted Cloudflare Worker with two browser tools:

| Tool | Use it for | Result |
| --- | --- | --- |
| INI template builder | Choose a subscription template and routing preferences | An opaque `/p/<token>` URL that redirects to the `.ini` subscription |
| Online YAML converter | Convert proxy links or subscriptions | A downloadable YAML profile with manual node selection |

## Use the web UI

1. Open the deployed Worker URL.
2. Choose **INI template builder** or **Online YAML converter** in the top navigation.
3. Choose a template. AI templates offer region and service controls. Preview the INI, then create its subscription URL; later edits update that same URL.
4. For YAML, use **Auto detect** to paste proxy links and HTTPS subscription URLs together, one entry per line. A conversion accepts at most five remote subscriptions, 256 KiB of downloaded subscription content in total, and 100 nodes. Pasted input has a separate 262,144-character limit and a 300,000-byte JSON request limit.
5. Copy or download the YAML. After import, select a node in a regional group, then choose that region in the pinned selector. With **Fail closed** enabled, also select allowed routes for DNS and each service you use. Selections stay manual.

### Builder states and next steps

The editor is your **draft**. **Preview** shows a snapshot of that draft and is marked outdated after you change routing settings. **Saved profile** is the last revision behind the subscription URL; previewing alone does not save changes.

After creating a profile, copy the read-only URL into OpenClash as its **Custom Template URL**, then save the separate management link somewhere private. Use the management link to edit and save the profile; the public builder only creates subscriptions. With **Fail closed** enabled, choose an allowed exit in your proxy client after import.

The YAML converter accepts `socks5h`, HTTPS proxy, and standard node links, plus pasted subscription text. Put each link or subscription URL on its own line. Paste Clash YAML or Base64 subscription data as a complete document by itself, not mixed with links. Every remote URL must match the exact-host allowlist; if any entry fails, the request returns no partial profile. Input and output stay in the page until you clear them or close the page. YAML can contain proxy credentials.

An HTTPS link with explicit proxy connection details is a proxy in **Auto detect** mode. Use **Subscription URLs or content** mode for bare HTTPS subscription URLs with an explicit port.

## Templates and routing controls

| Output | Available templates |
| --- | --- |
| INI | AI Balanced, Standard, Lite, GFW, Full, Mainland |
| YAML | AI Balanced, AI Strict, Standard |

The registry is `internal/config/ai-routing/catalogs/profile-templates.json`. The repository's placeholder YAML files are not offered. General-purpose templates retain their service routing and receive manual selectors and the shared privacy/DNS safeguards. The UI shows advanced options only for templates that support them.

For AI templates:

1. **Groups:** choose or create a group in the left list. Open **Group settings** to rename it, change its display order, or delete it. Restoring the template is under **Advanced actions** and requires confirmation.
2. **Services:** search for a service, then click or drag it into the selected group. Remove a service with its × button. Unassigned services are blocked. The account protection group keeps its separate identity and approved membership.
3. **Exit order:** search the available exits, then click or drag them into the numbered list. Drag to reorder; keyboard and touch controls appear on each row. Unavailable exits explain their restrictions. **Start with traffic blocked** controls the initial REJECT state separately from the exit list. This is a manual selector, so the order does not enable automatic failover.

A group shares its exits across its member services. Adding HK creates a manual exit for that group; it does not add HK to the global pool. Group layouts are saved separately for each template and output format.

Global controls still take precedence:

- Disable regions, or allow only selected regions. Add preferred regions and move them into an order such as **US → JP → SG**.
- Keep **Fail closed** enabled to place **REJECT** first in applicable selectors. These are manual choices, not automatic failover; select an allowed route after import.
- Enable **Allow DIRECT** only when direct routing is intended. Disabling it removes direct choices, rejects routes that otherwise go direct, and routes application DNS through the proxy. Encrypted proxy-host bootstrap stays independent to avoid a DNS cycle. Protected account routes retain their stricter policy.
- Disable a service to reject its traffic. Shared hostnames are blocked too, which can affect another service using the same backend.

The language menu supports English, Traditional Chinese, and Simplified Chinese. Translations load from JSON locale files. The selection also controls generated INI explanations and the YAML comment header; protocol syntax, group identifiers, and URLs keep their original values.

For Clash YAML input, only the `proxies` list is imported into the managed profile. Node options are retained after basic type, name, server, and port validation; the converter does not validate every Mihomo option.

## Allow remote subscription hosts

Remote subscriptions are fetched only from exact HTTPS hostnames configured by the operator. Add a comma-separated `CONVERTER_SUBSCRIPTION_HOSTS` Worker variable in `wrangler.jsonc` or the Cloudflare dashboard:

```jsonc
"vars": {
  "CONVERTER_SUBSCRIPTION_HOSTS": "subs.example.net,feed.example.org"
}
```

Use hostnames only: no scheme, port, path, wildcard, or redirect. Pasted subscription content does not use this allowlist. Leave the variable unset to disable remote subscription fetching.

Allow only subscription hosts you trust and control. The Worker resolves those hosts when fetching; the allowlist does not pin their DNS addresses.

## Run locally

Install [mise](https://mise.jdx.dev/getting-started.html), then run these
commands from the repository root. `make bootstrap` installs the
versions declared in `mise.toml`, Python development requirements, and one
frozen pnpm workspace for both the root tools and this Worker.

```sh
make bootstrap
mise run dev
```

`mise run dev` applies the local D1 migration, then starts the Worker on its
loopback development URL. It does not contact or deploy to a remote Worker.

### Browser end-to-end tests

Keep the development server running in one terminal. Run the E2E suite in a
second terminal:

```sh
mise run e2e
```

The default target is `http://127.0.0.1:8787`. Set
`PROFILE_SERVICE_E2E_BASE_URL` to another loopback URL if Wrangler uses a
different local port; non-loopback URLs are rejected. Set
`PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome browser. To use
Playwright's bundled Chromium instead, install it once with:

```sh
mise exec -- pnpm --filter mythic-rules-profile-service exec playwright install chromium
```

Run the profile-service unit tests with:

```sh
mise exec -- pnpm --filter mythic-rules-profile-service test
```

The INI renderer uses generated runtime data. Regenerate it from the parent
repository with `mise run generate` before testing parity-sensitive changes.

## Deploy

Deploy from the repository root so pnpm uses the checked-in workspace lockfile. The Worker serves both browser tools and uses the `DB` and `PROFILE_WRITE_LIMITER` bindings declared in its Wrangler config.

For a first deployment, install the pinned tools and dependencies, authenticate once, then deploy:

```sh
make bootstrap
mise run deploy:login
mise run deploy
```

The deploy command bundles locally first, reuses or creates the configured D1 database, applies pending migrations, then publishes the Worker and browser assets. `mise run deploy:setup` performs the bundle check and D1 setup/migrations without publishing. `mise run deploy:check` validates and bundles without changing remote resources; authenticated Wrangler may read existing deployment metadata. All stages use the same selected Wrangler config; the default is `apps/profile-service/wrangler.jsonc`.

Wrangler uses the currently authenticated account when only one is available. Select the destination explicitly when your login has multiple accounts:

```sh
CLOUDFLARE_ACCOUNT_ID=your-account-id mise run deploy
```

Before migrations, setup records the selected D1 database ID in that Wrangler config so later steps keep using the same database. The default config may therefore gain an account-specific `database_id` after first setup; do not commit that live ID to shared source. For another account or environment, use a separate operator-owned config. `wrangler.local.jsonc` is gitignored and can be selected explicitly with `--config`; Wrangler does not discover it automatically. Config paths are relative to `apps/profile-service/`:

```sh
mise exec -- pnpm --filter mythic-rules-profile-service run deploy --config wrangler.local.jsonc --env staging
```

Automatic D1 ID recording requires a JSON or JSONC config. For TOML, set `database_id` explicitly before deployment; otherwise setup stops before creating a database.

`make bootstrap` installs Python development dependencies for repository checks and generation; Python is not part of the deployed Worker runtime.

### GitHub Actions

Pull requests run the existing AI-profile validation pipeline, a Worker bundle check, and browser journeys against local Wrangler with Chromium.

1. Create the GitHub environment **profile-service-production** and restrict deployment branches to **main**.
2. Create a Cloudflare API token scoped to the destination account. For granular Workers roles, use an account-owned token with the permissions below.
3. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets in that GitHub environment.
4. Select **Actions → Deploy profile service → Run workflow** on **main**.

| Operation | Cloudflare token permission |
| --- | --- |
| Create the Worker on the first deployment | Workers product-level **Admin** in the destination account |
| Update an existing Worker | **Editor** scoped to `mythic-rules-profile-service` |
| List or create D1 databases and apply remote migrations | Account **D1 Edit** (called **D1 Write** in the API reference) |

After the first deployment, reduce Workers access to Editor for this Worker. Keep D1 Edit because every deployment checks the database and applies pending migrations. See Cloudflare's [Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/), [API token permission names](https://developers.cloudflare.com/fundamentals/api/reference/permissions/), and [D1 creation permissions](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/). The checked-in config uses `workers.dev` and declares no routes or custom domains, so it requires no zone or DNS permissions.

The workflow validates the checked-in sources and generated outputs, then uses the same `mise run deploy` entrypoint. Deployment is manual. No live D1 ID is committed back from the runner. GitHub's `contents: read` permission is sufficient for this job; Cloudflare access comes from the API token.

To require approval, configure required reviewers in that environment's protection rules. Naming an environment alone does not add an approval step.

Do not commit credentials. See Cloudflare's [Wrangler environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/) and [GitHub Actions deployment guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

The Wrangler config sets `keep_vars: true`, so deploys preserve dashboard variables such as `CONVERTER_SUBSCRIPTION_HOSTS`. Values declared by the selected Wrangler config take precedence. You can manage the subscription allowlist in the config or in the dashboard; the allowlist accepts exact HTTPS hostnames only. Keep invocation logs and request traces disabled: they can expose `/p/<token>` capability URLs. The Worker logs only a fixed, sanitized error event.

## API

- `GET /api/v1/catalog` returns the public profile catalog.
- `POST /api/v1/resolve` previews a typed INI `ProfileSpec` without saving it.
- `POST /api/v1/profiles` saves an INI profile and returns separate read and management capabilities.
- `GET /p/<token>` redirects to `/p/<token>.ini` with an empty response body.
- `GET /p/<token>.ini` returns the OpenClash custom-template INI; existing URLs keep working.
- `POST /api/v1/convert` accepts `{ "input": "…", "format": "auto|proxy|subscription", "spec": { "baseProfile": "ai-balanced" } }` and returns `{ "yaml": "…", "nodeCount": 1 }`.

`format` selects the input parser. `spec.baseProfile` selects a registered output template. Use the catalog's `templates`, `services`, `serviceGroups`, and `optionDefaults` fields to discover supported choices. AI options are `disabledNodeRegions`, `onlyNodeRegions`, `preferredNodeRegions`, `disabledServices`, `preferredServices`, `serviceGroups`, `allowDirect`, and `failClosed`. Both formats accept `language` (`en`, `zh-Hant`, or `zh-Hans`). Unsupported fields or template/option combinations return an error.

When supplied, `spec.serviceGroups` is the complete group layout for the selected output format. Each record has `id`, `name`, `serviceIds`, and ordered `routes`. Start from that format's catalog entries and use their `defaultRoutes` and `allowedRoutes`. A service can belong to one group; unassigned services are rejected. Empty groups match no traffic, and an empty route list rejects traffic. Account groups retain their canonical identity and membership. Services sharing an exact rule cannot be assigned to different destinations. Omitting this field preserves the template's group layout.

The INI endpoints accept only typed `ProfileSpec` fields. The YAML endpoint converts pasted links or subscription data; it does not save profiles. Do not put proxy or subscription credentials in query strings.
