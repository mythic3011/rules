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
- Downloads default to HTTPS-only through curl, with a 16 MiB response limit.
  Per-call limits cannot exceed 64 MiB; timeouts cannot exceed one hour.
  HTTP and the wget compatibility path require the explicit trailing argument
  `allow_insecure=1`. Setting the legacy HTTPS flag to `0` alone is rejected.
  Strict requests fail with an actionable error when curl is unavailable.
  Wget compatibility is for public URLs without credentials or query strings;
  use curl for subscription or capability URLs, including tokens in paths.
- Curl URLs and proxy credentials stay in a private temporary configuration
  file, removed on exit. They are not passed in command arguments or diagnostics.
- The minimal AWK JSON fallback rejects Unicode escapes it cannot decode.
  Use jsonfilter or jq for those inputs; literal UTF-8 text remains supported.
- Tests inject `uci`/`nft`/`curl` via `PATH` and init scripts via
  `SVC_INITD_DIR`.
