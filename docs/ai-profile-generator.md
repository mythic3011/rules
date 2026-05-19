# AI Profile Generator

`py/generate_ai_profiles.py` is the source of truth for the AI profile family. It generates `cfg/yaml/Custom_Clash_AI.yaml`, `cfg/yaml/Custom_Clash_AI_Strict.yaml`, `cfg/Custom_Clash_AI.ini`, the `rule/AI_*_Classical.yaml` files, `rule/AI_All_Classical.yaml`, the SSH companion rules, the gaming direct rules, and the optional process rule files. Generated files must not be hand-edited.

YAML and INI outputs use different schemas and must stay separate. YAML uses top-level `rule-providers` with explicit `behavior` values that match the referenced file format. INI keeps the existing subconverter `[custom]` dialect with `ruleset=` and `custom_proxy_group=` lines only. Do not copy YAML `rule-providers:` syntax into the INI.

`AI_All_Classical` is keyword-level only. It must not copy or union exact per-service payloads from the specific AI files. The specific rules own exact routing for ChatGPT, Copilot, Claude, Gemini, NotebookLM, Perplexity, Grok, and Poe. `AI_All_Classical` exists to reject broad leftovers with `DOMAIN-KEYWORD` matches only.

Strict kill-switch behavior has three layers:
1. Specific AI service rule-sets route to the corresponding AI proxy groups.
2. `AI_All_Classical` routes to `⛔ 拒絕`.
3. Strict `MATCH` also routes to `⛔ 拒絕`.

The relaxed YAML profile keeps `MATCH,🐟 漏網之魚`. `🐟 漏網之魚` must end with `⛔ 拒絕`, because proxy-group fallback is health-check based and is not a complete kill-switch by itself. `MATCH,DIRECT` is forbidden in every AI profile. Standalone `DST-PORT,80` and `DST-PORT,443` catch-all rules are also forbidden.

Custom provider names are explicit and canonical in generated outputs:
- `Custom_Direct_Domain`
- `Custom_Direct_Classical_IP`
- `Custom_Proxy_Domain`
- `Custom_Proxy_Classical_IP`

Provider metadata nodes must be filtered. YAML applies provider-level `exclude-filter` under `proxy-providers.provider1.override`. INI cannot express the same provider override, so it relies on filtered group regex and comments documenting the limitation. Raw `host:port` nodes are allowed to appear in `🚀 手動選擇` when they come dynamically from proxy-providers at runtime, but they must not be hardcoded into generator source.

Taiwan output labels must always use `🇹🇼 台灣節點`. The old `🇼🇸` Samoa flag is only a legacy input-cleanup concern and must never appear in generated output.

Process rules are data-driven and disabled by default. `ENABLE_PROCESS_RULES=false` is the router-mode default. When desktop compatibility routing is needed, update `data/process_rules.yaml`, regenerate, and keep the generated Process rule files limited to `PROCESS-NAME` entries only. The maintained source list should be refreshed manually from references such as `MetaCubeX/meta-rules-dat`, `blackmatrix7/ios_rule_script`, and `Loyalsoldier/clash-rules`, then deduplicated before emission.
