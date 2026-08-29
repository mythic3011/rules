#!/bin/sh
set -eu

# GENERATED FILE — DO NOT EDIT
# App: openclash-guard
# Manifest: shell/manifest.json

# BEGIN MODULE: cli
# POSIX CLI helpers for TTY, color, and confirmation.
# Prefix: cli_
set -eu

cli_is_tty() {
    [ -t 1 ]
}

cli_color_enabled() {
    [ -z "${NO_COLOR:-}" ] && [ -t 1 ]
}

_cli_color_on_fd() {
    [ -z "${NO_COLOR:-}" ] && [ -t "$1" ]
}

cli_set_assume_yes() {
    case ${1:-1} in
        0|false|FALSE|False|no|NO|off|OFF|n|N)
            _CLI_ASSUME_YES=0
            ;;
        *)
            _CLI_ASSUME_YES=1
            ;;
    esac
}

_cli_assume_yes() {
    if [ -n "${_CLI_ASSUME_YES:-}" ]; then
        [ "$_CLI_ASSUME_YES" = "1" ]
        return $?
    fi
    case ${CLI_ASSUME_YES:-0} in
        1|true|TRUE|True|yes|YES|on|ON|y|Y)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

cli_info() {
    if _cli_color_on_fd 1; then
        printf '\033[36minfo:\033[0m %s\n' "$*"
    else
        printf 'info: %s\n' "$*"
    fi
}

cli_warn() {
    if _cli_color_on_fd 2; then
        printf '\033[33mwarn:\033[0m %s\n' "$*" >&2
    else
        printf 'warn: %s\n' "$*" >&2
    fi
}

cli_error() {
    if _cli_color_on_fd 2; then
        printf '\033[31merror:\033[0m %s\n' "$*" >&2
    else
        printf 'error: %s\n' "$*" >&2
    fi
}

cli_success() {
    if _cli_color_on_fd 1; then
        printf '\033[32mok:\033[0m %s\n' "$*"
    else
        printf 'ok: %s\n' "$*"
    fi
}

cli_section() {
    if _cli_color_on_fd 1; then
        printf '\033[1m== %s ==\033[0m\n' "$*"
    else
        printf '== %s ==\n' "$*"
    fi
}

cli_kv() {
    _cli_kv_key=$1
    shift
    printf '%s: %s\n' "$_cli_kv_key" "$*"
}

cli_step() {
    printf '[%s/%s] %s\n' "$1" "$2" "$3"
}

cli_table() {
    awk -F '\t' '
        {
            n = NF
            if (n > nf) {
                nf = n
            }
            for (i = 1; i <= n; i++) {
                cell[NR, i] = $i
                l = length($i)
                if (l > w[i]) {
                    w[i] = l
                }
            }
            rows = NR
        }
        END {
            for (r = 1; r <= rows; r++) {
                for (i = 1; i <= nf; i++) {
                    printf "%-*s", w[i], cell[r, i]
                    if (i < nf) {
                        printf "  "
                    }
                }
                printf "\n"
            }
        }
    '
}

cli_confirm() {
    if _cli_assume_yes; then
        return 0
    fi
    if [ ! -t 0 ]; then
        return 1
    fi
    printf '%s [y/N] ' "${1:-Continue?}" >&2
    IFS= read -r _cli_confirm_ans || return 1
    case $_cli_confirm_ans in
        y|Y|yes|YES|Yes)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

cli_die() {
    _cli_die_code=1
    _cli_die_msg=$*
    case ${2:-} in
        [0-9]|[1-9][0-9]|[1-9][0-9][0-9])
            _cli_die_msg=$1
            _cli_die_code=$2
            ;;
    esac
    [ -n "$_cli_die_msg" ] || _cli_die_msg="aborted"
    cli_error "$_cli_die_msg"
    exit "$_cli_die_code"
}
# END MODULE: cli

# BEGIN MODULE: env
# Generic environment helpers (bool/int/default). Not service detection.
# Prefix: env_
set -eu

_env_valid_name() {
    case $1 in
        ''|*[!A-Za-z0-9_]*|[0-9]*)
            printf '%s\n' "env: invalid variable name: $1" >&2
            return 2
            ;;
    esac
}

env_is_set() {
    _env_valid_name "$1" || return $?
    eval "[ \"\${$1+set}\" = set ]"
}

env_get() {
    _env_get_name=$1
    _env_valid_name "$_env_get_name" || return $?
    if eval "[ \"\${$_env_get_name+set}\" = set ]"; then
        eval "printf '%s\\n' \"\${$_env_get_name}\""
        return 0
    fi
    if [ "$#" -ge 2 ]; then
        printf '%s\n' "$2"
        return 0
    fi
    return 1
}

env_default() {
    _env_def_name=$1
    _env_def_default=$2
    _env_valid_name "$_env_def_name" || return $?
    eval "_env_def_val=\${$_env_def_name:-}"
    if [ -n "$_env_def_val" ]; then
        printf '%s\n' "$_env_def_val"
    else
        printf '%s\n' "$_env_def_default"
    fi
}

_env_parse_bool() {
    case $1 in
        1|true|TRUE|True|yes|YES|Yes|on|ON|On|y|Y)
            printf '1\n'
            ;;
        0|false|FALSE|False|no|NO|No|off|OFF|Off|n|N|'')
            printf '0\n'
            ;;
        *)
            printf '%s\n' "env: invalid bool: $1" >&2
            return 1
            ;;
    esac
}

env_bool() {
    _env_bool_name=$1
    _env_valid_name "$_env_bool_name" || return $?
    if eval "[ \"\${$_env_bool_name+set}\" = set ]"; then
        eval "_env_bool_raw=\${$_env_bool_name}"
        _env_parse_bool "$_env_bool_raw"
        return $?
    fi
    if [ "$#" -ge 2 ]; then
        _env_parse_bool "$2"
        return $?
    fi
    return 1
}

_env_is_int() {
    case $1 in
        ''|'-'|'+')
            return 1
            ;;
        [+-]*)
            _env_int_rest=$(printf '%s' "$1" | cut -c2-)
            case $_env_int_rest in
                ''|*[!0-9]*)
                    return 1
                    ;;
            esac
            ;;
        *[!0-9]*)
            return 1
            ;;
    esac
    return 0
}

env_int() {
    _env_int_name=$1
    _env_valid_name "$_env_int_name" || return $?
    if eval "[ \"\${$_env_int_name+set}\" = set ]"; then
        eval "_env_int_raw=\${$_env_int_name}"
        if ! _env_is_int "$_env_int_raw"; then
            printf '%s\n' "env: invalid int: $_env_int_raw" >&2
            return 1
        fi
        printf '%s\n' "$_env_int_raw"
        return 0
    fi
    if [ "$#" -ge 2 ]; then
        if ! _env_is_int "$2"; then
            printf '%s\n' "env: invalid int: $2" >&2
            return 1
        fi
        printf '%s\n' "$2"
        return 0
    fi
    return 1
}
# END MODULE: env

# BEGIN MODULE: file
# File helpers: temp files, checksums, atomic replace.
# Prefix: file_
set -eu

file_mktemp() {
    _file_mk_dir=${1:-${TMPDIR:-/tmp}}
    if [ ! -d "$_file_mk_dir" ]; then
        printf '%s\n' "file_mktemp: not a directory: $_file_mk_dir" >&2
        return 1
    fi
    if command -v mktemp >/dev/null 2>&1; then
        mktemp "$_file_mk_dir/shlib.XXXXXX"
        return $?
    fi
    _file_mk_i=0
    while [ "$_file_mk_i" -lt 100 ]
    do
        _file_mk_path="$_file_mk_dir/shlib.$$.$_file_mk_i"
        if (umask 077; set -C; : > "$_file_mk_path") 2>/dev/null; then
            printf '%s\n' "$_file_mk_path"
            return 0
        fi
        _file_mk_i=$((_file_mk_i + 1))
    done
    printf '%s\n' "file_mktemp: unable to create temp file" >&2
    return 1
}

file_sha256() {
    if [ -z "${1:-}" ] || [ ! -f "$1" ]; then
        printf '%s\n' "file_sha256: not a file: ${1:-}" >&2
        return 1
    fi
    _file_sha_path=$1
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$_file_sha_path" | awk '{print $1}'
        return $?
    fi
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$_file_sha_path" | awk '{print $1}'
        return $?
    fi
    if command -v openssl >/dev/null 2>&1; then
        openssl dgst -sha256 "$_file_sha_path" | awk '{print $NF}'
        return $?
    fi
    printf '%s\n' "file_sha256: no sha256 tool found" >&2
    return 127
}

file_atomic_replace() {
    _file_ar_target=${1:-}
    _file_ar_source=${2:-}
    if [ -z "$_file_ar_target" ] || [ -z "$_file_ar_source" ]; then
        printf '%s\n' "file_atomic_replace: usage: file_atomic_replace TARGET SOURCE" >&2
        return 2
    fi
    if [ ! -f "$_file_ar_source" ]; then
        printf '%s\n' "file_atomic_replace: source not a file: $_file_ar_source" >&2
        return 1
    fi
    _file_ar_dir=$(dirname "$_file_ar_target")
    if [ ! -d "$_file_ar_dir" ]; then
        printf '%s\n' "file_atomic_replace: destination directory missing: $_file_ar_dir" >&2
        return 1
    fi
    _file_ar_tmp=$(file_mktemp "$_file_ar_dir") || return 1
    if ! cp "$_file_ar_source" "$_file_ar_tmp"; then
        rm -f "$_file_ar_tmp"
        return 1
    fi
    if ! mv -f "$_file_ar_tmp" "$_file_ar_target"; then
        rm -f "$_file_ar_tmp"
        return 1
    fi
}
# END MODULE: file

# BEGIN MODULE: fetch
# HTTP fetch with temp + optional validate + atomic replace.
# Failed fetches leave the last-known-good destination untouched.
# Prefix: fetch_
set -eu

_fetch_timeout_secs() {
    _fetch_to=${1:-${FETCH_TIMEOUT:-30}}
    case $_fetch_to in
        ''|*[!0-9]*)
            printf '%s\n' "fetch: invalid timeout: $_fetch_to" >&2
            return 2
            ;;
    esac
    printf '%s\n' "$_fetch_to"
}

_fetch_http_curl() {
    _fetch_c_url=$1
    _fetch_c_out=$2
    _fetch_c_timeout=$3
    curl -fLSs --connect-timeout "$_fetch_c_timeout" --max-time "$_fetch_c_timeout" -o "$_fetch_c_out" "$_fetch_c_url"
}

_fetch_http_wget() {
    _fetch_w_url=$1
    _fetch_w_out=$2
    _fetch_w_timeout=$3
    wget -q -O "$_fetch_w_out" -T "$_fetch_w_timeout" "$_fetch_w_url"
}

fetch_http() {
    _fetch_http_url=${1:-}
    _fetch_http_out=${2:-}
    if [ -z "$_fetch_http_url" ] || [ -z "$_fetch_http_out" ]; then
        printf '%s\n' "fetch_http: usage: fetch_http URL OUTPUT [TIMEOUT]" >&2
        return 2
    fi
    _fetch_http_timeout=$(_fetch_timeout_secs "${3:-}") || return $?
    _fetch_http_dir=$(dirname "$_fetch_http_out")
    _fetch_http_tmp=$(file_mktemp "$_fetch_http_dir") || return 1
    _fetch_http_rc=0
    if command -v curl >/dev/null 2>&1; then
        _fetch_http_curl "$_fetch_http_url" "$_fetch_http_tmp" "$_fetch_http_timeout" || _fetch_http_rc=$?
    elif command -v wget >/dev/null 2>&1; then
        _fetch_http_wget "$_fetch_http_url" "$_fetch_http_tmp" "$_fetch_http_timeout" || _fetch_http_rc=$?
    else
        rm -f "$_fetch_http_tmp"
        printf '%s\n' "fetch_http: curl or wget is required" >&2
        return 127
    fi
    if [ "$_fetch_http_rc" -ne 0 ]; then
        rm -f "$_fetch_http_tmp"
        printf '%s\n' "fetch_http: download failed: $_fetch_http_url" >&2
        return "$_fetch_http_rc"
    fi
    if [ ! -s "$_fetch_http_tmp" ]; then
        rm -f "$_fetch_http_tmp"
        printf '%s\n' "fetch_http: empty response: $_fetch_http_url" >&2
        return 1
    fi
    if ! mv -f "$_fetch_http_tmp" "$_fetch_http_out"; then
        rm -f "$_fetch_http_tmp"
        return 1
    fi
}

fetch_to_temp() {
    _fetch_tt_url=${1:-}
    if [ -z "$_fetch_tt_url" ]; then
        printf '%s\n' "fetch_to_temp: missing URL" >&2
        return 2
    fi
    _fetch_tt_tmp=$(file_mktemp) || return 1
    if fetch_http "$_fetch_tt_url" "$_fetch_tt_tmp" "${2:-}"; then
        printf '%s\n' "$_fetch_tt_tmp"
        return 0
    fi
    rm -f "$_fetch_tt_tmp"
    return 1
}

fetch_atomic() {
    _fetch_at_url=${1:-}
    _fetch_at_dest=${2:-}
    _fetch_at_validator=${3:-}
    if [ -z "$_fetch_at_url" ] || [ -z "$_fetch_at_dest" ]; then
        printf '%s\n' "fetch_atomic: usage: fetch_atomic URL DEST [VALIDATOR]" >&2
        return 2
    fi
    _fetch_at_dir=$(dirname "$_fetch_at_dest")
    if [ ! -d "$_fetch_at_dir" ]; then
        printf '%s\n' "fetch_atomic: destination directory missing: $_fetch_at_dir" >&2
        return 1
    fi
    _fetch_at_tmp=$(file_mktemp "$_fetch_at_dir") || return 1
    if ! fetch_http "$_fetch_at_url" "$_fetch_at_tmp" "${4:-}"; then
        rm -f "$_fetch_at_tmp"
        return 1
    fi
    if [ -n "$_fetch_at_validator" ]; then
        if ! "$_fetch_at_validator" "$_fetch_at_tmp"; then
            rm -f "$_fetch_at_tmp"
            printf '%s\n' "fetch_atomic: validation failed" >&2
            return 1
        fi
    fi
    if ! file_atomic_replace "$_fetch_at_dest" "$_fetch_at_tmp"; then
        rm -f "$_fetch_at_tmp"
        return 1
    fi
    rm -f "$_fetch_at_tmp"
}
# END MODULE: fetch

# BEGIN MODULE: json
# Restricted JSON get/keys/list. Prefers jsonfilter; POSIX awk fallback.
# Prefix: json_
set -eu

_json_normalize_path() {
    printf '%s\n' "$1" | sed -e 's/^\$\.//' -e 's/^@\.//' -e 's/^\.//' -e 's/\[\([0-9][0-9]*\)\]/.\1/g'
}

_json_require_file() {
    if [ -z "${1:-}" ] || [ ! -f "$1" ]; then
        printf '%s\n' "json: not a file: ${1:-}" >&2
        return 1
    fi
}

_json_path_simple() {
    case $1 in
        ''|*[!A-Za-z0-9._]*)
            return 1
            ;;
        .*)
            return 1
            ;;
    esac
    return 0
}

_json_flatten_awk() {
    awk '
        {
            src = src $0 "\n"
        }
        function peek() {
            return substr(src, pos, 1)
        }
        function skip(    c) {
            while (pos <= n) {
                c = substr(src, pos, 1)
                if (c == " " || c == "\t" || c == "\n" || c == "\r") {
                    pos++
                } else {
                    break
                }
            }
        }
        function fail(msg) {
            printf "json: %s\n", msg > "/dev/stderr"
            bad = 1
            exit 2
        }
        function emit(path, val) {
            if (path == "") {
                return
            }
            print path "\t" val
        }
        function parse_string(    c, out) {
            if (peek() != "\"") {
                fail("expected string")
            }
            pos++
            out = ""
            while (pos <= n) {
                c = substr(src, pos, 1)
                pos++
                if (c == "\"") {
                    return out
                }
                if (c == "\\") {
                    if (pos > n) {
                        fail("unterminated string")
                    }
                    c = substr(src, pos, 1)
                    pos++
                    if (c == "n") {
                        out = out "\n"
                    } else if (c == "t") {
                        out = out "\t"
                    } else if (c == "r") {
                        out = out "\r"
                    } else if (c == "b") {
                        out = out "\b"
                    } else if (c == "f") {
                        out = out "\f"
                    } else if (c == "u") {
                        out = out "\\u" substr(src, pos, 4)
                        pos += 4
                    } else {
                        out = out c
                    }
                    continue
                }
                out = out c
            }
            fail("unterminated string")
        }
        function parse_literal(    c, start, raw) {
            start = pos
            while (pos <= n) {
                c = substr(src, pos, 1)
                if (c ~ /[0-9A-Za-z.+-]/) {
                    pos++
                } else {
                    break
                }
            }
            raw = substr(src, start, pos - start)
            if (raw == "") {
                fail("expected value")
            }
            return raw
        }
        function parse_object(prefix,    key, child, c, nkeys) {
            if (peek() != "{") {
                fail("expected object")
            }
            pos++
            skip()
            nkeys = 0
            if (peek() == "}") {
                pos++
                if (prefix != "") {
                    emit(prefix, "{}")
                }
                return
            }
            while (pos <= n) {
                skip()
                key = parse_string()
                skip()
                if (peek() != ":") {
                    fail("expected colon")
                }
                pos++
                skip()
                if (prefix == "") {
                    child = key
                } else {
                    child = prefix "." key
                }
                parse_value(child)
                nkeys++
                skip()
                c = peek()
                if (c == ",") {
                    pos++
                    continue
                }
                if (c == "}") {
                    pos++
                    return
                }
                fail("expected comma or }")
            }
            fail("unterminated object")
        }
        function parse_array(prefix,    i, child, c) {
            if (peek() != "[") {
                fail("expected array")
            }
            pos++
            skip()
            i = 0
            if (peek() == "]") {
                pos++
                if (prefix != "") {
                    emit(prefix, "[]")
                }
                return
            }
            while (pos <= n) {
                skip()
                child = prefix "." i
                parse_value(child)
                i++
                skip()
                c = peek()
                if (c == ",") {
                    pos++
                    continue
                }
                if (c == "]") {
                    pos++
                    return
                }
                fail("expected comma or ]")
            }
            fail("unterminated array")
        }
        function parse_value(prefix,    c) {
            skip()
            c = peek()
            if (c == "{") {
                parse_object(prefix)
                return
            }
            if (c == "[") {
                parse_array(prefix)
                return
            }
            if (c == "\"") {
                emit(prefix, parse_string())
                return
            }
            emit(prefix, parse_literal())
        }
        END {
            n = length(src)
            pos = 1
            bad = 0
            skip()
            if (pos > n) {
                fail("empty JSON")
            }
            parse_value("")
            skip()
            if (pos <= n && peek() != "") {
                fail("trailing JSON content")
            }
        }
    ' "$1"
}

_JSON_FLAT_PATH=
_JSON_FLAT_DATA=

json_load() {
    _json_require_file "${1:-}" || return $?
    if [ "$1" = "$_JSON_FLAT_PATH" ] && [ -n "$_JSON_FLAT_DATA" ]; then
        return 0
    fi
    _JSON_FLAT_PATH=
    _JSON_FLAT_DATA=
    _JSON_FLAT_DATA=$(_json_flatten_awk "$1") || {
        _JSON_FLAT_DATA=
        return 1
    }
    _JSON_FLAT_PATH=$1
}

_json_flat() {
    json_load "$1" || return $?
    printf '%s\n' "$_JSON_FLAT_DATA"
}

json_get() {
    _json_jg_file=${1:-}
    _json_jg_path=${2:-}
    _json_require_file "$_json_jg_file" || return $?
    if [ -z "$_json_jg_path" ]; then
        printf '%s\n' "json_get: missing path" >&2
        return 2
    fi
    _json_jg_path=$(_json_normalize_path "$_json_jg_path")
    if [ -z "${JSON_FORCE_AWK:-}" ] && command -v jsonfilter >/dev/null 2>&1 && _json_path_simple "$_json_jg_path"; then
        _json_jg_out=$(jsonfilter -i "$_json_jg_file" -e "@.$_json_jg_path" 2>/dev/null) || _json_jg_out=
        if [ -n "$_json_jg_out" ]; then
            printf '%s\n' "$_json_jg_out"
            return 0
        fi
    fi
    _json_flat "$_json_jg_file" | awk -F '\t' -v q="$_json_jg_path" '
        $1 == q {
            sub(/^[^\t]*\t/, "")
            print
            found = 1
            exit 0
        }
        END {
            if (!found) {
                exit 1
            }
        }
    '
}

json_has() {
    _json_jh_file=${1:-}
    _json_jh_path=${2:-}
    _json_require_file "$_json_jh_file" || return $?
    if [ -z "$_json_jh_path" ]; then
        return 2
    fi
    _json_jh_path=$(_json_normalize_path "$_json_jh_path")
    _json_flat "$_json_jh_file" | awk -F '\t' -v q="$_json_jh_path" '
        $1 == q { found = 1; exit 0 }
        index($1, q ".") == 1 { found = 1; exit 0 }
        END { if (!found) exit 1 }
    '
}

json_keys() {
    _json_jk_file=${1:-}
    _json_jk_path=${2:-}
    _json_require_file "$_json_jk_file" || return $?
    _json_jk_path=$(_json_normalize_path "$_json_jk_path")
    _json_flat "$_json_jk_file" | awk -F '\t' -v p="$_json_jk_path" '
        {
            key = $1
            if (p == "") {
                rest = key
            } else if (key == p) {
                next
            } else if (index(key, p ".") == 1) {
                rest = substr(key, length(p) + 2)
            } else {
                next
            }
            split(rest, parts, ".")
            child = parts[1]
            if (child == "" || seen[child]++) {
                next
            }
            print child
        }
    '
}

json_list() {
    _json_jl_file=${1:-}
    _json_jl_path=${2:-}
    _json_require_file "$_json_jl_file" || return $?
    if [ -z "$_json_jl_path" ]; then
        printf '%s\n' "json_list: missing path" >&2
        return 2
    fi
    _json_jl_path=$(_json_normalize_path "$_json_jl_path")
    _json_flat "$_json_jl_file" | awk -F '\t' -v p="$_json_jl_path" '
        $1 == p && $2 == "[]" { empty = 1; next }
        {
            prefix = p "."
            if (index($1, prefix) != 1) {
                next
            }
            rest = substr($1, length(prefix) + 1)
            if (rest ~ /^[0-9]+$/) {
                val = $0
                sub(/^[^\t]*\t/, "", val)
                items[rest + 0] = val
                if (rest + 0 > max) {
                    max = rest + 0
                }
                found = 1
            }
        }
        END {
            if (empty && !found) {
                exit 0
            }
            if (!found) {
                exit 1
            }
            for (i = 0; i <= max; i++) {
                if (i in items) {
                    print items[i]
                }
            }
        }
    '
}
# END MODULE: json

# BEGIN MODULE: guard-geo
# Geo provider lookup with timeout, fallback, cache, and last-known-good.
# Prefix: guard_geo_
# Never mutates nft. Malformed responses are skipped.
set -eu

_guard_geo_json_string() {
    printf '%s' "$1" | awk '
        BEGIN { ORS = "" }
        {
            gsub(/\\/, "\\\\")
            gsub(/"/, "\\\"")
            gsub(/\t/, "\\t")
            print
        }
    '
}

_guard_geo_state_dir() {
    if [ -n "${GUARD_GEO_CACHE_DIR:-}" ]; then
        printf '%s\n' "$GUARD_GEO_CACHE_DIR"
        return 0
    fi
    printf '%s\n' "${GUARD_STATE_DIR:-/etc/openclash-guard}/geo"
}

_guard_geo_cache_path() {
    _guard_geo_kind=${1:-}
    _guard_geo_route=${2:-}
    _guard_geo_dir=$(_guard_geo_state_dir)
    case $_guard_geo_kind in
        direct)
            printf '%s/direct.json\n' "$_guard_geo_dir"
            ;;
        route)
            _guard_geo_safe=$(printf '%s' "$_guard_geo_route" | tr -c 'A-Za-z0-9_-' '_')
            if [ -z "$_guard_geo_safe" ] || [ "$_guard_geo_safe" = "_" ]; then
                printf '%s\n' "guard_geo: invalid route id" >&2
                return 2
            fi
            printf '%s/route-%s.json\n' "$_guard_geo_dir" "$_guard_geo_safe"
            ;;
        *)
            printf '%s\n' "guard_geo: unknown cache kind: ${_guard_geo_kind:-}" >&2
            return 2
            ;;
    esac
}

_guard_geo_policy_file() {
    if [ -n "${_GUARD_POLICY_FILE:-}" ] && [ -f "$_GUARD_POLICY_FILE" ]; then
        printf '%s\n' "$_GUARD_POLICY_FILE"
        return 0
    fi
    _guard_policy_default_path
}

_guard_geo_now() {
    date +%s
}

_guard_geo_is_int() {
    case ${1:-} in
        ''|*[!0-9]*)
            return 1
            ;;
        *)
            return 0
            ;;
    esac
}

_guard_geo_print() {
    _guard_geo_p_ip=$1
    _guard_geo_p_cc=$2
    _guard_geo_p_asn=$3
    _guard_geo_p_prov=$4
    printf '{"ip":"%s","country":"%s"' \
        "$(_guard_geo_json_string "$_guard_geo_p_ip")" \
        "$(_guard_geo_json_string "$_guard_geo_p_cc")"
    if _guard_geo_is_int "$_guard_geo_p_asn"; then
        printf ',"asn":%s' "$_guard_geo_p_asn"
    fi
    printf ',"provider":"%s"}\n' "$(_guard_geo_json_string "$_guard_geo_p_prov")"
}

_guard_geo_cache_write() {
    _guard_geo_cw_path=$1
    _guard_geo_cw_ip=$2
    _guard_geo_cw_cc=$3
    _guard_geo_cw_asn=$4
    _guard_geo_cw_prov=$5
    _guard_geo_cw_ttl=$6
    _guard_geo_cw_dir=$(dirname "$_guard_geo_cw_path")
    mkdir -p "$_guard_geo_cw_dir"
    _guard_geo_cw_tmp=$(file_mktemp "$_guard_geo_cw_dir") || return 1
    _guard_geo_cw_now=$(_guard_geo_now)
    {
        printf '{"ip":"%s","country":"%s"' \
            "$(_guard_geo_json_string "$_guard_geo_cw_ip")" \
            "$(_guard_geo_json_string "$_guard_geo_cw_cc")"
        if _guard_geo_is_int "$_guard_geo_cw_asn"; then
            printf ',"asn":%s' "$_guard_geo_cw_asn"
        fi
        printf ',"provider":"%s","fetchedAt":%s,"ttlSeconds":%s}\n' \
            "$(_guard_geo_json_string "$_guard_geo_cw_prov")" \
            "$_guard_geo_cw_now" \
            "$_guard_geo_cw_ttl"
    } > "$_guard_geo_cw_tmp"
    if ! file_atomic_replace "$_guard_geo_cw_path" "$_guard_geo_cw_tmp"; then
        rm -f "$_guard_geo_cw_tmp"
        return 1
    fi
    rm -f "$_guard_geo_cw_tmp"
}

_guard_geo_cache_fresh() {
    _guard_geo_cf_file=$1
    if [ ! -f "$_guard_geo_cf_file" ]; then
        return 1
    fi
    _guard_geo_cf_fetched=$(json_get "$_guard_geo_cf_file" fetchedAt 2>/dev/null) || return 1
    _guard_geo_cf_ttl=$(json_get "$_guard_geo_cf_file" ttlSeconds 2>/dev/null) || _guard_geo_cf_ttl=300
    if ! _guard_geo_is_int "$_guard_geo_cf_fetched" || ! _guard_geo_is_int "$_guard_geo_cf_ttl"; then
        return 1
    fi
    _guard_geo_cf_now=$(_guard_geo_now)
    _guard_geo_cf_age=$((_guard_geo_cf_now - _guard_geo_cf_fetched))
    [ "$_guard_geo_cf_age" -ge 0 ] && [ "$_guard_geo_cf_age" -le "$_guard_geo_cf_ttl" ]
}

_guard_geo_emit_file() {
    _guard_geo_ef=$1
    _guard_geo_ef_ip=$(json_get "$_guard_geo_ef" ip 2>/dev/null) || _guard_geo_ef_ip=
    _guard_geo_ef_cc=$(json_get "$_guard_geo_ef" country 2>/dev/null) || _guard_geo_ef_cc=
    _guard_geo_ef_asn=$(json_get "$_guard_geo_ef" asn 2>/dev/null) || _guard_geo_ef_asn=
    _guard_geo_ef_prov=$(json_get "$_guard_geo_ef" provider 2>/dev/null) || _guard_geo_ef_prov=
    if [ -z "$_guard_geo_ef_cc" ]; then
        return 1
    fi
    _guard_geo_print "$_guard_geo_ef_ip" "$_guard_geo_ef_cc" "$_guard_geo_ef_asn" "$_guard_geo_ef_prov"
}

guard_geo_cached_country() {
    _guard_geo_cc_path=$(_guard_geo_cache_path "${1:-direct}" "${2:-}") || return $?
    if [ ! -f "$_guard_geo_cc_path" ]; then
        return 1
    fi
    json_get "$_guard_geo_cc_path" country
}

_guard_geo_normalize_country() {
    printf '%s' "$1" | tr 'A-Z' 'a-z' | tr -cd 'a-z'
}

_guard_geo_normalize_asn() {
    _guard_geo_na=$1
    case $_guard_geo_na in
        [Aa][Ss][0-9]*)
            _guard_geo_na=${_guard_geo_na#*[Ss]}
            ;;
    esac
    if _guard_geo_is_int "$_guard_geo_na"; then
        printf '%s\n' "$_guard_geo_na"
        return 0
    fi
    printf '\n'
}

guard_geo_lookup() {
    _guard_geo_kind=${1:-direct}
    _guard_geo_route=${2:-}
    _guard_geo_cache=$(_guard_geo_cache_path "$_guard_geo_kind" "$_guard_geo_route") || return $?
    if _guard_geo_cache_fresh "$_guard_geo_cache"; then
        _guard_geo_emit_file "$_guard_geo_cache"
        return $?
    fi
    _guard_geo_pf=$(_guard_geo_policy_file)
    if [ ! -f "$_guard_geo_pf" ]; then
        if [ -f "$_guard_geo_cache" ]; then
            _guard_geo_emit_file "$_guard_geo_cache"
            return $?
        fi
        printf '%s\n' "guard_geo: policy file missing" >&2
        return 1
    fi
    _guard_geo_i=0
    _guard_geo_ok=0
    while json_has "$_guard_geo_pf" "geoProviders.${_guard_geo_i}"
    do
        _guard_geo_id=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.id") || _guard_geo_id=
        _guard_geo_url=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.url") || _guard_geo_url=
        _guard_geo_to=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.timeoutSeconds") || _guard_geo_to=3
        _guard_geo_ttl=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.cacheTtlSeconds") || _guard_geo_ttl=300
        _guard_geo_ipf=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.fields.ip") || _guard_geo_ipf=ip
        _guard_geo_ccf=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.fields.country") || _guard_geo_ccf=country
        _guard_geo_asnf=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.fields.asn") || _guard_geo_asnf=
        _guard_geo_i=$((_guard_geo_i + 1))
        if [ -z "$_guard_geo_url" ]; then
            continue
        fi
        if ! _guard_geo_is_int "$_guard_geo_to"; then
            _guard_geo_to=3
        fi
        _guard_geo_tmp=$(file_mktemp) || return 1
        if ! fetch_http "$_guard_geo_url" "$_guard_geo_tmp" "$_guard_geo_to"; then
            rm -f "$_guard_geo_tmp"
            continue
        fi
        if ! json_load "$_guard_geo_tmp"; then
            rm -f "$_guard_geo_tmp"
            continue
        fi
        _guard_geo_ip=$(json_get "$_guard_geo_tmp" "$_guard_geo_ipf" 2>/dev/null) || _guard_geo_ip=
        _guard_geo_cc_raw=$(json_get "$_guard_geo_tmp" "$_guard_geo_ccf" 2>/dev/null) || _guard_geo_cc_raw=
        _guard_geo_cc=$(_guard_geo_normalize_country "$_guard_geo_cc_raw")
        _guard_geo_asn=
        if [ -n "$_guard_geo_asnf" ]; then
            _guard_geo_asn_raw=$(json_get "$_guard_geo_tmp" "$_guard_geo_asnf" 2>/dev/null) || _guard_geo_asn_raw=
            _guard_geo_asn=$(_guard_geo_normalize_asn "$_guard_geo_asn_raw")
        fi
        rm -f "$_guard_geo_tmp"
        if [ -z "$_guard_geo_cc" ] || [ "${#_guard_geo_cc}" -ne 2 ]; then
            continue
        fi
        _guard_geo_cache_write "$_guard_geo_cache" "$_guard_geo_ip" "$_guard_geo_cc" "$_guard_geo_asn" "$_guard_geo_id" "$_guard_geo_ttl" || true
        _guard_geo_print "$_guard_geo_ip" "$_guard_geo_cc" "$_guard_geo_asn" "$_guard_geo_id"
        _guard_geo_ok=1
        break
    done
    if [ "$_guard_geo_ok" = 1 ]; then
        return 0
    fi
    if [ -f "$_guard_geo_cache" ]; then
        cli_warn "geo lookup failed; using last-known-good cache" 2>/dev/null || true
        _guard_geo_emit_file "$_guard_geo_cache"
        return $?
    fi
    printf '%s\n' "guard_geo: all providers failed" >&2
    return 1
}

guard_geo_detect_direct() {
    guard_geo_lookup direct
}

guard_geo_detect_route() {
    if [ -z "${1:-}" ]; then
        printf '%s\n' "guard_geo_detect_route: missing route" >&2
        return 2
    fi
    guard_geo_lookup route "$1"
}
# END MODULE: guard-geo

# BEGIN MODULE: guard-policy
# Load/validate runtime policy JSON and decide path verdicts.
# Prefix: guard_policy_
set -eu

_GUARD_POLICY_FILE=
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=openclash-guard
_GUARD_POLICY_REVISION=
_GUARD_POLICY_STATE=disabled
_GUARD_POLICY_ENFORCEMENT=reject

_guard_policy_default_path() {
    if [ -n "${GUARD_POLICY_FILE:-}" ]; then
        printf '%s\n' "$GUARD_POLICY_FILE"
        return 0
    fi
    printf '%s\n' "/etc/openclash-guard/openclash-guard.json"
}

_guard_policy_is_bool() {
    case $1 in
        true|false)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

_guard_policy_class_field() {
    _guard_pc_svc=$1
    _guard_pc_field=$2
    _guard_pc_class=$(json_get "$_GUARD_POLICY_FILE" "services.${_guard_pc_svc}.protectionClass") || return 1
    json_get "$_GUARD_POLICY_FILE" "protectionClasses.${_guard_pc_class}.${_guard_pc_field}"
}

guard_policy_validate_file() {
    _guard_pv_file=${1:-}
    if [ -z "$_guard_pv_file" ] || [ ! -f "$_guard_pv_file" ]; then
        printf '%s\n' "guard_policy: missing policy file: ${_guard_pv_file:-}" >&2
        return 1
    fi
    if ! json_load "$_guard_pv_file"; then
        printf '%s\n' "guard_policy: invalid JSON: $_guard_pv_file" >&2
        return 1
    fi
    _guard_pv_ver=$(json_get "$_guard_pv_file" schemaVersion) || _guard_pv_ver=
    if [ "$_guard_pv_ver" != 1 ]; then
        printf '%s\n' "guard_policy: unsupported schemaVersion: ${_guard_pv_ver:-missing}" >&2
        return 1
    fi
    for _guard_pv_key in nft.family nft.table nft.commentPrefix
    do
        _guard_pv_val=$(json_get "$_guard_pv_file" "$_guard_pv_key") || _guard_pv_val=
        if [ -z "$_guard_pv_val" ]; then
            printf '%s\n' "guard_policy: missing $_guard_pv_key" >&2
            return 1
        fi
    done
    if ! json_has "$_guard_pv_file" protectionClasses; then
        printf '%s\n' "guard_policy: missing protectionClasses" >&2
        return 1
    fi
    if ! json_has "$_guard_pv_file" services; then
        printf '%s\n' "guard_policy: missing services" >&2
        return 1
    fi
    _guard_pv_classes=$(json_keys "$_guard_pv_file" protectionClasses)
    for _guard_pv_class in $_guard_pv_classes
    do
        [ -n "$_guard_pv_class" ] || continue
        _guard_pv_da=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.directAllowed") || _guard_pv_da=
        _guard_pv_fm=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.failMode") || _guard_pv_fm=
        _guard_pv_quic=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.quic") || _guard_pv_quic=
        _guard_pv_ks=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.firewallKillSwitch") || _guard_pv_ks=
        if ! _guard_policy_is_bool "$_guard_pv_da"; then
            printf '%s\n' "guard_policy: invalid directAllowed on $_guard_pv_class" >&2
            return 1
        fi
        case $_guard_pv_fm in
            reject|drop)
                ;;
            *)
                printf '%s\n' "guard_policy: invalid failMode on $_guard_pv_class" >&2
                return 1
                ;;
        esac
        case $_guard_pv_quic in
            proxy-or-reject|reject|allow)
                ;;
            *)
                printf '%s\n' "guard_policy: invalid quic on $_guard_pv_class" >&2
                return 1
                ;;
        esac
        if ! _guard_policy_is_bool "$_guard_pv_ks"; then
            printf '%s\n' "guard_policy: invalid firewallKillSwitch on $_guard_pv_class" >&2
            return 1
        fi
    done
    _guard_pv_svcs=$(json_keys "$_guard_pv_file" services)
    for _guard_pv_svc in $_guard_pv_svcs
    do
        [ -n "$_guard_pv_svc" ] || continue
        _guard_pv_cls=$(json_get "$_guard_pv_file" "services.${_guard_pv_svc}.protectionClass") || _guard_pv_cls=
        if [ -z "$_guard_pv_cls" ]; then
            printf '%s\n' "guard_policy: service $_guard_pv_svc missing protectionClass" >&2
            return 1
        fi
        if ! json_has "$_guard_pv_file" "protectionClasses.${_guard_pv_cls}"; then
            printf '%s\n' "guard_policy: service $_guard_pv_svc references unknown class $_guard_pv_cls" >&2
            return 1
        fi
    done
    if ! json_has "$_guard_pv_file" gaming; then
        printf '%s\n' "guard_policy: missing gaming" >&2
        return 1
    fi
    return 0
}

guard_policy_load() {
    _guard_pl_path=${1:-$(_guard_policy_default_path)}
    guard_policy_validate_file "$_guard_pl_path" || return $?
    _GUARD_POLICY_FILE=$_guard_pl_path
    _GUARD_NFT_FAMILY=$(json_get "$_GUARD_POLICY_FILE" nft.family)
    _GUARD_NFT_TABLE=$(json_get "$_GUARD_POLICY_FILE" nft.table)
    _GUARD_NFT_PREFIX=$(json_get "$_GUARD_POLICY_FILE" nft.commentPrefix)
    _GUARD_POLICY_REVISION=$(json_get "$_GUARD_POLICY_FILE" revision 2>/dev/null) || _GUARD_POLICY_REVISION=
}

guard_policy_needs_failclosed() {
    _guard_nf_svcs=$(json_keys "$_GUARD_POLICY_FILE" services) || _guard_nf_svcs=
    for _guard_nf_svc in $_guard_nf_svcs
    do
        [ -n "$_guard_nf_svc" ] || continue
        _guard_nf_ks=$(_guard_policy_class_field "$_guard_nf_svc" firewallKillSwitch) || _guard_nf_ks=false
        _guard_nf_da=$(_guard_policy_class_field "$_guard_nf_svc" directAllowed) || _guard_nf_da=true
        if [ "$_guard_nf_ks" = true ] || [ "$_guard_nf_da" = false ]; then
            return 0
        fi
    done
    return 1
}

guard_policy_refresh_state() {
    _GUARD_POLICY_STATE=ok
    _GUARD_POLICY_ENFORCEMENT=allow-proxy
    if [ "${_GUARD_UCI_ENABLED:-1}" = 0 ]; then
        _GUARD_POLICY_STATE=disabled
        _GUARD_POLICY_ENFORCEMENT=disabled
        return 0
    fi
    _guard_ps_failclosed=0
    if guard_policy_needs_failclosed; then
        _guard_ps_failclosed=1
    fi
    if [ "$_guard_ps_failclosed" = 1 ] && [ "$_GUARD_DNS_DOMAIN_SET" = unavailable ]; then
        _GUARD_POLICY_STATE=degraded
        _GUARD_POLICY_ENFORCEMENT=reject
    fi
    if [ "$_GUARD_OC_HEALTHY" != 1 ]; then
        if [ "${_GUARD_UCI_KILL_SWITCH:-1}" = 1 ] || [ "$_guard_ps_failclosed" = 1 ]; then
            _GUARD_POLICY_ENFORCEMENT=reject
            if [ "$_GUARD_POLICY_STATE" = ok ]; then
                _GUARD_POLICY_STATE=degraded
            fi
        fi
    fi
}

guard_policy_port_in_list() {
    _guard_pil_port=$1
    _guard_pil_path=$2
    _guard_pil_items=$(json_list "$_GUARD_POLICY_FILE" "$_guard_pil_path" 2>/dev/null) || _guard_pil_items=
    for _guard_pil_item in $_guard_pil_items
    do
        if [ "$_guard_pil_item" = "$_guard_pil_port" ]; then
            return 0
        fi
    done
    return 1
}

guard_policy_region_allowed() {
    _guard_pra_svc=$1
    _guard_pra_region=$2
    if [ -z "$_guard_pra_region" ]; then
        return 1
    fi
    _guard_pra_items=$(json_list "$_GUARD_POLICY_FILE" "services.${_guard_pra_svc}.allowedRegions" 2>/dev/null) || _guard_pra_items=
    for _guard_pra_item in $_guard_pra_items
    do
        if [ "$_guard_pra_item" = "$_guard_pra_region" ]; then
            return 0
        fi
    done
    return 1
}

# Verdict: allow-proxy | reject-direct | reject | allow-direct
# UDP/443 and other protected UDP ports are never classified as gaming.
guard_policy_eval() {
    _guard_pe_svc=${1:-}
    _guard_pe_proto=${2:-}
    _guard_pe_dport=${3:-}
    _guard_pe_src=${4:-}
    _guard_pe_dest=${5:-}
    _guard_pe_gaming=0
    if [ -n "$_guard_pe_dport" ] && guard_policy_port_in_list "$_guard_pe_dport" gaming.protectedUdpPorts; then
        _guard_pe_gaming=0
    elif guard_game_flow_eligible "$_guard_pe_proto" "$_guard_pe_dport" "$_guard_pe_src" "$_guard_pe_dest"; then
        _guard_pe_gaming=1
    fi
    if [ "$_GUARD_POLICY_ENFORCEMENT" = reject ] || [ "$_GUARD_OC_HEALTHY" != 1 ]; then
        if [ -n "$_guard_pe_svc" ]; then
            _guard_pe_ks=$(_guard_policy_class_field "$_guard_pe_svc" firewallKillSwitch 2>/dev/null) || _guard_pe_ks=false
            if [ "$_guard_pe_ks" = true ] || [ "${_GUARD_UCI_KILL_SWITCH:-1}" = 1 ]; then
                printf '%s\n' "reject"
                return 0
            fi
        else
            printf '%s\n' "reject"
            return 0
        fi
    fi
    if [ -n "$_guard_pe_svc" ]; then
        _guard_pe_da=$(_guard_policy_class_field "$_guard_pe_svc" directAllowed) || _guard_pe_da=false
        _guard_pe_fm=$(_guard_policy_class_field "$_guard_pe_svc" failMode) || _guard_pe_fm=reject
        if [ "$_guard_pe_da" = false ]; then
            if [ "$_GUARD_PROXY_HEALTHY" = 1 ] && guard_policy_region_allowed "$_guard_pe_svc" "$_GUARD_PROXY_REGION"; then
                printf '%s\n' "reject-direct"
                return 0
            fi
            printf '%s\n' "reject"
            return 0
        fi
        if [ "$_guard_pe_gaming" = 1 ]; then
            printf '%s\n' "allow-direct"
            return 0
        fi
        if [ "$_GUARD_PROXY_HEALTHY" = 1 ] && guard_policy_region_allowed "$_guard_pe_svc" "$_GUARD_PROXY_REGION"; then
            printf '%s\n' "allow-proxy"
            return 0
        fi
        printf '%s\n' "$_guard_pe_fm"
        return 0
    fi
    if [ "$_guard_pe_gaming" = 1 ]; then
        printf '%s\n' "allow-direct"
        return 0
    fi
    printf '%s\n' "allow-proxy"
}

guard_policy_json_extra() {
    printf '"state":"%s","enforcement":"%s","policyRevision":"%s"' \
        "$(_guard_env_json_string "$_GUARD_POLICY_STATE")" \
        "$(_guard_env_json_string "$_GUARD_POLICY_ENFORCEMENT")" \
        "$(_guard_env_json_string "$_GUARD_POLICY_REVISION")"
}
# END MODULE: guard-policy

# BEGIN MODULE: lock
# Directory lock with timeout. mkdir is the atomic primitive (no flock).
# Prefix: lock_
set -eu

_lock_refuse_path() {
    case $1 in
        ''|/|.|..|/tmp|/var|/var/lock|/etc|/usr|/home|/root)
            printf '%s\n' "lock: refused path: ${1:-<empty>}" >&2
            return 2
            ;;
    esac
}

_lock_timeout_secs() {
    _lock_to=${1:-30}
    case $_lock_to in
        ''|*[!0-9]*)
            printf '%s\n' "lock: invalid timeout: $_lock_to" >&2
            return 2
            ;;
    esac
    printf '%s\n' "$_lock_to"
}

_lock_try_steal() {
    _lock_st_path=$1
    [ -d "$_lock_st_path" ] || return 1
    if [ ! -f "$_lock_st_path/pid" ]; then
        rmdir "$_lock_st_path" 2>/dev/null && return 0
        return 1
    fi
    _lock_st_pid=$(cat "$_lock_st_path/pid" 2>/dev/null) || _lock_st_pid=
    case $_lock_st_pid in
        ''|*[!0-9]*)
            rm -f "$_lock_st_path/pid"
            rmdir "$_lock_st_path" 2>/dev/null && return 0
            return 1
            ;;
    esac
    if kill -0 "$_lock_st_pid" 2>/dev/null; then
        return 1
    fi
    rm -f "$_lock_st_path/pid"
    rmdir "$_lock_st_path" 2>/dev/null && return 0
    return 1
}

_lock_claim() {
    _lock_cl_path=$1
    if mkdir "$_lock_cl_path" 2>/dev/null; then
        printf '%s\n' "$$" > "$_lock_cl_path/pid" || {
            rmdir "$_lock_cl_path" 2>/dev/null || true
            return 1
        }
        return 0
    fi
    return 1
}

lock_acquire() {
    _lock_aq_path=${1:-}
    _lock_refuse_path "$_lock_aq_path" || return $?
    _lock_aq_timeout=$(_lock_timeout_secs "${2:-30}") || return $?
    _lock_aq_elapsed=0
    while :
    do
        if _lock_claim "$_lock_aq_path"; then
            return 0
        fi
        _lock_try_steal "$_lock_aq_path" || true
        if _lock_claim "$_lock_aq_path"; then
            return 0
        fi
        if [ "$_lock_aq_elapsed" -ge "$_lock_aq_timeout" ]; then
            printf '%s\n' "lock_acquire: timeout waiting for $_lock_aq_path" >&2
            return 1
        fi
        sleep 1
        _lock_aq_elapsed=$((_lock_aq_elapsed + 1))
    done
}

lock_release() {
    _lock_rl_path=${1:-}
    _lock_refuse_path "$_lock_rl_path" || return $?
    if [ ! -d "$_lock_rl_path" ]; then
        return 0
    fi
    _lock_rl_pid=
    if [ -f "$_lock_rl_path/pid" ]; then
        _lock_rl_pid=$(cat "$_lock_rl_path/pid" 2>/dev/null) || _lock_rl_pid=
    fi
    if [ -n "$_lock_rl_pid" ] && [ "$_lock_rl_pid" != "$$" ]; then
        printf '%s\n' "lock_release: lock owned by pid $_lock_rl_pid" >&2
        return 1
    fi
    rm -f "$_lock_rl_path/pid"
    rmdir "$_lock_rl_path" 2>/dev/null || true
}

lock_is_held() {
    _lock_ih_path=${1:-}
    _lock_refuse_path "$_lock_ih_path" || return $?
    [ -d "$_lock_ih_path" ] || return 1
    [ -f "$_lock_ih_path/pid" ] || return 1
    _lock_ih_pid=$(cat "$_lock_ih_path/pid" 2>/dev/null) || return 1
    case $_lock_ih_pid in
        ''|*[!0-9]*)
            return 1
            ;;
    esac
    kill -0 "$_lock_ih_pid" 2>/dev/null
}
# END MODULE: lock

# BEGIN MODULE: nft
# nftables helpers that only touch objects owned by a caller-supplied prefix.
# Prefix: nft_
set -eu

_nft_require() {
    if ! command -v nft >/dev/null 2>&1; then
        printf '%s\n' "nft: command not found" >&2
        return 127
    fi
}

_nft_require_prefix() {
    if [ -z "${1:-}" ]; then
        printf '%s\n' "nft: refusing empty ownership prefix" >&2
        return 2
    fi
}

_nft_parse_comment_handles() {
    awk '
        {
            comment = ""
            handle = ""
            if (match($0, /comment "[^"]*"/)) {
                comment = substr($0, RSTART + 9, RLENGTH - 10)
            }
            if (match($0, /# handle [0-9]+/)) {
                handle = substr($0, RSTART + 9)
                gsub(/[^0-9].*/, "", handle)
            } else if (match($0, /handle [0-9]+/)) {
                handle = substr($0, RSTART + 7)
                gsub(/[^0-9].*/, "", handle)
            }
            if (comment != "" && handle != "") {
                print handle "\t" comment
            }
        }
    '
}

_nft_comment_owned() {
    case $1 in
        "$2"|"$2"*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

nft_table_exists() {
    _nft_require || return $?
    nft list table "$1" "$2" >/dev/null 2>&1
}

nft_chain_exists() {
    _nft_require || return $?
    nft list chain "$1" "$2" "$3" >/dev/null 2>&1
}

nft_set_exists() {
    _nft_require || return $?
    nft list set "$1" "$2" "$3" >/dev/null 2>&1
}

nft_rule_handles_by_comment() {
    _nft_require || return $?
    _nft_require_prefix "${4:-}" || return $?
    _nft_rh_family=$1
    _nft_rh_table=$2
    _nft_rh_chain=$3
    _nft_rh_prefix=$4
    nft -a list chain "$_nft_rh_family" "$_nft_rh_table" "$_nft_rh_chain" 2>/dev/null |
        _nft_parse_comment_handles |
        while IFS="$(printf '\t')" read -r _nft_rh_handle _nft_rh_comment
        do
            [ -n "$_nft_rh_handle" ] || continue
            if _nft_comment_owned "$_nft_rh_comment" "$_nft_rh_prefix"; then
                printf '%s\n' "$_nft_rh_handle"
            fi
        done
}

nft_delete_rules_by_comment() {
    _nft_require || return $?
    _nft_require_prefix "${4:-}" || return $?
    _nft_dr_family=$1
    _nft_dr_table=$2
    _nft_dr_chain=$3
    _nft_dr_prefix=$4
    _nft_dr_handles=$(nft_rule_handles_by_comment "$_nft_dr_family" "$_nft_dr_table" "$_nft_dr_chain" "$_nft_dr_prefix") || return $?
    [ -n "$_nft_dr_handles" ] || return 0
    _nft_dr_rev=
    for _nft_dr_handle in $_nft_dr_handles
    do
        _nft_dr_rev="$_nft_dr_handle $_nft_dr_rev"
    done
    for _nft_dr_handle in $_nft_dr_rev
    do
        [ -n "$_nft_dr_handle" ] || continue
        nft delete rule "$_nft_dr_family" "$_nft_dr_table" "$_nft_dr_chain" handle "$_nft_dr_handle" || return $?
    done
}

nft_delete_owned_set() {
    _nft_require || return $?
    _nft_require_prefix "${4:-}" || return $?
    _nft_ds_family=$1
    _nft_ds_table=$2
    _nft_ds_set=$3
    _nft_ds_prefix=$4
    case $_nft_ds_set in
        "$_nft_ds_prefix"|"$_nft_ds_prefix"*)
            ;;
        *)
            printf '%s\n' "nft: refusing to delete unowned set: $_nft_ds_set" >&2
            return 2
            ;;
    esac
    if ! nft_set_exists "$_nft_ds_family" "$_nft_ds_table" "$_nft_ds_set"; then
        return 0
    fi
    nft delete set "$_nft_ds_family" "$_nft_ds_table" "$_nft_ds_set"
}

nft_apply_batch() {
    _nft_require || return $?
    _nft_ab_file=${1:-}
    if [ -z "$_nft_ab_file" ]; then
        printf '%s\n' "nft_apply_batch: missing batch file" >&2
        return 2
    fi
    if [ "$_nft_ab_file" = "-" ]; then
        nft -f -
        return $?
    fi
    if [ ! -f "$_nft_ab_file" ]; then
        printf '%s\n' "nft_apply_batch: not a file: $_nft_ab_file" >&2
        return 1
    fi
    nft -f "$_nft_ab_file"
}

nft_dump_owned_state() {
    _nft_require || return $?
    _nft_require_prefix "${3:-}" || return $?
    _nft_do_family=$1
    _nft_do_table=$2
    _nft_do_prefix=$3
    nft -a list table "$_nft_do_family" "$_nft_do_table" 2>/dev/null |
        _nft_parse_comment_handles |
        while IFS="$(printf '\t')" read -r _nft_do_handle _nft_do_comment
        do
            [ -n "$_nft_do_handle" ] || continue
            if _nft_comment_owned "$_nft_do_comment" "$_nft_do_prefix"; then
                printf 'rule\t%s\t%s\n' "$_nft_do_handle" "$_nft_do_comment"
            fi
        done
    nft -a list table "$_nft_do_family" "$_nft_do_table" 2>/dev/null |
        awk '
            $1 == "set" {
                name = $2
                gsub(/\{/, "", name)
                print name
            }
        ' |
        while IFS= read -r _nft_do_set
        do
            [ -n "$_nft_do_set" ] || continue
            case $_nft_do_set in
                "$_nft_do_prefix"|"$_nft_do_prefix"*)
                    printf 'set\t%s\n' "$_nft_do_set"
                    ;;
            esac
        done
}
# END MODULE: nft

# BEGIN MODULE: guard-migration
# Remove stale project-owned nft/dnsmasq artifacts from apply_ai_failclosed.sh.
# Prefix: guard_migrate_
set -eu

_GUARD_STALE_COMMENT=rules-ai-failclosed
_GUARD_STALE_CHAIN=rules_ai_failclosed
_GUARD_STALE_SET_PREFIX=rules_ai
_GUARD_STALE_CONF=rules-ai-failclosed.conf
_GUARD_STALE_PROVIDERS="chatgpt copilot claude gemini notebooklm perplexity grok poe"

_guard_migrate_conf_dirs() {
    if [ -n "${GUARD_STALE_CONF_DIRS:-}" ]; then
        printf '%s\n' $GUARD_STALE_CONF_DIRS
        return 0
    fi
    printf '%s\n' /tmp/dnsmasq.d /etc/dnsmasq.d
    if [ -d /tmp ]; then
        for _guard_md_dir in /tmp/dnsmasq.*.d
        do
            if [ -d "$_guard_md_dir" ]; then
                printf '%s\n' "$_guard_md_dir"
            fi
        done
    fi
}

guard_migrate_dnsmasq_conf() {
    _guard_mdc_dirs=$(_guard_migrate_conf_dirs)
    for _guard_mdc_dir in $_guard_mdc_dirs
    do
        [ -n "$_guard_mdc_dir" ] || continue
        _guard_mdc_file="$_guard_mdc_dir/$_GUARD_STALE_CONF"
        if [ -f "$_guard_mdc_file" ]; then
            rm -f "$_guard_mdc_file"
        fi
    done
    # Never restart/enable dnsmasq after cleanup.
}

guard_migrate_nft() {
    if [ "$_GUARD_NFT_AVAILABLE" != 1 ]; then
        return 0
    fi
    if nft_chain_exists inet fw4 forward 2>/dev/null; then
        nft_delete_rules_by_comment inet fw4 forward "$_GUARD_STALE_COMMENT" 2>/dev/null || true
    fi
    if nft_chain_exists inet fw4 "$_GUARD_STALE_CHAIN" 2>/dev/null; then
        nft delete chain inet fw4 "$_GUARD_STALE_CHAIN" 2>/dev/null || true
    fi
    for _guard_mn_prov in $_GUARD_STALE_PROVIDERS
    do
        nft_delete_owned_set inet fw4 "${_GUARD_STALE_SET_PREFIX}_${_guard_mn_prov}_v4" "$_GUARD_STALE_SET_PREFIX" 2>/dev/null || true
        nft_delete_owned_set inet fw4 "${_GUARD_STALE_SET_PREFIX}_${_guard_mn_prov}_v6" "$_GUARD_STALE_SET_PREFIX" 2>/dev/null || true
    done
}

guard_migrate_stale() {
    guard_migrate_nft
    guard_migrate_dnsmasq_conf
}
# END MODULE: guard-migration

# BEGIN MODULE: service
# OpenWrt init.d observation helpers. Lifecycle mutation requires --mutate.
# Prefix: svc_
set -eu

_svc_dir() {
    printf '%s\n' "${SVC_INITD_DIR:-/etc/init.d}"
}

_svc_path() {
    printf '%s/%s\n' "$(_svc_dir)" "$1"
}

_svc_require_name() {
    case $1 in
        ''|*/*|.*)
            printf '%s\n' "svc: invalid service name: $1" >&2
            return 2
            ;;
    esac
    case $1 in
        *..*)
            printf '%s\n' "svc: invalid service name: $1" >&2
            return 2
            ;;
    esac
}

svc_exists() {
    _svc_require_name "$1" || return $?
    _svc_exists_path=$(_svc_path "$1")
    [ -x "$_svc_exists_path" ]
}

svc_enabled() {
    svc_exists "$1" || return 1
    _svc_en_path=$(_svc_path "$1")
    "$_svc_en_path" enabled >/dev/null 2>&1
}

svc_running() {
    svc_exists "$1" || return 1
    _svc_rn_path=$(_svc_path "$1")
    if "$_svc_rn_path" running >/dev/null 2>&1; then
        return 0
    fi
    _svc_rn_rc=0
    _svc_rn_out=$("$_svc_rn_path" status 2>/dev/null) || _svc_rn_rc=$?
    case $_svc_rn_out in
        *"not running"*|*"inactive"*|*"stopped"*)
            return 1
            ;;
        *"running"*|*"active"*)
            return 0
            ;;
    esac
    [ "$_svc_rn_rc" -eq 0 ]
}

svc_status() {
    _svc_require_name "$1" || return $?
    if ! svc_exists "$1"; then
        printf '%s\n' "missing"
        return 1
    fi
    if svc_running "$1"; then
        printf '%s\n' "running"
        return 0
    fi
    printf '%s\n' "stopped"
    return 0
}

_svc_require_mutate() {
    if [ "${1:-}" != "--mutate" ]; then
        printf '%s\n' "svc: refusing to change service lifecycle without --mutate" >&2
        return 2
    fi
}

svc_restart() {
    _svc_require_mutate "${1:-}" || return $?
    shift
    _svc_rs_name=${1:-}
    if ! svc_exists "$_svc_rs_name"; then
        printf '%s\n' "svc: service not found: $_svc_rs_name" >&2
        return 1
    fi
    _svc_rs_path=$(_svc_path "$_svc_rs_name")
    "$_svc_rs_path" restart
}

svc_enable() {
    _svc_require_mutate "${1:-}" || return $?
    shift
    _svc_el_name=${1:-}
    if ! svc_exists "$_svc_el_name"; then
        printf '%s\n' "svc: service not found: $_svc_el_name" >&2
        return 1
    fi
    _svc_el_path=$(_svc_path "$_svc_el_name")
    "$_svc_el_path" enable
}
# END MODULE: service

# BEGIN MODULE: guard-dns
# DNS backend detection. Never starts, enables, or restarts dnsmasq.
# Prefix: guard_dns_
set -eu

_GUARD_DNS_NAMES="adguardhome AdGuardHome adguard-home"

guard_dns_agh_name() {
    _guard_dns_agh=
    for _guard_dns_cand in $_GUARD_DNS_NAMES
    do
        if svc_exists "$_guard_dns_cand"; then
            _guard_dns_agh=$_guard_dns_cand
            break
        fi
    done
    if [ -n "$_guard_dns_agh" ]; then
        printf '%s\n' "$_guard_dns_agh"
        return 0
    fi
    return 1
}

guard_dns_dnsmasq_port() {
    _guard_dns_port=
    if command -v uci >/dev/null 2>&1; then
        _guard_dns_port=$(uci -q get dhcp.@dnsmasq[0].port 2>/dev/null) || _guard_dns_port=
        if [ -z "$_guard_dns_port" ]; then
            _guard_dns_port=$(uci -q get dhcp.dnsmasq.port 2>/dev/null) || _guard_dns_port=
        fi
    fi
    if [ -z "$_guard_dns_port" ]; then
        _guard_dns_port=53
    fi
    printf '%s\n' "$_guard_dns_port"
}

guard_dns_backend() {
    _guard_dns_agh_en=0
    _guard_dns_agh_run=0
    if _guard_dns_agh=$(guard_dns_agh_name 2>/dev/null); then
        if svc_enabled "$_guard_dns_agh"; then
            _guard_dns_agh_en=1
        fi
        if svc_running "$_guard_dns_agh"; then
            _guard_dns_agh_run=1
        fi
    fi
    if [ "$_guard_dns_agh_en" = 1 ] && [ "$_guard_dns_agh_run" = 1 ]; then
        printf '%s\n' "adguardhome"
        return 0
    fi
    _guard_dns_msq_en=0
    _guard_dns_msq_run=0
    if svc_exists dnsmasq; then
        if svc_enabled dnsmasq; then
            _guard_dns_msq_en=1
        fi
        if svc_running dnsmasq; then
            _guard_dns_msq_run=1
        fi
    fi
    if [ "$_guard_dns_msq_en" = 1 ] && [ "$_guard_dns_msq_run" = 1 ]; then
        _guard_dns_port=$(guard_dns_dnsmasq_port)
        if [ "$_guard_dns_port" != 0 ]; then
            printf '%s\n' "dnsmasq"
            return 0
        fi
    fi
    printf '%s\n' "none"
}

guard_dns_domain_set_backend() {
    _guard_dns_be=${1:-}
    if [ -z "$_guard_dns_be" ]; then
        _guard_dns_be=$(guard_dns_backend)
    fi
    case $_guard_dns_be in
        dnsmasq)
            printf '%s\n' "dnsmasq-nftset"
            ;;
        adguardhome)
            # resolver-sync is not implemented; do not claim dest-set protection.
            printf '%s\n' "unavailable"
            ;;
        *)
            printf '%s\n' "unavailable"
            ;;
    esac
}

guard_dns_detect() {
    _GUARD_DNS_BACKEND=$(guard_dns_backend)
    _GUARD_DNS_AGH_ENABLED=0
    _GUARD_DNS_AGH_RUNNING=0
    _GUARD_DNS_MSQ_ENABLED=0
    _GUARD_DNS_MSQ_RUNNING=0
    if _guard_dns_agh=$(guard_dns_agh_name 2>/dev/null); then
        if svc_enabled "$_guard_dns_agh"; then
            _GUARD_DNS_AGH_ENABLED=1
        fi
        if svc_running "$_guard_dns_agh"; then
            _GUARD_DNS_AGH_RUNNING=1
        fi
    fi
    if svc_exists dnsmasq; then
        if svc_enabled dnsmasq; then
            _GUARD_DNS_MSQ_ENABLED=1
        fi
        if svc_running dnsmasq; then
            _GUARD_DNS_MSQ_RUNNING=1
        fi
    fi
    _GUARD_DNS_DOMAIN_SET=$(guard_dns_domain_set_backend "$_GUARD_DNS_BACKEND")
}

# Guard never resurrects DNS daemons; detection is observation-only.
# END MODULE: guard-dns

# BEGIN MODULE: uci
# Thin UCI wrappers. Get/set do not commit; failures that affect state are not hidden.
# Prefix: uci_
set -eu

_uci_require() {
    if ! command -v uci >/dev/null 2>&1; then
        printf '%s\n' "uci: command not found" >&2
        return 127
    fi
    if [ -z "${1:-}" ]; then
        printf '%s\n' "uci: missing option" >&2
        return 2
    fi
}

uci_get() {
    _uci_require "$1" || return $?
    uci get "$1"
}

uci_get_default() {
    _uci_require "$1" || return $?
    _uci_gd_opt=$1
    _uci_gd_default=${2:-}
    if _uci_gd_val=$(uci -q get "$_uci_gd_opt"); then
        printf '%s\n' "$_uci_gd_val"
        return 0
    fi
    printf '%s\n' "$_uci_gd_default"
}

uci_get_bool() {
    _uci_require "$1" || return $?
    _uci_gb_opt=$1
    _uci_gb_raw=
    if _uci_gb_raw=$(uci -q get "$_uci_gb_opt"); then
        :
    elif [ "$#" -ge 2 ]; then
        _uci_gb_raw=$2
    else
        return 1
    fi
    case $_uci_gb_raw in
        1|true|TRUE|True|yes|YES|on|ON|enabled|ENABLED)
            printf '1\n'
            ;;
        0|false|FALSE|False|no|NO|off|OFF|disabled|DISABLED|'')
            printf '0\n'
            ;;
        *)
            printf '%s\n' "uci: invalid bool for $_uci_gb_opt: $_uci_gb_raw" >&2
            return 1
            ;;
    esac
}

uci_get_list() {
    _uci_require "$1" || return $?
    _uci_gl_nl='
'
    uci -d "$_uci_gl_nl" get "$1"
}

uci_set() {
    _uci_require "$1" || return $?
    if [ "$#" -lt 2 ]; then
        printf '%s\n' "uci_set: missing value" >&2
        return 2
    fi
    uci set "$1=$2"
}

uci_add_list() {
    _uci_require "$1" || return $?
    if [ "$#" -lt 2 ]; then
        printf '%s\n' "uci_add_list: missing value" >&2
        return 2
    fi
    uci add_list "$1=$2"
}

uci_delete() {
    _uci_require "$1" || return $?
    uci -q delete "$1" || true
}

uci_commit_if_changed() {
    if ! command -v uci >/dev/null 2>&1; then
        printf '%s\n' "uci: command not found" >&2
        return 127
    fi
    _uci_cif_pkg=${1:-}
    if [ -n "$_uci_cif_pkg" ]; then
        _uci_cif_changes=$(uci changes "$_uci_cif_pkg") || return $?
    else
        _uci_cif_changes=$(uci changes) || return $?
    fi
    if [ -z "$_uci_cif_changes" ]; then
        return 0
    fi
    if [ -n "$_uci_cif_pkg" ]; then
        uci commit "$_uci_cif_pkg"
    else
        uci commit
    fi
}
# END MODULE: uci

# BEGIN MODULE: guard-environment
# Read-only normalized environment model for openclash-guard.
# Prefix: guard_env_
set -eu

_GUARD_OC_INSTALLED=0
_GUARD_OC_ENABLED=0
_GUARD_OC_RUNNING=0
_GUARD_OC_HEALTHY=0
_GUARD_DNS_BACKEND=none
_GUARD_DNS_MSQ_ENABLED=0
_GUARD_DNS_MSQ_RUNNING=0
_GUARD_DNS_AGH_ENABLED=0
_GUARD_DNS_AGH_RUNNING=0
_GUARD_DNS_DOMAIN_SET=unavailable
_GUARD_NET_IPV6=0
_GUARD_NET_DIRECT_REGION=
_GUARD_PROXY_HEALTHY=0
_GUARD_PROXY_REGION=
_GUARD_GAME_CLIENTS=0
_GUARD_GAME_CLIENT_ITEMS=
_GUARD_GAME_BLANKET=0
_GUARD_NFT_AVAILABLE=0
_GUARD_DEPENDENCY_FAILURE=0

_guard_env_dependency_failed() {
    _guard_ed_service=${GUARD_SERVICE_ID:-}
    _guard_ed_file=${GUARD_DEPENDENCY_STATUS_FILE:-}
    [ -n "$_guard_ed_service" ] && [ -f "$_guard_ed_file" ] || return 1
    _guard_ed_deps=$(json_keys "$_guard_ed_file" "services.$_guard_ed_service.dependencies" 2>/dev/null) || return 1
    for _guard_ed_dep in $_guard_ed_deps
    do
        _guard_ed_required=$(json_get "$_guard_ed_file" "services.$_guard_ed_service.dependencies.$_guard_ed_dep.required" 2>/dev/null) || _guard_ed_required=true
        [ "$_guard_ed_required" = true ] || continue
        _guard_ed_healthy=$(json_get "$_guard_ed_file" "services.$_guard_ed_service.dependencies.$_guard_ed_dep.healthy" 2>/dev/null) || _guard_ed_healthy=unknown
        _guard_ed_compatible=$(json_get "$_guard_ed_file" "services.$_guard_ed_service.dependencies.$_guard_ed_dep.routeCompatible" 2>/dev/null) || _guard_ed_compatible=true
        if [ "$_guard_ed_healthy" = false ] || [ "$_guard_ed_compatible" = false ]; then
            return 0
        fi
    done
    return 1
}

_guard_env_json_bool() {
    if [ "$1" = 1 ]; then
        printf 'true'
    else
        printf 'false'
    fi
}

_guard_env_json_string() {
    printf '%s' "$1" | awk '
        BEGIN { ORS = "" }
        {
            gsub(/\\/, "\\\\")
            gsub(/"/, "\\\"")
            gsub(/\t/, "\\t")
            print
        }
    '
}

_guard_env_oc_probe_healthy() {
    case ${GUARD_OPENCLASH_HEALTHY:-} in
        1|true|TRUE|yes|YES|on|ON)
            return 0
            ;;
        0|false|FALSE|no|NO|off|OFF)
            return 1
            ;;
    esac
    _guard_env_pidf=${GUARD_OPENCLASH_PID_FILE:-/tmp/etc/openclash/clash.pid}
    if [ -f "$_guard_env_pidf" ]; then
        _guard_env_pid=$(cat "$_guard_env_pidf" 2>/dev/null) || _guard_env_pid=
        case $_guard_env_pid in
            ''|*[!0-9]*)
                ;;
            *)
                if kill -0 "$_guard_env_pid" 2>/dev/null; then
                    return 0
                fi
                ;;
        esac
    fi
    for _guard_env_if in ${GUARD_OPENCLASH_TUN_IFACES:-utun Meta tun0 utun0}
    do
        if [ -e "/sys/class/net/$_guard_env_if" ]; then
            return 0
        fi
    done
    return 1
}

_guard_env_ipv6() {
    case ${GUARD_IPV6:-} in
        1|true|TRUE|yes|YES|on|ON)
            printf '1\n'
            return 0
            ;;
        0|false|FALSE|no|NO|off|OFF)
            printf '0\n'
            return 0
            ;;
    esac
    if [ -s /proc/net/if_inet6 ]; then
        printf '1\n'
        return 0
    fi
    printf '0\n'
}

_guard_env_proxy_healthy() {
    case ${GUARD_PROXY_HEALTHY:-} in
        1|true|TRUE|yes|YES|on|ON)
            printf '1\n'
            return 0
            ;;
        0|false|FALSE|no|NO|off|OFF)
            printf '0\n'
            return 0
            ;;
    esac
    if [ "$_GUARD_OC_HEALTHY" = 1 ]; then
        printf '1\n'
    else
        printf '0\n'
    fi
}

_guard_env_load_clients() {
    _GUARD_GAME_CLIENTS=0
    _GUARD_GAME_CLIENT_ITEMS=
    if ! command -v uci >/dev/null 2>&1; then
        return 0
    fi
    _guard_env_nl='
'
    _guard_env_items=$(uci -d "$_guard_env_nl" -q get openclash_guard.udp.src_ip 2>/dev/null) || _guard_env_items=
    for _guard_env_item in $_guard_env_items
    do
        [ -n "$_guard_env_item" ] || continue
        _GUARD_GAME_CLIENTS=$((_GUARD_GAME_CLIENTS + 1))
        if [ -z "$_GUARD_GAME_CLIENT_ITEMS" ]; then
            _GUARD_GAME_CLIENT_ITEMS=$_guard_env_item
        else
            _GUARD_GAME_CLIENT_ITEMS="$_GUARD_GAME_CLIENT_ITEMS $_guard_env_item"
        fi
    done
}

_guard_env_json_items() {
    printf '['
    _guard_env_ji_first=1
    for _guard_env_ji in $_GUARD_GAME_CLIENT_ITEMS
    do
        [ -n "$_guard_env_ji" ] || continue
        if [ "$_guard_env_ji_first" = 1 ]; then
            _guard_env_ji_first=0
        else
            printf ','
        fi
        printf '"%s"' "$(_guard_env_json_string "$_guard_env_ji")"
    done
    printf ']'
}

guard_env_detect() {
    _GUARD_OC_INSTALLED=0
    _GUARD_OC_ENABLED=0
    _GUARD_OC_RUNNING=0
    _GUARD_OC_HEALTHY=0
    if svc_exists openclash; then
        _GUARD_OC_INSTALLED=1
        if svc_enabled openclash; then
            _GUARD_OC_ENABLED=1
        fi
        if svc_running openclash; then
            _GUARD_OC_RUNNING=1
        fi
    fi
    if [ "$_GUARD_OC_RUNNING" = 1 ] && _guard_env_oc_probe_healthy; then
        _GUARD_OC_HEALTHY=1
    fi
    guard_dns_detect
    _GUARD_NET_IPV6=$(_guard_env_ipv6)
    if [ -n "${GUARD_DIRECT_REGION:-}" ]; then
        _GUARD_NET_DIRECT_REGION=$GUARD_DIRECT_REGION
    else
        _GUARD_NET_DIRECT_REGION=$(guard_geo_cached_country direct 2>/dev/null) || _GUARD_NET_DIRECT_REGION=
    fi
    _GUARD_PROXY_HEALTHY=$(_guard_env_proxy_healthy)
    if [ -n "${GUARD_PROXY_REGION:-}" ]; then
        _GUARD_PROXY_REGION=$GUARD_PROXY_REGION
    elif [ -n "${GUARD_GEO_ROUTE:-}" ]; then
        _GUARD_PROXY_REGION=$(guard_geo_cached_country route "$GUARD_GEO_ROUTE" 2>/dev/null) || _GUARD_PROXY_REGION=
    else
        _GUARD_PROXY_REGION=
    fi
    _guard_env_load_clients
    _GUARD_GAME_BLANKET=0
    if command -v uci >/dev/null 2>&1; then
        _GUARD_GAME_BLANKET=$(uci_get_bool openclash_guard.udp.blanket_udp_bypass 0 2>/dev/null) || _GUARD_GAME_BLANKET=0
    fi
    case ${GUARD_GAMING_BLANKET:-} in
        1|true|TRUE|yes|YES|on|ON)
            _GUARD_GAME_BLANKET=1
            ;;
        0|false|FALSE|no|NO|off|OFF)
            _GUARD_GAME_BLANKET=0
            ;;
    esac
    _GUARD_NFT_AVAILABLE=0
    if command -v nft >/dev/null 2>&1; then
        _GUARD_NFT_AVAILABLE=1
    fi
    case ${GUARD_DEPENDENCY_FAILED:-} in
        1|true|TRUE|yes|YES|on|ON) _GUARD_DEPENDENCY_FAILURE=1 ;;
        *) _GUARD_DEPENDENCY_FAILURE=0 ;;
    esac
    if _guard_env_dependency_failed; then
        _GUARD_DEPENDENCY_FAILURE=1
    fi
}

guard_env_get() {
    case ${1:-} in
        openclash.installed) printf '%s\n' "$_GUARD_OC_INSTALLED" ;;
        openclash.enabled) printf '%s\n' "$_GUARD_OC_ENABLED" ;;
        openclash.running) printf '%s\n' "$_GUARD_OC_RUNNING" ;;
        openclash.healthy) printf '%s\n' "$_GUARD_OC_HEALTHY" ;;
        dns.backend) printf '%s\n' "$_GUARD_DNS_BACKEND" ;;
        dns.dnsmasqEnabled) printf '%s\n' "$_GUARD_DNS_MSQ_ENABLED" ;;
        dns.dnsmasqRunning) printf '%s\n' "$_GUARD_DNS_MSQ_RUNNING" ;;
        dns.adguardhomeEnabled) printf '%s\n' "$_GUARD_DNS_AGH_ENABLED" ;;
        dns.adguardhomeRunning) printf '%s\n' "$_GUARD_DNS_AGH_RUNNING" ;;
        dns.domainSetBackend) printf '%s\n' "$_GUARD_DNS_DOMAIN_SET" ;;
        network.ipv6) printf '%s\n' "$_GUARD_NET_IPV6" ;;
        network.directRegion) printf '%s\n' "$_GUARD_NET_DIRECT_REGION" ;;
        proxy.healthy) printf '%s\n' "$_GUARD_PROXY_HEALTHY" ;;
        proxy.region) printf '%s\n' "$_GUARD_PROXY_REGION" ;;
        gaming.clients.count) printf '%s\n' "$_GUARD_GAME_CLIENTS" ;;
        gaming.clients.items) printf '%s\n' "$_GUARD_GAME_CLIENT_ITEMS" ;;
        gaming.blanketUdpBypassDetected) printf '%s\n' "$_GUARD_GAME_BLANKET" ;;
        nft.available) printf '%s\n' "$_GUARD_NFT_AVAILABLE" ;;
        dependency.requiredFailure) printf '%s\n' "$_GUARD_DEPENDENCY_FAILURE" ;;
        *)
            printf '%s\n' "guard_env_get: unknown key: ${1:-}" >&2
            return 2
            ;;
    esac
}

guard_env_json() {
    printf '{'
    printf '"dependency":{"requiredFailure":%s},' \
        "$(_guard_env_json_bool "$_GUARD_DEPENDENCY_FAILURE")"
    printf '"openclash":{"installed":%s,"enabled":%s,"running":%s,"healthy":%s},' \
        "$(_guard_env_json_bool "$_GUARD_OC_INSTALLED")" \
        "$(_guard_env_json_bool "$_GUARD_OC_ENABLED")" \
        "$(_guard_env_json_bool "$_GUARD_OC_RUNNING")" \
        "$(_guard_env_json_bool "$_GUARD_OC_HEALTHY")"
    printf '"dns":{"backend":"%s","dnsmasqEnabled":%s,"dnsmasqRunning":%s,"adguardhomeEnabled":%s,"adguardhomeRunning":%s,"domainSetBackend":"%s"},' \
        "$(_guard_env_json_string "$_GUARD_DNS_BACKEND")" \
        "$(_guard_env_json_bool "$_GUARD_DNS_MSQ_ENABLED")" \
        "$(_guard_env_json_bool "$_GUARD_DNS_MSQ_RUNNING")" \
        "$(_guard_env_json_bool "$_GUARD_DNS_AGH_ENABLED")" \
        "$(_guard_env_json_bool "$_GUARD_DNS_AGH_RUNNING")" \
        "$(_guard_env_json_string "$_GUARD_DNS_DOMAIN_SET")"
    printf '"network":{"ipv6":%s,"directRegion":"%s"},' \
        "$(_guard_env_json_bool "$_GUARD_NET_IPV6")" \
        "$(_guard_env_json_string "$_GUARD_NET_DIRECT_REGION")"
    printf '"proxy":{"healthy":%s,"region":"%s"},' \
        "$(_guard_env_json_bool "$_GUARD_PROXY_HEALTHY")" \
        "$(_guard_env_json_string "$_GUARD_PROXY_REGION")"
    printf '"gaming":{"clients":{"count":%s,"items":%s},"blanketUdpBypassDetected":%s},' \
        "$_GUARD_GAME_CLIENTS" \
        "$(_guard_env_json_items)" \
        "$(_guard_env_json_bool "$_GUARD_GAME_BLANKET")"
    printf '"nft":{"available":%s}' "$(_guard_env_json_bool "$_GUARD_NFT_AVAILABLE")"
    printf '}\n'
}
# END MODULE: guard-environment

# BEGIN MODULE: guard-killswitch
# Persistent inet table independent of disposable OpenClash/fw4 chains.
# Prefix: guard_kill_
set -eu

_GUARD_UCI_ENABLED=1
_GUARD_UCI_MODE=auto
_GUARD_UCI_KILL_SWITCH=1
_GUARD_UCI_DNS_KILL_SWITCH=0

_guard_kill_comment() {
    printf '%s:%s' "$_GUARD_NFT_PREFIX" "$1"
}

guard_kill_read_uci() {
    _GUARD_UCI_ENABLED=1
    _GUARD_UCI_MODE=auto
    _GUARD_UCI_KILL_SWITCH=1
    _GUARD_UCI_DNS_KILL_SWITCH=0
    if command -v uci >/dev/null 2>&1; then
        _GUARD_UCI_ENABLED=$(uci_get_bool openclash_guard.main.enabled 1 2>/dev/null) || _GUARD_UCI_ENABLED=1
        _GUARD_UCI_MODE=$(uci_get_default openclash_guard.main.mode auto 2>/dev/null) || _GUARD_UCI_MODE=auto
        _GUARD_UCI_KILL_SWITCH=$(uci_get_bool openclash_guard.main.kill_switch 1 2>/dev/null) || _GUARD_UCI_KILL_SWITCH=1
        _GUARD_UCI_DNS_KILL_SWITCH=$(uci_get_bool openclash_guard.main.dns_kill_switch 0 2>/dev/null) || _GUARD_UCI_DNS_KILL_SWITCH=0
    fi
}

_guard_kill_csv_set() {
    _guard_ks_out=
    _guard_ks_first=1
    for _guard_ks_item in "$@"
    do
        [ -n "$_guard_ks_item" ] || continue
        if [ "$_guard_ks_first" = 1 ]; then
            _guard_ks_out=$_guard_ks_item
            _guard_ks_first=0
        else
            _guard_ks_out="$_guard_ks_out, $_guard_ks_item"
        fi
    done
    printf '%s' "$_guard_ks_out"
}

_guard_kill_add_set() {
    _guard_as_name=$1
    _guard_as_type=$2
    _guard_as_tag=$3
    _guard_as_flags=${4:-}
    _guard_as_extra=
    if [ -n "$_guard_as_flags" ]; then
        _guard_as_extra=" flags $_guard_as_flags;"
    fi
    printf 'add set %s %s %s { type %s;%s comment "%s"; }\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE" "$_guard_as_name" "$_guard_as_type" \
        "$_guard_as_extra" "$(_guard_kill_comment "$_guard_as_tag")"
}

_guard_kill_add_elements() {
    _guard_ae_name=$1
    shift
    _guard_ae_csv=$(_guard_kill_csv_set "$@")
    if [ -z "$_guard_ae_csv" ]; then
        return 0
    fi
    printf 'add element %s %s %s { %s }\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE" "$_guard_ae_name" "$_guard_ae_csv"
}

_guard_kill_add_rule() {
    printf 'add rule %s %s %s %s comment "%s"\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE" "$1" "$2" "$(_guard_kill_comment "$3")"
}

guard_kill_delete_table() {
    if [ "$_GUARD_NFT_AVAILABLE" != 1 ]; then
        return 0
    fi
    if nft_table_exists "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"; then
        nft delete table "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    fi
}

# Order: local accepts, kill/protect reject, (gaming appended later), remaining.
guard_kill_render() {
    printf 'add table %s %s\n' "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    _guard_kill_add_set lan_rfc1918 ipv4_addr lan interval
    _guard_kill_add_elements lan_rfc1918 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
    _guard_kill_add_set protected_udp inet_service protected-udp
    _guard_ku_ports=$(json_list "$_GUARD_POLICY_FILE" gaming.protectedUdpPorts 2>/dev/null) || _guard_ku_ports=
    _guard_ku_has443=0
    for _guard_ku_port in $_guard_ku_ports
    do
        if [ "$_guard_ku_port" = 443 ]; then
            _guard_ku_has443=1
            break
        fi
    done
    if [ "$_guard_ku_has443" != 1 ]; then
        _guard_ku_ports="$_guard_ku_ports 443"
    fi
    # shellcheck disable=SC2086
    _guard_kill_add_elements protected_udp $_guard_ku_ports

    printf 'add chain %s %s input { type filter hook input priority -150; policy accept; }\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    printf 'add chain %s %s forward { type filter hook forward priority -150; policy accept; }\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"

    _guard_kill_add_rule input 'ct state established,related accept' est-in
    if [ "$_GUARD_UCI_DNS_KILL_SWITCH" = 1 ]; then
        _guard_kill_add_rule input 'iifname != "lo" udp dport 53 reject' dns-ks
        _guard_kill_add_rule input 'iifname != "lo" tcp dport 53 reject' dns-ks-tcp
    fi

    _guard_kill_add_rule forward 'ct state established,related accept' est
    _guard_kill_add_rule forward 'iifname "lo" accept' lo
    _guard_kill_add_rule forward 'udp dport { 67, 68 } accept' dhcp
    _guard_kill_add_rule forward 'ip daddr @lan_rfc1918 accept' lan-dst
    _guard_kill_add_rule forward 'udp dport @protected_udp reject' protected-udp
    if [ "$_GUARD_POLICY_ENFORCEMENT" = reject ]; then
        _guard_kill_add_rule forward reject kill-switch
    fi
}

guard_kill_apply_batch() {
    _guard_ka_file=${1:-}
    if [ -z "$_guard_ka_file" ] || [ ! -f "$_guard_ka_file" ]; then
        printf '%s\n' "guard_kill_apply_batch: missing batch" >&2
        return 2
    fi
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        cat "$_guard_ka_file"
        return 0
    fi
    if [ "$_GUARD_NFT_AVAILABLE" != 1 ]; then
        printf '%s\n' "guard_kill: nft not available" >&2
        return 1
    fi
    guard_kill_delete_table || return $?
    nft_apply_batch "$_guard_ka_file"
}
# END MODULE: guard-killswitch

# BEGIN MODULE: guard-gaming
# Scoped gaming exceptions. Never saddr+any-UDP. Never UDP/443 blanket.
# Prefix: guard_game_
set -eu

_GUARD_GAME_ENABLED=1

guard_game_read_uci() {
    _GUARD_GAME_ENABLED=1
    if command -v uci >/dev/null 2>&1; then
        _GUARD_GAME_ENABLED=$(uci_get_bool openclash_guard.udp.enabled 1 2>/dev/null) || _GUARD_GAME_ENABLED=1
    fi
}

guard_game_src_ips() {
    if ! command -v uci >/dev/null 2>&1; then
        return 0
    fi
    _guard_gs_nl='
'
    uci -d "$_guard_gs_nl" -q get openclash_guard.udp.src_ip 2>/dev/null || true
}

_guard_game_ip_in() {
    _guard_gi_ip=$1
    shift
    for _guard_gi_item in "$@"
    do
        if [ "$_guard_gi_item" = "$_guard_gi_ip" ]; then
            return 0
        fi
    done
    return 1
}

# Prefix match for /8 /16 /24 plus exact host. Sufficient for the contract schema.
_guard_game_dest_ok() {
    _guard_gd_dest=$1
    if [ -z "$_guard_gd_dest" ]; then
        return 1
    fi
    _guard_gd_cidrs=$(json_list "$_GUARD_POLICY_FILE" gaming.destinationCidrs 2>/dev/null) || _guard_gd_cidrs=
    if [ -z "$_guard_gd_cidrs" ]; then
        return 0
    fi
    for _guard_gd_cidr in $_guard_gd_cidrs
    do
        [ -n "$_guard_gd_cidr" ] || continue
        case $_guard_gd_cidr in
            */8)
                _guard_gd_net=${_guard_gd_cidr%/*}
                _guard_gd_pfx=${_guard_gd_net%%.*}.
                case $_guard_gd_dest in
                    "$_guard_gd_pfx"*)
                        return 0
                        ;;
                esac
                ;;
            */16)
                _guard_gd_net=${_guard_gd_cidr%/*}
                _guard_gd_a=${_guard_gd_net%%.*}
                _guard_gd_rest=${_guard_gd_net#*.}
                _guard_gd_b=${_guard_gd_rest%%.*}
                _guard_gd_pfx="${_guard_gd_a}.${_guard_gd_b}."
                case $_guard_gd_dest in
                    "$_guard_gd_pfx"*)
                        return 0
                        ;;
                esac
                ;;
            */24)
                _guard_gd_net=${_guard_gd_cidr%/*}
                _guard_gd_pfx=${_guard_gd_net%.*}.
                case $_guard_gd_dest in
                    "$_guard_gd_pfx"*)
                        return 0
                        ;;
                esac
                ;;
            */*)
                _guard_gd_net=${_guard_gd_cidr%/*}
                if [ "$_guard_gd_dest" = "$_guard_gd_net" ]; then
                    return 0
                fi
                ;;
            *)
                if [ "$_guard_gd_dest" = "$_guard_gd_cidr" ]; then
                    return 0
                fi
                ;;
        esac
    done
    return 1
}

guard_game_flow_eligible() {
    _guard_gf_proto=$1
    _guard_gf_dport=$2
    _guard_gf_src=$3
    _guard_gf_dest=$4
    if [ "$_GUARD_GAME_ENABLED" != 1 ]; then
        return 1
    fi
    case $_guard_gf_proto in
        udp|UDP)
            ;;
        *)
            return 1
            ;;
    esac
    if [ -z "$_guard_gf_dport" ] || guard_policy_port_in_list "$_guard_gf_dport" gaming.protectedUdpPorts; then
        return 1
    fi
    if ! guard_policy_port_in_list "$_guard_gf_dport" gaming.udpPorts; then
        return 1
    fi
    _guard_gf_srcs=$(guard_game_src_ips)
    if [ -z "$_guard_gf_srcs" ]; then
        return 1
    fi
    if ! _guard_game_ip_in "$_guard_gf_src" $_guard_gf_srcs; then
        return 1
    fi
    if json_has "$_GUARD_POLICY_FILE" gaming.destinationCidrs; then
        _guard_gf_any=$(json_list "$_GUARD_POLICY_FILE" gaming.destinationCidrs 2>/dev/null) || _guard_gf_any=
        if [ -n "$_guard_gf_any" ]; then
            _guard_game_dest_ok "$_guard_gf_dest" || return 1
        fi
    fi
    return 0
}

# Gaming runs AFTER kill/protect. Skipped entirely when enforcement=reject
# so it cannot override the global kill switch or directAllowed=false.
guard_game_render() {
    if [ "$_GUARD_GAME_ENABLED" != 1 ]; then
        return 0
    fi
    if [ "$_GUARD_POLICY_ENFORCEMENT" = reject ]; then
        return 0
    fi
    _guard_gr_srcs=$(guard_game_src_ips)
    if [ -z "$_guard_gr_srcs" ]; then
        return 0
    fi
    _guard_gr_ports=$(json_list "$_GUARD_POLICY_FILE" gaming.udpPorts 2>/dev/null) || _guard_gr_ports=
    _guard_gr_keep=
    for _guard_gr_port in $_guard_gr_ports
    do
        [ -n "$_guard_gr_port" ] || continue
        if guard_policy_port_in_list "$_guard_gr_port" gaming.protectedUdpPorts; then
            continue
        fi
        _guard_gr_keep="$_guard_gr_keep $_guard_gr_port"
    done
    if [ -z "$_guard_gr_keep" ]; then
        return 0
    fi
    _guard_kill_add_set gaming_src ipv4_addr gaming-src interval
    # shellcheck disable=SC2086
    _guard_kill_add_elements gaming_src $_guard_gr_srcs
    _guard_kill_add_set gaming_udp inet_service gaming-udp
    # shellcheck disable=SC2086
    _guard_kill_add_elements gaming_udp $_guard_gr_keep
    _guard_gr_cidrs=$(json_list "$_GUARD_POLICY_FILE" gaming.destinationCidrs 2>/dev/null) || _guard_gr_cidrs=
    if [ -n "$_guard_gr_cidrs" ]; then
        _guard_kill_add_set gaming_dst ipv4_addr gaming-dst interval
        # shellcheck disable=SC2086
        _guard_kill_add_elements gaming_dst $_guard_gr_cidrs
        _guard_kill_add_rule forward 'ip saddr @gaming_src ip daddr @gaming_dst udp dport @gaming_udp accept' game-udp
    else
        _guard_kill_add_rule forward 'ip saddr @gaming_src udp dport @gaming_udp accept' game-udp
    fi
}
# END MODULE: guard-gaming

# BEGIN MODULE: guard-template
# Data-driven template matcher and apply. Detection never auto-applies.
# Prefix: guard_template_
set -eu

_GUARD_TEMPLATE_APPLY_KEYS="guard.kill_switch guard.dns_kill_switch dns.ownership gaming.blanket_udp_bypass gaming.protect_udp_443 mode policy.refresh"

_guard_template_catalog_path() {
    if [ -n "${GUARD_TEMPLATES_FILE:-}" ]; then
        printf '%s\n' "$GUARD_TEMPLATES_FILE"
        return 0
    fi
    _guard_tc_pol=$(_guard_policy_default_path)
    printf '%s/openclash-guard-templates.json\n' "$(dirname "$_guard_tc_pol")"
}

_guard_template_is_int() {
    case ${1:-} in
        ''|*[!0-9]*)
            return 1
            ;;
        *)
            return 0
            ;;
    esac
}

_guard_template_severity_rank() {
    case ${1:-} in
        high)
            printf '0\n'
            ;;
        medium)
            printf '1\n'
            ;;
        info)
            printf '2\n'
            ;;
        *)
            printf '9\n'
            ;;
    esac
}

_guard_template_severity_label() {
    printf '%s' "$1" | tr 'a-z' 'A-Z'
}

_guard_template_eval_all() {
    _guard_te_cat=$1
    _guard_te_pfx=$2
    _guard_te_env=$3
    _guard_te_keys=$(json_keys "$_guard_te_cat" "$_guard_te_pfx") || return 1
    if [ -z "$_guard_te_keys" ]; then
        return 1
    fi
    for _guard_te_i in $_guard_te_keys
    do
        [ -n "$_guard_te_i" ] || continue
        _guard_template_eval_node "$_guard_te_cat" "${_guard_te_pfx}.${_guard_te_i}" "$_guard_te_env" || return 1
    done
    return 0
}

_guard_template_eval_any() {
    _guard_ty_cat=$1
    _guard_ty_pfx=$2
    _guard_ty_env=$3
    _guard_ty_keys=$(json_keys "$_guard_ty_cat" "$_guard_ty_pfx") || return 1
    for _guard_ty_i in $_guard_ty_keys
    do
        [ -n "$_guard_ty_i" ] || continue
        if _guard_template_eval_node "$_guard_ty_cat" "${_guard_ty_pfx}.${_guard_ty_i}" "$_guard_ty_env"; then
            return 0
        fi
    done
    return 1
}

_guard_template_contains() {
    _guard_tcn_cat=$1
    _guard_tcn_pfx=$2
    _guard_tcn_env=$3
    _guard_tcn_path=$4
    _guard_tcn_needle=$(json_get "$_guard_tcn_cat" "${_guard_tcn_pfx}.contains") || return 1
    if json_list "$_guard_tcn_env" "$_guard_tcn_path" >/dev/null 2>&1; then
        _guard_tcn_items=$(json_list "$_guard_tcn_env" "$_guard_tcn_path") || return 1
        for _guard_tcn_item in $_guard_tcn_items
        do
            if [ "$_guard_tcn_item" = "$_guard_tcn_needle" ]; then
                return 0
            fi
        done
        return 1
    fi
    _guard_tcn_hay=$(json_get "$_guard_tcn_env" "$_guard_tcn_path" 2>/dev/null) || return 1
    case $_guard_tcn_hay in
        *"$_guard_tcn_needle"*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

_guard_template_eval_leaf() {
    _guard_tl_cat=$1
    _guard_tl_pfx=$2
    _guard_tl_env=$3
    _guard_tl_path=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.path") || return 1
    _guard_tl_lhs=$(json_get "$_guard_tl_env" "$_guard_tl_path" 2>/dev/null) || _guard_tl_lhs=
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.eq"; then
        _guard_tl_rhs=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.eq") || return 1
        [ "$_guard_tl_lhs" = "$_guard_tl_rhs" ]
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.ne"; then
        _guard_tl_rhs=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.ne") || return 1
        [ "$_guard_tl_lhs" != "$_guard_tl_rhs" ]
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.in"; then
        _guard_tl_items=$(json_list "$_guard_tl_cat" "${_guard_tl_pfx}.in") || return 1
        for _guard_tl_item in $_guard_tl_items
        do
            if [ "$_guard_tl_item" = "$_guard_tl_lhs" ]; then
                return 0
            fi
        done
        return 1
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.contains"; then
        _guard_template_contains "$_guard_tl_cat" "$_guard_tl_pfx" "$_guard_tl_env" "$_guard_tl_path"
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.gte"; then
        _guard_tl_rhs=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.gte") || return 1
        if ! _guard_template_is_int "$_guard_tl_lhs" || ! _guard_template_is_int "$_guard_tl_rhs"; then
            return 1
        fi
        [ "$_guard_tl_lhs" -ge "$_guard_tl_rhs" ]
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.lte"; then
        _guard_tl_rhs=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.lte") || return 1
        if ! _guard_template_is_int "$_guard_tl_lhs" || ! _guard_template_is_int "$_guard_tl_rhs"; then
            return 1
        fi
        [ "$_guard_tl_lhs" -le "$_guard_tl_rhs" ]
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.exists"; then
        _guard_tl_want=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.exists") || _guard_tl_want=true
        if json_has "$_guard_tl_env" "$_guard_tl_path"; then
            _guard_tl_has=1
        else
            _guard_tl_has=0
        fi
        case $_guard_tl_want in
            true|1)
                [ "$_guard_tl_has" = 1 ]
                ;;
            false|0)
                [ "$_guard_tl_has" = 0 ]
                ;;
            *)
                return 1
                ;;
        esac
        return $?
    fi
    return 1
}

_guard_template_eval_node() {
    _guard_tn_cat=$1
    _guard_tn_pfx=$2
    _guard_tn_env=$3
    if json_has "$_guard_tn_cat" "${_guard_tn_pfx}.all"; then
        _guard_template_eval_all "$_guard_tn_cat" "${_guard_tn_pfx}.all" "$_guard_tn_env"
        return $?
    fi
    if json_has "$_guard_tn_cat" "${_guard_tn_pfx}.any"; then
        _guard_template_eval_any "$_guard_tn_cat" "${_guard_tn_pfx}.any" "$_guard_tn_env"
        return $?
    fi
    if json_has "$_guard_tn_cat" "${_guard_tn_pfx}.not"; then
        if _guard_template_eval_node "$_guard_tn_cat" "${_guard_tn_pfx}.not" "$_guard_tn_env"; then
            return 1
        fi
        return 0
    fi
    _guard_template_eval_leaf "$_guard_tn_cat" "$_guard_tn_pfx" "$_guard_tn_env"
}

guard_template_match() {
    _guard_tm_cat=${1:-}
    _guard_tm_id=${2:-}
    _guard_tm_env=${3:-}
    if [ -z "$_guard_tm_cat" ] || [ -z "$_guard_tm_id" ] || [ -z "$_guard_tm_env" ]; then
        printf '%s\n' "guard_template_match: usage: catalog id env.json" >&2
        return 2
    fi
    if ! json_has "$_guard_tm_cat" "templates.${_guard_tm_id}"; then
        return 1
    fi
    _guard_template_eval_node "$_guard_tm_cat" "templates.${_guard_tm_id}.when" "$_guard_tm_env"
}

guard_template_matches() {
    _guard_tms_cat=$1
    _guard_tms_env=$2
    _guard_tms_ids=$(json_keys "$_guard_tms_cat" templates) || _guard_tms_ids=
    _guard_tms_out=$(file_mktemp) || return 1
    : > "$_guard_tms_out"
    for _guard_tms_id in $_guard_tms_ids
    do
        [ -n "$_guard_tms_id" ] || continue
        if guard_template_match "$_guard_tms_cat" "$_guard_tms_id" "$_guard_tms_env"; then
            _guard_tms_sev=$(json_get "$_guard_tms_cat" "templates.${_guard_tms_id}.recommendation.severity") || _guard_tms_sev=info
            _guard_tms_rank=$(_guard_template_severity_rank "$_guard_tms_sev")
            printf '%s\t%s\n' "$_guard_tms_rank" "$_guard_tms_id" >> "$_guard_tms_out"
        fi
    done
    sort -n "$_guard_tms_out" | awk -F '\t' '{print $2}'
    rm -f "$_guard_tms_out"
}

_guard_template_require_catalog() {
    _GUARD_TEMPLATE_FILE=$(_guard_template_catalog_path)
    if [ ! -f "$_GUARD_TEMPLATE_FILE" ]; then
        cli_error "template catalog missing: $_GUARD_TEMPLATE_FILE"
        return 1
    fi
    if ! json_load "$_GUARD_TEMPLATE_FILE"; then
        cli_error "invalid template catalog: $_GUARD_TEMPLATE_FILE"
        return 1
    fi
    _guard_tr_ver=$(json_get "$_GUARD_TEMPLATE_FILE" schemaVersion) || _guard_tr_ver=
    if [ "$_guard_tr_ver" != 1 ]; then
        cli_error "unsupported template schemaVersion: ${_guard_tr_ver:-missing}"
        return 1
    fi
    if ! json_has "$_GUARD_TEMPLATE_FILE" templates; then
        cli_error "template catalog missing templates"
        return 1
    fi
}

_guard_template_env_file() {
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    _guard_tef=$(file_mktemp) || return 1
    guard_env_json > "$_guard_tef"
    printf '%s\n' "$_guard_tef"
}

guard_intent_ensure_sections() {
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        return 0
    fi
    if ! command -v uci >/dev/null 2>&1; then
        printf '%s\n' "uci: command not found" >&2
        return 127
    fi
    uci_set openclash_guard.main openclash_guard
    uci_set openclash_guard.udp udp
}

_guard_template_bool_uci() {
    case $1 in
        true|1)
            printf '1\n'
            ;;
        false|0)
            printf '0\n'
            ;;
        *)
            return 1
            ;;
    esac
}

_guard_template_set() {
    _guard_ts_opt=$1
    _guard_ts_val=$2
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would set %s=%s\n' "$_guard_ts_opt" "$_guard_ts_val"
        return 0
    fi
    uci_set "$_guard_ts_opt" "$_guard_ts_val"
}

_guard_template_apply_key() {
    _guard_tak_key=$1
    _guard_tak_val=$2
    case $_guard_tak_key in
        guard.kill_switch)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            _guard_template_set openclash_guard.main.kill_switch "$_guard_tak_uci"
            ;;
        guard.dns_kill_switch)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            _guard_template_set openclash_guard.main.dns_kill_switch "$_guard_tak_uci"
            ;;
        dns.ownership)
            if [ "$_guard_tak_val" != preserve ]; then
                cli_error "dns.ownership must be preserve"
                return 1
            fi
            _guard_template_set openclash_guard.main.dns_ownership preserve
            ;;
        gaming.blanket_udp_bypass)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            if [ "$_guard_tak_uci" = 1 ]; then
                cli_error "refusing to enable blanket UDP bypass"
                return 1
            fi
            _guard_template_set openclash_guard.udp.blanket_udp_bypass 0
            ;;
        gaming.protect_udp_443)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            if [ "$_guard_tak_uci" != 1 ]; then
                cli_error "UDP/443 protection cannot be disabled"
                return 1
            fi
            _guard_template_set openclash_guard.udp.protect_udp_443 1
            ;;
        mode)
            case $_guard_tak_val in
                auto|strict|manual)
                    ;;
                *)
                    cli_error "invalid mode: $_guard_tak_val"
                    return 1
                    ;;
            esac
            _guard_template_set openclash_guard.main.mode "$_guard_tak_val"
            ;;
        policy.refresh)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            _guard_template_set openclash_guard.main.policy_refresh "$_guard_tak_uci"
            ;;
        *)
            cli_error "unknown apply key: $_guard_tak_key"
            return 1
            ;;
    esac
}

_guard_template_dump_apply() {
    _guard_td_cat=$1
    _guard_td_id=$2
    for _guard_td_key in $_GUARD_TEMPLATE_APPLY_KEYS
    do
        if json_has "$_guard_td_cat" "templates.${_guard_td_id}.apply.${_guard_td_key}"; then
            _guard_td_val=$(json_get "$_guard_td_cat" "templates.${_guard_td_id}.apply.${_guard_td_key}") || continue
            printf '%s=%s\n' "$_guard_td_key" "$_guard_td_val"
        fi
    done
}

_guard_template_print_one() {
    _guard_tp_cat=$1
    _guard_tp_id=$2
    _guard_tp_explain=${3:-0}
    _guard_tp_title=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.title") || _guard_tp_title=$_guard_tp_id
    _guard_tp_sev=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.recommendation.severity") || _guard_tp_sev=info
    _guard_tp_reason=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.recommendation.reason") || _guard_tp_reason=
    printf '[%s] %s\n' "$(_guard_template_severity_label "$_guard_tp_sev")" "$_guard_tp_id"
    printf '  %s\n' "$_guard_tp_reason"
    if [ "$_guard_tp_explain" = 1 ]; then
        _guard_tp_risk=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.recommendation.risk") || _guard_tp_risk=
        _guard_tp_desc=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.description") || _guard_tp_desc=
        printf '  title: %s\n' "$_guard_tp_title"
        printf '  detected: %s\n' "$_guard_tp_desc"
        printf '  risk: %s\n' "$_guard_tp_risk"
        printf '  proposed:\n'
        _guard_template_dump_apply "$_guard_tp_cat" "$_guard_tp_id" | sed 's/^/    /'
    fi
    printf '\n  Apply:\n    openclash-guard template apply %s\n' "$_guard_tp_id"
}

guard_cmd_template_list() {
    _guard_template_require_catalog || return $?
    _guard_tl_json=0
    _guard_tl_explain=0
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --json)
                _guard_tl_json=1
                shift
                ;;
            --explain)
                _guard_tl_explain=1
                shift
                ;;
            *)
                cli_die "unknown template list option: $1" 2
                ;;
        esac
    done
    _guard_tl_ids=$(json_keys "$_GUARD_TEMPLATE_FILE" templates) || _guard_tl_ids=
    if [ "$_guard_tl_json" = 1 ] || [ "$_GUARD_JSON" = 1 ]; then
        printf '{"templates":['
        _guard_tl_first=1
        for _guard_tl_id in $_guard_tl_ids
        do
            [ -n "$_guard_tl_id" ] || continue
            if [ "$_guard_tl_first" = 1 ]; then
                _guard_tl_first=0
            else
                printf ','
            fi
            printf '"%s"' "$(_guard_env_json_string "$_guard_tl_id")"
        done
        printf ']}\n'
        return 0
    fi
    cli_section "Templates"
    for _guard_tl_id in $_guard_tl_ids
    do
        [ -n "$_guard_tl_id" ] || continue
        _guard_tl_title=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tl_id}.title") || _guard_tl_title=
        cli_kv "$_guard_tl_id" "$_guard_tl_title"
        if [ "$_guard_tl_explain" = 1 ]; then
            _guard_template_dump_apply "$_GUARD_TEMPLATE_FILE" "$_guard_tl_id" | sed 's/^/  /'
        fi
    done
}

guard_cmd_template_suggest() {
    _guard_tsg_json=0
    _guard_tsg_explain=0
    _guard_tsg_service=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --json)
                _guard_tsg_json=1
                shift
                ;;
            --explain)
                _guard_tsg_explain=1
                shift
                ;;
            --service)
                _guard_tsg_service=$2
                shift 2
                ;;
            *)
                cli_die "unknown template suggest option: $1" 2
                ;;
        esac
    done
    if [ "$_GUARD_JSON" = 1 ]; then
        _guard_tsg_json=1
    fi
    _guard_template_require_catalog || return $?
    export GUARD_SERVICE_ID=$_guard_tsg_service
    _guard_tsg_env=$(_guard_template_env_file) || return $?
    _guard_tsg_ids=$(guard_template_matches "$_GUARD_TEMPLATE_FILE" "$_guard_tsg_env") || _guard_tsg_ids=
    if [ "$_guard_tsg_json" = 1 ]; then
        printf '{"suggestions":['
        _guard_tsg_first=1
        for _guard_tsg_id in $_guard_tsg_ids
        do
            [ -n "$_guard_tsg_id" ] || continue
            _guard_tsg_sev=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsg_id}.recommendation.severity") || _guard_tsg_sev=info
            _guard_tsg_conf=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsg_id}.recommendation.confidence") || _guard_tsg_conf=high
            _guard_tsg_reason=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsg_id}.recommendation.reason") || _guard_tsg_reason=
            if [ "$_guard_tsg_first" = 1 ]; then
                _guard_tsg_first=0
            else
                printf ','
            fi
            printf '{"id":"%s","severity":"%s","confidence":"%s","reason":"%s","applyCommand":"openclash-guard template apply %s"}' \
                "$(_guard_env_json_string "$_guard_tsg_id")" \
                "$(_guard_env_json_string "$_guard_tsg_sev")" \
                "$(_guard_env_json_string "$_guard_tsg_conf")" \
                "$(_guard_env_json_string "$_guard_tsg_reason")" \
                "$(_guard_env_json_string "$_guard_tsg_id")"
        done
        printf ']}\n'
        rm -f "$_guard_tsg_env"
        return 0
    fi
    cli_section "Suggested Templates"
    _guard_tsg_any=0
    for _guard_tsg_id in $_guard_tsg_ids
    do
        [ -n "$_guard_tsg_id" ] || continue
        _guard_tsg_any=1
        printf '\n'
        _guard_template_print_one "$_GUARD_TEMPLATE_FILE" "$_guard_tsg_id" "$_guard_tsg_explain"
    done
    rm -f "$_guard_tsg_env"
    if [ "$_guard_tsg_any" != 1 ]; then
        cli_info "no templates matched"
    fi
}

guard_cmd_template_show() {
    _guard_tsh_json=0
    _guard_tsh_explain=0
    _guard_tsh_id=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --json)
                _guard_tsh_json=1
                shift
                ;;
            --explain)
                _guard_tsh_explain=1
                shift
                ;;
            --*)
                cli_die "unknown template show option: $1" 2
                ;;
            *)
                if [ -n "$_guard_tsh_id" ]; then
                    cli_die "duplicate template id" 2
                fi
                _guard_tsh_id=$1
                shift
                ;;
        esac
    done
    if [ "$_GUARD_JSON" = 1 ]; then
        _guard_tsh_json=1
    fi
    if [ -z "$_guard_tsh_id" ]; then
        cli_error "usage: openclash-guard template show <id>"
        return 2
    fi
    _guard_template_require_catalog || return $?
    if ! json_has "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}"; then
        cli_error "unknown template: $_guard_tsh_id"
        return 1
    fi
    if [ "$_guard_tsh_json" = 1 ]; then
        printf '{"id":"%s","title":"%s","description":"%s","severity":"%s","confidence":"%s","reason":"%s","risk":"%s","apply":{' \
            "$(_guard_env_json_string "$_guard_tsh_id")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.title")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.description")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.recommendation.severity")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.recommendation.confidence")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.recommendation.reason")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.recommendation.risk")")"
        _guard_tsh_first=1
        for _guard_tsh_key in $_GUARD_TEMPLATE_APPLY_KEYS
        do
            if json_has "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.apply.${_guard_tsh_key}"; then
                _guard_tsh_val=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.apply.${_guard_tsh_key}") || continue
                if [ "$_guard_tsh_first" = 1 ]; then
                    _guard_tsh_first=0
                else
                    printf ','
                fi
                case $_guard_tsh_val in
                    true|false)
                        printf '"%s":%s' "$(_guard_env_json_string "$_guard_tsh_key")" "$_guard_tsh_val"
                        ;;
                    *)
                        printf '"%s":"%s"' "$(_guard_env_json_string "$_guard_tsh_key")" "$(_guard_env_json_string "$_guard_tsh_val")"
                        ;;
                esac
            fi
        done
        printf '}}\n'
        return 0
    fi
    cli_section "$_guard_tsh_id"
    _guard_template_print_one "$_GUARD_TEMPLATE_FILE" "$_guard_tsh_id" 1
}

guard_cmd_template_apply() {
    _guard_ta_id=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --json)
                _GUARD_JSON=1
                shift
                ;;
            --yes|-y)
                cli_set_assume_yes 1
                shift
                ;;
            --dry-run)
                GUARD_DRY_RUN=1
                shift
                ;;
            --*)
                cli_die "unknown template apply option: $1" 2
                ;;
            *)
                if [ -n "$_guard_ta_id" ]; then
                    cli_die "duplicate template id" 2
                fi
                _guard_ta_id=$1
                shift
                ;;
        esac
    done
    if [ -z "$_guard_ta_id" ]; then
        cli_error "usage: openclash-guard template apply <id> [--dry-run] [--yes]"
        return 2
    fi
    _guard_template_require_catalog || return $?
    if ! json_has "$_GUARD_TEMPLATE_FILE" "templates.${_guard_ta_id}"; then
        cli_error "unknown template: $_guard_ta_id"
        return 1
    fi
    _guard_ta_env=$(_guard_template_env_file) || return $?
    rm -f "$_guard_ta_env"
    if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
        if ! cli_confirm "Apply template ${_guard_ta_id}?"; then
            cli_error "refusing to apply without confirmation (pass --yes)"
            return 1
        fi
    fi
    cli_section "template ${_guard_ta_id}"
    _guard_template_dump_apply "$_GUARD_TEMPLATE_FILE" "$_guard_ta_id"
    guard_intent_ensure_sections || return $?
    for _guard_ta_key in $_GUARD_TEMPLATE_APPLY_KEYS
    do
        if json_has "$_GUARD_TEMPLATE_FILE" "templates.${_guard_ta_id}.apply.${_guard_ta_key}"; then
            _guard_ta_val=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_ta_id}.apply.${_guard_ta_key}") || continue
            _guard_template_apply_key "$_guard_ta_key" "$_guard_ta_val" || return $?
        fi
    done
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        cli_info "dry-run: no UCI written"
        return 0
    fi
    uci_commit_if_changed openclash_guard || return $?
    guard_cmd_reconcile
}

guard_cmd_template() {
    _guard_tc_sub=${1:-}
    if [ "$#" -gt 0 ]; then
        shift
    fi
    case $_guard_tc_sub in
        list)
            guard_cmd_template_list "$@"
            ;;
        suggest)
            guard_cmd_template_suggest "$@"
            ;;
        show)
            guard_cmd_template_show "$@"
            ;;
        apply)
            guard_cmd_template_apply "$@"
            ;;
        *)
            printf '%s\n' "usage: openclash-guard template list|suggest|show|apply" >&2
            return 2
            ;;
    esac
}
# END MODULE: guard-template

# BEGIN MODULE: guard-install
# Interactive and headless installer. Headless never prompts.
# Prefix: guard_install_
set -eu

_guard_install_root() {
    printf '%s\n' "${GUARD_PREFIX:-}"
}

_guard_install_bin() {
    printf '%s/usr/bin/openclash-guard\n' "$(_guard_install_root)"
}

_guard_install_etc() {
    printf '%s/etc/openclash-guard\n' "$(_guard_install_root)"
}

_guard_install_init() {
    printf '%s/etc/init.d/openclash-guard\n' "$(_guard_install_root)"
}

_guard_install_hotplug() {
    printf '%s/etc/hotplug.d/firewall/99-openclash-guard\n' "$(_guard_install_root)"
}

_guard_install_fw4() {
    printf '%s/etc/openclash-guard/fw4.include\n' "$(_guard_install_root)"
}

_guard_install_oc_hook() {
    printf '%s/usr/lib/openclash-guard/on-openclash-restart\n' "$(_guard_install_root)"
}

_guard_install_write() {
    _guard_iw_dest=$1
    _guard_iw_mode=${2:-0644}
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would write %s\n' "$_guard_iw_dest"
        cat >/dev/null
        return 0
    fi
    mkdir -p "$(dirname "$_guard_iw_dest")"
    cat > "$_guard_iw_dest"
    chmod "$_guard_iw_mode" "$_guard_iw_dest"
}

_guard_install_copy() {
    _guard_ic_src=$1
    _guard_ic_dest=$2
    _guard_ic_mode=${3:-0644}
    if [ ! -f "$_guard_ic_src" ]; then
        return 1
    fi
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would copy %s -> %s\n' "$_guard_ic_src" "$_guard_ic_dest"
        return 0
    fi
    mkdir -p "$(dirname "$_guard_ic_dest")"
    cp "$_guard_ic_src" "$_guard_ic_dest"
    chmod "$_guard_ic_mode" "$_guard_ic_dest"
}

_guard_install_self() {
    _guard_is_dest=$(_guard_install_bin)
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would install %s\n' "$_guard_is_dest"
        return 0
    fi
    mkdir -p "$(dirname "$_guard_is_dest")"
    cp "$0" "$_guard_is_dest"
    chmod 0755 "$_guard_is_dest"
}

_guard_install_shebang() {
    printf '%s%s\n' '#!' "${1:-/bin/sh}"
}

_guard_install_script() {
    _guard_is_dest=$1
    _guard_is_interp=$2
    _guard_is_body=$3
    {
        _guard_install_shebang "$_guard_is_interp"
        printf '%s' "$_guard_is_body"
    } | _guard_install_write "$_guard_is_dest" 0755
}

_guard_install_hooks() {
    _guard_ih_bin=$(_guard_install_bin)
    _guard_install_script "$(_guard_install_init)" "/bin/sh /etc/rc.common" "\
# OpenClash Guard boot reconcile. Does not enable OpenClash.
START=99
STOP=10

start() {
	${_guard_ih_bin} reconcile
}

reload() {
	start
}

restart() {
	start
}
"
    _guard_ih_body="# Re-apply owned table. Does not enable OpenClash.
[ -x ${_guard_ih_bin} ] || exit 0
${_guard_ih_bin} reconcile
"
    _guard_install_script "$(_guard_install_hotplug)" "/bin/sh" "# fw4/firewall reload hook.
${_guard_ih_body}"
    _guard_install_script "$(_guard_install_fw4)" "/bin/sh" "# fw4 include.
${_guard_ih_body}"
    _guard_install_script "$(_guard_install_oc_hook)" "/bin/sh" "# Observe OpenClash restart.
${_guard_ih_body}"
    _guard_ih_oc="$(_guard_install_root)/etc/openclash"
    if [ -d "$_guard_ih_oc" ]; then
        _guard_install_script "${_guard_ih_oc}/openclash-guard-hook.sh" "/bin/sh" "# Drop-in observer.
${_guard_ih_body}"
    fi
}

_guard_install_policy_files() {
    _guard_ip_etc=$(_guard_install_etc)
    _guard_ip_pol=${GUARD_POLICY_SOURCE:-}
    _guard_ip_tpl=${GUARD_TEMPLATES_SOURCE:-}
    if [ -z "$_guard_ip_pol" ] && [ -n "${GUARD_POLICY_FILE:-}" ] && [ -f "${GUARD_POLICY_FILE}" ]; then
        _guard_ip_pol=$GUARD_POLICY_FILE
    fi
    if [ -n "$_guard_ip_pol" ] && [ -f "$_guard_ip_pol" ]; then
        _guard_install_copy "$_guard_ip_pol" "${_guard_ip_etc}/openclash-guard.json" 0644 || return $?
        if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
            GUARD_POLICY_FILE=${_guard_ip_etc}/openclash-guard.json
        fi
    fi
    if [ -z "$_guard_ip_tpl" ] && [ -n "$_guard_ip_pol" ]; then
        _guard_ip_sib=$(dirname "$_guard_ip_pol")/openclash-guard-templates.json
        if [ -f "$_guard_ip_sib" ]; then
            _guard_ip_tpl=$_guard_ip_sib
        fi
    fi
    if [ -z "$_guard_ip_tpl" ] && [ -n "${GUARD_TEMPLATES_FILE:-}" ] && [ -f "${GUARD_TEMPLATES_FILE}" ]; then
        _guard_ip_tpl=$GUARD_TEMPLATES_FILE
    fi
    if [ -n "$_guard_ip_tpl" ] && [ -f "$_guard_ip_tpl" ]; then
        _guard_install_copy "$_guard_ip_tpl" "${_guard_ip_etc}/openclash-guard-templates.json" 0644 || return $?
        if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
            GUARD_TEMPLATES_FILE=${_guard_ip_etc}/openclash-guard-templates.json
        fi
    fi
}

_guard_install_write_uci() {
    _guard_iu_mode=$1
    _guard_iu_ks=$2
    _guard_iu_dns=$3
    _guard_iu_game=$4
    _guard_iu_url=$5
    _guard_iu_clients=$6
    guard_intent_ensure_sections || return $?
    _guard_template_set openclash_guard.main.enabled 1
    _guard_template_set openclash_guard.main.mode "$_guard_iu_mode"
    _guard_template_set openclash_guard.main.kill_switch "$_guard_iu_ks"
    _guard_template_set openclash_guard.main.dns_kill_switch "$_guard_iu_dns"
    _guard_template_set openclash_guard.main.dns_ownership preserve
    _guard_template_set openclash_guard.main.policy_refresh 1
    if [ -n "$_guard_iu_url" ]; then
        _guard_template_set openclash_guard.main.policy_url "$_guard_iu_url"
    fi
    _guard_template_set openclash_guard.udp.enabled "$_guard_iu_game"
    _guard_template_set openclash_guard.udp.blanket_udp_bypass 0
    _guard_template_set openclash_guard.udp.protect_udp_443 1
    if [ -n "$_guard_iu_clients" ]; then
        if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
            for _guard_iu_c in $_guard_iu_clients
            do
                [ -n "$_guard_iu_c" ] || continue
                printf 'would add_list openclash_guard.udp.src_ip=%s\n' "$_guard_iu_c"
            done
        else
            uci_delete openclash_guard.udp.src_ip
            for _guard_iu_c in $_guard_iu_clients
            do
                [ -n "$_guard_iu_c" ] || continue
                uci_add_list openclash_guard.udp.src_ip "$_guard_iu_c"
            done
        fi
    fi
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        return 0
    fi
    uci_commit_if_changed openclash_guard || return $?
}

_guard_install_print_env() {
    cli_section "Environment"
    cli_kv "OpenWrt/fw4" "$(guard_env_get nft.available)"
    cli_kv "OpenClash" "$(guard_env_get openclash.running)"
    cli_kv "DNS backend" "$(guard_env_get dns.backend)"
    cli_kv "dnsmasq DNS" "$(guard_env_get dns.dnsmasqEnabled)"
    cli_kv "Direct region" "$(guard_env_get network.directRegion)"
    cli_kv "Gaming clients" "$(guard_env_get gaming.clients.count)"
}

_guard_install_print_proposed() {
    _guard_ipp_ks=$1
    _guard_ipp_dns=$2
    _guard_ipp_game=$3
    cli_section "Proposed policy"
    if [ "$_guard_ipp_ks" = 1 ]; then
        cli_kv "Global kill switch" enabled
    else
        cli_kv "Global kill switch" disabled
    fi
    cli_kv "AI service guard" enabled
    if [ "$_guard_ipp_game" = 1 ]; then
        cli_kv "Gaming UDP bypass" scoped
    else
        cli_kv "Gaming UDP bypass" disabled
    fi
    if [ "$_guard_ipp_dns" = 1 ]; then
        cli_kv "DNS kill switch" enabled
    else
        cli_kv "DNS kill switch" disabled
    fi
    cli_kv "Policy refresh" enabled
}

guard_cmd_install() {
    _guard_in_mode=auto
    _guard_in_url=
    _guard_in_ks=
    _guard_in_dns=
    _guard_in_game=
    _guard_in_norefresh=0
    _guard_in_clients=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --mode)
                _guard_in_mode=$2
                shift 2
                ;;
            --policy-url)
                _guard_in_url=$2
                shift 2
                ;;
            --enable-kill-switch)
                _guard_in_ks=1
                shift
                ;;
            --disable-kill-switch)
                _guard_in_ks=0
                shift
                ;;
            --enable-dns-kill-switch)
                _guard_in_dns=1
                shift
                ;;
            --disable-dns-kill-switch)
                _guard_in_dns=0
                shift
                ;;
            --enable-gaming-bypass)
                _guard_in_game=1
                shift
                ;;
            --disable-gaming-bypass)
                _guard_in_game=0
                shift
                ;;
            --gaming-client)
                _guard_in_clients="${_guard_in_clients} $2"
                shift 2
                ;;
            --no-refresh)
                _guard_in_norefresh=1
                shift
                ;;
            --yes|-y)
                cli_set_assume_yes 1
                shift
                ;;
            --dry-run)
                GUARD_DRY_RUN=1
                shift
                ;;
            --json)
                _GUARD_JSON=1
                shift
                ;;
            *)
                cli_die "unknown install option: $1" 2
                ;;
        esac
    done
    case $_guard_in_mode in
        auto|strict|manual)
            ;;
        *)
            cli_error "invalid --mode: $_guard_in_mode (auto|strict|manual)"
            return 2
            ;;
    esac
    _guard_in_ks_eff=${_guard_in_ks:-1}
    _guard_in_dns_eff=${_guard_in_dns:-0}
    _guard_in_game_eff=${_guard_in_game:-1}
    if [ "$_guard_in_mode" = strict ]; then
        _guard_in_ks_eff=${_guard_in_ks:-1}
    fi
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    if [ -f "$(_guard_policy_default_path)" ]; then
        guard_policy_load "$(_guard_policy_default_path)" 2>/dev/null || true
        guard_geo_detect_direct >/dev/null 2>&1 || true
        guard_env_detect
    fi
    if [ "$_GUARD_JSON" != 1 ]; then
        cli_section "OpenClash Guard Setup"
        _guard_install_print_env
        printf '\n'
        _guard_install_print_proposed "$_guard_in_ks_eff" "$_guard_in_dns_eff" "$_guard_in_game_eff"
        printf '\n'
        if [ -f "$(_guard_template_catalog_path)" ]; then
            GUARD_TEMPLATES_FILE=${GUARD_TEMPLATES_FILE:-$(_guard_template_catalog_path)}
            _guard_in_env=$(_guard_template_env_file) || _guard_in_env=
            if [ -n "$_guard_in_env" ]; then
                _guard_in_ids=$(guard_template_matches "${GUARD_TEMPLATES_FILE}" "$_guard_in_env") || _guard_in_ids=
                rm -f "$_guard_in_env"
                if [ -n "$_guard_in_ids" ]; then
                    cli_section "Suggested Templates"
                    for _guard_in_id in $_guard_in_ids
                    do
                        [ -n "$_guard_in_id" ] || continue
                        printf '\n'
                        _guard_template_print_one "${GUARD_TEMPLATES_FILE}" "$_guard_in_id" 0
                    done
                    printf '\n'
                    cli_info "suggestions are not auto-applied"
                fi
            fi
        fi
    fi
    if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
        if ! cli_confirm "Apply?"; then
            cli_error "refusing to install without confirmation (pass --yes)"
            return 1
        fi
    fi
    _guard_install_write_uci "$_guard_in_mode" "$_guard_in_ks_eff" "$_guard_in_dns_eff" "$_guard_in_game_eff" "$_guard_in_url" "$_guard_in_clients" || return $?
    _guard_install_self || return $?
    _guard_install_policy_files || return $?
    _guard_install_hooks || return $?
    if [ -n "$_guard_in_url" ]; then
        GUARD_POLICY_URL=$_guard_in_url
    fi
    if [ "$_guard_in_norefresh" != 1 ] && [ -n "${GUARD_POLICY_URL:-}" ] && [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
        if ! guard_cmd_refresh; then
            cli_warn "policy refresh failed; keeping last-known-good"
        else
            cli_info "installed and reconciled"
            return 0
        fi
    fi
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        cli_info "dry-run: install not written"
        return 0
    fi
    guard_cmd_reconcile
}
# END MODULE: guard-install

# BEGIN MODULE: guard-main
# openclash-guard CLI: apply/reconcile/status/doctor/refresh/remove/template/install/geo.
set -eu

_GUARD_JSON=0
_GUARD_LOCK_HELD=0

guard_usage() {
    printf '%s\n' "usage: openclash-guard apply|reconcile|status|doctor [SERVICE]|refresh|remove|eval|template|install|geo [--json] [--yes] [--dry-run] [--policy-file FILE]"
}

_guard_lock_path() {
    printf '%s\n' "${GUARD_LOCK_PATH:-/var/lock/openclash-guard.lock}"
}

_guard_lock_acquire() {
    _guard_lp=$(_guard_lock_path)
    lock_acquire "$_guard_lp" "${GUARD_LOCK_TIMEOUT:-30}" || return $?
    _GUARD_LOCK_HELD=1
}

_guard_lock_release() {
    if [ "$_GUARD_LOCK_HELD" = 1 ]; then
        lock_release "$(_guard_lock_path)" || true
        _GUARD_LOCK_HELD=0
    fi
}

_guard_distribution_state_path() {
    printf '%s\n' "${GUARD_DISTRIBUTION_STATE_FILE:-/etc/openclash-guard/distribution-state}"
}

_guard_distribution_selected() {
    _guard_ds_file=$(_guard_distribution_state_path)
    [ -f "$_guard_ds_file" ] || return 1
    sed -n 's/^selectedSource=//p' "$_guard_ds_file" | head -n 1
}

_guard_distribution_record() {
    [ "${GUARD_DRY_RUN:-0}" = 1 ] && return 0
    _guard_dr_file=$(_guard_distribution_state_path)
    mkdir -p "$(dirname "$_guard_dr_file")"
    printf 'selectedSource=%s\nlastRefresh=%s\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$_guard_dr_file"
}

_guard_prepare() {
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    guard_policy_load "$(_guard_policy_default_path)" || return $?
    guard_policy_refresh_state
}

_guard_write_batch() {
    _guard_wb=$1
    : > "$_guard_wb"
    {
        guard_kill_render
        guard_game_render
    } >> "$_guard_wb"
}

guard_cmd_reconcile() {
    _guard_prepare || return $?
    if [ "$_GUARD_NFT_AVAILABLE" != 1 ]; then
        cli_error "nft is required"
        return 1
    fi
    guard_migrate_stale
    if [ "$_GUARD_UCI_ENABLED" != 1 ]; then
        guard_kill_delete_table
        cli_info "openclash-guard disabled"
        return 0
    fi
    _guard_batch=$(file_mktemp)
    _guard_write_batch "$_guard_batch"
    guard_kill_apply_batch "$_guard_batch"
    _guard_rc=$?
    rm -f "$_guard_batch"
    if [ "$_guard_rc" -ne 0 ]; then
        return "$_guard_rc"
    fi
    cli_info "reconciled table $_GUARD_NFT_FAMILY $_GUARD_NFT_TABLE (state=$_GUARD_POLICY_STATE enforcement=$_GUARD_POLICY_ENFORCEMENT)"
}

guard_cmd_apply() {
    guard_cmd_reconcile
}

guard_cmd_remove() {
    if [ "$_GUARD_JSON" != 1 ]; then
        if ! cli_confirm "Remove openclash-guard nft table?"; then
            cli_warn "aborted"
            return 1
        fi
    fi
    guard_kill_read_uci
    guard_env_detect
    if [ -f "$(_guard_policy_default_path)" ]; then
        guard_policy_load "$(_guard_policy_default_path)" 2>/dev/null || true
    fi
    guard_migrate_stale
    guard_kill_delete_table
    cli_info "removed openclash-guard table"
}

guard_cmd_refresh() {
    _guard_refresh_source=${GUARD_POLICY_SOURCE:-auto}
    _guard_refresh_base=${GUARD_POLICY_BASE_URL:-}
    while [ "$#" -gt 0 ]; do
        case $1 in
            --source) _guard_refresh_source=$2; shift 2 ;;
            --base-url) _guard_refresh_base=$2; shift 2 ;;
            --policy-url) _guard_refresh_url=$2; shift 2 ;;
            *) cli_error "unknown refresh option: $1"; return 2 ;;
        esac
    done
    _guard_url=${_guard_refresh_url:-${GUARD_POLICY_URL:-}}
    if [ -z "$_guard_url" ] && command -v uci >/dev/null 2>&1; then
        _guard_url=$(uci_get_default openclash_guard.main.policy_url "" 2>/dev/null) || _guard_url=
    fi
    if [ -z "$_guard_url" ] && [ -n "$_guard_refresh_base" ]; then _guard_url=${_guard_refresh_base%/}/cfg/runtime/openclash-guard.json; fi
    _guard_dest=$(_guard_policy_default_path)
    _guard_dir=$(dirname "$_guard_dest")
    if [ ! -d "$_guard_dir" ]; then
        cli_error "policy directory missing: $_guard_dir"
        return 1
    fi
    if [ -n "$_guard_url" ]; then
        _guard_refresh_sources=override
    else
        _guard_refresh_sources="$_guard_refresh_source"
    fi
    if [ -z "$_guard_url" ] && [ "$_guard_refresh_source" = auto ]; then
        _guard_refresh_sources="jsdelivr github-raw"
        _guard_refresh_selected=$(_guard_distribution_selected 2>/dev/null) || _guard_refresh_selected=
        if [ -n "$_guard_refresh_selected" ]; then
            _guard_refresh_sources="$_guard_refresh_selected $_guard_refresh_sources"
        fi
    fi
    _guard_refresh_ok=0
    for _guard_refresh_item in $_guard_refresh_sources; do
        if [ -z "$_guard_url" ]; then
            case $_guard_refresh_item in
                *)
                    _guard_source_key=$_guard_refresh_item
                    [ "$_guard_refresh_item" = github-raw ] && _guard_source_key=raw
                    [ "$_guard_refresh_item" = jsdelivr ] && _guard_source_key=cdn
                    _guard_source_base=$(json_get "$_GUARD_POLICY_FILE" "distributionSources.$_guard_source_key.baseUrl" 2>/dev/null) || _guard_source_base=
                    if [ -z "$_guard_source_base" ]; then cli_error "unsupported distribution source: $_guard_refresh_item"; return 2; fi
                    _guard_url="$_guard_source_base/cfg/runtime/openclash-guard.json"
                    ;;
            esac
        fi
        if fetch_atomic "$_guard_url" "$_guard_dest" guard_policy_validate_file; then
            _guard_refresh_ok=1
            _guard_distribution_record "$_guard_refresh_item"
            break
        fi
        _guard_url=
    done
    if [ "$_guard_refresh_ok" != 1 ]; then
        cli_error "refresh failed; keeping last-known-good policy and firewall state"
        return 1
    fi
    guard_cmd_reconcile
}

_guard_emit_status_json() {
    _guard_sj=$(guard_env_json)
    _guard_sj=${_guard_sj%?}
    printf '%s,' "$_guard_sj"
    guard_policy_json_extra
    printf '}\n'
}

guard_cmd_status() {
    _guard_prepare || true
    if [ "$_GUARD_JSON" = 1 ]; then
        _guard_emit_status_json
        return 0
    fi
    cli_section "openclash-guard status"
    cli_kv openclash.installed "$(guard_env_get openclash.installed)"
    cli_kv openclash.enabled "$(guard_env_get openclash.enabled)"
    cli_kv openclash.running "$(guard_env_get openclash.running)"
    cli_kv openclash.healthy "$(guard_env_get openclash.healthy)"
    cli_kv dns.backend "$(guard_env_get dns.backend)"
    cli_kv dns.domainSetBackend "$(guard_env_get dns.domainSetBackend)"
    cli_kv network.directRegion "$(guard_env_get network.directRegion)"
    cli_kv proxy.region "$(guard_env_get proxy.region)"
    cli_kv proxy.healthy "$(guard_env_get proxy.healthy)"
    cli_kv gaming.clients.count "$(guard_env_get gaming.clients.count)"
    cli_kv nft.available "$(guard_env_get nft.available)"
    cli_kv state "$_GUARD_POLICY_STATE"
    cli_kv enforcement "$_GUARD_POLICY_ENFORCEMENT"
    cli_kv distribution.selectedSource "$(_guard_distribution_selected 2>/dev/null || printf 'none')"
}

guard_cmd_doctor() {
    _guard_doctor_service=${1:-}
    guard_cmd_status
    if [ "$_GUARD_JSON" = 1 ]; then
        return 0
    fi
    cli_section "doctor"
    cli_kv dns.dnsmasqEnabled "$(guard_env_get dns.dnsmasqEnabled)"
    cli_kv dns.dnsmasqRunning "$(guard_env_get dns.dnsmasqRunning)"
    cli_kv dns.adguardhomeEnabled "$(guard_env_get dns.adguardhomeEnabled)"
    cli_kv dns.adguardhomeRunning "$(guard_env_get dns.adguardhomeRunning)"
    if [ "$_GUARD_DNS_BACKEND" = adguardhome ]; then
        cli_info "AdGuard Home owns DNS; dnsmasq will not be enabled, started, or restarted"
    fi
    if [ "$_GUARD_DNS_DOMAIN_SET" = unavailable ] && guard_policy_needs_failclosed 2>/dev/null; then
        cli_warn "domain-set backend unavailable; fail-closed enforcement=reject (not fail-open)"
    fi
    cli_info "gaming bypass never matches protected UDP ports (including 443)"
    if [ -n "$_guard_doctor_service" ]; then
        # shellcheck disable=SC2153
        if ! json_has "$_GUARD_POLICY_FILE" "services.$_guard_doctor_service"; then
            cli_error "unknown service: $_guard_doctor_service"
            return 2
        fi
        cli_section "$_guard_doctor_service dependency check"
        _guard_doctor_dependencies=$(json_keys "$_GUARD_POLICY_FILE" "services.$_guard_doctor_service.dependencies" 2>/dev/null) || _guard_doctor_dependencies=
        if [ -z "$_guard_doctor_dependencies" ]; then
            cli_info "no configured dependencies"
            return 0
        fi
        for _guard_doctor_dep in $_guard_doctor_dependencies
        do
            _guard_doctor_base="services.$_guard_doctor_service.dependencies.$_guard_doctor_dep"
            _guard_doctor_host=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.host") || _guard_doctor_host=
            _guard_doctor_role=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.role") || _guard_doctor_role=
            _guard_doctor_required=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.required") || _guard_doctor_required=false
            _guard_doctor_route=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.routePolicy") || _guard_doctor_route=
            _guard_doctor_path=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.path") || _guard_doctor_path=/
            _guard_doctor_granularity=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.matcher.availableGranularity") || _guard_doctor_granularity=host
            _guard_doctor_scope=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.matcher.scopeExpansion") || _guard_doctor_scope=false
            _guard_doctor_status=UNKNOWN
            if [ "$_GUARD_DEPENDENCY_FAILURE" = 0 ]; then _guard_doctor_status=PASS; fi
            printf '  %s [%s] %s\n' "$_guard_doctor_dep" "$_guard_doctor_status" "$_guard_doctor_host"
            cli_kv role "$_guard_doctor_role"
            cli_kv required "$_guard_doctor_required"
            cli_kv routePolicy "$_guard_doctor_route"
            cli_kv path "$_guard_doctor_path"
            cli_kv matcher "$_guard_doctor_granularity"
            if [ "$_guard_doctor_scope" = true ]; then
                cli_warn "host matcher broadens path scope; explicit approval required"
            fi
        done
    fi
}

guard_cmd_geo() {
    _guard_geo_sub=${1:-}
    if [ "$#" -gt 0 ]; then
        shift
    fi
    case $_guard_geo_sub in
        direct)
            _guard_prepare || true
            guard_geo_detect_direct
            ;;
        route)
            if [ -z "${1:-}" ]; then
                cli_error "usage: openclash-guard geo route <id>"
                return 2
            fi
            _guard_prepare || true
            guard_geo_detect_route "$1"
            ;;
        *)
            printf '%s\n' "usage: openclash-guard geo direct|route <id>" >&2
            return 2
            ;;
    esac
}

guard_cmd_eval() {
    _guard_ev_svc=
    _guard_ev_proto=udp
    _guard_ev_dport=
    _guard_ev_src=
    _guard_ev_dest=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --service)
                _guard_ev_svc=$2
                shift 2
                ;;
            --proto)
                _guard_ev_proto=$2
                shift 2
                ;;
            --dport)
                _guard_ev_dport=$2
                shift 2
                ;;
            --src)
                _guard_ev_src=$2
                shift 2
                ;;
            --dest)
                _guard_ev_dest=$2
                shift 2
                ;;
            *)
                cli_die "unknown eval option: $1" 2
                ;;
        esac
    done
    _guard_prepare || return $?
    _guard_ev_verdict=$(guard_policy_eval "$_guard_ev_svc" "$_guard_ev_proto" "$_guard_ev_dport" "$_guard_ev_src" "$_guard_ev_dest")
    if [ "$_GUARD_JSON" = 1 ]; then
        printf '{"verdict":"%s","service":"%s","proto":"%s","dport":"%s","src":"%s","dest":"%s"}\n' \
            "$(_guard_env_json_string "$_guard_ev_verdict")" \
            "$(_guard_env_json_string "$_guard_ev_svc")" \
            "$(_guard_env_json_string "$_guard_ev_proto")" \
            "$(_guard_env_json_string "$_guard_ev_dport")" \
            "$(_guard_env_json_string "$_guard_ev_src")" \
            "$(_guard_env_json_string "$_guard_ev_dest")"
        return 0
    fi
    printf '%s\n' "$_guard_ev_verdict"
}

_guard_cmd_needs_lock() {
    case $1 in
        status|doctor|eval|geo)
            return 1
            ;;
        template)
            case $2 in
                apply)
                    return 0
                    ;;
                *)
                    return 1
                    ;;
            esac
            ;;
        *)
            return 0
            ;;
    esac
}

main() {
    _GUARD_JSON=0
    _guard_cmd=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --json)
                _GUARD_JSON=1
                shift
                ;;
            --yes|-y)
                cli_set_assume_yes 1
                shift
                ;;
            --dry-run)
                GUARD_DRY_RUN=1
                shift
                ;;
            --policy-file)
                GUARD_POLICY_FILE=$2
                shift 2
                ;;
            -h|--help)
                guard_usage
                return 0
                ;;
            apply|reconcile|status|doctor|refresh|remove|eval|template|install|geo)
                [ -z "$_guard_cmd" ] || break
                _guard_cmd=$1
                shift
                ;;
            *)
                [ -n "$_guard_cmd" ] && break
                cli_die "unknown argument: $1" 2
                ;;
        esac
    done
    if [ -z "$_guard_cmd" ]; then
        guard_usage >&2
        return 2
    fi
    if _guard_cmd_needs_lock "$_guard_cmd" "${1:-}"; then
        _guard_lock_acquire || return $?
        trap _guard_lock_release EXIT INT TERM
    fi
    _guard_rc=0
    case $_guard_cmd in
        apply) guard_cmd_apply || _guard_rc=$? ;;
        reconcile) guard_cmd_reconcile || _guard_rc=$? ;;
        status) guard_cmd_status || _guard_rc=$? ;;
        doctor) guard_cmd_doctor "$@" || _guard_rc=$? ;;
        refresh) guard_cmd_refresh "$@" || _guard_rc=$? ;;
        remove) guard_cmd_remove || _guard_rc=$? ;;
        eval) guard_cmd_eval "$@" || _guard_rc=$? ;;
        template) guard_cmd_template "$@" || _guard_rc=$? ;;
        install) guard_cmd_install "$@" || _guard_rc=$? ;;
        geo) guard_cmd_geo "$@" || _guard_rc=$? ;;
        *)
            guard_usage >&2
            _guard_rc=2
            ;;
    esac
    _guard_lock_release
    trap - EXIT INT TERM
    return "$_guard_rc"
}
# END MODULE: guard-main

main "$@"
