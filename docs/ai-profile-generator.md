# AI profile generator

`internal/python/generate_ai_profiles.py` compiles the AI profile family from the canonical declarations under `internal/config/ai-routing/`. Generated `cfg/`, `rule/`, and `dns/` files are public consumer paths; edit their source declarations and regenerate instead of hand-editing them. See the [policy maintenance guide](policy-maintenance.md) for add, edit, remove, and shared-policy workflows.

## Output formats

YAML uses Mihomo `rule-providers`. INI keeps the existing subconverter `ruleset=` and `custom_proxy_group=` dialect; do not copy YAML provider syntax into it. Keep the documented `.ini` subscription contract and its filenames stable.

The INI MVP migration is intentionally partial. TypeScript owns `internal/generated/ai-routing/hk.ini-mvp-plan.json`; Python loads that plan and renders its declared lines. It currently covers the HK matrix for Claude, Windsurf, and Hugging Face. Legacy generation still owns other INI services and all YAML profiles.

## Routing guarantees

- Strict profiles route unmatched traffic to `⛔ 拒絕` and omit relaxed-only direct, gaming, process, and custom rules.
- The privacy guard precedes private, service, gaming, and fallback routes. Relaxed fallback still ends in `⛔ 拒絕`; `MATCH,DIRECT` and catch-all `DST-PORT,80` / `DST-PORT,443` rules are forbidden. See [traffic privacy](node-normalization.md) for the guard's limits and router requirements.
- Claude remains reject-only in the public INI MVP. Its account selector is fail-closed and requires an explicit manual choice; automatic or direct fallbacks are not emitted.
- Regional and global selectors use shared provider pools as manual `select` groups with `REJECT` first. Health checks cannot switch the egress IP; the user changes it explicitly. Account-sensitive selectors remain separate, manual, and reject-first.
- Provider metadata nodes are filtered in YAML and by the maintained node filter in INI. The formats do not offer the same provider-level filter option.

Process rules are disabled by default for router use. If desktop compatibility rules are needed, edit `internal/config/ai-routing/catalogs/process-rules.yaml`, regenerate, and keep the generated entries limited to `PROCESS-NAME` rules. Taiwan output uses `🇹🇼 台灣節點`.
