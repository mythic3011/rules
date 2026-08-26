# Node Normalization

Node normalization for the AI profiles is generator-owned. `internal/python/generate_ai_profiles.py` decides the visible group labels, provider regex filters, provider metadata suppression, and the region-group layout used by the generated YAML and INI outputs.

Provider metadata nodes such as remaining-traffic banners, expiry notices, Telegram channels, and panel/author labels must be filtered before they leak into AI groups. YAML can do this with `proxy-providers.provider1.override.exclude-filter`. INI cannot attach the same provider-level override, so it keeps the manual group open to filtered provider nodes with a regex tail and documents the limitation instead of pretending the schemas are identical.

Gaming direct routing is separate from node normalization, but the rationale belongs here because the same profiles carry both concerns. DNS `fake-ip-filter` alone does not route traffic `DIRECT`. Gaming CDN downloads, STUN, and other latency-sensitive UDP flows often need routing-level direct handling to avoid TProxy/proxy instability. The generated `Gaming_Direct_Classical` rules therefore prefer narrow game-service and CDN domains instead of broad publisher domains. `ea.com` is intentionally excluded by default because it can include account, auth, and login endpoints in addition to CDN traffic.
