# AI Profile Generator

`py/generate_ai_profiles.py` is the source of truth for the AI profile family. It generates `cfg/yaml/Custom_Clash_AI.yaml`, `cfg/yaml/Custom_Clash_AI_Strict.yaml`, `cfg/Custom_Clash_AI.ini`, local-payload `rule/AI_*_Classical.yaml` files, the SSH companion rules, the gaming direct rules, and the optional process rule files. Generated files must not be hand-edited.

YAML and INI outputs use different schemas and must stay separate. YAML uses top-level `rule-providers` with explicit `behavior` values that match the referenced file format. INI keeps the existing subconverter `[custom]` dialect with `ruleset=` and `custom_proxy_group=` lines only. Do not copy YAML `rule-providers:` syntax into the INI.

## INI MVP migration boundary

`generated/ai-routing/hk.ini-mvp-plan.json` is a deterministic, TypeScript-owned presentation plan for the first INI migration slice. It is compiled from the canonical routing manifests plus `data/ai-routing-mihomo.yaml`; Python loads the JSON strictly and renders only the declared INI lines. Python does not parse the canonical YAML manifests or make routing-policy decisions from them.

The MVP is deliberately partial. It covers the HK matrix for Claude, Windsurf, and Hugging Face only; the existing legacy generator continues to own every other service and all YAML output. The INI rule order is fixed as private rules, the Claude protected provider plus its immediate terminal reject, legacy service rules excluding Claude, Windsurf and Hugging Face, AI_All, then the category-AI safety net and the pre-existing non-AI rules.

Claude remains reject-only in the public INI MVP group. Its exact approved egress-node activation and router-local enforcement remain outside this migration slice; no automatic node selection, fallback, or direct path is emitted here. Each shared stable region group begins with `⛔ 拒絕`, then its filtered provider-node candidate, so it remains fail-closed until the user explicitly selects a node. These INI selectors are not a complete runtime firewall or DNS kill switch.

Only services with local domain payloads receive an `AI_*_Classical` rule-provider file. Service identities without a local payload route through their maintained `GEOSITE` identity. The current AI safety net is the generated `GEOSITE,google-deepmind` and `GEOSITE,category-ai-!cn` guards; `AI_All_Classical.yaml` is not generated and must not be added as a compatibility fallback.

Strict kill-switch behavior has three layers:
1. Local-payload rule-sets and `GEOSITE` service identities route to their corresponding AI proxy groups.
2. The upstream AI guard `GEOSITE` entries route to `⛔ 拒絕`.
3. Strict `MATCH` also routes to `⛔ 拒絕`.

AI identity and guard rules are emitted before relaxed-only SSH, gaming, process, and custom rules. Strict YAML omits those relaxed-only providers and rules altogether; it retains only the local-payload AI providers and its fail-closed routing baseline.

The relaxed YAML profile keeps `MATCH,🐟 漏網之魚`. `🐟 漏網之魚` must end with `⛔ 拒絕`, because proxy-group fallback is health-check based and is not a complete kill-switch by itself. `MATCH,DIRECT` is forbidden in every AI profile. Standalone `DST-PORT,80` and `DST-PORT,443` catch-all rules are also forbidden.

Custom provider names are explicit and canonical in generated outputs:
- `Custom_Direct_Domain`
- `Custom_Direct_Classical_IP`
- `Custom_Proxy_Domain`
- `Custom_Proxy_Classical_IP`

Provider metadata nodes must be filtered. YAML applies provider-level `exclude-filter` on `proxy-providers.provider1`. INI cannot express the same provider override, so it relies on filtered group regex and comments documenting the limitation. Raw `host:port` nodes are allowed to appear in `🚀 手動選擇` when they come dynamically from proxy-providers at runtime, but they must not be hardcoded into generator source.

Taiwan output labels must always use `🇹🇼 台灣節點`. The old `🇼🇸` Samoa flag is only a legacy input-cleanup concern and must never appear in generated output.

Process rules are data-driven and disabled by default. `ENABLE_PROCESS_RULES=false` is the router-mode default. When desktop compatibility routing is needed, update `data/process_rules.yaml`, regenerate, and keep the generated Process rule files limited to `PROCESS-NAME` entries only. The maintained source list should be refreshed manually from references such as `MetaCubeX/meta-rules-dat`, `blackmatrix7/ios_rule_script`, and `Loyalsoldier/clash-rules`, then deduplicated before emission.
