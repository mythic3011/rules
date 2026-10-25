# Kill Switch

The AI profiles are fail-closed by design. The generated strict YAML profile uses a real three-layer kill-switch:
1. Local AI rule-sets and `GEOSITE` service identities route only to their dedicated AI groups.
2. `GEOSITE,google-deepmind` and `GEOSITE,category-ai-!cn` route to `⛔ 拒絕`.
3. Final `MATCH` routes to `⛔ 拒絕`.

This means strict kill-switch behavior does not depend on proxy-group health checks alone. Fallback and url-test groups are health-check based selection helpers. They are not complete leak-prevention mechanisms.

The relaxed YAML profile is still explicit: it ends with `MATCH,🐟 漏網之魚`, and `🐟 漏網之魚` must list `⛔ 拒絕` as the final option. AI service identity and guard rules are emitted before relaxed SSH, gaming, process, and custom rules, so broad relaxed entries cannot bypass an AI guard. `AI_All_Classical` is no longer generated. `MATCH,DIRECT` is forbidden. Standalone `DST-PORT,80` and `DST-PORT,443` catch-all rules are forbidden.

Process-based routing is off by default. `ENABLE_PROCESS_RULES=false` is the safe router-mode default because OpenClash transparent proxy mode normally cannot inspect LAN client processes. If you want desktop-only compatibility routing, update `internal/config/ai-routing/catalogs/process-rules.yaml`, set `ENABLE_PROCESS_RULES=true`, and regenerate. The generated Process rule files contain only `PROCESS-NAME` entries after deduplication.
