# Filtering data

Canonical inputs for the adblock/tracking/telemetry/malware generator live here.

- `categories.yaml` defines output wiring and category ownership.
- `domain-policies.yaml` contains cross-source policy and exceptions.
- `sources/` contains upstream source declarations.
- `sources/custom/` contains repository-local extensions.
- `seeds/` contains deterministic lite-rule seeds.

Generated outputs stay in the stable public `dns/`, `rule/`, and `web/reports/` paths.
