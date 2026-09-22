# GitHub Actions

Active automation is intentionally limited to generation, publishing, security, dependency maintenance, and protected release signing.

| Workflow | Responsibility |
| --- | --- |
| `auto-generate-ai-profiles.yml` | validate/generate AI routing artifacts and scheduled upstream locks |
| `sign-openclash-guard-release.yml` | automatically sign a qualified next-sequence OpenClash Guard release candidate after the trusted push generator completes; manual dispatch remains available for controlled recovery |
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

Repository consumers do not need to understand these workflows. Maintainers should prefer `make check`, `make generate`, and `make refresh` locally so CI and local commands exercise the same entrypoints.

For OpenClash Guard releases, the normal path is chained automatically: a feature-branch push runs the trusted generator workflow, deterministic managed outputs are repaired/committed when needed, then the signer on `main` qualifies the exact resulting branch head. Automatic signing only accepts an exact `trusted sequence + 1` candidate and never auto-merges the PR. CodeQL and ordinary PR validation continue independently and remain part of the merge/review surface rather than a manual prerequisite to invoking the signer.

Manual signer dispatch remains a break-glass path for controlled same-sequence signature recovery or an explicitly reviewed next-sequence candidate.

Release maintainers should follow `docs/openclash-guard-release-signing.md`; the signing key must remain outside repository and pull-request execution contexts.
