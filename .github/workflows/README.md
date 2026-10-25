# GitHub Actions

Automation validates changes, generates public assets, and publishes them. Profile-service deployment is a separate manual action.

| Workflow | Responsibility |
| --- | --- |
| `auto-generate-ai-profiles.yml` | validate/generate AI routing artifacts, check Worker packaging, run Chromium E2E, and refresh scheduled upstream locks |
| `deploy-profile-service.yml` | manually validate and deploy the default-branch profile service using the `profile-service-production` environment |
| `service-intake.yml` | validate labeled service-intake issues and propose canonical registry changes by pull request |
| `auto-generate-adblock.yml` | refresh filtering sources and publish DNS/Clash outputs |
| `auto-generate-rules.yml` | derive YAML/MRS files from public `.list` rules |
| `auto-update-game-cdn.yml` | refresh the game download CDN list |
| `auto-update-mainland.yml` | derive the Mainland subconverter template |
| `deploy-reports-site.yml` | publish the consumer landing page and reports to GitHub Pages |
| `purge-jsdelivr.yml` | purge/verify CDN artifacts after managed generation |
| `check-bootstrap-alias.yml` | externally verify the human-facing Guard bootstrap redirect |
| `codeql.yml` | CodeQL security analysis |
| `dependabot-auto-merge.yml` | labeled Dependabot automation |

Maintainers use `mise run check`, `mise run generate`, and the explicit `mise run refresh` locally. The Make targets remain compatible aliases. Profile-service deployment setup is documented in [its guide](../../apps/profile-service/README.md#github-actions).
