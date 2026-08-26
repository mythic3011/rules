# Repository layout

The tree is split by audience, not by implementation language.

## Stable consumer surface

- `cfg/` — published Mihomo/OpenClash profiles and subconverter templates.
- `rule/` — published rule providers, including `rule/games/`.
- `dns/` — published DNS/hosts outputs plus local allow/block inputs.
- `catalog.json` — machine-readable discovery for published profiles.
- `setup/` — user-facing setup helpers; router mutation is explicit and minimal.

These paths are the compatibility boundary for raw GitHub/jsDelivr consumers.

## Maintainer surface

- `internal/config/` — source-of-truth routing and filtering declarations.
- `internal/python/` — Python generators, renderers, audits, and local helpers.
- `internal/typescript/` — typed routing compiler/projection implementation.
- `internal/generated/` — tracked deterministic compiler intermediates.
- `internal/schemas/` — exported machine-readable schemas.
- `internal/templates/` — renderer templates.
- `internal/examples/` — internal/reference deployment examples.
- `tests/` — Python and TypeScript contract/regression suites.
- `web/` — GitHub Pages source and generated report payloads.

## History

Inactive attic files and staged P1-P19 delivery receipts were removed from the active tree during the repository refresh. They remain recoverable from Git history instead of competing with current source-of-truth files.
