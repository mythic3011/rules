# GitHub Actions

Active automation is intentionally limited to generation, publishing, security, and dependency maintenance.

| Workflow | Responsibility |
| --- | --- |
| `auto-generate-ai-profiles.yml` | validate/generate AI routing artifacts and scheduled upstream locks |
| `service-intake.yml` | validate labeled service-intake issues and propose canonical registry changes by pull request |
| `auto-generate-adblock.yml` | refresh filtering sources and publish DNS/Clash outputs |
| `auto-generate-rules.yml` | derive YAML/MRS files from public `.list` rules |
| `auto-update-game-cdn.yml` | refresh the game download CDN list |
| `auto-update-mainland.yml` | derive the Mainland subconverter template |
| `deploy-reports-site.yml` | publish the consumer landing page and reports to GitHub Pages |
| `purge-jsdelivr.yml` | purge/verify CDN artifacts after managed generation |
| `codeql.yml` | CodeQL security analysis |
| `dependabot-auto-merge.yml` | labeled Dependabot automation |

Repository consumers do not need to understand these workflows. Maintainers should prefer `make check`, `make generate`, and `make refresh` locally so CI and local commands exercise the same entrypoints.
