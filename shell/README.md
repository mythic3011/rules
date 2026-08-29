# shell/

POSIX shell **source** for bundled apps. This is not the pre-v2 published runtime
tree (that moved to `setup/openclash/scripts/`). Do not put curl-installable
standalone scripts here; generated artifacts live under `dist/` and must not be
hand-edited.

- `manifest.json` — module/app DAG consumed by `tools/shbundle.py`
- `lib/` — shared libraries
- `apps/` — app entry modules

```sh
python3 tools/shbundle.py check
python3 tools/shbundle.py list
python3 tools/shbundle.py graph <app>
python3 tools/shbundle.py build <app>
python3 tools/shbundle.py build --all
```
