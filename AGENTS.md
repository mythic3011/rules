# Repository agent guidance

Treat `cfg/`, `rule/`, and `dns/` as stable public artifact APIs. Do not move or rename published files without an explicit compatibility decision.

Source-of-truth declarations live under `internal/config/`. Generated AI/service artifacts must be changed through the generators, not hand-edited.

Before finishing a change, run:

```sh
make check
```

For TypeScript routing changes, install dependencies and run:

```sh
npm ci
make check-all
```

Network-backed upstream refreshes are explicit (`make refresh`) and must not be folded into ordinary deterministic generation.

The optional Cloudflare app lives at `apps/profile-service/`. Its generated `worker/generated/runtime-data.mjs` is derived from the Python subconverter compiler and must remain parity-tested. Public profile HTTP input is typed `ProfileSpec`; never pass arbitrary user input directly to INI/YAML renderers.

OpenClash subscription conversion consumes `.ini` custom templates. Keep `/p/<opaque-token>.ini` as the dynamic subscription contract; do not replace it with a YAML endpoint unless a separate runtime-profile feature is explicitly designed.
