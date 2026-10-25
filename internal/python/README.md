# Python implementation

This directory contains generators, renderers, audits, and local composition helpers. The canonical policy declarations live under `internal/config/ai-routing/`; Python loads and compiles them into generated artifacts. Start with the [policy maintenance guide](../../docs/policy-maintenance.md) for ordinary changes.

| Area | Responsibility |
| --- | --- |
| `ai_profiles/schema.py` and `catalog.py` | Validate and load typed policy declarations. |
| `ai_profiles/compiler.py` and `routing_ir.py` | Compile routing and projection plans. |
| `ai_profiles/render/` | Render the plans as YAML and INI. |
| `generate_ai_profiles.py` | Write the generated AI profile family. |
| Other `generate_*.py` entrypoints | Generate their separately owned repository artifacts. |

`ai_profiles/paths.py` owns catalog document paths; `ai_profiles/domains.py` owns the shared authored-hostname validator. Reuse those owners instead of copying paths or hostname syntax into loaders and forms.

After `make bootstrap`, use the pinned root commands for routine work:

```sh
mise run generate
mise run check
```

`mise exec -- make refresh` is a separate network-backed update. Keep it out of ordinary deterministic generation.
