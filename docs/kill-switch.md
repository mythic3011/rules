# Kill Switch

The AI profiles are fail-closed by design. The generated strict YAML profile uses a real three-layer kill-switch:
1. Specific AI rule-sets route only to their dedicated AI groups.
2. `AI_All_Classical` rejects broad keyword matches that were not caught by the specific service files.
3. Final `MATCH` routes to `⛔ 拒絕`.

This means strict kill-switch behavior does not depend on proxy-group health checks alone. Fallback and url-test groups are health-check based selection helpers. They are not complete leak-prevention mechanisms.

The relaxed YAML profile is still explicit: it ends with `MATCH,🐟 漏網之魚`, and `🐟 漏網之魚` must list `⛔ 拒絕` as the final option. Even in relaxed mode, `AI_All_Classical` still routes to `⛔ 拒絕`. `MATCH,DIRECT` is forbidden. Standalone `DST-PORT,80` and `DST-PORT,443` catch-all rules are forbidden.

Process-based routing is off by default. `ENABLE_PROCESS_RULES=false` is the safe router-mode default because OpenClash transparent proxy mode normally cannot inspect LAN client processes. If you want desktop-only compatibility routing, update `data/process_rules.yaml`, set `ENABLE_PROCESS_RULES=true`, and regenerate. The generated Process rule files contain only `PROCESS-NAME` entries after deduplication.
