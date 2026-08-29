# mythic3011/rules

OpenClash/Mihomo routing profiles, rule providers, DNS filters, regional service intelligence, and a self-hostable Profile Builder for generating personalized **subconverter custom-template INI** URLs.

[![Deploy Profile Builder to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mythic3011/rules/tree/main/apps/profile-service)
[![Routing validation](https://github.com/mythic3011/rules/actions/workflows/auto-generate-ai-profiles.yml/badge.svg)](https://github.com/mythic3011/rules/actions/workflows/auto-generate-ai-profiles.yml)
[![CodeQL](https://github.com/mythic3011/rules/actions/workflows/codeql.yml/badge.svg)](https://github.com/mythic3011/rules/actions/workflows/codeql.yml)
[![Built with Cloudflare](https://workers.cloudflare.com/built-with-cloudflare.svg)](https://cloudflare.com)

> **Start here:** use the shared `.ini` template if the defaults fit you. Deploy the Profile Builder only when you want personal region constraints such as “never use Hong Kong nodes” or “only use US + Singapore exits”.

## Choose your path

| Goal | Start here |
| --- | --- |
| Use the shared AI-aware OpenClash template | [`cfg/Custom_Clash_AI.ini`](cfg/Custom_Clash_AI.ini) |
| Build a personalized OpenClash template without editing YAML/INI | **[Deploy the Profile Builder](https://deploy.workers.cloudflare.com/?url=https://github.com/mythic3011/rules/tree/main/apps/profile-service)** |
| Load a ready-to-run balanced Mihomo/OpenClash config | [`cfg/yaml/Custom_Clash_AI.yaml`](cfg/yaml/Custom_Clash_AI.yaml) |
| Use a fail-closed runtime profile | [`cfg/yaml/Custom_Clash_AI_Strict.yaml`](cfg/yaml/Custom_Clash_AI_Strict.yaml) |
| Report a region-restricted service | GitHub **Regional Service Intake** issue form |
| Discover artifacts programmatically | [`catalog.json`](catalog.json) / `./rulesctl list` |

## 60-second OpenClash setup

For an existing provider subscription that uses **subscription conversion**, set OpenClash **Custom Template URL** to:

```text
https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/cfg/Custom_Clash_AI.ini
```

That is the shared AI-aware template. It is generated and published by this repository; you do not need to clone the repo or edit generated files.

If you need personal routing preferences, use the Profile Builder instead.

## OpenClash Guard

Install the unified guard from either public source:

```sh
curl -fsSL https://raw.githubusercontent.com/mythic3011/rules/main/setup/openclash/install.sh | sh
curl -fsSL https://cdn.jsdelivr.net/gh/mythic3011/rules@main/setup/openclash/install.sh | sh
```

After installation, use `openclash-guard refresh` for automatic source
selection and validated fallback. Manual controls include `--source
auto|github-raw|jsdelivr`, `--base-url URL`, and `--policy-url URL`.

## Personalized Profile Builder

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mythic3011/rules/tree/main/apps/profile-service)

The Profile Builder is an optional Cloudflare Worker + Web UI for non-technical users. It generates a long-lived, opaque **custom-template INI URL** that can be pasted directly into OpenClash.

Typical use cases:

- exclude all Hong Kong nodes;
- allow only US + Singapore exits;
- prefer Japan before Singapore;
- keep personal preferences out of the shared repository;
- update the saved profile later without changing the OpenClash URL.

### User flow

```text
Open Web Builder
      ↓
Choose base profile
      ↓
Disable / allow / prefer regions
      ↓
Preview effective routing
      ↓
Create subscription
      ↓
https://<worker>/p/<opaque-read-token>.ini
      ↓
OpenClash → Custom Template URL
```

The subscription URL does **not** contain routing preferences such as `?disable=hk&prefer=jp,sg`. Saved preferences live in a typed `ProfileSpec`; the URL is an opaque read capability.

Read and management capabilities are separate:

```text
/p/<read-token>.ini        → fetch generated INI only
/manage/<manage-token>     → edit the saved ProfileSpec
```

See [`apps/profile-service/README.md`](apps/profile-service/README.md) for deployment, API, local development, D1 storage, and capability details.

## Local generation

Cloudflare is optional. A local clone can render the same region constraints:

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

`--only` is enforced structurally. Generic provider matching is restricted too, so nodes from unlisted or unknown regions cannot leak back through a catch-all group.

## Published artifacts

The public surface is intentionally small and stable.

| Artifact | Purpose |
| --- | --- |
| [`cfg/Custom_Clash_AI.ini`](cfg/Custom_Clash_AI.ini) | AI-aware OpenClash/subconverter custom template |
| [`cfg/yaml/Custom_Clash_AI.yaml`](cfg/yaml/Custom_Clash_AI.yaml) | Recommended balanced runtime profile |
| [`cfg/yaml/Custom_Clash_AI_Strict.yaml`](cfg/yaml/Custom_Clash_AI_Strict.yaml) | Fail-closed runtime profile |
| [`cfg/Custom_Clash.ini`](cfg/Custom_Clash.ini) | General subscription-conversion template |
| [`cfg/Custom_Clash_Lite.ini`](cfg/Custom_Clash_Lite.ini) | Smaller general template |
| [`cfg/Custom_Clash_GFW.ini`](cfg/Custom_Clash_GFW.ini) | Minimal GFW-oriented template |
| [`cfg/Custom_Clash_Full.ini`](cfg/Custom_Clash_Full.ini) | Full rule template |

Machine-readable discovery:

```sh
./rulesctl list
./rulesctl url ai-balanced
./rulesctl download ai-balanced -o profile.yaml
```

Canonical metadata is published in [`catalog.json`](catalog.json).

## Regional Service Intake

Do not patch generated INI/YAML when a service has regional restrictions.

Use the GitHub **Regional Service Intake** issue form. The form records observations instead of asking contributors to understand routing implementation:

- service name;
- matcher type and values;
- confirmed working regions;
- confirmed blocked regions;
- additional/unlisted regions when needed.

The intake pipeline then:

```text
GitHub Issue Form
      ↓
Validate + canonicalize
      ↓
Service / Region Registry
      ↓
Generate routing artifacts
      ↓
Run checks
      ↓
Bot pull request
```

New regions are deduplicated against existing region identities. A region can remain observation-only or be explicitly proposed as a routable exit.

Architecture: [`docs/architecture/service-intake.md`](docs/architecture/service-intake.md).

## OpenWrt distribution surfaces

These surfaces have separate roles:

- `setup/openclash/install.sh` is the bootstrap installer.
- `dist/openclash-guard.sh` is the generated standalone POSIX application.
- `cfg/` contains generated OpenClash profiles and policy artifacts.

Install the verified Guard build directly from either supported public source:

```sh
curl -fsSL https://raw.githubusercontent.com/mythic3011/rules/main/setup/openclash/install.sh | sh
curl -fsSL https://cdn.jsdelivr.net/gh/mythic3011/rules@main/setup/openclash/install.sh | sh
```

The bootstrap verifies the paired checksum and manifest, then atomically installs `/usr/bin/openclash-guard` and reconciles it. It does not require Python, Node.js, git, or `shbundle` on OpenWrt.

To download a ready-to-load profile instead, pass `--profile`; this deliberately does **not** switch the active OpenClash profile:

```sh
wget -O /tmp/mythic3011-rules-install.sh \
  https://raw.githubusercontent.com/mythic3011/rules/main/setup/openclash/install.sh
sh /tmp/mythic3011-rules-install.sh --profile ai-balanced --install
```

Build-time commands are `python3 tools/shbundle.py build openclash-guard`, `python3 tools/shbundle.py build --all`, and `make build`.

Validate and activate the downloaded config in OpenClash yourself.

## Stable downstream paths

Only these roots are intended as stable downstream URLs:

```text
cfg/    published profiles and subconverter templates
rule/   published Mihomo/OpenClash rule providers
dns/    published DNS/hosts outputs and local override inputs
```

Everything else is an implementation surface and may evolve without preserving raw GitHub paths.

## How the repository is organized

```text
.
├── cfg/                  # stable public profiles/templates
├── rule/                 # stable public rule providers
├── dns/                  # stable public DNS/hosts assets
├── setup/                # OpenClash/end-user setup helpers
├── apps/
│   └── profile-service/  # isolated Cloudflare Worker + Web Builder
├── docs/                 # usage, operations, architecture
├── internal/
│   ├── config/           # canonical service/region/routing data
│   ├── python/           # compiler/generator implementation
│   ├── typescript/       # routing validation/projection tooling
│   ├── schemas/          # machine-readable contracts
│   ├── templates/        # generated-artifact templates
│   └── generated/        # checked/generated intermediate data
├── tests/                # contract/regression tests
├── web/                  # report/site sources
├── catalog.json          # machine-readable public entrypoint
├── rulesctl              # consumer + maintainer CLI
└── Makefile              # maintainer shortcuts
```

Generated files are outputs, not hand-edited state. Git history is the archive; inactive phase receipts and attic files do not live in the active tree.

## Architecture in one view

```text
Service Registry ─┐
Region Registry  ─┼─→ Routing compiler / solver
Policy data      ─┘          │
                             ├─→ static cfg/rule/dns artifacts
                             ├─→ subconverter custom-template INI
                             └─→ Profile Service runtime data

Web Builder → typed ProfileSpec → solver → opaque .ini URL → OpenClash
GitHub Issue → intake validator → registry change → generated PR
```

The important boundary is simple:

> **Services and regions are data. Compiler behavior changes only when the routing mechanism itself changes.**

## Development

Bootstrap dependencies:

```sh
npm ci
python3 -m pip install -r requirements-dev.txt
```

Fast contract checks:

```sh
make check
```

Full routing validation:

```sh
make check-all
```

`make check-all` includes `npm run validate:routing` before TypeScript typecheck/tests. The core routing validator reads only numbered canonical fragments under `internal/config/ai-routing/core/`:

```text
00-*.yaml
10-*.yaml
...
50-*.yaml
```

`mihomo.yaml`, `parity.yaml`, and `process-rules.yaml` are separate manifest dialects with their own loaders and schemas.

Deterministic regeneration:

```sh
make generate
```

Network-backed upstream refresh:

```sh
make refresh
```

Profile Service independently:

```sh
cd apps/profile-service
npm test
npm run dev
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for ownership, generation, and contribution rules.

## Security model

- Generated artifacts are never treated as user-editable source-of-truth.
- Public HTTP inputs use typed allowlisted schemas.
- Arbitrary raw rules, regexes, provider URLs, and renderer directives are rejected at the HTTP boundary.
- Saved Profile Builder subscriptions use separate read and management capabilities.
- D1 stores capability hashes rather than plaintext capability tokens.
- Query-string routing directives on `/p/<token>.ini` are ignored; saved `ProfileSpec` state is authoritative.
- Account-sensitive finance routing remains fail-closed by default.
- The OpenWrt installer never silently activates a profile or restarts OpenClash.

## License

See [`LICENSE`](LICENSE).
