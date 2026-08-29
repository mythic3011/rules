# Shared POSIX shell libraries

Generic OpenWrt `/bin/sh` primitives. App policy, service facts, and endpoints
do not belong here.

Libraries are function-only: no load-time `nft`/`uci`/`curl`/`rm`/`init.d`
work, and no `main "$@"`. The bundle builder concatenates sourced modules.

POSIX shell has no namespaces. Exported functions use a prefix:

| File | Prefix |
| --- | --- |
| `cli.sh` | `cli_` |
| `env.sh` | `env_` |
| `service.sh` | `svc_` |
| `uci.sh` | `uci_` |
| `nft.sh` | `nft_` |
| `file.sh` | `file_` |
| `fetch.sh` | `fetch_` |
| `lock.sh` | `lock_` |
| `json.sh` | `json_` |

Implementation notes:

- Strict POSIX: no arrays, no `[[ ]]`, no `local`.
- `svc_restart` / `svc_enable` require a literal first argument `--mutate`.
  Observing a service is not owning its lifecycle.
- `nft_delete_*` requires a non-empty ownership prefix and will not delete
  unrelated fw4/OpenClash objects.
- Fetch writes a candidate, optionally validates, then atomically replaces.
  A failed fetch leaves the last-known-good file in place.
- Tests inject `uci`/`nft`/`curl` via `PATH` and init scripts via
  `SVC_INITD_DIR`.
