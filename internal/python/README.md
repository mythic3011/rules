# Python implementation

Python generators, renderers, audits, and local composition helpers live here.

Normal repository consumers do not need this directory. Maintainers should use the root commands instead of memorizing individual entrypoints:

```sh
make check
make generate
make refresh
```

`ai_profiles/` owns the generated AI profile family. `generate_adblock_outputs.py` owns filtering outputs. Direct invocation remains supported for CI and targeted debugging.
