# mythic3011/rules

OpenClash/Mihomo routing profiles, rule providers, DNS filters, regional service intelligence, and an optional self-hosted Profile Builder for generating personalized **subconverter custom-template INI** URLs.

[![Deploy Profile Builder to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mythic3011/rules/tree/main/apps/profile-service)
[![Built with Cloudflare](https://workers.cloudflare.com/built-with-cloudflare.svg)](https://cloudflare.com)

The repository has a deliberately small consumer surface: **use the published artifacts, or deploy the Profile Builder and generate your own opaque `.ini` subscription URL.** Maintainer/compiler internals live under `internal/`.

## Pick how you want to use it

| You want | Use |
| --- | --- |
| AI-aware subscription conversion with no personal settings | [`cfg/Custom_Clash_AI.ini`](cfg/Custom_Clash_AI.ini) |
| A ready-to-load balanced Mihomo/OpenClash YAML | [`cfg/yaml/Custom_Clash_AI.yaml`](cfg/yaml/Custom_Clash_AI.yaml) |
| A fail-closed runtime profile | [`cfg/yaml/Custom_Clash_AI_Strict.yaml`](cfg/yaml/Custom_Clash_AI_Strict.yaml) |
| Disable/prefer/limit node regions without editing generated files | **Deploy the Profile Builder** |
| Submit a service that works only in specific regions | **Regional Service Intake** GitHub Issue Form |

## Fastest OpenClash setup

If OpenClash is converting an existing provider subscription, paste this into **Custom Template URL**:

```text
https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/cfg/Custom_Clash_AI.ini
```

That is the stable, shared AI template. Nothing local needs to be edited.

For a personalized template — for example:

- never use Hong Kong nodes;
- only allow US + Singapore exits;
- prefer Japan before Singapore;

use the Profile Builder instead.

## Personalized Profile Builder

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mythic3011/rules/tree/main/apps/profile-service)

The Profile Builder is an optional Cloudflare Worker + Web UI. Cloudflare can clone the isolated app, provision its D1 binding, run the migration, and deploy it from the button above.

After deployment:

1. Open the Worker URL in a browser.
2. Choose the base profile.
3. Select disabled, allowed, and preferred node regions.
4. Preview the resolved routing plan.
5. Create the subscription.
6. Copy the generated URL into OpenClash **Custom Template URL**.

The long-lived URL is intentionally opaque:

```text
https://<your-worker-domain>/p/<opaque-read-capability>.ini
```

Routing preferences are stored as a typed `ProfileSpec`; they are not encoded into the subscription query string. The read capability can fetch the generated INI but cannot edit the profile. Management uses a separate capability.

```text
Web Builder
    │
    ▼
ProfileSpec
    │
    ▼
Constraint Solver
    │
    ▼
SubconverterPlan IR
    │
    ▼
/p/<opaque-token>.ini
    │
    ▼
OpenClash subscription conversion
```

See [`apps/profile-service/README.md`](apps/profile-service/README.md) for deployment, API, local development, and capability details.

## Local profile generation

Cloudflare is optional. A local clone can render the same region constraints directly:

```sh
./rulesctl profile render \
  --disable hk \
  --prefer jp,sg \
  -o custom.ini
```

Closed-world example:

```sh
./rulesctl profile render \
  --only us,sg \
  --prefer sg \
  -o custom.ini
```

`--only` is enforced structurally: generic provider matching is also restricted, so nodes from unlisted regions cannot leak back through a catch-all group.

## Published artifacts

| ID | Purpose | Stable artifact |
| --- | --- | --- |
| `subconverter-ai` | AI-aware OpenClash subscription conversion | `cfg/Custom_Clash_AI.ini` |
| `ai-balanced` | Recommended ready-to-load runtime profile | `cfg/yaml/Custom_Clash_AI.yaml` |
| `ai-strict` | Fail-closed runtime profile | `cfg/yaml/Custom_Clash_AI_Strict.yaml` |
| `subconverter-standard` | General subscription conversion | `cfg/Custom_Clash.ini` |
| `subconverter-lite` | Smaller general template | `cfg/Custom_Clash_Lite.ini` |
| `subconverter-gfw` | Minimal GFW-oriented template | `cfg/Custom_Clash_GFW.ini` |
| `subconverter-full` | Full rule template | `cfg/Custom_Clash_Full.ini` |

Machine-readable discovery is available in [`catalog.json`](catalog.json):

```sh
./rulesctl list
./rulesctl url ai-balanced
./rulesctl download ai-balanced -o profile.yaml
```

## OpenWrt installer

The installer downloads a ready-to-load profile but deliberately does **not** switch the active OpenClash profile or restart the router:

```sh
wget -O /tmp/mythic3011-rules-install.sh \
  https://raw.githubusercontent.com/mythic3011/rules/main/setup/openclash/install.sh
sh /tmp/mythic3011-rules-install.sh --profile ai-balanced --install
```

Validate and activate the downloaded config in OpenClash yourself.

## Regional service intake

A service may be reachable only from specific regions. Do not patch generated INI/YAML manually.

Open the **Regional Service Intake** GitHub Issue Form instead. The form records facts rather than implementation details:

- service name;
- matcher type and values;
- confirmed working regions;
- confirmed blocked regions;
- up to three additional/unlisted regions.

The intake pipeline validates and canonicalizes the report, reuses existing region identities where possible, updates the Service/Region registries, regenerates artifacts, runs checks, and opens a pull request. New regions can remain observation-only or be proposed as routable exits.

Architecture: [`docs/architecture/service-intake.md`](docs/architecture/service-intake.md).

## Stable public API

Only these roots are intended as stable downstream URLs:

```text
cfg/    published profiles and subconverter templates
rule/   published Mihomo/OpenClash rule providers
dns/    published DNS/hosts outputs and local override inputs
```

Everything else may evolve without requiring downstream URL changes.

## Repository layout

```text
.
├── cfg/                  # stable public profiles/templates
├── rule/                 # stable public rule providers
├── dns/                  # stable public DNS/hosts assets
├── setup/                # OpenClash/end-user setup helpers
├── apps/
│   └── profile-service/  # isolated Cloudflare Worker + Web Builder
├── docs/                 # usage, operations, architecture
├── internal/             # registries, compiler, generators, schemas
├── tests/                # contract/regression tests
├── web/                  # GitHub Pages/report sources
├── catalog.json          # machine-readable public entrypoint
├── rulesctl              # consumer + maintainer CLI
└── Makefile              # maintainer shortcuts
```

Historical delivery receipts and inactive attic files are intentionally kept out of the active tree; Git history is the archive.

## Maintainer workflow

Python/compiler contract checks:

```sh
make check
```

Full routing suite:

```sh
npm ci
make check-all
```

Deterministic regeneration:

```sh
make generate
```

Explicit network-backed upstream refresh:

```sh
make refresh
```

Profile Service tests can also run independently from its isolated subdirectory:

```sh
cd apps/profile-service
npm test
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for ownership rules.

## Safety model

Generated artifacts are outputs, not hand-edited state. User-facing HTTP inputs are schema-validated and cannot inject arbitrary raw rules, regexes, provider URLs, or renderer directives.

Saved Profile Builder subscriptions use separate read and management capabilities. D1 stores capability hashes rather than plaintext tokens. Account-sensitive finance routing remains fail-closed by default, and the public router installer never silently activates a profile or restarts OpenClash.

## License

See [`LICENSE`](LICENSE).
