# Repository refresh migration

The refresh keeps the stable consumer URLs under `cfg/`, `rule/`, and `dns/`. Internal and maintenance paths were reorganized so consumers no longer need to understand implementation layout.

| Before | After |
| --- | --- |
| `data/` | `internal/config/` |
| `py/` | `internal/python/` |
| `src/routing/` | `internal/typescript/routing/` |
| `generated/` | `internal/generated/` |
| `schema/` | `internal/schemas/` |
| `templates/` | `internal/templates/` |
| `examples/` | `internal/examples/` |
| `shell/` | `setup/openclash/scripts/` |
| `overwrite/` | `setup/openclash/overwrites/` |
| `game_rule/` | `rule/games/` |
| `site/` | `web/site/` |
| `reports/` | `web/reports/` |
| `LICENCE` | `LICENSE` |

The old `archive/` and staged P1-P19 receipt tree were removed from the active repository. Git history is the historical source instead.

For automation, stop calling internal scripts directly where a root command exists. Prefer `./rulesctl`, `make check`, `make generate`, and `make refresh`.
