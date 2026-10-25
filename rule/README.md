# Published rule providers

This directory is a stable public URL surface for Mihomo/OpenClash and downstream tooling.

The source-of-truth for generated AI/service providers lives under `internal/config/`; generated files should not be edited directly. Hand-maintained `.list` files remain here because they are themselves public inputs.

Common forms:

| Form | Purpose |
| --- | --- |
| `.list` | text rules / subconverter input |
| `_Classical.yaml` | mixed classical rule-provider |
| `_Classical_IP.yaml` | IP-only classical provider |
| `_Domain.yaml` | domain provider |
| `_IP.yaml` | IP-CIDR provider |
| `.mrs` | Mihomo binary ruleset |

Game-specific standalone rules are grouped under `rule/games/`.
