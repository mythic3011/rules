# Published profiles and templates

This directory is a stable public URL surface.

## Subconverter custom templates

These are the templates used by OpenClash subscription conversion:

- `Custom_Clash_AI.ini` — AI-aware static template.
- `Custom_Clash.ini` — standard template.
- `Custom_Clash_Lite.ini` — smaller template.
- `Custom_Clash_GFW.ini` — minimal GFW-oriented template.
- `Custom_Clash_Full.ini` — full template.
- `Custom_Clash_Mainland.ini` — generated Mainland variant.

The dynamic Profile Builder produces the same artifact class at `/p/<opaque-token>.ini`; it is personalized from a typed `ProfileSpec` rather than by editing these generated files.

## Ready-to-load Mihomo/OpenClash YAML

- `yaml/Custom_Clash_AI.yaml` — AI Balanced runtime profile.
- `yaml/Custom_Clash_AI_Strict.yaml` — fail-closed AI Strict runtime profile.

Do not confuse `.ini` subconverter templates with runtime Mihomo YAML. Use root `catalog.json` for machine-readable discovery and channel URLs.
