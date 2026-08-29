# Contributing

The repository has three stable public artifact roots: `cfg/`, `rule/`, and `dns/`.
Everything used to build those artifacts lives under `internal/`.

```sh
make bootstrap
make doctor
make check
```

For TypeScript routing changes:

```sh
npm ci
make check-all
```

Regenerate deterministic outputs with:

```sh
make generate
```

Network-backed upstream pin/list changes are explicit:

```sh
make refresh
```

Do not hand-edit generated AI profiles or generated provider files. Change the declarative config under `internal/config/` and regenerate instead.

## Service and region intake

For ordinary service-routing additions, use the generated GitHub **Regional
service intake** form rather than editing generated artifacts. The form captures
observations and matcher data; automation proposes the source-of-truth change as
a pull request. Unlisted regions use structured additional-region slots; do not
invent registry IDs or regex manually. The intake derives canonical identity and
reuses matching existing regions by code/name/alias.

Maintainers should review:

- matcher scope (especially broad `DOMAIN-KEYWORD` entries);
- contradictory or weak regional evidence;
- whether a newly submitted region should be routable or observation-only;
- generated diff size and CI results.

`internal/config/ai-routing/catalogs/regions.json` is the Region Registry. `regions` may
contain observation-only regions, while `primaryOrder` is the explicit set/order
of routable exits.

## Profile service

`apps/profile-service/` is an application surface, not a fourth published artifact root. Its Worker runtime projection is generated from the canonical Python `SubconverterPlan`:

```sh
python3 internal/python/generate_profile_service_runtime.py
npm run test:profile-service
```

Do not hand-edit `apps/profile-service/worker/generated/runtime-data.mjs`. Change the catalog/compiler and regenerate it. Any change to Python `ProfileSpec` solving must retain Worker parity fixtures.

The public HTTP ProfileSpec is allowlisted. Do not add raw regex, raw rules, arbitrary URLs, or renderer directives as convenience fields; add a typed domain concept and compiler support instead.
