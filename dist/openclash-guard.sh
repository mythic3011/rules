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

cli_tty_path() {
    printf '%s\n' "${CLI_TTY_PATH:-/dev/tty}"
}

cli_has_controlling_tty() {
    _cli_ht_path=$(cli_tty_path)
    if (exec 9<>"$_cli_ht_path") 2>/dev/null; then
        return 0
    fi
    [ -t 0 ]
}

cli_read_tty() {
    _cli_rt_path=$(cli_tty_path)
    if (exec 9<>"$_cli_rt_path") 2>/dev/null; then
        IFS= read -r _cli_rt_value < "$_cli_rt_path" || return 1
    else
        IFS= read -r _cli_rt_value || return 1
    fi
    printf '%s\n' "$_cli_rt_value"
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
    if ! cli_has_controlling_tty; then
        return 1
    fi
    printf '%s [y/N] ' "${1:-Continue?}" >&2
    _cli_confirm_ans=$(cli_read_tty) || return 1
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

# BEGIN MODULE: distribution
# Generated distribution catalog for cold-start runtime policy refresh.
# Prefix: guard_distribution_
set -eu

# BEGIN GENERATED DISTRIBUTION CATALOG
_GUARD_DISTRIBUTION_RAW_BASE="https://raw.githubusercontent.com/mythic3011/rules/refs/heads/main"
_GUARD_DISTRIBUTION_CDN_BASE="https://cdn.jsdelivr.net/gh/mythic3011/rules@main"
_GUARD_DISTRIBUTION_ARTIFACT="dist/openclash-guard.sh"
_GUARD_DISTRIBUTION_MANIFEST="dist/manifest.json"
_GUARD_DISTRIBUTION_CHECKSUM="dist/openclash-guard.sha256"
_GUARD_DISTRIBUTION_POLICY="cfg/runtime/openclash-guard.json"
_GUARD_DISTRIBUTION_TEMPLATES="cfg/runtime/openclash-guard-templates.json"
# END GENERATED DISTRIBUTION CATALOG

_guard_distribution_base() {
    _guard_ds_source=${1:-}
    _guard_ds_override=${2:-}
    if [ -n "$_guard_ds_override" ]; then
        printf '%s\n' "${_guard_ds_override%/}"
        return 0
    fi
    case $_guard_ds_source in
        github-raw|raw) printf '%s\n' "$_GUARD_DISTRIBUTION_RAW_BASE" ;;
        jsdelivr|cdn) printf '%s\n' "$_GUARD_DISTRIBUTION_CDN_BASE" ;;
        *) return 1 ;;
    esac
}

_guard_distribution_url() {
    _guard_du_base=$(_guard_distribution_base "${1:-}" "${3:-}") || return $?
    printf '%s/%s\n' "$_guard_du_base" "${2#/}"
}

_guard_distribution_policy_url() {
    _guard_distribution_url "${1:-}" "$_GUARD_DISTRIBUTION_POLICY" "${2:-}"
}

_guard_distribution_templates_url() {
    _guard_distribution_url "${1:-}" "$_GUARD_DISTRIBUTION_TEMPLATES" "${2:-}"
}

guard_distribution_validate_bundle() {
    _guard_dv_file=${1:-}
    [ -s "$_guard_dv_file" ] || return 1
    _guard_dv_shebang=$(printf '%s%s' '#!' '/bin/sh')
    [ "$(sed -n '1p' "$_guard_dv_file")" = "$_guard_dv_shebang" ] || return 1
    [ "$(awk -v expected="$_guard_dv_shebang" '$0 == expected { count++ } END { print count + 0 }' "$_guard_dv_file")" -eq 1 ] || return 1
    [ "$(grep -c '^main "\$@"$' "$_guard_dv_file")" -eq 1 ] || return 1
    grep -q '^# GENERATED FILE' "$_guard_dv_file" || return 1
    /bin/sh -n "$_guard_dv_file"
}

guard_distribution_fetch_bundle() {
    _guard_df_dest=${1:-}
    _guard_df_source=${2:-auto}
    [ -n "$_guard_df_dest" ] || return 2
    case $_guard_df_source in
        auto) _guard_df_sources="github-raw jsdelivr" ;;
        github-raw|raw|jsdelivr|cdn) _guard_df_sources=$_guard_df_source ;;
        *) return 2 ;;
    esac
    mkdir -p "$(dirname "$_guard_df_dest")"
    for _guard_df_item in $_guard_df_sources; do
        _guard_df_artifact=$(file_mktemp) || return 1
        _guard_df_checksum=$(file_mktemp) || { rm -f "$_guard_df_artifact"; return 1; }
        _guard_df_manifest=$(file_mktemp) || { rm -f "$_guard_df_artifact" "$_guard_df_checksum"; return 1; }
        _guard_df_artifact_url=$(_guard_distribution_url "$_guard_df_item" "$_GUARD_DISTRIBUTION_ARTIFACT") || continue
        _guard_df_checksum_url=$(_guard_distribution_url "$_guard_df_item" "$_GUARD_DISTRIBUTION_CHECKSUM") || continue
        _guard_df_manifest_url=$(_guard_distribution_url "$_guard_df_item" "$_GUARD_DISTRIBUTION_MANIFEST") || continue
        if fetch_http "$_guard_df_artifact_url" "$_guard_df_artifact" && \
            fetch_http "$_guard_df_checksum_url" "$_guard_df_checksum" && \
            fetch_http "$_guard_df_manifest_url" "$_guard_df_manifest"; then
            _guard_df_expected=$(awk 'NF {print $1; exit}' "$_guard_df_checksum")
            _guard_df_actual=$(file_sha256 "$_guard_df_artifact") || _guard_df_actual=
            _guard_df_paired=$(sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]*\)".*/\1/p' "$_guard_df_manifest" | head -n 1)
            if [ -n "$_guard_df_actual" ] && \
                [ "$_guard_df_actual" = "$_guard_df_expected" ] && \
                [ "$_guard_df_actual" = "$_guard_df_paired" ] && \
                guard_distribution_validate_bundle "$_guard_df_artifact" && \
                file_atomic_replace "$_guard_df_dest" "$_guard_df_artifact"; then
                chmod 0755 "$_guard_df_dest"
                rm -f "$_guard_df_artifact" "$_guard_df_checksum" "$_guard_df_manifest"
                return 0
            fi
        fi
        rm -f "$_guard_df_artifact" "$_guard_df_checksum" "$_guard_df_manifest"
    done
    return 1
}
# END MODULE: distribution

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
    _fetch_c_https_only=${4:-0}
    _fetch_c_max_bytes=${5:-}
    if [ "$_fetch_c_https_only" = 1 ]; then
        case $_fetch_c_url in
            https://*) ;;
            *) printf '%s\n' "fetch: secure fetch requires an HTTPS URL" >&2; return 2 ;;
        esac
        _fetch_c_blocks=$(((_fetch_c_max_bytes + 511) / 512))
        (
            ulimit -f "$_fetch_c_blocks"
            curl -fLSs --max-redirs 0 --proto '=https' --proto-redir '=https' \
                --max-filesize "$_fetch_c_max_bytes" \
                --connect-timeout "$_fetch_c_timeout" --max-time "$_fetch_c_timeout" \
                -o "$_fetch_c_out" "$_fetch_c_url"
        )
        return $?
    fi
    curl -fLSs --connect-timeout "$_fetch_c_timeout" --max-time "$_fetch_c_timeout" -o "$_fetch_c_out" "$_fetch_c_url"
}

_fetch_http_wget() {
    _fetch_w_url=$1
    _fetch_w_out=$2
    _fetch_w_timeout=$3
    _fetch_w_https_only=${4:-0}
    if [ "$_fetch_w_https_only" = 1 ]; then
        printf '%s\n' "fetch: HTTPS-only redirect enforcement requires curl" >&2
        return 127
    fi
    wget -q -O "$_fetch_w_out" -T "$_fetch_w_timeout" "$_fetch_w_url"
}

_fetch_http_direct_curl() {
    _fetch_dc_url=$1
    _fetch_dc_out=$2
    _fetch_dc_timeout=$3
    curl -fLSs --noproxy '*' --proxy '' \
        --connect-timeout "$_fetch_dc_timeout" --max-time "$_fetch_dc_timeout" \
        -o "$_fetch_dc_out" "$_fetch_dc_url"
}

_fetch_http_direct_wget() {
    _fetch_dw_url=$1
    _fetch_dw_out=$2
    _fetch_dw_timeout=$3
    http_proxy= https_proxy= HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= all_proxy= \
        wget -q -O "$_fetch_dw_out" -T "$_fetch_dw_timeout" "$_fetch_dw_url"
}

_fetch_http_proxy_curl() {
    _fetch_pc_url=$1
    _fetch_pc_out=$2
    _fetch_pc_timeout=$3
    _fetch_pc_proxy=$4
    _fetch_pc_auth=${5:-}
    if [ -n "$_fetch_pc_auth" ]; then
        curl -fLSs --proxy "$_fetch_pc_proxy" --proxy-user "$_fetch_pc_auth" \
            --connect-timeout "$_fetch_pc_timeout" --max-time "$_fetch_pc_timeout" \
            -o "$_fetch_pc_out" "$_fetch_pc_url"
        return $?
    fi
    curl -fLSs --proxy "$_fetch_pc_proxy" \
        --connect-timeout "$_fetch_pc_timeout" --max-time "$_fetch_pc_timeout" \
        -o "$_fetch_pc_out" "$_fetch_pc_url"
}

_fetch_http_with_mode() {
    _fetch_hm_mode=$1
    _fetch_hm_url=$2
    _fetch_hm_out=$3
    _fetch_hm_timeout=$4
    _fetch_hm_proxy=${5:-}
    _fetch_hm_auth=${6:-}
    case $_fetch_hm_mode in
        direct)
            if command -v curl >/dev/null 2>&1; then
                _fetch_http_direct_curl "$_fetch_hm_url" "$_fetch_hm_out" "$_fetch_hm_timeout"
            elif command -v wget >/dev/null 2>&1; then
                _fetch_http_direct_wget "$_fetch_hm_url" "$_fetch_hm_out" "$_fetch_hm_timeout"
            else
                printf '%s\n' "fetch: curl or wget is required" >&2
                return 127
            fi
            ;;
        proxy)
            if ! command -v curl >/dev/null 2>&1; then
                printf '%s\n' "fetch: proxy probe requires curl" >&2
                return 127
            fi
            _fetch_http_proxy_curl "$_fetch_hm_url" "$_fetch_hm_out" "$_fetch_hm_timeout" "$_fetch_hm_proxy" "$_fetch_hm_auth"
            ;;
        *)
            printf '%s\n' "fetch: unknown HTTP mode: $_fetch_hm_mode" >&2
            return 2
            ;;
    esac
}

fetch_http_direct() {
    _fetch_hd_url=${1:-}
    _fetch_hd_out=${2:-}
    [ -n "$_fetch_hd_url" ] && [ -n "$_fetch_hd_out" ] || {
        printf '%s\n' "fetch_http_direct: usage: fetch_http_direct URL OUTPUT [TIMEOUT]" >&2
        return 2
    }
    _fetch_hd_timeout=$(_fetch_timeout_secs "${3:-}") || return $?
    _fetch_hd_tmp=$(file_mktemp "$(dirname "$_fetch_hd_out")") || return 1
    _fetch_hd_rc=0
    _fetch_http_with_mode direct "$_fetch_hd_url" "$_fetch_hd_tmp" "$_fetch_hd_timeout" || _fetch_hd_rc=$?
    if [ "$_fetch_hd_rc" -ne 0 ]; then
        rm -f "$_fetch_hd_tmp"
        return "$_fetch_hd_rc"
    fi
    if [ ! -s "$_fetch_hd_tmp" ] || ! mv -f "$_fetch_hd_tmp" "$_fetch_hd_out"; then
        rm -f "$_fetch_hd_tmp"
        return 1
    fi
}

fetch_http_proxy() {
    _fetch_hp_url=${1:-}
    _fetch_hp_out=${2:-}
    _fetch_hp_proxy=${3:-}
    [ -n "$_fetch_hp_url" ] && [ -n "$_fetch_hp_out" ] && [ -n "$_fetch_hp_proxy" ] || {
        printf '%s\n' "fetch_http_proxy: usage: fetch_http_proxy URL OUTPUT PROXY [TIMEOUT] [AUTH]" >&2
        return 2
    }
    _fetch_hp_timeout=$(_fetch_timeout_secs "${4:-}") || return $?
    _fetch_hp_tmp=$(file_mktemp "$(dirname "$_fetch_hp_out")") || return 1
    _fetch_hp_rc=0
    _fetch_http_with_mode proxy "$_fetch_hp_url" "$_fetch_hp_tmp" "$_fetch_hp_timeout" "$_fetch_hp_proxy" "${5:-}" || _fetch_hp_rc=$?
    if [ "$_fetch_hp_rc" -ne 0 ]; then
        rm -f "$_fetch_hp_tmp"
        return "$_fetch_hp_rc"
    fi
    if [ ! -s "$_fetch_hp_tmp" ] || ! mv -f "$_fetch_hp_tmp" "$_fetch_hp_out"; then
        rm -f "$_fetch_hp_tmp"
        return 1
    fi
}

fetch_http() {
    _fetch_http_url=${1:-}
    _fetch_http_out=${2:-}
    if [ -z "$_fetch_http_url" ] || [ -z "$_fetch_http_out" ]; then
        printf '%s\n' "fetch_http: usage: fetch_http URL OUTPUT [TIMEOUT [HTTPS_ONLY [MAX_BYTES]]]" >&2
        return 2
    fi
    _fetch_http_timeout=$(_fetch_timeout_secs "${3:-}") || return $?
    _fetch_http_https_only=${4:-0}
    _fetch_http_max_bytes=${5:-}
    case $_fetch_http_https_only in
        0|1) ;;
        *) printf '%s\n' "fetch_http: HTTPS-only mode must be 0 or 1" >&2; return 2 ;;
    esac
    if [ "$_fetch_http_https_only" = 1 ]; then
        case $_fetch_http_max_bytes in
            ''|*[!0-9]*|0) printf '%s\n' "fetch_http: secure fetch requires a positive byte limit" >&2; return 2 ;;
        esac
    fi
    _fetch_http_dir=$(dirname "$_fetch_http_out")
    _fetch_http_tmp=$(file_mktemp "$_fetch_http_dir") || return 1
    _fetch_http_rc=0
    if command -v curl >/dev/null 2>&1; then
        _fetch_http_curl "$_fetch_http_url" "$_fetch_http_tmp" "$_fetch_http_timeout" "$_fetch_http_https_only" "$_fetch_http_max_bytes" || _fetch_http_rc=$?
    elif command -v wget >/dev/null 2>&1; then
        _fetch_http_wget "$_fetch_http_url" "$_fetch_http_tmp" "$_fetch_http_timeout" "$_fetch_http_https_only" || _fetch_http_rc=$?
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
        printf '%s\n' "fetch_atomic: usage: fetch_atomic URL DEST [VALIDATOR [TIMEOUT [MAX_BYTES [HTTPS_ONLY]]]]" >&2
        return 2
    fi
    _fetch_at_dir=$(dirname "$_fetch_at_dest")
    if [ ! -d "$_fetch_at_dir" ]; then
        printf '%s\n' "fetch_atomic: destination directory missing: $_fetch_at_dir" >&2
        return 1
    fi
    _fetch_at_tmp=$(file_mktemp "$_fetch_at_dir") || return 1
    if ! fetch_http "$_fetch_at_url" "$_fetch_at_tmp" "${4:-}" "${6:-0}" "${5:-}"; then
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

# BEGIN MODULE: guard-overlay
# Guard-owned OpenClash custom-overwrite integration for staged rule providers.
# Prefix: guard_overlay_
set -eu

_GUARD_OVERLAY_BEGIN="# BEGIN openclash-guard rules"
_GUARD_OVERLAY_END="# END openclash-guard rules"
_GUARD_OVERLAY_RUNTIME_BIN=${GUARD_OVERLAY_RUNTIME_BIN:-/usr/bin/openclash-guard}

guard_overlay_provider_specs() {
    printf '%s\n' \
        "Custom_Direct_Domain domain Custom_Direct_Domain.yaml" \
        "Custom_Direct_Classical_IP classical Custom_Direct_Classical_IP.yaml" \
        "Custom_Proxy_Domain domain Custom_Proxy_Domain.yaml" \
        "Custom_Proxy_Classical_IP classical Custom_Proxy_Classical_IP.yaml"
}

_guard_overlay_hook_path() {
    if [ -n "${GUARD_OPENCLASH_CUSTOM_OVERWRITE:-}" ]; then
        printf '%s\n' "$GUARD_OPENCLASH_CUSTOM_OVERWRITE"
        return 0
    fi
    printf '%s/etc/openclash/custom/openclash_custom_overwrite.sh\n' "${GUARD_PREFIX:-}"
}

_guard_overlay_backup_path() {
    if [ -n "${GUARD_OVERLAY_BACKUP_FILE:-}" ]; then
        printf '%s\n' "$GUARD_OVERLAY_BACKUP_FILE"
        return 0
    fi
    printf '%s/etc/openclash-guard/backups/openclash_custom_overwrite.sh\n' "${GUARD_PREFIX:-}"
}

_guard_overlay_provider_root() {
    if [ -n "${GUARD_RULES_DIR:-}" ]; then
        printf '%s/providers\n' "${GUARD_RULES_DIR%/}"
        return 0
    fi
    printf '%s/etc/openclash-guard/rules/providers\n' "${GUARD_PREFIX:-}"
}

_guard_overlay_marker_count() {
    _guard_omc_file=$1
    _guard_omc_marker=$2
    awk -v marker="$_guard_omc_marker" '$0 == marker { count++ } END { print count + 0 }' "$_guard_omc_file"
}

_guard_overlay_validate_hook() {
    _guard_ovh_file=$1
    if [ ! -f "$_guard_ovh_file" ] || [ -L "$_guard_ovh_file" ]; then
        cli_error "OpenClash custom-overwrite hook is missing or not a regular file: $_guard_ovh_file"
        return 1
    fi
    if ! /bin/sh -n "$_guard_ovh_file"; then
        cli_error "OpenClash custom-overwrite hook has invalid shell syntax: $_guard_ovh_file"
        return 1
    fi
    if ! grep -E '^[[:space:]]*CONFIG_FILE=.*\$1' "$_guard_ovh_file" >/dev/null 2>&1; then
        cli_error "OpenClash custom-overwrite hook does not expose CONFIG_FILE from its first argument"
        return 1
    fi
    _guard_ovh_begin=$(_guard_overlay_marker_count "$_guard_ovh_file" "$_GUARD_OVERLAY_BEGIN") || return 1
    _guard_ovh_end=$(_guard_overlay_marker_count "$_guard_ovh_file" "$_GUARD_OVERLAY_END") || return 1
    if { [ "$_guard_ovh_begin" -ne 0 ] || [ "$_guard_ovh_end" -ne 0 ]; } && \
       { [ "$_guard_ovh_begin" -ne 1 ] || [ "$_guard_ovh_end" -ne 1 ]; }; then
        cli_error "OpenClash custom-overwrite hook has unexpected Guard marker shape"
        return 1
    fi
    _guard_ovh_exits=$(awk '/^[[:space:]]*exit[[:space:]]+0[[:space:]]*$/ { count++ } END { print count + 0 }' "$_guard_ovh_file") || return 1
    if [ "$_guard_ovh_exits" -ne 1 ]; then
        cli_error "OpenClash custom-overwrite hook must contain exactly one terminal 'exit 0'"
        return 1
    fi
}

_guard_overlay_strip_block() {
    _guard_osb_source=$1
    _guard_osb_dest=$2
    awk -v begin="$_GUARD_OVERLAY_BEGIN" -v end="$_GUARD_OVERLAY_END" '
        $0 == begin {
            if (inside) exit 2
            inside = 1
            next
        }
        $0 == end {
            if (!inside) exit 2
            inside = 0
            next
        }
        !inside { print }
        END { if (inside) exit 2 }
    ' "$_guard_osb_source" > "$_guard_osb_dest"
}

_guard_overlay_write_block() {
    _guard_owb_dest=$1
    cat > "$_guard_owb_dest" <<EOF
$_GUARD_OVERLAY_BEGIN
if [ ! -x "$_GUARD_OVERLAY_RUNTIME_BIN" ]; then
    printf '%s\n' "openclash-guard: rules overlay runtime is missing" >&2
    exit 1
fi
"$_GUARD_OVERLAY_RUNTIME_BIN" rules apply-overlay "\${CONFIG_FILE:-}" || exit \$?
$_GUARD_OVERLAY_END
EOF
}

_guard_overlay_insert_block() {
    _guard_oib_source=$1
    _guard_oib_block=$2
    _guard_oib_dest=$3
    awk -v block="$_guard_oib_block" '
        BEGIN {
            rendered = ""
            while ((getline line < block) > 0) rendered = rendered line ORS
            close(block)
        }
        /^[[:space:]]*exit[[:space:]]+0[[:space:]]*$/ && !inserted {
            printf "%s", rendered
            inserted = 1
        }
        { print }
        END { if (!inserted) exit 3 }
    ' "$_guard_oib_source" > "$_guard_oib_dest"
}

guard_overlay_is_active() {
    _guard_oia_hook=$(_guard_overlay_hook_path)
    [ -f "$_guard_oia_hook" ] || return 1
    [ "$(_guard_overlay_marker_count "$_guard_oia_hook" "$_GUARD_OVERLAY_BEGIN")" -eq 1 ] && \
        [ "$(_guard_overlay_marker_count "$_guard_oia_hook" "$_GUARD_OVERLAY_END")" -eq 1 ]
}

guard_overlay_activate() {
    _guard_oa_yes=0
    while [ "$#" -gt 0 ]; do
        case $1 in
            --yes|-y) _guard_oa_yes=1; shift ;;
            *) cli_error "unknown rules activate option: $1"; return 2 ;;
        esac
    done
    [ "$_guard_oa_yes" -eq 1 ] && cli_set_assume_yes 1
    _guard_oa_hook=$(_guard_overlay_hook_path)
    _guard_overlay_validate_hook "$_guard_oa_hook" || return $?
    if ! cli_confirm "Install the marked OpenClash Guard rule-provider overlay?"; then
        cli_error "refusing to activate staged rules without confirmation (pass --yes)"
        return 1
    fi
    _guard_oa_dir=$(dirname "$_guard_oa_hook")
    _guard_oa_stripped=$(file_mktemp "$_guard_oa_dir") || return 1
    _guard_oa_block=$(file_mktemp "$_guard_oa_dir") || {
        rm -f "$_guard_oa_stripped"
        return 1
    }
    _guard_oa_candidate=$(file_mktemp "$_guard_oa_dir") || {
        rm -f "$_guard_oa_stripped" "$_guard_oa_block"
        return 1
    }
    if ! _guard_overlay_strip_block "$_guard_oa_hook" "$_guard_oa_stripped" || \
       ! _guard_overlay_write_block "$_guard_oa_block" || \
       ! _guard_overlay_insert_block "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate" || \
       ! /bin/sh -n "$_guard_oa_candidate" || \
       [ "$(_guard_overlay_marker_count "$_guard_oa_candidate" "$_GUARD_OVERLAY_BEGIN")" -ne 1 ] || \
       [ "$(_guard_overlay_marker_count "$_guard_oa_candidate" "$_GUARD_OVERLAY_END")" -ne 1 ]; then
        rm -f "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate"
        cli_error "unable to construct a valid OpenClash custom-overwrite hook; keeping last-good"
        return 1
    fi
    _guard_oa_backup=$(_guard_overlay_backup_path)
    if [ ! -e "$_guard_oa_backup" ]; then
        mkdir -p "$(dirname "$_guard_oa_backup")"
        if ! cp -p "$_guard_oa_hook" "$_guard_oa_backup"; then
            rm -f "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate"
            cli_error "unable to back up OpenClash custom-overwrite hook"
            return 1
        fi
    fi
    if ! cmp -s "$_guard_oa_hook" "$_guard_oa_candidate"; then
        if ! file_atomic_replace "$_guard_oa_hook" "$_guard_oa_candidate"; then
            rm -f "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate"
            cli_error "unable to publish OpenClash custom-overwrite hook; keeping last-good"
            return 1
        fi
    fi
    rm -f "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate"
    cli_success "rule-provider overlay activated; restart OpenClash to apply it"
}

guard_overlay_deactivate() {
    _guard_od_yes=0
    while [ "$#" -gt 0 ]; do
        case $1 in
            --yes|-y) _guard_od_yes=1; shift ;;
            *) cli_error "unknown rules deactivate option: $1"; return 2 ;;
        esac
    done
    [ "$_guard_od_yes" -eq 1 ] && cli_set_assume_yes 1
    _guard_od_hook=$(_guard_overlay_hook_path)
    if [ ! -f "$_guard_od_hook" ]; then
        cli_info "rule-provider overlay is not installed"
        return 0
    fi
    _guard_overlay_validate_hook "$_guard_od_hook" || return $?
    if ! guard_overlay_is_active; then
        cli_info "rule-provider overlay is not installed"
        return 0
    fi
    if ! cli_confirm "Remove only the marked OpenClash Guard rule-provider overlay?"; then
        cli_error "refusing to deactivate rules without confirmation (pass --yes)"
        return 1
    fi
    _guard_od_candidate=$(file_mktemp "$(dirname "$_guard_od_hook")") || return 1
    if ! _guard_overlay_strip_block "$_guard_od_hook" "$_guard_od_candidate" || \
       ! /bin/sh -n "$_guard_od_candidate"; then
        rm -f "$_guard_od_candidate"
        cli_error "unable to remove the marked overlay safely; keeping last-good"
        return 1
    fi
    if ! file_atomic_replace "$_guard_od_hook" "$_guard_od_candidate"; then
        rm -f "$_guard_od_candidate"
        cli_error "unable to publish OpenClash custom-overwrite hook; keeping last-good"
        return 1
    fi
    rm -f "$_guard_od_candidate"
    _guard_od_backup=$(_guard_overlay_backup_path)
    rm -f "$_guard_od_backup"
    cli_success "removed only the marked rule-provider overlay; staged rule data was preserved"
}

_guard_overlay_validate_providers() {
    _guard_ovp_root=$1
    while IFS=' ' read -r _guard_ovp_name _guard_ovp_behavior _guard_ovp_file; do
        [ -n "$_guard_ovp_name" ] || continue
        _guard_ovp_path="$_guard_ovp_root/$_guard_ovp_file"
        if [ ! -s "$_guard_ovp_path" ] || ! awk 'NR == 1 { ok = ($0 == "payload:") } END { exit(ok ? 0 : 1) }' "$_guard_ovp_path"; then
            cli_error "staged provider is missing or invalid: $_guard_ovp_path"
            return 1
        fi
    done <<EOF
$(guard_overlay_provider_specs)
EOF
}

guard_overlay_apply_config() {
    _guard_oac_config=${1:-}
    if [ -z "$_guard_oac_config" ] || [ ! -f "$_guard_oac_config" ] || [ -L "$_guard_oac_config" ]; then
        cli_error "rules apply-overlay requires a regular active config file"
        return 2
    fi
    if ! command -v ruby >/dev/null 2>&1; then
        cli_error "OpenClash Ruby runtime is required for structured provider replacement"
        return 127
    fi
    _guard_oac_root=$(_guard_overlay_provider_root)
    _guard_overlay_validate_providers "$_guard_oac_root" || return $?
    _guard_oac_tmp=$(file_mktemp "$(dirname "$_guard_oac_config")") || return 1
    set -- "$_guard_oac_config" "$_guard_oac_tmp" "$_guard_oac_root"
    while IFS=' ' read -r _guard_oac_name _guard_oac_behavior _guard_oac_file; do
        [ -n "$_guard_oac_name" ] || continue
        set -- "$@" "$_guard_oac_name" "$_guard_oac_behavior" "$_guard_oac_file"
    done <<EOF
$(guard_overlay_provider_specs)
EOF
    if ! ruby -ryaml -e '
def safe_yaml(text)
  YAML.safe_load(text, permitted_classes: [], permitted_symbols: [], aliases: true)
rescue ArgumentError
  YAML.safe_load(text, [], [], true)
end
args = ARGV.dup
source, output, root = args.shift(3)
abort("invalid provider specification") unless args.length == 12
doc = safe_yaml(File.binread(source))
abort("active config root must be a mapping") unless doc.is_a?(Hash)
providers = doc["rule-providers"]
abort("active config rule-providers must be a mapping") unless providers.is_a?(Hash)
specs = {}
args.each_slice(3) { |name, behavior, filename| specs[name] = [behavior, filename] }
missing = specs.keys.reject { |key| providers.key?(key) }
abort("reserved providers missing: #{missing.join(",")}") unless missing.empty?
specs.each do |key, (behavior, filename)|
  providers[key] = {
    "type" => "file",
    "behavior" => behavior,
    "format" => "yaml",
    "path" => File.join(root, filename)
  }
end
rendered = YAML.dump(doc)
check = safe_yaml(rendered)
abort("rendered config root must be a mapping") unless check.is_a?(Hash)
out_providers = check["rule-providers"]
abort("rendered providers missing") unless out_providers.is_a?(Hash)
specs.each do |key, (behavior, filename)|
  expected = {"type"=>"file", "behavior"=>behavior, "format"=>"yaml", "path"=>File.join(root, filename)}
  abort("rendered provider mismatch: #{key}") unless out_providers[key] == expected
end
File.binwrite(output, rendered)
' "$@"; then
        rm -f "$_guard_oac_tmp"
        cli_error "active config lacks the expected four provider slots; leaving it untouched"
        return 1
    fi
    if ! file_atomic_replace "$_guard_oac_config" "$_guard_oac_tmp"; then
        rm -f "$_guard_oac_tmp"
        cli_error "unable to publish validated active config; keeping last-good"
        return 1
    fi
    rm -f "$_guard_oac_tmp"
}
# END MODULE: guard-overlay

# BEGIN MODULE: guard-rules
# Guard-owned local and remote custom-rule staging.
# Prefix: guard_rules_
set -eu

# A fetched rule file is data.  It is parsed as matcher records below and is
# never sourced, eval'ed, or interpolated into a shell command.
_GUARD_RULES_MAX_REMOTE_BYTES=262144
_GUARD_RULES_SYNC_INTERVAL_DEFAULT=10800

guard_rules_dir() {
    if [ -n "${GUARD_RULES_DIR:-}" ]; then
        printf '%s\n' "$GUARD_RULES_DIR"
    else
        printf '%s/etc/openclash-guard/rules\n' "${GUARD_PREFIX:-}"
    fi
}

guard_rules_config() {
    if [ -n "${GUARD_RULES_CONFIG:-}" ]; then
        printf '%s\n' "$GUARD_RULES_CONFIG"
    else
        printf '%s/sources.tsv\n' "$(guard_rules_dir)"
    fi
}

guard_rules_local_file() {
    case ${1:-} in
        direct|proxy) printf '%s/local-%s.tsv\n' "$(guard_rules_dir)" "$1" ;;
        *) return 2 ;;
    esac
}

guard_rules_remote_file() {
    case ${1:-} in
        direct|proxy) printf '%s/remote-%s.tsv\n' "$(guard_rules_dir)" "$1" ;;
        *) return 2 ;;
    esac
}

guard_rules_sources_dir() {
    printf '%s/sources\n' "$(guard_rules_dir)"
}

guard_rules_providers_dir() {
    printf '%s/providers\n' "$(guard_rules_dir)"
}

guard_rules_error() {
    printf 'error: %s\n' "$*" >&2
}

guard_rules_staged_notice() {
    printf '%s\n' "rules staged, not yet active; activation is provided by the separate Guard overlay command and is not performed by this rules module"
}

guard_rules_make_stage() {
    _guard_rules_ms_base=$(guard_rules_dir)
    mkdir -p "$_guard_rules_ms_base"
    _guard_rules_ms_file=$(file_mktemp "$_guard_rules_ms_base") || return 1
    rm -f "$_guard_rules_ms_file"
    mkdir -p "$_guard_rules_ms_file/sources/direct" "$_guard_rules_ms_file/sources/proxy" "$_guard_rules_ms_file/providers"
    printf '%s\n' "$_guard_rules_ms_file"
}

guard_rules_remove_stage() {
    _guard_rules_rs_stage=${1:-}
    [ -n "$_guard_rules_rs_stage" ] || return 0
    case $_guard_rules_rs_stage in
        "$(guard_rules_dir)"/*) rm -rf "$_guard_rules_rs_stage" ;;
        *) guard_rules_error "refusing to remove a non-Guard staging path"; return 1 ;;
    esac
}

guard_rules_ensure_empty_file() {
    _guard_rules_eef_dest=$1
    [ -f "$_guard_rules_eef_dest" ] && return 0
    _guard_rules_eef_dir=$(dirname "$_guard_rules_eef_dest")
    mkdir -p "$_guard_rules_eef_dir"
    _guard_rules_eef_tmp=$(file_mktemp "$_guard_rules_eef_dir") || return 1
    : > "$_guard_rules_eef_tmp"
    if ! file_atomic_replace "$_guard_rules_eef_dest" "$_guard_rules_eef_tmp"; then
        rm -f "$_guard_rules_eef_tmp"
        return 1
    fi
    rm -f "$_guard_rules_eef_tmp"
}

guard_rules_ensure_layout() {
    _guard_rules_el_dir=$(guard_rules_dir)
    _guard_rules_el_config=$(guard_rules_config)
    mkdir -p "$_guard_rules_el_dir" "$(guard_rules_sources_dir)/direct" "$(guard_rules_sources_dir)/proxy" "$(guard_rules_providers_dir)" "$(dirname "$_guard_rules_el_config")"
    guard_rules_ensure_empty_file "$(guard_rules_local_file direct)"
    guard_rules_ensure_empty_file "$(guard_rules_local_file proxy)"
    guard_rules_ensure_empty_file "$(guard_rules_remote_file direct)"
    guard_rules_ensure_empty_file "$(guard_rules_remote_file proxy)"
    guard_rules_ensure_empty_file "$_guard_rules_el_config"
}

guard_rules_bad_chars() {
    # Match whitespace and all control bytes.  The URL and matcher validators
    # deliberately reject these instead of trying to repair user input.
    LC_ALL=C awk 'BEGIN { bad = 0 } { if (NR > 1 || $0 ~ /[[:space:][:cntrl:]]/) bad = 1 } END { exit bad }'
}

guard_rules_validate_url() {
    _guard_rules_vu_url=${1:-}
    [ -n "$_guard_rules_vu_url" ] || return 1
    if ! printf '%s' "$_guard_rules_vu_url" | guard_rules_bad_chars; then
        return 1
    fi
    LC_ALL=C awk -v value="$_guard_rules_vu_url" '
        BEGIN {
            if (value !~ /^https:\/\//) exit 1
            rest = value
            sub(/^https:\/\//, "", rest)
            slash = index(rest, "/")
            if (slash <= 1) exit 1
            host = substr(rest, 1, slash - 1)
            path = substr(rest, slash)
            if (host != "raw.githubusercontent.com" && host != "gist.githubusercontent.com") exit 1
            if (path == "/" || path == "") exit 1
            if (host ~ /:/ || host ~ /@/) exit 1
            if (index(path, "?") || index(path, "#") || index(path, "\\")) exit 1
            count = split(path, parts, "/")
            if (host == "raw.githubusercontent.com") {
                if (count < 5 || parts[2] == "" || parts[3] == "" || parts[4] == "" || parts[5] == "") exit 1
            } else {
                if (count < 5 || parts[2] == "" || parts[3] == "" || parts[4] != "raw" || parts[5] == "") exit 1
            }
            exit 0
        }
    '
}

guard_rules_validate_domain() {
    _guard_rules_vd_value=${1:-}
    LC_ALL=C awk -v value="$_guard_rules_vd_value" '
        BEGIN {
            if (length(value) < 1 || length(value) > 253) exit 1
            if (value ~ /[^A-Za-z0-9.-]/ || value ~ /^[-.]|[-.]$/ || value ~ /\.\./) exit 1
            count = split(value, labels, ".")
            if (count < 1) exit 1
            for (i = 1; i <= count; i++) {
                label = labels[i]
                if (length(label) < 1 || length(label) > 63) exit 1
                if (length(label) == 1) {
                    if (label !~ /^[A-Za-z0-9]$/) exit 1
                } else if (label !~ /^[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]$/) {
                    exit 1
                }
            }
            exit 0
        }
    '
}

guard_rules_validate_keyword() {
    _guard_rules_vk_value=${1:-}
    LC_ALL=C awk -v value="$_guard_rules_vk_value" '
        BEGIN {
            if (length(value) < 1 || length(value) > 253) exit 1
            if (length(value) == 1) {
                if (value !~ /^[A-Za-z0-9]$/) exit 1
            } else if (value !~ /^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$/) {
                exit 1
            }
            exit 0
        }
    '
}

guard_rules_validate_ipv4_cidr() {
    _guard_rules_vi_value=${1:-}
    LC_ALL=C awk -v value="$_guard_rules_vi_value" '
        BEGIN {
            if (split(value, pair, "/") != 2) exit 1
            address = pair[1]
            prefix = pair[2]
            if (split(address, octets, ".") != 4) exit 1
            for (i = 1; i <= 4; i++) {
                octet = octets[i]
                if (octet !~ /^[0-9]+$/ || length(octet) > 3) exit 1
                if (length(octet) > 1 && substr(octet, 1, 1) == "0") exit 1
                if ((octet + 0) > 255) exit 1
            }
            if (prefix !~ /^[0-9]+$/ || length(prefix) > 2) exit 1
            if (length(prefix) > 1 && substr(prefix, 1, 1) == "0") exit 1
            if ((prefix + 0) > 32) exit 1
            exit 0
        }
    '
}

guard_rules_normalize_entry() {
    _guard_rules_ne_entry=${1:-}
    _guard_rules_ne_allow_keyword=${2:-0}
    [ -n "$_guard_rules_ne_entry" ] || return 1
    if ! printf '%s' "$_guard_rules_ne_entry" | guard_rules_bad_chars; then
        return 1
    fi
    case $_guard_rules_ne_entry in
        *,*) ;;
        *) return 1 ;;
    esac
    _guard_rules_ne_kind=${_guard_rules_ne_entry%%,*}
    _guard_rules_ne_value=${_guard_rules_ne_entry#*,}
    case $_guard_rules_ne_value in
        *,*|'') return 1 ;;
    esac
    case $_guard_rules_ne_kind in
        DOMAIN|DOMAIN-SUFFIX)
            _guard_rules_ne_value=$(printf '%s' "$_guard_rules_ne_value" | LC_ALL=C tr '[:upper:]' '[:lower:]')
            guard_rules_validate_domain "$_guard_rules_ne_value" || return 1
            ;;
        DOMAIN-KEYWORD)
            [ "$_guard_rules_ne_allow_keyword" = 1 ] || return 1
            _guard_rules_ne_value=$(printf '%s' "$_guard_rules_ne_value" | LC_ALL=C tr '[:upper:]' '[:lower:]')
            guard_rules_validate_keyword "$_guard_rules_ne_value" || return 1
            ;;
        IP-CIDR)
            guard_rules_validate_ipv4_cidr "$_guard_rules_ne_value" || return 1
            ;;
        *) return 1 ;;
    esac
    printf '%s,%s\n' "$_guard_rules_ne_kind" "$_guard_rules_ne_value"
}

guard_rules_validate_rule_file() {
    _guard_rules_vrf_file=${1:-}
    _guard_rules_vrf_allow_keyword=${2:-0}
    [ -f "$_guard_rules_vrf_file" ] || return 1
    while IFS= read -r _guard_rules_vrf_line || [ -n "$_guard_rules_vrf_line" ]; do
        case $_guard_rules_vrf_line in
            ''|'#'*) continue ;;
        esac
        _guard_rules_vrf_normalized=$(guard_rules_normalize_entry "$_guard_rules_vrf_line" "$_guard_rules_vrf_allow_keyword") || return 1
        [ "$_guard_rules_vrf_normalized" = "$_guard_rules_vrf_line" ] || return 1
    done < "$_guard_rules_vrf_file"
}

guard_rules_normalize_remote_file() {
    _guard_rules_nrf_input=$1
    _guard_rules_nrf_output=$2
    : > "$_guard_rules_nrf_output"
    while IFS= read -r _guard_rules_nrf_line || [ -n "$_guard_rules_nrf_line" ]; do
        case $_guard_rules_nrf_line in
            ''|'#'*) continue ;;
        esac
        _guard_rules_nrf_normalized=$(guard_rules_normalize_entry "$_guard_rules_nrf_line" 1) || return 1
        printf '%s\n' "$_guard_rules_nrf_normalized" >> "$_guard_rules_nrf_output"
    done < "$_guard_rules_nrf_input"
    LC_ALL=C sort -u "$_guard_rules_nrf_output" -o "$_guard_rules_nrf_output"
}

guard_rules_source_id() {
    _guard_rules_sid_url=$1
    _guard_rules_sid_tmp=$(file_mktemp) || return 1
    printf '%s' "$_guard_rules_sid_url" > "$_guard_rules_sid_tmp"
    _guard_rules_sid_digest=$(file_sha256 "$_guard_rules_sid_tmp") || {
        rm -f "$_guard_rules_sid_tmp"
        return 1
    }
    rm -f "$_guard_rules_sid_tmp"
    printf '%s\n' "$_guard_rules_sid_digest"
}

guard_rules_source_file() {
    _guard_rules_sfp_root=$1
    _guard_rules_sfp_scope=$2
    _guard_rules_sfp_url=$3
    printf '%s/%s/%s.tsv\n' "$_guard_rules_sfp_root" "$_guard_rules_sfp_scope" "$(guard_rules_source_id "$_guard_rules_sfp_url")"
}

guard_rules_validate_sources_file() {
    _guard_rules_vsf_file=${1:-}
    [ -f "$_guard_rules_vsf_file" ] || return 1
    while IFS="$(printf '\t')" read -r _guard_rules_vsf_scope _guard_rules_vsf_url _guard_rules_vsf_extra || [ -n "${_guard_rules_vsf_scope:-}" ]; do
        case ${_guard_rules_vsf_scope:-} in
            ''|'#'*) continue ;;
            direct|proxy) ;;
            *) return 1 ;;
        esac
        [ -n "${_guard_rules_vsf_url:-}" ] || return 1
        [ -z "${_guard_rules_vsf_extra:-}" ] || return 1
        guard_rules_validate_url "$_guard_rules_vsf_url" || return 1
    done < "$_guard_rules_vsf_file"
}

guard_rules_collect_sources() {
    _guard_rules_cs_config=$1
    _guard_rules_cs_root=$2
    _guard_rules_cs_scope=$3
    _guard_rules_cs_output=$4
    : > "$_guard_rules_cs_output"
    while IFS="$(printf '\t')" read -r _guard_rules_cs_cfg_scope _guard_rules_cs_url _guard_rules_cs_extra || [ -n "${_guard_rules_cs_cfg_scope:-}" ]; do
        [ "${_guard_rules_cs_cfg_scope:-}" = "$_guard_rules_cs_scope" ] || continue
        [ -n "${_guard_rules_cs_url:-}" ] || continue
        _guard_rules_cs_source=$(guard_rules_source_file "$_guard_rules_cs_root" "$_guard_rules_cs_scope" "$_guard_rules_cs_url")
        [ -f "$_guard_rules_cs_source" ] || continue
        cat "$_guard_rules_cs_source" >> "$_guard_rules_cs_output"
    done < "$_guard_rules_cs_config"
    _guard_rules_cs_sorted=$(file_mktemp "$(dirname "$_guard_rules_cs_output")") || return 1
    if ! LC_ALL=C sort -u "$_guard_rules_cs_output" > "$_guard_rules_cs_sorted"; then
        rm -f "$_guard_rules_cs_sorted"
        return 1
    fi
    mv -f "$_guard_rules_cs_sorted" "$_guard_rules_cs_output"
}

guard_rules_render_provider() {
    _guard_rules_rp_kind=$1
    _guard_rules_rp_local=$2
    _guard_rules_rp_remote=$3
    _guard_rules_rp_dest=$4
    _guard_rules_rp_data=$(file_mktemp "$(dirname "$_guard_rules_rp_dest")") || return 1
    case $_guard_rules_rp_kind in
        domain)
            awk -F ',' '
                $1 == "DOMAIN" { print $2 }
                $1 == "DOMAIN-SUFFIX" { print "+." $2 }
                $1 == "DOMAIN-KEYWORD" { print "*" $2 "*" }
            ' "$_guard_rules_rp_local" "$_guard_rules_rp_remote" | LC_ALL=C sort -u > "$_guard_rules_rp_data"
            ;;
        ip)
            awk -F ',' '$1 == "IP-CIDR" { print "IP-CIDR," $2 ",no-resolve" }' "$_guard_rules_rp_local" "$_guard_rules_rp_remote" | LC_ALL=C sort -u > "$_guard_rules_rp_data"
            ;;
        *) rm -f "$_guard_rules_rp_data"; return 2 ;;
    esac
    {
        printf 'payload:\n'
        while IFS= read -r _guard_rules_rp_line || [ -n "$_guard_rules_rp_line" ]; do
            [ -n "$_guard_rules_rp_line" ] || continue
            printf "  - '%s'\n" "$_guard_rules_rp_line"
        done < "$_guard_rules_rp_data"
    } > "$_guard_rules_rp_dest"
    rm -f "$_guard_rules_rp_data"
}

guard_rules_render_all() {
    _guard_rules_ra_local_direct=$1
    _guard_rules_ra_local_proxy=$2
    _guard_rules_ra_remote_direct=$3
    _guard_rules_ra_remote_proxy=$4
    _guard_rules_ra_dest=$5
    mkdir -p "$_guard_rules_ra_dest"
    while IFS=' ' read -r _guard_rules_ra_name _guard_rules_ra_behavior _guard_rules_ra_file; do
        case $_guard_rules_ra_name in
            Custom_Direct_*)
                _guard_rules_ra_local=$_guard_rules_ra_local_direct
                _guard_rules_ra_remote=$_guard_rules_ra_remote_direct
                ;;
            Custom_Proxy_*)
                _guard_rules_ra_local=$_guard_rules_ra_local_proxy
                _guard_rules_ra_remote=$_guard_rules_ra_remote_proxy
                ;;
            *) return 2 ;;
        esac
        case $_guard_rules_ra_behavior in
            domain) _guard_rules_ra_kind=domain ;;
            classical) _guard_rules_ra_kind=ip ;;
            *) return 2 ;;
        esac
        guard_rules_render_provider "$_guard_rules_ra_kind" "$_guard_rules_ra_local" "$_guard_rules_ra_remote" "$_guard_rules_ra_dest/$_guard_rules_ra_file" || return $?
    done <<EOF
$(guard_overlay_provider_specs)
EOF
}

guard_rules_publish_providers() {
    _guard_rules_pp_stage=$1
    _guard_rules_pp_dest=$(guard_rules_providers_dir)
    mkdir -p "$_guard_rules_pp_dest"
    while IFS=' ' read -r _guard_rules_pp_key _guard_rules_pp_behavior _guard_rules_pp_name; do
        [ -n "$_guard_rules_pp_name" ] || continue
        if [ -f "$_guard_rules_pp_dest/$_guard_rules_pp_name" ] && \
           cmp -s "$_guard_rules_pp_dest/$_guard_rules_pp_name" "$_guard_rules_pp_stage/$_guard_rules_pp_name"; then
            continue
        fi
        if ! file_atomic_replace "$_guard_rules_pp_dest/$_guard_rules_pp_name" "$_guard_rules_pp_stage/$_guard_rules_pp_name"; then
            return 1
        fi
    done <<EOF
$(guard_overlay_provider_specs)
EOF
}

guard_rules_init() {
    guard_rules_ensure_layout
    _guard_rules_gi_stage=$(guard_rules_make_stage) || return 1
    _guard_rules_gi_local_direct=$(guard_rules_local_file direct)
    _guard_rules_gi_local_proxy=$(guard_rules_local_file proxy)
    _guard_rules_gi_direct=$(guard_rules_remote_file direct)
    _guard_rules_gi_proxy=$(guard_rules_remote_file proxy)
    if ! guard_rules_render_all "$_guard_rules_gi_local_direct" "$_guard_rules_gi_local_proxy" "$_guard_rules_gi_direct" "$_guard_rules_gi_proxy" "$_guard_rules_gi_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_gi_stage"
        return 1
    fi
    if ! guard_rules_publish_providers "$_guard_rules_gi_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_gi_stage"
        return 1
    fi
    guard_rules_remove_stage "$_guard_rules_gi_stage"
    guard_rules_staged_notice
}

guard_rules_local_mutate() {
    _guard_rules_lm_scope=$1
    _guard_rules_lm_action=$2
    _guard_rules_lm_entry=$3
    case $_guard_rules_lm_scope in
        direct|proxy) ;;
        *) return 2 ;;
    esac
    _guard_rules_lm_normalized=$(guard_rules_normalize_entry "$_guard_rules_lm_entry" 0) || {
        guard_rules_error "invalid local rule; expected DOMAIN, DOMAIN-SUFFIX, or IP-CIDR"
        return 1
    }
    guard_rules_ensure_layout
    _guard_rules_lm_local=$(guard_rules_local_file "$_guard_rules_lm_scope")
    if ! guard_rules_validate_rule_file "$_guard_rules_lm_local" 0; then
        guard_rules_error "Guard local rule state is invalid"
        return 1
    fi
    _guard_rules_lm_stage=$(guard_rules_make_stage) || return 1
    _guard_rules_lm_new="$_guard_rules_lm_stage/local-$_guard_rules_lm_scope.tsv"
    if [ "$_guard_rules_lm_action" = add ]; then
        awk -v want="$_guard_rules_lm_normalized" '$0 == want { found = 1 } { print } END { if (!found) print want }' "$_guard_rules_lm_local" > "$_guard_rules_lm_new"
    else
        awk -v want="$_guard_rules_lm_normalized" '$0 != want { print }' "$_guard_rules_lm_local" > "$_guard_rules_lm_new"
    fi
    _guard_rules_lm_sorted=$(file_mktemp "$_guard_rules_lm_stage") || {
        guard_rules_remove_stage "$_guard_rules_lm_stage"
        return 1
    }
    LC_ALL=C sort -u "$_guard_rules_lm_new" > "$_guard_rules_lm_sorted"
    mv -f "$_guard_rules_lm_sorted" "$_guard_rules_lm_new"
    _guard_rules_lm_direct=$(guard_rules_remote_file direct)
    _guard_rules_lm_proxy=$(guard_rules_remote_file proxy)
    _guard_rules_lm_local_direct=$(guard_rules_local_file direct)
    _guard_rules_lm_local_proxy=$(guard_rules_local_file proxy)
    if [ "$_guard_rules_lm_scope" = direct ]; then
        _guard_rules_lm_local_direct=$_guard_rules_lm_new
    else
        _guard_rules_lm_local_proxy=$_guard_rules_lm_new
    fi
    if ! guard_rules_render_all "$_guard_rules_lm_local_direct" "$_guard_rules_lm_local_proxy" "$_guard_rules_lm_direct" "$_guard_rules_lm_proxy" "$_guard_rules_lm_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_lm_stage"
        return 1
    fi
    if ! file_atomic_replace "$_guard_rules_lm_local" "$_guard_rules_lm_new" || ! guard_rules_publish_providers "$_guard_rules_lm_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_lm_stage"
        return 1
    fi
    guard_rules_remove_stage "$_guard_rules_lm_stage"
    guard_rules_staged_notice
}

guard_rules_list_local() {
    _guard_rules_ll_scope=${1:-}
    case $_guard_rules_ll_scope in
        direct|proxy)
            _guard_rules_ll_local=$(guard_rules_local_file "$_guard_rules_ll_scope")
            [ -f "$_guard_rules_ll_local" ] || return 0
            ;;
        '')
            guard_rules_list_local direct
            guard_rules_list_local proxy
            return 0
            ;;
        *) return 2 ;;
    esac
    cat "$_guard_rules_ll_local"
}

guard_rules_config_mutate() {
    _guard_rules_cm_scope=$1
    _guard_rules_cm_action=$2
    _guard_rules_cm_url=$3
    case $_guard_rules_cm_scope in
        direct|proxy) ;;
        *) return 2 ;;
    esac
    guard_rules_validate_url "$_guard_rules_cm_url" || {
        guard_rules_error "only HTTPS raw.githubusercontent.com or gist.githubusercontent.com URLs are accepted"
        return 1
    }
    guard_rules_ensure_layout
    _guard_rules_cm_config=$(guard_rules_config)
    guard_rules_validate_sources_file "$_guard_rules_cm_config" || {
        guard_rules_error "Guard source configuration is invalid"
        return 1
    }
    _guard_rules_cm_stage=$(guard_rules_make_stage) || return 1
    _guard_rules_cm_new="$_guard_rules_cm_stage/sources.tsv"
    _guard_rules_cm_found=0
    if [ "$_guard_rules_cm_action" = add ]; then
        awk -F '\t' -v scope="$_guard_rules_cm_scope" -v url="$_guard_rules_cm_url" '
            $1 == scope && $2 == url { found = 1 }
            { print }
            END { if (!found) print scope "\t" url }
        ' "$_guard_rules_cm_config" > "$_guard_rules_cm_new"
    else
        awk -F '\t' -v scope="$_guard_rules_cm_scope" -v url="$_guard_rules_cm_url" '$1 == scope && $2 == url { found = 1; next } { print }' "$_guard_rules_cm_config" > "$_guard_rules_cm_new"
    fi
    _guard_rules_cm_direct="$_guard_rules_cm_stage/remote-direct.tsv"
    _guard_rules_cm_proxy="$_guard_rules_cm_stage/remote-proxy.tsv"
    guard_rules_collect_sources "$_guard_rules_cm_new" "$(guard_rules_sources_dir)" direct "$_guard_rules_cm_direct"
    guard_rules_collect_sources "$_guard_rules_cm_new" "$(guard_rules_sources_dir)" proxy "$_guard_rules_cm_proxy"
    if ! guard_rules_render_all "$(guard_rules_local_file direct)" "$(guard_rules_local_file proxy)" "$_guard_rules_cm_direct" "$_guard_rules_cm_proxy" "$_guard_rules_cm_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_cm_stage"
        return 1
    fi
    if ! file_atomic_replace "$_guard_rules_cm_config" "$_guard_rules_cm_new" || \
       ! file_atomic_replace "$(guard_rules_remote_file direct)" "$_guard_rules_cm_direct" || \
       ! file_atomic_replace "$(guard_rules_remote_file proxy)" "$_guard_rules_cm_proxy" || \
       ! guard_rules_publish_providers "$_guard_rules_cm_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_cm_stage"
        return 1
    fi
    guard_rules_remove_stage "$_guard_rules_cm_stage"
    guard_rules_staged_notice
}

guard_rules_sync_run() {
    guard_rules_ensure_layout
    _guard_rules_sr_config=$(guard_rules_config)
    guard_rules_validate_sources_file "$_guard_rules_sr_config" || {
        guard_rules_error "Guard source configuration is invalid; keeping last-good staged rules"
        return 1
    }
    _guard_rules_sr_stage=$(guard_rules_make_stage) || return 1
    _guard_rules_sr_ok=1
    while IFS="$(printf '\t')" read -r _guard_rules_sr_scope _guard_rules_sr_url _guard_rules_sr_extra || [ -n "${_guard_rules_sr_scope:-}" ]; do
        case ${_guard_rules_sr_scope:-} in
            ''|'#'*) continue ;;
        esac
        _guard_rules_sr_raw=$(file_mktemp "$_guard_rules_sr_stage") || { _guard_rules_sr_ok=0; break; }
        if ! fetch_atomic "$_guard_rules_sr_url" "$_guard_rules_sr_raw" "" "" "$_GUARD_RULES_MAX_REMOTE_BYTES" 1; then
            _guard_rules_sr_ok=0
            break
        fi
        _guard_rules_sr_bytes=$(wc -c < "$_guard_rules_sr_raw" | tr -d '[:space:]')
        case $_guard_rules_sr_bytes in
            ''|*[!0-9]*) _guard_rules_sr_ok=0; break ;;
        esac
        if [ "$_guard_rules_sr_bytes" -gt "$_GUARD_RULES_MAX_REMOTE_BYTES" ]; then
            guard_rules_error "remote rule source exceeds ${_GUARD_RULES_MAX_REMOTE_BYTES} bytes: $_guard_rules_sr_url"
            _guard_rules_sr_ok=0
            break
        fi
        _guard_rules_sr_snapshot=$(guard_rules_source_file "$_guard_rules_sr_stage/sources" "$_guard_rules_sr_scope" "$_guard_rules_sr_url")
        mkdir -p "$(dirname "$_guard_rules_sr_snapshot")"
        if ! guard_rules_normalize_remote_file "$_guard_rules_sr_raw" "$_guard_rules_sr_snapshot"; then
            guard_rules_error "remote rule source has invalid matcher data: $_guard_rules_sr_url"
            _guard_rules_sr_ok=0
            break
        fi
    done < "$_guard_rules_sr_config"
    if [ "$_guard_rules_sr_ok" != 1 ]; then
        guard_rules_remove_stage "$_guard_rules_sr_stage"
        guard_rules_error "sync failed; keeping last-good remote snapshots and providers"
        return 1
    fi
    _guard_rules_sr_direct="$_guard_rules_sr_stage/remote-direct.tsv"
    _guard_rules_sr_proxy="$_guard_rules_sr_stage/remote-proxy.tsv"
    guard_rules_collect_sources "$_guard_rules_sr_config" "$_guard_rules_sr_stage/sources" direct "$_guard_rules_sr_direct"
    guard_rules_collect_sources "$_guard_rules_sr_config" "$_guard_rules_sr_stage/sources" proxy "$_guard_rules_sr_proxy"
    if ! guard_rules_render_all "$(guard_rules_local_file direct)" "$(guard_rules_local_file proxy)" "$_guard_rules_sr_direct" "$_guard_rules_sr_proxy" "$_guard_rules_sr_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_sr_stage"
        return 1
    fi

    # Every source has been fetched, size-checked, parsed, deduped, and used
    # to render all four providers before any production snapshot is changed.
    if ! file_atomic_replace "$(guard_rules_remote_file direct)" "$_guard_rules_sr_direct" || \
       ! file_atomic_replace "$(guard_rules_remote_file proxy)" "$_guard_rules_sr_proxy"; then
        guard_rules_remove_stage "$_guard_rules_sr_stage"
        return 1
    fi
    mkdir -p "$(guard_rules_sources_dir)/direct" "$(guard_rules_sources_dir)/proxy"
    while IFS="$(printf '\t')" read -r _guard_rules_sr_scope _guard_rules_sr_url _guard_rules_sr_extra || [ -n "${_guard_rules_sr_scope:-}" ]; do
        case ${_guard_rules_sr_scope:-} in
            ''|'#'*) continue ;;
        esac
        _guard_rules_sr_snapshot=$(guard_rules_source_file "$_guard_rules_sr_stage/sources" "$_guard_rules_sr_scope" "$_guard_rules_sr_url")
        _guard_rules_sr_dest=$(guard_rules_source_file "$(guard_rules_sources_dir)" "$_guard_rules_sr_scope" "$_guard_rules_sr_url")
        if ! file_atomic_replace "$_guard_rules_sr_dest" "$_guard_rules_sr_snapshot"; then
            guard_rules_remove_stage "$_guard_rules_sr_stage"
            return 1
        fi
    done < "$_guard_rules_sr_config"
    if ! guard_rules_publish_providers "$_guard_rules_sr_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_sr_stage"
        return 1
    fi
    guard_rules_remove_stage "$_guard_rules_sr_stage"
    guard_rules_staged_notice
}

guard_rules_sync_list() {
    _guard_rules_sl_scope=${1:-}
    _guard_rules_sl_config=$(guard_rules_config)
    [ -f "$_guard_rules_sl_config" ] || return 0
    case $_guard_rules_sl_scope in
        direct|proxy)
            awk -F '\t' -v scope="$_guard_rules_sl_scope" '$1 == scope { print }' "$_guard_rules_sl_config"
            ;;
        '') cat "$_guard_rules_sl_config" ;;
        *) return 2 ;;
    esac
}

guard_rules_sync_interval() {
    _guard_rules_si_value=${GUARD_RULES_SYNC_INTERVAL:-$_GUARD_RULES_SYNC_INTERVAL_DEFAULT}
    case $_guard_rules_si_value in
        ''|*[!0-9]*) return 1 ;;
    esac
    [ "$_guard_rules_si_value" -gt 0 ] || return 1
    printf '%s\n' "$_guard_rules_si_value"
}

guard_rules_sync_watch() {
    [ "${GUARD_RULES_ALLOW_WATCH:-0}" = 1 ] || {
        guard_rules_error "sync watch is internal-only; set GUARD_RULES_ALLOW_WATCH=1 explicitly"
        return 2
    }
    _guard_rules_sw_interval=$(guard_rules_sync_interval) || {
        guard_rules_error "GUARD_RULES_SYNC_INTERVAL must be a positive integer"
        return 2
    }
    trap '_guard_lock_release; exit 0' INT TERM
    trap _guard_lock_release EXIT
    while :; do
        _guard_rules_sw_rc=0
        if _guard_lock_acquire; then
            guard_rules_sync_run || _guard_rules_sw_rc=$?
            _guard_lock_release
        else
            _guard_rules_sw_rc=$?
            guard_rules_error "scheduled sync could not acquire the Guard lock"
        fi
        [ "$_guard_rules_sw_rc" -eq 0 ] || guard_rules_error "scheduled sync failed; last-good rules remain active"
        sleep "$_guard_rules_sw_interval" || true
    done
}

guard_rules_purge() {
    _guard_rules_pg_dir=$(guard_rules_dir)
    _guard_rules_pg_config=$(guard_rules_config)
    [ -d "$_guard_rules_pg_dir" ] || return 0
    rm -f "$_guard_rules_pg_dir/local-direct.tsv" "$_guard_rules_pg_dir/local-proxy.tsv" "$_guard_rules_pg_dir/remote-direct.tsv" "$_guard_rules_pg_dir/remote-proxy.tsv"
    while IFS=' ' read -r _guard_rules_pg_key _guard_rules_pg_behavior _guard_rules_pg_name; do
        [ -n "$_guard_rules_pg_name" ] || continue
        rm -f "$_guard_rules_pg_dir/providers/$_guard_rules_pg_name"
    done <<EOF
$(guard_overlay_provider_specs)
EOF
    for _guard_rules_pg_scope in direct proxy; do
        if [ -d "$_guard_rules_pg_dir/sources/$_guard_rules_pg_scope" ]; then
            find "$_guard_rules_pg_dir/sources/$_guard_rules_pg_scope" -type f -name '*.tsv' -exec rm -f {} + 2>/dev/null || true
        fi
        rmdir "$_guard_rules_pg_dir/sources/$_guard_rules_pg_scope" 2>/dev/null || true
    done
    find "$_guard_rules_pg_dir" -type d -name 'shlib.*' -prune -exec rm -rf {} + 2>/dev/null || true
    rmdir "$_guard_rules_pg_dir/providers" "$_guard_rules_pg_dir/sources" 2>/dev/null || true
    rm -f "$_guard_rules_pg_config"
    rmdir "$_guard_rules_pg_dir" 2>/dev/null || true
}

guard_cmd_rules() {
    _guard_rules_cmd=${1:-}
    [ -n "$_guard_rules_cmd" ] || {
        guard_rules_error "usage: rules add-direct|add-proxy|list|remove-direct|remove-proxy|sync ..."
        return 2
    }
    shift
    case $_guard_rules_cmd in
        add-direct)
            [ "$#" -eq 1 ] || return 2
            guard_rules_local_mutate direct add "$1"
            ;;
        add-proxy)
            [ "$#" -eq 1 ] || return 2
            guard_rules_local_mutate proxy add "$1"
            ;;
        remove-direct)
            [ "$#" -eq 1 ] || return 2
            guard_rules_local_mutate direct remove "$1"
            ;;
        remove-proxy)
            [ "$#" -eq 1 ] || return 2
            guard_rules_local_mutate proxy remove "$1"
            ;;
        list)
            [ "$#" -le 1 ] || return 2
            guard_rules_list_local "${1:-}"
            ;;
        activate)
            guard_overlay_activate "$@"
            ;;
        deactivate)
            guard_overlay_deactivate "$@"
            ;;
        apply-overlay)
            guard_overlay_apply_config "$@"
            ;;
        sync)
            _guard_rules_sync_cmd=${1:-}
            [ -n "$_guard_rules_sync_cmd" ] || return 2
            shift
            case $_guard_rules_sync_cmd in
                add-direct) [ "$#" -eq 1 ] || return 2; guard_rules_config_mutate direct add "$1" ;;
                add-proxy) [ "$#" -eq 1 ] || return 2; guard_rules_config_mutate proxy add "$1" ;;
                remove-direct) [ "$#" -eq 1 ] || return 2; guard_rules_config_mutate direct remove "$1" ;;
                remove-proxy) [ "$#" -eq 1 ] || return 2; guard_rules_config_mutate proxy remove "$1" ;;
                list) [ "$#" -le 1 ] || return 2; guard_rules_sync_list "${1:-}" ;;
                run) [ "$#" -eq 0 ] || return 2; guard_rules_sync_run ;;
                watch) [ "$#" -eq 0 ] || return 2; guard_rules_sync_watch ;;
                *) guard_rules_error "unknown rules sync command: $_guard_rules_sync_cmd"; return 2 ;;
            esac
            ;;
        init)
            [ "$#" -eq 0 ] || return 2
            guard_rules_init
            ;;
        *)
            guard_rules_error "unknown rules command: $_guard_rules_cmd"
            return 2
            ;;
    esac
}
# END MODULE: guard-rules

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

_GUARD_GEO_PROXY_URL=
_GUARD_GEO_PROXY_AUTH=
_GUARD_GEO_ROUTE=
_GUARD_GEO_ROUTE_REASON=

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
    if [ -n "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ] && [ -f "$_GUARD_PREFLIGHT_POLICY_FILE" ]; then
        printf '%s\n' "$_GUARD_PREFLIGHT_POLICY_FILE"
        return 0
    fi
    if [ -n "${_GUARD_POLICY_FILE:-}" ] && [ -f "$_GUARD_POLICY_FILE" ]; then
        printf '%s\n' "$_GUARD_POLICY_FILE"
        return 0
    fi
    _guard_policy_default_path
}

_guard_geo_valid_port() {
    _guard_geo_vp=${1:-}
    _guard_geo_is_int "$_guard_geo_vp" || return 1
    [ "$_guard_geo_vp" -ge 1 ] && [ "$_guard_geo_vp" -le 65535 ]
}

guard_geo_discover_proxy_route() {
    _GUARD_GEO_PROXY_URL=
    _GUARD_GEO_PROXY_AUTH=
    _GUARD_GEO_ROUTE=
    _GUARD_GEO_ROUTE_REASON=
    if [ -n "${GUARD_OPENCLASH_PROXY_URL:-}" ]; then
        case $GUARD_OPENCLASH_PROXY_URL in
            http://*|https://*|socks5://*|socks5h://*)
                _GUARD_GEO_PROXY_URL=$GUARD_OPENCLASH_PROXY_URL
                _GUARD_GEO_ROUTE=${GUARD_GEO_ROUTE:-openclash-override}
                _GUARD_GEO_PROXY_AUTH=${GUARD_OPENCLASH_PROXY_AUTH:-}
                return 0
                ;;
            *)
                _GUARD_GEO_ROUTE_REASON="GUARD_OPENCLASH_PROXY_URL is not a supported proxy URL"
                return 1
                ;;
        esac
    fi
    if ! command -v uci >/dev/null 2>&1; then
        _GUARD_GEO_ROUTE_REASON="OpenClash proxy listener cannot be discovered because uci is unavailable"
        return 1
    fi
    _guard_geo_port=$(uci_get_default openclash.config.mixed_port "" 2>/dev/null) || _guard_geo_port=
    _guard_geo_kind=mixed
    if ! _guard_geo_valid_port "$_guard_geo_port"; then
        _guard_geo_port=$(uci_get_default openclash.config.http_port "" 2>/dev/null) || _guard_geo_port=
        _guard_geo_kind=http
    fi
    if ! _guard_geo_valid_port "$_guard_geo_port"; then
        _GUARD_GEO_ROUTE_REASON="OpenClash has no valid mixed_port or http_port in UCI"
        return 1
    fi
    _GUARD_GEO_PROXY_URL="http://127.0.0.1:${_guard_geo_port}"
    _GUARD_GEO_ROUTE="openclash-${_guard_geo_kind}-${_guard_geo_port}"
    _guard_geo_auth_enabled=$(uci_get_default 'openclash.@authentication[0].enabled' 0 2>/dev/null) || _guard_geo_auth_enabled=0
    if [ "$_guard_geo_auth_enabled" = 1 ]; then
        _guard_geo_auth_user=$(uci_get_default 'openclash.@authentication[0].username' "" 2>/dev/null) || _guard_geo_auth_user=
        _guard_geo_auth_pass=$(uci_get_default 'openclash.@authentication[0].password' "" 2>/dev/null) || _guard_geo_auth_pass=
        if [ -z "$_guard_geo_auth_user" ] || [ -z "$_guard_geo_auth_pass" ]; then
            _GUARD_GEO_ROUTE_REASON="OpenClash proxy authentication is enabled but credentials are incomplete"
            _GUARD_GEO_PROXY_URL=
            _GUARD_GEO_ROUTE=
            return 1
        fi
        _GUARD_GEO_PROXY_AUTH="${_guard_geo_auth_user}:${_guard_geo_auth_pass}"
    fi
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
        _guard_geo_fetch_rc=0
        case $_guard_geo_kind in
            direct)
                fetch_http_direct "$_guard_geo_url" "$_guard_geo_tmp" "$_guard_geo_to" || _guard_geo_fetch_rc=$?
                ;;
            route)
                if [ -z "${_GUARD_GEO_PROXY_URL:-}" ]; then
                    printf '%s\n' "guard_geo: proxy route is not available" >&2
                    rm -f "$_guard_geo_tmp"
                    return 1
                fi
                fetch_http_proxy "$_guard_geo_url" "$_guard_geo_tmp" "$_GUARD_GEO_PROXY_URL" "$_guard_geo_to" "${_GUARD_GEO_PROXY_AUTH:-}" || _guard_geo_fetch_rc=$?
                ;;
        esac
        if [ "$_guard_geo_fetch_rc" -ne 0 ]; then
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
        _guard_pv_dr=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.directRequiresSupportedRegion" 2>/dev/null) || _guard_pv_dr=false
        _guard_pv_fm=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.failMode") || _guard_pv_fm=
        _guard_pv_quic=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.quic") || _guard_pv_quic=
        _guard_pv_ks=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.firewallKillSwitch") || _guard_pv_ks=
        if ! _guard_policy_is_bool "$_guard_pv_da"; then
            printf '%s\n' "guard_policy: invalid directAllowed on $_guard_pv_class" >&2
            return 1
        fi
        if ! _guard_policy_is_bool "$_guard_pv_dr"; then
            printf '%s\n' "guard_policy: invalid directRequiresSupportedRegion on $_guard_pv_class" >&2
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
        _guard_pe_direct_required=$(_guard_policy_class_field "$_guard_pe_svc" directRequiresSupportedRegion 2>/dev/null) || _guard_pe_direct_required=false
        if [ "$_guard_pe_direct_required" = true ]; then
            if guard_policy_region_allowed "$_guard_pe_svc" "$_GUARD_NET_DIRECT_REGION"; then
                printf '%s\n' "allow-direct"
                return 0
            fi
            if [ "$_GUARD_PROXY_HEALTHY" = 1 ] && guard_policy_region_allowed "$_guard_pe_svc" "$_GUARD_PROXY_REGION"; then
                printf '%s\n' "allow-proxy"
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
        network.directRegionReason) printf '%s\n' "${_GUARD_PREFLIGHT_DIRECT_REASON:-}" ;;
        proxy.healthy) printf '%s\n' "$_GUARD_PROXY_HEALTHY" ;;
        proxy.region) printf '%s\n' "$_GUARD_PROXY_REGION" ;;
        proxy.regionReason) printf '%s\n' "${_GUARD_PREFLIGHT_PROXY_REASON:-}" ;;
        proxy.route) printf '%s\n' "${_GUARD_GEO_ROUTE:-}" ;;
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
    printf '"network":{"ipv6":%s,"directRegion":"%s","directRegionReason":"%s"},' \
        "$(_guard_env_json_bool "$_GUARD_NET_IPV6")" \
        "$(_guard_env_json_string "$_GUARD_NET_DIRECT_REGION")" \
        "$(_guard_env_json_string "${_GUARD_PREFLIGHT_DIRECT_REASON:-}")"
    printf '"proxy":{"healthy":%s,"region":"%s","regionReason":"%s","route":"%s"},' \
        "$(_guard_env_json_bool "$_GUARD_PROXY_HEALTHY")" \
        "$(_guard_env_json_string "$_GUARD_PROXY_REGION")" \
        "$(_guard_env_json_string "${_GUARD_PREFLIGHT_PROXY_REASON:-}")" \
        "$(_guard_env_json_string "${_GUARD_GEO_ROUTE:-}")"
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
_GUARD_NFT_TABLE_EXISTS=0

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
    if [ "${_GUARD_NFT_TABLE_EXISTS:-0}" = 1 ]; then
        printf 'flush table %s %s\n' "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    else
        printf 'add table %s %s\n' "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    fi
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

guard_template_validate_file() {
    _guard_tv_file=${1:-}
    [ -f "$_guard_tv_file" ] || return 1
    json_load "$_guard_tv_file" || return 1
    _guard_tv_ver=$(json_get "$_guard_tv_file" schemaVersion 2>/dev/null) || _guard_tv_ver=
    [ "$_guard_tv_ver" = 1 ] || return 1
    json_has "$_guard_tv_file" templates
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
    if ! guard_template_validate_file "$_GUARD_TEMPLATE_FILE"; then
        cli_error "invalid template catalog: $_GUARD_TEMPLATE_FILE"
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

_guard_install_observations() {
    printf '%s/environment.json\n' "$(_guard_install_etc)"
}

_guard_install_write() {
    _guard_iw_dest=$1
    _guard_iw_mode=${2:-0644}
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would write %s\n' "$_guard_iw_dest"
        cat >/dev/null
        return 0
    fi
    _guard_iw_dir=$(dirname "$_guard_iw_dest")
    mkdir -p "$_guard_iw_dir"
    _guard_iw_tmp=$(file_mktemp "$_guard_iw_dir") || return 1
    if ! cat > "$_guard_iw_tmp"; then
        rm -f "$_guard_iw_tmp"
        return 1
    fi
    chmod "$_guard_iw_mode" "$_guard_iw_tmp"
    if [ -f "$_guard_iw_dest" ] && cmp -s "$_guard_iw_dest" "$_guard_iw_tmp"; then
        chmod "$_guard_iw_mode" "$_guard_iw_dest"
        rm -f "$_guard_iw_tmp"
        return 0
    fi
    if ! file_atomic_replace "$_guard_iw_dest" "$_guard_iw_tmp"; then
        rm -f "$_guard_iw_tmp"
        return 1
    fi
    chmod "$_guard_iw_mode" "$_guard_iw_dest"
    rm -f "$_guard_iw_tmp"
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
    if [ -f "$_guard_ic_dest" ] && cmp -s "$_guard_ic_src" "$_guard_ic_dest"; then
        chmod "$_guard_ic_mode" "$_guard_ic_dest"
        return 0
    fi
    file_atomic_replace "$_guard_ic_dest" "$_guard_ic_src" || return $?
    chmod "$_guard_ic_mode" "$_guard_ic_dest"
}

_guard_install_self() {
    _guard_is_dest=$(_guard_install_bin)
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would install %s\n' "$_guard_is_dest"
        return 0
    fi
    mkdir -p "$(dirname "$_guard_is_dest")"
    _guard_is_source=${GUARD_SELF_PATH:-$0}
    if [ -f "$_guard_is_source" ] && guard_distribution_validate_bundle "$_guard_is_source"; then
        if [ -f "$_guard_is_dest" ] && cmp -s "$_guard_is_source" "$_guard_is_dest"; then
            chmod 0755 "$_guard_is_dest"
            return 0
        fi
        file_atomic_replace "$_guard_is_dest" "$_guard_is_source" || return $?
        chmod 0755 "$_guard_is_dest"
        return 0
    fi
    cli_info "script is running from stdin; fetching the verified published bundle"
    if ! guard_distribution_fetch_bundle "$_guard_is_dest" auto; then
        cli_error "unable to install a verified OpenClash Guard bundle"
        return 1
    fi
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
# OpenClash Guard boot reconcile and fixed-interval rule sync.
USE_PROCD=1
START=99
STOP=10
PROG=${_guard_ih_bin}

start_service() {
	\"\$PROG\" reconcile
	procd_open_instance rules-sync
	procd_set_param command \"\$PROG\" rules sync watch
	procd_set_param env GUARD_RULES_ALLOW_WATCH=1
	procd_set_param respawn 3600 5 5
	procd_close_instance
}

reload_service() {
	\"\$PROG\" reconcile
	\"\$PROG\" rules sync run || true
}

stop_service() {
	\"\$PROG\" --yes remove || true
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

_guard_install_service_control() {
    if [ -n "${GUARD_SERVICE_CONTROL:-}" ]; then
        printf '%s\n' "$GUARD_SERVICE_CONTROL"
        return 0
    fi
    if [ -n "${GUARD_PREFIX:-}" ]; then
        return 1
    fi
    _guard_install_init
}

_guard_install_enable_service() {
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would enable %s\n' "$(_guard_install_init)"
        return 0
    fi
    _guard_ies_control=$(_guard_install_service_control) || {
        cli_info "service enable deferred for prefixed installation"
        return 0
    }
    if [ ! -x "$_guard_ies_control" ]; then
        cli_error "Guard service control is missing: $_guard_ies_control"
        return 1
    fi
    if "$_guard_ies_control" enabled >/dev/null 2>&1; then
        return 0
    fi
    "$_guard_ies_control" enable
}

_guard_install_stop_disable_service() {
    _guard_isd_control=$(_guard_install_service_control) || return 0
    [ -x "$_guard_isd_control" ] || return 0
    "$_guard_isd_control" stop >/dev/null 2>&1 || true
    if "$_guard_isd_control" enabled >/dev/null 2>&1; then
        "$_guard_isd_control" disable || return $?
    fi
}

_guard_install_service_state() {
    _guard_iss_control=$(_guard_install_service_control) || {
        printf '%s\n' deferred
        return 0
    }
    if [ ! -x "$_guard_iss_control" ]; then
        printf '%s\n' missing
        return 1
    fi
    if "$_guard_iss_control" enabled >/dev/null 2>&1; then
        printf '%s\n' enabled
        return 0
    fi
    printf '%s\n' disabled
    return 1
}

_guard_install_policy_files() {
    _guard_ip_etc=$(_guard_install_etc)
    _guard_ip_pol=${_GUARD_PREFLIGHT_POLICY_FILE:-}
    _guard_ip_tpl=${_GUARD_PREFLIGHT_TEMPLATES_FILE:-${GUARD_TEMPLATES_SOURCE:-}}
    if [ -z "$_guard_ip_pol" ] && [ -n "${GUARD_POLICY_FILE:-}" ] && [ -f "${GUARD_POLICY_FILE}" ]; then
        _guard_ip_pol=$GUARD_POLICY_FILE
    fi
    if [ -n "$_guard_ip_pol" ] && [ -f "$_guard_ip_pol" ]; then
        # GUARD_POLICY_FILE may identify a staged source. Installation always
        # publishes the validated runtime into the installer-owned directory.
        _guard_ip_dest=$(_guard_install_etc)/openclash-guard.json
        _guard_install_copy "$_guard_ip_pol" "$_guard_ip_dest" 0644 || return $?
        if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
            GUARD_POLICY_FILE=$_guard_ip_dest
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
        _guard_ip_tpl_dest="$(_guard_install_etc)/openclash-guard-templates.json"
        _guard_install_copy "$_guard_ip_tpl" "$_guard_ip_tpl_dest" 0644 || return $?
        if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
            GUARD_TEMPLATES_FILE=$_guard_ip_tpl_dest
        fi
    fi
}

_guard_install_apply_preflight_templates() {
    _guard_iat_catalog=${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}
    [ -f "$_guard_iat_catalog" ] || return 0
    for _guard_iat_id in ${_GUARD_PREFLIGHT_TEMPLATE_IDS:-}
    do
        [ -n "$_guard_iat_id" ] || continue
        for _guard_iat_key in $_GUARD_TEMPLATE_APPLY_KEYS
        do
            if json_has "$_guard_iat_catalog" "templates.${_guard_iat_id}.apply.${_guard_iat_key}"; then
                _guard_iat_val=$(json_get "$_guard_iat_catalog" "templates.${_guard_iat_id}.apply.${_guard_iat_key}") || return 1
                _guard_template_apply_key "$_guard_iat_key" "$_guard_iat_val" || return $?
            fi
        done
    done
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

_guard_install_render_observations() {
    _guard_iro_detected_at=$1
    {
        printf '{"schemaVersion":1,'
        printf '"detectedAt":"%s",' "$(_guard_env_json_string "$_guard_iro_detected_at")"
        printf '"dns":{"backend":"%s","domainSetBackend":"%s"},' \
            "$(_guard_env_json_string "$_GUARD_DNS_BACKEND")" \
            "$(_guard_env_json_string "$_GUARD_DNS_DOMAIN_SET")"
        printf '"direct":{"region":"%s","reason":"%s"},' \
            "$(_guard_env_json_string "$_GUARD_NET_DIRECT_REGION")" \
            "$(_guard_env_json_string "${_GUARD_PREFLIGHT_DIRECT_REASON:-}")"
        printf '"proxy":{"region":"%s","healthy":%s,"route":"%s","reason":"%s"},' \
            "$(_guard_env_json_string "$_GUARD_PROXY_REGION")" \
            "$(_guard_env_json_bool "$_GUARD_PROXY_HEALTHY")" \
            "$(_guard_env_json_string "${_GUARD_GEO_ROUTE:-}")" \
            "$(_guard_env_json_string "${_GUARD_PREFLIGHT_PROXY_REASON:-}")"
        printf '"templates":['
        _guard_iwo_first=1
        for _guard_iwo_id in ${_GUARD_PREFLIGHT_TEMPLATE_IDS:-}
        do
            [ -n "$_guard_iwo_id" ] || continue
            [ "$_guard_iwo_first" = 1 ] || printf ','
            _guard_iwo_first=0
            printf '"%s"' "$(_guard_env_json_string "$_guard_iwo_id")"
        done
        printf ']}\n'
    }
}

_guard_install_write_observations() {
    _guard_iwo_dest=$(_guard_install_observations)
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would write %s\n' "$_guard_iwo_dest"
        return 0
    fi
    mkdir -p "$(dirname "$_guard_iwo_dest")"
    _guard_iwo_tmp=$(file_mktemp "$(dirname "$_guard_iwo_dest")") || return 1
    _guard_iwo_detected_at=
    if [ -f "$_guard_iwo_dest" ] && json_load "$_guard_iwo_dest" >/dev/null 2>&1; then
        _guard_iwo_detected_at=$(json_get "$_guard_iwo_dest" detectedAt 2>/dev/null) || _guard_iwo_detected_at=
    fi
    [ -n "$_guard_iwo_detected_at" ] || _guard_iwo_detected_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _guard_install_render_observations "$_guard_iwo_detected_at" > "$_guard_iwo_tmp"
    json_load "$_guard_iwo_tmp" || {
        rm -f "$_guard_iwo_tmp"
        return 1
    }
    if [ -f "$_guard_iwo_dest" ] && cmp -s "$_guard_iwo_dest" "$_guard_iwo_tmp"; then
        rm -f "$_guard_iwo_tmp"
        return 0
    fi
    _guard_install_render_observations "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$_guard_iwo_tmp"
    file_atomic_replace "$_guard_iwo_dest" "$_guard_iwo_tmp"
    _guard_iwo_rc=$?
    rm -f "$_guard_iwo_tmp"
    return "$_guard_iwo_rc"
}

_GUARD_SETUP_INVALID_REASON=

guard_install_validate() {
    _GUARD_SETUP_INVALID_REASON=
    _guard_iv_bin=$(_guard_install_bin)
    _guard_iv_policy=$(_guard_policy_default_path)
    _guard_iv_templates=$(dirname "$_guard_iv_policy")/openclash-guard-templates.json
    _guard_iv_observations=$(_guard_install_observations)
    _guard_iv_state=$(_guard_distribution_state_path)
    if [ ! -x "$_guard_iv_bin" ] || ! guard_distribution_validate_bundle "$_guard_iv_bin" >/dev/null 2>&1; then
        _GUARD_SETUP_INVALID_REASON="verified Guard runtime bundle is missing"
        return 1
    fi
    if ! guard_policy_validate_file "$_guard_iv_policy" >/dev/null 2>&1; then
        _GUARD_SETUP_INVALID_REASON="runtime policy is missing or invalid"
        return 1
    fi
    if ! guard_template_validate_file "$_guard_iv_templates" >/dev/null 2>&1; then
        _GUARD_SETUP_INVALID_REASON="template catalog is missing or invalid"
        return 1
    fi
    if ! json_load "$_guard_iv_observations" >/dev/null 2>&1 || \
       [ "$(json_get "$_guard_iv_observations" schemaVersion 2>/dev/null || printf 0)" != 1 ]; then
        _GUARD_SETUP_INVALID_REASON="validated environment observations are missing"
        return 1
    fi
    if [ ! -f "$_guard_iv_state" ] || [ -z "$(_guard_distribution_selected 2>/dev/null || true)" ]; then
        _GUARD_SETUP_INVALID_REASON="distribution source metadata is missing"
        return 1
    fi
    for _guard_iv_hook in "$(_guard_install_init)" "$(_guard_install_hotplug)" "$(_guard_install_fw4)" "$(_guard_install_oc_hook)"
    do
        if [ ! -x "$_guard_iv_hook" ]; then
            _GUARD_SETUP_INVALID_REASON="required runtime hook is missing: $_guard_iv_hook"
            return 1
        fi
    done
    if ! command -v uci >/dev/null 2>&1 || \
       [ "$(uci_get_default openclash_guard.main.enabled 0 2>/dev/null || printf 0)" != 1 ] || \
       [ "$(uci_get_default openclash_guard.main.dns_ownership "" 2>/dev/null || true)" != preserve ] || \
       [ "$(uci_get_default openclash_guard.udp.protect_udp_443 0 2>/dev/null || printf 0)" != 1 ]; then
        _GUARD_SETUP_INVALID_REASON="required Guard UCI configuration is incomplete"
        return 1
    fi
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
    guard_preflight_require_stage || return $?
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
        if ! cli_confirm "Provision the complete OpenClash Guard runtime?"; then
            cli_error "refusing to install without confirmation (pass --yes)"
            return 1
        fi
    fi
    _guard_install_self || return $?
    _guard_install_policy_files || return $?
    _guard_install_hooks || return $?
    guard_rules_init || return $?
    _guard_install_write_uci "$_guard_in_mode" "$_guard_in_ks_eff" "$_guard_in_dns_eff" "$_guard_in_game_eff" "$_guard_in_url" "$_guard_in_clients" || return $?
    _guard_install_write_observations || return $?
    _guard_install_enable_service || return $?
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        cli_info "dry-run: install not written"
        return 0
    fi
    _guard_distribution_record "$_GUARD_PREFLIGHT_SOURCE" "$_GUARD_PREFLIGHT_POLICY_URL" "$_GUARD_PREFLIGHT_TEMPLATES_URL" 1 || return $?
    if ! guard_install_validate; then
        cli_error "Setup validation failed: $_GUARD_SETUP_INVALID_REASON"
        return 1
    fi
    _guard_in_overlay=$(_guard_overlay_hook_path)
    if [ -f "$_guard_in_overlay" ]; then
        if cli_confirm "Activate the four staged Custom rule-provider slots through OpenClash's documented hook?"; then
            guard_overlay_activate --yes || {
                cli_error "setup completed, but rule activation failed safely; staged rules are not active"
                return 1
            }
        else
            cli_warn "rules are staged, not yet active; run 'openclash-guard rules activate --yes'"
        fi
    else
        cli_warn "rules are staged, not yet active; OpenClash custom-overwrite hook was not found at $_guard_in_overlay"
    fi
    cli_success "setup complete; runtime is valid and not yet applied"
}

guard_cmd_health_check() {
    _guard_hc_json=${_GUARD_JSON:-0}
    while [ "$#" -gt 0 ]; do
        case $1 in
            --json) _guard_hc_json=1; shift ;;
            *) cli_error "unknown health-check option: $1"; return 2 ;;
        esac
    done
    _guard_hc_valid=1
    _guard_hc_reason=
    if ! guard_install_validate; then
        _guard_hc_valid=0
        _guard_hc_reason=$_GUARD_SETUP_INVALID_REASON
    fi
    _guard_hc_service=$(_guard_install_service_state 2>/dev/null) || true
    [ -n "$_guard_hc_service" ] || _guard_hc_service=missing
    if [ "$_guard_hc_service" = missing ] || [ "$_guard_hc_service" = disabled ]; then
        _guard_hc_valid=0
        [ -n "$_guard_hc_reason" ] || _guard_hc_reason="Guard service is $_guard_hc_service"
    fi
    _guard_hc_overlay=staged
    guard_overlay_is_active && _guard_hc_overlay=active
    if [ "$_guard_hc_json" = 1 ]; then
        printf '{"healthy":%s,"service":"%s","firewallHooks":%s,"rules":{"activation":"%s","data":"preserved"},"reason":"%s"}\n' \
            "$(_guard_env_json_bool "$_guard_hc_valid")" \
            "$(_guard_env_json_string "$_guard_hc_service")" \
            "$(_guard_env_json_bool "$([ -x "$(_guard_install_hotplug)" ] && [ -x "$(_guard_install_fw4)" ] && printf 1 || printf 0)")" \
            "$(_guard_env_json_string "$_guard_hc_overlay")" \
            "$(_guard_env_json_string "$_guard_hc_reason")"
    else
        cli_section "OpenClash Guard health check"
        cli_kv install "$([ "$_guard_hc_valid" = 1 ] && printf healthy || printf unhealthy)"
        cli_kv service "$_guard_hc_service"
        cli_kv firewall.hotplug "$([ -x "$(_guard_install_hotplug)" ] && printf present || printf missing)"
        cli_kv firewall.fw4 "$([ -x "$(_guard_install_fw4)" ] && printf present || printf missing)"
        cli_kv rules.activation "$_guard_hc_overlay"
        [ -z "$_guard_hc_reason" ] || cli_kv reason "$_guard_hc_reason"
    fi
    [ "$_guard_hc_valid" = 1 ]
}

_guard_install_remove_owned_file() {
    _guard_irof_file=$1
    _guard_irof_marker=${2:-}
    [ -e "$_guard_irof_file" ] || return 0
    if [ -n "$_guard_irof_marker" ] && ! grep -F "$_guard_irof_marker" "$_guard_irof_file" >/dev/null 2>&1; then
        cli_warn "preserving modified file not recognized as Guard-owned: $_guard_irof_file"
        return 0
    fi
    rm -f "$_guard_irof_file"
}

guard_cmd_uninstall() {
    _guard_un_yes=0
    _guard_un_purge=0
    while [ "$#" -gt 0 ]; do
        case $1 in
            --yes|-y) _guard_un_yes=1; shift ;;
            --purge-rules) _guard_un_purge=1; shift ;;
            *) cli_error "unknown uninstall option: $1"; return 2 ;;
        esac
    done
    [ "$_guard_un_yes" -eq 1 ] && cli_set_assume_yes 1
    if [ "$_guard_un_purge" -eq 1 ]; then
        _guard_un_prompt="Uninstall OpenClash Guard and permanently delete staged rule data?"
    else
        _guard_un_prompt="Uninstall OpenClash Guard and preserve staged rule data?"
    fi
    if ! cli_confirm "$_guard_un_prompt"; then
        cli_error "refusing to uninstall without confirmation (pass --yes)"
        return 1
    fi
    _guard_un_rc=0
    if ! guard_overlay_deactivate --yes; then
        cli_error "uninstall stopped before removing the Guard runtime because the managed overlay could not be removed safely"
        return 1
    fi
    guard_cmd_remove || _guard_un_rc=1
    _guard_install_stop_disable_service || _guard_un_rc=1
    if command -v uci >/dev/null 2>&1; then
        for _guard_un_uci in \
            openclash_guard.main.enabled \
            openclash_guard.main.mode \
            openclash_guard.main.kill_switch \
            openclash_guard.main.dns_kill_switch \
            openclash_guard.main.dns_ownership \
            openclash_guard.main.policy_refresh \
            openclash_guard.main.policy_url \
            openclash_guard.udp.enabled \
            openclash_guard.udp.blanket_udp_bypass \
            openclash_guard.udp.protect_udp_443 \
            openclash_guard.udp.src_ip
        do
            uci_delete "$_guard_un_uci"
        done
        uci_delete openclash_guard.main
        uci_delete openclash_guard.udp
        uci_commit_if_changed openclash_guard || _guard_un_rc=1
    fi
    _guard_install_remove_owned_file "$(_guard_install_hotplug)" "# fw4/firewall reload hook." || _guard_un_rc=1
    _guard_install_remove_owned_file "$(_guard_install_fw4)" "# fw4 include." || _guard_un_rc=1
    _guard_install_remove_owned_file "$(_guard_install_oc_hook)" "# Observe OpenClash restart." || _guard_un_rc=1
    _guard_install_remove_owned_file "$(_guard_install_init)" "# OpenClash Guard boot reconcile" || _guard_un_rc=1
    _guard_un_oc_dropin="$(_guard_install_root)/etc/openclash/openclash-guard-hook.sh"
    _guard_install_remove_owned_file "$_guard_un_oc_dropin" "# Drop-in observer." || _guard_un_rc=1
    _guard_install_remove_owned_file "$(_guard_install_bin)" || _guard_un_rc=1
    _guard_install_remove_owned_file "$(_guard_install_etc)/openclash-guard.json" || _guard_un_rc=1
    _guard_install_remove_owned_file "$(_guard_install_etc)/openclash-guard-templates.json" || _guard_un_rc=1
    _guard_install_remove_owned_file "$(_guard_install_observations)" || _guard_un_rc=1
    _guard_install_remove_owned_file "$(_guard_distribution_state_path)" || _guard_un_rc=1
    if [ "$_guard_un_purge" -eq 1 ]; then
        guard_rules_purge || _guard_un_rc=1
    else
        cli_info "preserved staged rule data under $(_guard_overlay_provider_root | sed 's,/providers$,,' )"
    fi
    rmdir "$(_guard_install_etc)/backups" "$(_guard_install_etc)" 2>/dev/null || true
    rmdir "$(_guard_install_root)/usr/lib/openclash-guard" 2>/dev/null || true
    if [ "$_guard_un_rc" -ne 0 ]; then
        cli_error "uninstall completed with cleanup errors"
        return "$_guard_un_rc"
    fi
    if [ "$_guard_un_purge" -eq 1 ]; then
        cli_success "OpenClash Guard uninstalled; staged rule data deleted"
    else
        cli_success "OpenClash Guard uninstalled; staged rule data preserved"
    fi
}
# END MODULE: guard-install

# BEGIN MODULE: guard-preflight
# Complete read-only bootstrap discovery for OpenClash Guard.
# Prefix: guard_preflight_
set -eu

_GUARD_PREFLIGHT_COMPLETE=0
_GUARD_PREFLIGHT_POLICY_FILE=
_GUARD_PREFLIGHT_TEMPLATES_FILE=
_GUARD_PREFLIGHT_SOURCE=
_GUARD_PREFLIGHT_POLICY_URL=
_GUARD_PREFLIGHT_TEMPLATES_URL=
_GUARD_PREFLIGHT_SOURCE_REASON=
_GUARD_PREFLIGHT_DIRECT_REASON=
_GUARD_PREFLIGHT_PROXY_REASON=
_GUARD_PREFLIGHT_TEMPLATE_IDS=
_GUARD_PREFLIGHT_TEMPLATE_REASON=
_GUARD_PREFLIGHT_SETUP_VALID=0
_GUARD_PREFLIGHT_SETUP_REASON=
_GUARD_PREFLIGHT_GUARD_INSTALLED=0
_GUARD_PREFLIGHT_CACHE_DIR=
_GUARD_PREFLIGHT_CACHE_TEMP=0
_GUARD_PREFLIGHT_POLICY_TEMP=0
_GUARD_PREFLIGHT_TEMPLATES_TEMP=0

_guard_preflight_remove_file() {
    [ -n "${1:-}" ] && [ -f "$1" ] && rm -f "$1"
}

guard_preflight_cleanup() {
    if [ "${_GUARD_PREFLIGHT_POLICY_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_POLICY_FILE:-}"
    fi
    if [ "${_GUARD_PREFLIGHT_TEMPLATES_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}"
    fi
    if [ "${_GUARD_PREFLIGHT_CACHE_TEMP:-0}" = 1 ] && [ -n "${_GUARD_PREFLIGHT_CACHE_DIR:-}" ] && [ -d "$_GUARD_PREFLIGHT_CACHE_DIR" ]; then
        _guard_preflight_remove_file "$_GUARD_PREFLIGHT_CACHE_DIR/direct.json"
        for _guard_pc_file in "$_GUARD_PREFLIGHT_CACHE_DIR"/route-*.json
        do
            [ -f "$_guard_pc_file" ] && rm -f "$_guard_pc_file"
        done
        rmdir "$_GUARD_PREFLIGHT_CACHE_DIR" 2>/dev/null || true
    fi
    _GUARD_PREFLIGHT_POLICY_FILE=
    _GUARD_PREFLIGHT_TEMPLATES_FILE=
    _GUARD_PREFLIGHT_CACHE_DIR=
    _GUARD_PREFLIGHT_CACHE_TEMP=0
    _GUARD_PREFLIGHT_POLICY_TEMP=0
    _GUARD_PREFLIGHT_TEMPLATES_TEMP=0
}

_guard_preflight_source_list() {
    case ${1:-auto} in
        auto) printf '%s\n' "github-raw jsdelivr" ;;
        github-raw|raw|jsdelivr|cdn) printf '%s\n' "$1" ;;
        *) return 2 ;;
    esac
}

guard_preflight_stage_distribution() {
    _guard_ps_source=${1:-auto}
    _guard_ps_base=${2:-}
    _guard_ps_sources=$(_guard_preflight_source_list "$_guard_ps_source") || {
        _GUARD_PREFLIGHT_SOURCE_REASON="unsupported distribution source: $_guard_ps_source"
        return 2
    }
    if [ "${_GUARD_PREFLIGHT_POLICY_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_POLICY_FILE:-}"
    fi
    if [ "${_GUARD_PREFLIGHT_TEMPLATES_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}"
    fi
    _GUARD_PREFLIGHT_POLICY_FILE=
    _GUARD_PREFLIGHT_TEMPLATES_FILE=
    _GUARD_PREFLIGHT_SOURCE=
    _GUARD_PREFLIGHT_POLICY_URL=
    _GUARD_PREFLIGHT_TEMPLATES_URL=
    _GUARD_PREFLIGHT_SOURCE_REASON=
    _GUARD_PREFLIGHT_POLICY_TEMP=0
    _GUARD_PREFLIGHT_TEMPLATES_TEMP=0
    for _guard_ps_item in $_guard_ps_sources
    do
        _guard_ps_policy=$(file_mktemp) || return 1
        _guard_ps_templates=$(file_mktemp) || {
            rm -f "$_guard_ps_policy"
            return 1
        }
        _guard_ps_policy_url=$(_guard_distribution_policy_url "$_guard_ps_item" "$_guard_ps_base") || {
            rm -f "$_guard_ps_policy" "$_guard_ps_templates"
            continue
        }
        _guard_ps_templates_url=$(_guard_distribution_templates_url "$_guard_ps_item" "$_guard_ps_base") || {
            rm -f "$_guard_ps_policy" "$_guard_ps_templates"
            continue
        }
        _guard_ps_ok=1
        fetch_http "$_guard_ps_policy_url" "$_guard_ps_policy" || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && guard_policy_validate_file "$_guard_ps_policy" || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && fetch_http "$_guard_ps_templates_url" "$_guard_ps_templates" || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && guard_template_validate_file "$_guard_ps_templates" || _guard_ps_ok=0
        if [ "$_guard_ps_ok" = 1 ]; then
            _GUARD_PREFLIGHT_POLICY_FILE=$_guard_ps_policy
            _GUARD_PREFLIGHT_TEMPLATES_FILE=$_guard_ps_templates
            _GUARD_PREFLIGHT_SOURCE=$_guard_ps_item
            _GUARD_PREFLIGHT_POLICY_URL=$_guard_ps_policy_url
            _GUARD_PREFLIGHT_TEMPLATES_URL=$_guard_ps_templates_url
            _GUARD_PREFLIGHT_POLICY_TEMP=1
            _GUARD_PREFLIGHT_TEMPLATES_TEMP=1
            return 0
        fi
        rm -f "$_guard_ps_policy" "$_guard_ps_templates"
    done
    _GUARD_PREFLIGHT_SOURCE_REASON="no distribution source supplied a valid policy and template catalog"
    return 1
}

_guard_preflight_installed_policy() {
    _guard_pi_policy=$(_guard_policy_default_path)
    if guard_policy_validate_file "$_guard_pi_policy" >/dev/null 2>&1; then
        printf '%s\n' "$_guard_pi_policy"
        return 0
    fi
    return 1
}

_guard_preflight_installed_templates() {
    _guard_pi_templates=$(_guard_template_catalog_path)
    if guard_template_validate_file "$_guard_pi_templates" >/dev/null 2>&1; then
        printf '%s\n' "$_guard_pi_templates"
        return 0
    fi
    return 1
}

_guard_preflight_last_error() {
    _guard_pe_file=$1
    _guard_pe_fallback=$2
    _guard_pe_line=$(tail -n 1 "$_guard_pe_file" 2>/dev/null) || _guard_pe_line=
    rm -f "$_guard_pe_file"
    if [ -n "$_guard_pe_line" ]; then
        printf '%s\n' "$_guard_pe_line"
    else
        printf '%s\n' "$_guard_pe_fallback"
    fi
}

_guard_preflight_geo_cache() {
    if [ -n "${GUARD_GEO_CACHE_DIR:-}" ] && [ -d "$GUARD_GEO_CACHE_DIR" ]; then
        _GUARD_PREFLIGHT_CACHE_DIR=$GUARD_GEO_CACHE_DIR
        _GUARD_PREFLIGHT_CACHE_TEMP=0
        return 0
    fi
    _guard_pg_marker=$(file_mktemp) || return 1
    rm -f "$_guard_pg_marker"
    mkdir "$_guard_pg_marker" || return 1
    _GUARD_PREFLIGHT_CACHE_DIR=$_guard_pg_marker
    _GUARD_PREFLIGHT_CACHE_TEMP=1
    GUARD_GEO_CACHE_DIR=$_guard_pg_marker
    export GUARD_GEO_CACHE_DIR
}

_guard_preflight_detect_direct() {
    if [ -n "${GUARD_DIRECT_REGION:-}" ]; then
        _GUARD_NET_DIRECT_REGION=$GUARD_DIRECT_REGION
        _GUARD_PREFLIGHT_DIRECT_REASON="provided by GUARD_DIRECT_REGION"
        return 0
    fi
    _GUARD_NET_DIRECT_REGION=
    _guard_pd_err=$(file_mktemp) || return 1
    if guard_geo_detect_direct >/dev/null 2>"$_guard_pd_err"; then
        _GUARD_NET_DIRECT_REGION=$(guard_geo_cached_country direct 2>/dev/null) || _GUARD_NET_DIRECT_REGION=
        rm -f "$_guard_pd_err"
        if [ -n "$_GUARD_NET_DIRECT_REGION" ]; then
            _GUARD_PREFLIGHT_DIRECT_REASON="direct HTTPS geo probe bypassed proxy environment"
            return 0
        fi
    fi
    _GUARD_PREFLIGHT_DIRECT_REASON=$(_guard_preflight_last_error "$_guard_pd_err" "direct geo providers returned no usable country")
    return 1
}

_guard_preflight_detect_proxy() {
    _GUARD_PROXY_HEALTHY=0
    if [ "$_GUARD_OC_INSTALLED" != 1 ]; then
        _GUARD_PROXY_REGION=
        _GUARD_PREFLIGHT_PROXY_REASON="OpenClash is not installed"
        return 1
    fi
    if [ "$_GUARD_OC_RUNNING" != 1 ]; then
        _GUARD_PROXY_REGION=
        _GUARD_PREFLIGHT_PROXY_REASON="OpenClash is not running"
        return 1
    fi
    if [ "$_GUARD_OC_HEALTHY" != 1 ]; then
        _GUARD_PROXY_REGION=
        _GUARD_PREFLIGHT_PROXY_REASON="OpenClash runtime health probe failed"
        return 1
    fi
    if [ -n "${GUARD_PROXY_REGION:-}" ]; then
        _GUARD_PROXY_REGION=$GUARD_PROXY_REGION
        _GUARD_PROXY_HEALTHY=$(_guard_env_proxy_healthy)
        if guard_geo_discover_proxy_route; then
            _GUARD_PROXY_HEALTHY=1
            _GUARD_PREFLIGHT_PROXY_REASON="provided by GUARD_PROXY_REGION; route capability discovered"
        else
            _GUARD_PREFLIGHT_PROXY_REASON="provided by GUARD_PROXY_REGION; route was not testable: ${_GUARD_GEO_ROUTE_REASON:-unavailable}"
        fi
        return 0
    fi
    if ! guard_geo_discover_proxy_route; then
        _GUARD_PROXY_REGION=
        _GUARD_PREFLIGHT_PROXY_REASON=${_GUARD_GEO_ROUTE_REASON:-OpenClash proxy route is unavailable}
        return 1
    fi
    _GUARD_PROXY_REGION=
    _guard_pp_err=$(file_mktemp) || return 1
    if guard_geo_detect_route "$_GUARD_GEO_ROUTE" >/dev/null 2>"$_guard_pp_err"; then
        _GUARD_PROXY_REGION=$(guard_geo_cached_country route "$_GUARD_GEO_ROUTE" 2>/dev/null) || _GUARD_PROXY_REGION=
        rm -f "$_guard_pp_err"
        if [ -n "$_GUARD_PROXY_REGION" ]; then
            _GUARD_PROXY_HEALTHY=1
            _GUARD_PREFLIGHT_PROXY_REASON="geo probe traversed $_GUARD_GEO_ROUTE"
            return 0
        fi
    fi
    _GUARD_PREFLIGHT_PROXY_REASON=$(_guard_preflight_last_error "$_guard_pp_err" "no active OpenClash proxy route could be tested successfully")
    return 1
}

_guard_preflight_match_templates() {
    _GUARD_PREFLIGHT_TEMPLATE_IDS=
    _GUARD_PREFLIGHT_TEMPLATE_REASON=
    _guard_pt_catalog=${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}
    if [ -z "$_guard_pt_catalog" ] || [ ! -f "$_guard_pt_catalog" ]; then
        _guard_pt_catalog=$(_guard_preflight_installed_templates 2>/dev/null) || _guard_pt_catalog=
    fi
    if [ -z "$_guard_pt_catalog" ]; then
        _GUARD_PREFLIGHT_TEMPLATE_REASON="no validated template catalog is available"
        return 1
    fi
    _guard_pt_env=$(file_mktemp) || return 1
    guard_env_json > "$_guard_pt_env"
    _GUARD_PREFLIGHT_TEMPLATE_IDS=$(guard_template_matches "$_guard_pt_catalog" "$_guard_pt_env") || _GUARD_PREFLIGHT_TEMPLATE_IDS=
    rm -f "$_guard_pt_env"
    if [ -n "$_GUARD_PREFLIGHT_TEMPLATE_IDS" ]; then
        _GUARD_PREFLIGHT_TEMPLATE_REASON="matched against complete preflight environment"
    else
        _GUARD_PREFLIGHT_TEMPLATE_REASON="validated catalog has no matching template"
    fi
}

_guard_preflight_local_policy() {
    # Accept a locally-provided policy file from the environment without a network fetch.
    # This keeps preflight non-mutating and allows tests/operators to supply known-good files.
    _guard_plp_file=${GUARD_POLICY_FILE:-}
    if [ -n "$_guard_plp_file" ] && guard_policy_validate_file "$_guard_plp_file" >/dev/null 2>&1; then
        printf '%s\n' "$_guard_plp_file"
        return 0
    fi
    return 1
}

_guard_preflight_local_templates() {
    # Accept a locally-provided templates file from the environment.
    for _guard_plt_f in "${GUARD_TEMPLATES_FILE:-}" "${GUARD_TEMPLATES_SOURCE:-}"
    do
        [ -n "$_guard_plt_f" ] && guard_template_validate_file "$_guard_plt_f" >/dev/null 2>&1 || continue
        printf '%s\n' "$_guard_plt_f"
        return 0
    done
    # Try sibling of GUARD_POLICY_FILE
    _guard_plt_pol=${GUARD_POLICY_FILE:-}
    if [ -n "$_guard_plt_pol" ]; then
        _guard_plt_sib=$(dirname "$_guard_plt_pol")/openclash-guard-templates.json
        if guard_template_validate_file "$_guard_plt_sib" >/dev/null 2>&1; then
            printf '%s\n' "$_guard_plt_sib"
            return 0
        fi
    fi
    return 1
}

guard_preflight_run() {
    guard_preflight_cleanup
    _GUARD_PREFLIGHT_COMPLETE=0
    _GUARD_PREFLIGHT_SETUP_VALID=0
    _GUARD_PREFLIGHT_SETUP_REASON=
    _GUARD_PREFLIGHT_GUARD_INSTALLED=0
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    [ -x "$(_guard_install_bin)" ] && _GUARD_PREFLIGHT_GUARD_INSTALLED=1
    # Use locally-provided files when available; only fetch from network when none exist.
    _guard_pf_local_pol=$(_guard_preflight_local_policy 2>/dev/null) || _guard_pf_local_pol=
    _guard_pf_local_tpl=$(_guard_preflight_local_templates 2>/dev/null) || _guard_pf_local_tpl=
    if [ -n "$_guard_pf_local_pol" ] && [ -n "$_guard_pf_local_tpl" ]; then
        _GUARD_PREFLIGHT_POLICY_FILE=$_guard_pf_local_pol
        _GUARD_PREFLIGHT_TEMPLATES_FILE=$_guard_pf_local_tpl
        _GUARD_PREFLIGHT_SOURCE=local
        _GUARD_PREFLIGHT_POLICY_URL=
        _GUARD_PREFLIGHT_TEMPLATES_URL=
        _GUARD_PREFLIGHT_POLICY_TEMP=0
        _GUARD_PREFLIGHT_TEMPLATES_TEMP=0
    elif [ -n "$_guard_pf_local_pol" ] && [ -z "$_guard_pf_local_tpl" ]; then
        # Have policy but no templates: try network for templates only.
        guard_preflight_stage_distribution "${GUARD_DISTRIBUTION_SOURCE:-auto}" "${GUARD_POLICY_BASE_URL:-}" || true
    else
        guard_preflight_stage_distribution "${GUARD_DISTRIBUTION_SOURCE:-auto}" "${GUARD_POLICY_BASE_URL:-}" || true
    fi
    if [ -z "$_GUARD_PREFLIGHT_POLICY_FILE" ]; then
        # Network fetch may have failed or no network pair was found; fall back to local policy.
        if [ -n "$_guard_pf_local_pol" ]; then
            _GUARD_PREFLIGHT_POLICY_FILE=$_guard_pf_local_pol
        else
            _GUARD_PREFLIGHT_POLICY_FILE=$(_guard_preflight_installed_policy 2>/dev/null) || _GUARD_PREFLIGHT_POLICY_FILE=
        fi
    fi
    if [ -z "$_GUARD_PREFLIGHT_TEMPLATES_FILE" ]; then
        _GUARD_PREFLIGHT_TEMPLATES_FILE=$(_guard_preflight_installed_templates 2>/dev/null) || _GUARD_PREFLIGHT_TEMPLATES_FILE=
    fi
    _guard_preflight_geo_cache || {
        _GUARD_PREFLIGHT_DIRECT_REASON="unable to create temporary geo cache"
        _GUARD_PREFLIGHT_PROXY_REASON="unable to create temporary geo cache"
    }
    if [ -n "$_GUARD_PREFLIGHT_POLICY_FILE" ] && [ -n "$_GUARD_PREFLIGHT_CACHE_DIR" ]; then
        _guard_preflight_detect_direct || true
        _guard_preflight_detect_proxy || true
    else
        _GUARD_NET_DIRECT_REGION=
        _GUARD_PROXY_REGION=
        [ -n "$_GUARD_PREFLIGHT_DIRECT_REASON" ] || _GUARD_PREFLIGHT_DIRECT_REASON="no validated runtime policy is available for geo providers"
        [ -n "$_GUARD_PREFLIGHT_PROXY_REASON" ] || _GUARD_PREFLIGHT_PROXY_REASON="no validated runtime policy is available for geo providers"
    fi
    _guard_preflight_match_templates || true
    if guard_install_validate >/dev/null 2>&1; then
        _GUARD_PREFLIGHT_SETUP_VALID=1
        _GUARD_PREFLIGHT_SETUP_REASON="complete runtime validated"
    elif [ -n "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ] && \
         [ -f "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ] && \
         command -v uci >/dev/null 2>&1 && \
         [ "$(uci_get_default openclash_guard.main.enabled 0 2>/dev/null || printf 0)" = 1 ]; then
        _GUARD_PREFLIGHT_SETUP_VALID=1
        _GUARD_PREFLIGHT_SETUP_REASON="operational: policy loaded and Guard enabled in UCI"
    else
        _GUARD_PREFLIGHT_SETUP_REASON=${_GUARD_SETUP_INVALID_REASON:-runtime is not fully provisioned}
    fi
    _GUARD_PREFLIGHT_COMPLETE=1
}

guard_preflight_require_stage() {
    if [ "${_GUARD_PREFLIGHT_COMPLETE:-0}" != 1 ]; then
        guard_preflight_run
    fi
    if [ -f "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ] && \
       [ -f "${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}" ]; then
        return 0
    fi
    cli_error "Setup requires a validated policy/template pair: ${_GUARD_PREFLIGHT_SOURCE_REASON:-unavailable}"
    return 1
}
# END MODULE: guard-preflight

# BEGIN MODULE: guard-menu
# Interactive /dev/tty frontend over the existing guard command functions.
# Prefix: guard_menu_
set -eu

_guard_menu_value() {
    if [ -n "${1:-}" ]; then
        printf '%s\n' "$1" | tr 'a-z' 'A-Z'
    else
        printf '%s\n' "unknown"
    fi
}

_guard_menu_environment() {
    _guard_me_openclash="installed=$_GUARD_OC_INSTALLED enabled=$_GUARD_OC_ENABLED running=$_GUARD_OC_RUNNING healthy=$_GUARD_OC_HEALTHY"
    _guard_me_dns=$_GUARD_DNS_BACKEND
    [ "$_guard_me_dns" = adguardhome ] && _guard_me_dns="AdGuard Home"
    [ "$_guard_me_dns" = none ] && _guard_me_dns=unknown
    _guard_me_guard=uninitialized
    [ "$_GUARD_PREFLIGHT_SETUP_VALID" = 1 ] && _guard_me_guard=valid
    _guard_me_source=$_GUARD_PREFLIGHT_SOURCE
    if [ -z "$_guard_me_source" ]; then
        _guard_me_source=$(_guard_distribution_selected 2>/dev/null) || _guard_me_source=unknown
    fi
    _guard_me_templates=$(printf '%s' "$_GUARD_PREFLIGHT_TEMPLATE_IDS" | tr '\n' ' ')
    [ -n "$_guard_me_templates" ] || _guard_me_templates=none

    cli_section "OpenClash Guard"
    printf '\nDetected environment\n'
    cli_kv "  OpenClash" "$_guard_me_openclash"
    cli_kv "  DNS backend / ownership" "$_guard_me_dns / $_GUARD_DNS_DOMAIN_SET"
    cli_kv "  Direct region" "$(_guard_menu_value "$_GUARD_NET_DIRECT_REGION")"
    [ -n "$_GUARD_NET_DIRECT_REGION" ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_DIRECT_REASON"
    cli_kv "  Proxy region" "$(_guard_menu_value "$_GUARD_PROXY_REGION")"
    [ -n "$_GUARD_PROXY_REGION" ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_PROXY_REASON"
    cli_kv "  Proxy health" "$_GUARD_PROXY_HEALTHY"
    cli_kv "  Routing capability" "${_GUARD_GEO_ROUTE:-unavailable}"
    cli_kv "  Guard runtime" "$_guard_me_guard"
    [ "$_GUARD_PREFLIGHT_SETUP_VALID" = 1 ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_SETUP_REASON"
    cli_kv "  Distribution source" "$_guard_me_source"
    [ -n "$_GUARD_PREFLIGHT_SOURCE" ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_SOURCE_REASON"
    cli_kv "  Matching templates" "$_guard_me_templates"
    [ -n "$_GUARD_PREFLIGHT_TEMPLATE_IDS" ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_TEMPLATE_REASON"
}

_guard_menu_setup() {
    _guard_dispatch install || return $?
    guard_preflight_run
    if [ "$_GUARD_PREFLIGHT_SETUP_VALID" != 1 ]; then
        cli_error "Setup returned without a valid runtime: $_GUARD_PREFLIGHT_SETUP_REASON"
        return 1
    fi
    if cli_confirm "Setup is valid. Apply / reconcile now?"; then
        _guard_dispatch reconcile
    else
        cli_info "Setup is valid; Apply remains pending"
    fi
}

_guard_menu_confirm_dispatch() {
    _guard_mc_prompt=$1
    shift
    if ! cli_confirm "$_guard_mc_prompt"; then
        cli_warn "aborted"
        return 1
    fi
    _guard_dispatch "$@"
}

guard_menu() {
    guard_preflight_run
    while :; do
        printf '\n'
        _guard_menu_environment
        printf '\nActions\n'
        if [ "$_GUARD_PREFLIGHT_SETUP_VALID" = 1 ]; then
            printf '%s\n' \
                "  1. Refresh runtime assets    [mutating]" \
                "  2. Apply / reconcile         [mutating]" \
                "  3. Status                    [read-only]" \
                "  4. Doctor                    [read-only]" \
                "  5. Remove firewall rules     [mutating]" \
                "  6. Health check              [read-only]" \
                "  7. List staged custom rules  [read-only]" \
                "  8. Uninstall Guard           [mutating]" \
                "  0. Exit"
        else
            printf '%s\n' \
                "  1. Setup                     [mutating]" \
                "  2. Status                    [read-only]" \
                "  3. Doctor                    [read-only]" \
                "  0. Exit"
        fi
        printf '\nSelect an action: ' >&2
        _guard_menu_choice=$(cli_read_tty) || return 0
        printf '\n'
        if [ "$_GUARD_PREFLIGHT_SETUP_VALID" = 1 ]; then
            case $_guard_menu_choice in
                1) _guard_menu_confirm_dispatch "Refresh the validated runtime assets?" refresh --source auto || true; guard_preflight_run || true ;;
                2) _guard_menu_confirm_dispatch "Apply OpenClash Guard firewall policy?" reconcile || true; guard_preflight_run || true ;;
                3) _guard_dispatch status || true ;;
                4) _guard_dispatch doctor || true ;;
                5) _guard_dispatch remove || true; guard_preflight_run || true ;;
                6) _guard_dispatch health-check || true ;;
                7) _guard_dispatch rules list || true ;;
                8) if _guard_menu_confirm_dispatch "Uninstall OpenClash Guard and preserve staged rule data?" uninstall --yes; then return 0; fi ;;
                0) return 0 ;;
                *) cli_warn "unknown menu choice: $_guard_menu_choice" ;;
            esac
        else
            case $_guard_menu_choice in
                1) _guard_menu_setup || true; guard_preflight_run || true ;;
                2) _guard_dispatch status || true ;;
                3) _guard_dispatch doctor || true ;;
                0) return 0 ;;
                *) cli_warn "unknown menu choice: $_guard_menu_choice" ;;
            esac
        fi
    done
}
# END MODULE: guard-menu

# BEGIN MODULE: guard-main
# openclash-guard CLI: lifecycle, diagnostics, templates, geo, and custom rules.
set -eu

_GUARD_JSON=0
_GUARD_LOCK_HELD=0

guard_usage() {
    printf '%s\n' "usage: openclash-guard apply|reconcile|status|doctor [SERVICE]|health-check|refresh|remove|eval|template|install|uninstall|geo|rules [--json] [--yes] [--dry-run] [--policy-file FILE]"
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
    if [ -n "${GUARD_DISTRIBUTION_STATE_FILE:-}" ]; then
        printf '%s\n' "$GUARD_DISTRIBUTION_STATE_FILE"
    elif [ -n "${GUARD_POLICY_FILE:-}" ]; then
        printf '%s/distribution-state\n' "$(dirname "$GUARD_POLICY_FILE")"
    else
        printf '%s/etc/openclash-guard/distribution-state\n' "${GUARD_PREFIX:-}"
    fi
}

_guard_distribution_selected() {
    _guard_ds_file=$(_guard_distribution_state_path)
    [ -f "$_guard_ds_file" ] || return 1
    sed -n 's/^selectedSource=//p' "$_guard_ds_file" | head -n 1
}

_guard_distribution_record() {
    [ "${GUARD_DRY_RUN:-0}" = 1 ] && return 0
    _guard_dr_file=$(_guard_distribution_state_path)
    _guard_dr_preserve=${4:-0}
    if [ "$_guard_dr_preserve" = 1 ] && [ -f "$_guard_dr_file" ]; then
        _guard_dr_source=$(sed -n 's/^selectedSource=//p' "$_guard_dr_file" | head -n 1)
        _guard_dr_policy=$(sed -n 's/^policyURL=//p' "$_guard_dr_file" | head -n 1)
        _guard_dr_templates=$(sed -n 's/^templatesURL=//p' "$_guard_dr_file" | head -n 1)
        if [ "$_guard_dr_source" = "$1" ] && \
           [ "$_guard_dr_policy" = "${2:-}" ] && \
           [ "$_guard_dr_templates" = "${3:-}" ]; then
            return 0
        fi
    fi
    mkdir -p "$(dirname "$_guard_dr_file")"
    _guard_dr_tmp=$(file_mktemp "$(dirname "$_guard_dr_file")") || return 1
    printf 'selectedSource=%s\npolicyURL=%s\ntemplatesURL=%s\nlastRefresh=%s\n' \
        "$1" "${2:-}" "${3:-}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$_guard_dr_tmp"
    file_atomic_replace "$_guard_dr_file" "$_guard_dr_tmp"
    _guard_dr_rc=$?
    rm -f "$_guard_dr_tmp"
    return "$_guard_dr_rc"
}

_guard_prepare() {
    _guard_pp_direct=${_GUARD_NET_DIRECT_REGION:-}
    _guard_pp_proxy=${_GUARD_PROXY_REGION:-}
    _guard_pp_proxy_healthy=${_GUARD_PROXY_HEALTHY:-0}
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    if [ "${_GUARD_PREFLIGHT_COMPLETE:-0}" = 1 ]; then
        _GUARD_NET_DIRECT_REGION=$_guard_pp_direct
        _GUARD_PROXY_REGION=$_guard_pp_proxy
        _GUARD_PROXY_HEALTHY=$_guard_pp_proxy_healthy
    fi
    guard_policy_load "$(_guard_policy_default_path)" || return $?
    if [ -z "$_GUARD_NET_DIRECT_REGION" ]; then
        guard_geo_detect_direct >/dev/null 2>&1 || true
        _GUARD_NET_DIRECT_REGION=$(guard_geo_cached_country direct 2>/dev/null) || _GUARD_NET_DIRECT_REGION=
    fi
    if [ -z "$_GUARD_PROXY_REGION" ] && [ -n "${GUARD_GEO_ROUTE:-}" ]; then
        guard_geo_detect_route "$GUARD_GEO_ROUTE" >/dev/null 2>&1 || true
        _GUARD_PROXY_REGION=$(guard_geo_cached_country route "$GUARD_GEO_ROUTE" 2>/dev/null) || _GUARD_PROXY_REGION=
    fi
    guard_policy_refresh_state
}

_guard_prepare_readonly() {
    if [ "${_GUARD_PREFLIGHT_COMPLETE:-0}" != 1 ]; then
        guard_preflight_run
    fi
    _guard_pr_policy=$(_guard_policy_default_path)
    if [ ! -f "$_guard_pr_policy" ] && [ -f "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ]; then
        _guard_pr_policy=$_GUARD_PREFLIGHT_POLICY_FILE
    fi
    if guard_policy_load "$_guard_pr_policy" >/dev/null 2>&1; then
        guard_policy_refresh_state
        return 0
    fi
    _GUARD_POLICY_STATE=uninitialized
    _GUARD_POLICY_ENFORCEMENT=unavailable
    return 1
}

_guard_require_setup_for_apply() {
    if guard_install_validate >/dev/null 2>&1; then
        return 0
    fi
    if [ -n "${GUARD_POLICY_FILE:-}" ] && \
       guard_policy_validate_file "$GUARD_POLICY_FILE" >/dev/null 2>&1 && \
       command -v uci >/dev/null 2>&1 && \
       [ "$(uci_get_default openclash_guard.main.enabled 0 2>/dev/null || printf 0)" = 1 ]; then
        return 0
    fi
    cli_error "Apply is blocked until Setup validates: ${_GUARD_SETUP_INVALID_REASON:-runtime is incomplete}"
    return 1
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
    if [ "${_GUARD_PREFLIGHT_COMPLETE:-0}" != 1 ]; then
        guard_preflight_run
    fi
    _guard_require_setup_for_apply || return $?
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
    _GUARD_NFT_TABLE_EXISTS=0
    if nft_table_exists "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"; then
        _GUARD_NFT_TABLE_EXISTS=1
    fi
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
    if ! cli_confirm "Remove openclash-guard nft table?"; then
        cli_warn "aborted"
        return 1
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
    _guard_refresh_source=${GUARD_DISTRIBUTION_SOURCE:-auto}
    _guard_refresh_base=${GUARD_POLICY_BASE_URL:-}
    _guard_refresh_url=
    _guard_refresh_templates_url=
    while [ "$#" -gt 0 ]; do
        case $1 in
            --source) _guard_refresh_source=$2; shift 2 ;;
            --base-url) _guard_refresh_base=$2; shift 2 ;;
            --policy-url) _guard_refresh_url=$2; shift 2 ;;
            --templates-url) _guard_refresh_templates_url=$2; shift 2 ;;
            *) cli_error "unknown refresh option: $1"; return 2 ;;
        esac
    done
    if [ -n "$_guard_refresh_url" ] || [ -n "$_guard_refresh_templates_url" ]; then
        if [ -z "$_guard_refresh_url" ] || [ -z "$_guard_refresh_templates_url" ]; then
            cli_error "--policy-url and --templates-url must be supplied together"
            return 2
        fi
        _guard_refresh_policy=$(file_mktemp) || return 1
        _guard_refresh_templates=$(file_mktemp) || {
            rm -f "$_guard_refresh_policy"
            return 1
        }
        if ! fetch_http "$_guard_refresh_url" "$_guard_refresh_policy" || \
           ! guard_policy_validate_file "$_guard_refresh_policy" || \
           ! fetch_http "$_guard_refresh_templates_url" "$_guard_refresh_templates" || \
           ! guard_template_validate_file "$_guard_refresh_templates"; then
            rm -f "$_guard_refresh_policy" "$_guard_refresh_templates"
            cli_error "refresh failed; keeping the installed runtime pair"
            return 1
        fi
        _GUARD_PREFLIGHT_POLICY_FILE=$_guard_refresh_policy
        _GUARD_PREFLIGHT_TEMPLATES_FILE=$_guard_refresh_templates
        _GUARD_PREFLIGHT_POLICY_TEMP=1
        _GUARD_PREFLIGHT_TEMPLATES_TEMP=1
        _GUARD_PREFLIGHT_SOURCE=override
        _GUARD_PREFLIGHT_POLICY_URL=$_guard_refresh_url
        _GUARD_PREFLIGHT_TEMPLATES_URL=$_guard_refresh_templates_url
    elif ! guard_preflight_stage_distribution "$_guard_refresh_source" "$_guard_refresh_base"; then
        cli_error "refresh failed; keeping the installed runtime pair: $_GUARD_PREFLIGHT_SOURCE_REASON"
        return 1
    fi
    _guard_dest=$(_guard_policy_default_path)
    _guard_dir=$(dirname "$_guard_dest")
    if [ ! -d "$_guard_dir" ]; then
        cli_error "policy directory missing: $_guard_dir"
        return 1
    fi
    _guard_templates_dest="$_guard_dir/openclash-guard-templates.json"
    if ! file_atomic_replace "$_guard_dest" "$_GUARD_PREFLIGHT_POLICY_FILE" || \
       ! file_atomic_replace "$_guard_templates_dest" "$_GUARD_PREFLIGHT_TEMPLATES_FILE"; then
        cli_error "refresh failed while publishing the validated runtime pair"
        return 1
    fi
    GUARD_POLICY_FILE=$_guard_dest
    GUARD_TEMPLATES_FILE=$_guard_templates_dest
    if ! guard_policy_validate_file "$_guard_dest" || ! guard_template_validate_file "$_guard_templates_dest"; then
        cli_error "published runtime pair failed post-write validation"
        return 1
    fi
    _guard_distribution_record "$_GUARD_PREFLIGHT_SOURCE" "$_GUARD_PREFLIGHT_POLICY_URL" "$_GUARD_PREFLIGHT_TEMPLATES_URL" || return $?
    cli_success "runtime policy and template catalog refreshed; Apply remains pending"
}

_guard_emit_status_json() {
    _guard_sj=$(guard_env_json)
    _guard_sj=${_guard_sj%?}
    printf '%s,' "$_guard_sj"
    guard_policy_json_extra
    guard_doctor_json_extra
    printf '}\n'
}

guard_doctor_json_extra() {
    [ -n "${_guard_doctor_service:-}" ] || return 0
    printf ',"dependencies":{'
    _guard_dj_first=1
    # shellcheck disable=SC2153
    _guard_dj_deps=$(json_keys "$_GUARD_POLICY_FILE" "services.$_guard_doctor_service.dependencies" 2>/dev/null) || _guard_dj_deps=
    for _guard_dj_dep in $_guard_dj_deps; do
        _guard_dj_base="services.$_guard_doctor_service.dependencies.$_guard_dj_dep"
        _guard_dj_required=$(json_get "$_GUARD_POLICY_FILE" "$_guard_dj_base.required" 2>/dev/null) || _guard_dj_required=true
        _guard_dj_status=PASS
        if [ "$_guard_dj_required" = true ]; then
            _guard_dj_healthy=$(json_get "${GUARD_DEPENDENCY_STATUS_FILE:-}" "$_guard_dj_base.healthy" 2>/dev/null) || _guard_dj_healthy=unknown
            _guard_dj_compatible=$(json_get "${GUARD_DEPENDENCY_STATUS_FILE:-}" "$_guard_dj_base.routeCompatible" 2>/dev/null) || _guard_dj_compatible=true
            if [ "$_guard_dj_healthy" = false ] || [ "$_guard_dj_compatible" = false ]; then
                _guard_dj_status=FAIL
            elif [ "$_guard_dj_healthy" = unknown ]; then
                _guard_dj_status=UNKNOWN
            fi
        fi
        [ "$_guard_dj_first" = 1 ] || printf ','
        _guard_dj_first=0
        printf '"%s":{"status":"%s","required":%s}' \
            "$(_guard_env_json_string "$_guard_dj_dep")" "$_guard_dj_status" "$_guard_dj_required"
    done
    printf '}'
}

guard_cmd_status() {
    _guard_prepare_readonly || true
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
    if [ -z "$_GUARD_NET_DIRECT_REGION" ]; then
        cli_kv network.directRegionReason "$(guard_env_get network.directRegionReason)"
    fi
    cli_kv proxy.region "$(guard_env_get proxy.region)"
    if [ -z "$_GUARD_PROXY_REGION" ]; then
        cli_kv proxy.regionReason "$(guard_env_get proxy.regionReason)"
    fi
    cli_kv proxy.route "$(guard_env_get proxy.route)"
    cli_kv proxy.healthy "$(guard_env_get proxy.healthy)"
    cli_kv gaming.clients.count "$(guard_env_get gaming.clients.count)"
    cli_kv nft.available "$(guard_env_get nft.available)"
    cli_kv state "$_GUARD_POLICY_STATE"
    cli_kv enforcement "$_GUARD_POLICY_ENFORCEMENT"
    cli_kv distribution.selectedSource "$(_guard_distribution_selected 2>/dev/null || printf 'none')"
}

guard_cmd_doctor() {
    _guard_doctor_service=
    while [ "$#" -gt 0 ]; do
        case $1 in
            --json) _GUARD_JSON=1; shift ;;
            --yes) shift ;;
            *)
                [ -z "$_guard_doctor_service" ] || { cli_error "unknown doctor option: $1"; return 2; }
                _guard_doctor_service=$1
                shift
                ;;
        esac
    done
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
            _guard_doctor_status=PASS
            if [ "$_guard_doctor_required" = true ]; then
                _guard_doctor_healthy=$(json_get "${GUARD_DEPENDENCY_STATUS_FILE:-}" "$_guard_doctor_base.healthy" 2>/dev/null) || _guard_doctor_healthy=unknown
                _guard_doctor_compatible=$(json_get "${GUARD_DEPENDENCY_STATUS_FILE:-}" "$_guard_doctor_base.routeCompatible" 2>/dev/null) || _guard_doctor_compatible=true
                if [ "$_guard_doctor_healthy" = false ] || [ "$_guard_doctor_compatible" = false ]; then
                    _guard_doctor_status=FAIL
                elif [ "$_guard_doctor_healthy" = unknown ]; then
                    _guard_doctor_status=UNKNOWN
                fi
            fi
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
            _guard_prepare_readonly || true
            guard_geo_detect_direct
            ;;
        route)
            if [ -z "${1:-}" ]; then
                cli_error "usage: openclash-guard geo route <id>"
                return 2
            fi
            _guard_prepare_readonly || true
            if [ -z "${_GUARD_GEO_PROXY_URL:-}" ]; then
                guard_geo_discover_proxy_route || {
                    cli_error "${_GUARD_GEO_ROUTE_REASON:-OpenClash proxy route is unavailable}"
                    return 1
                }
            fi
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
        status|doctor|health-check|eval|geo)
            return 1
            ;;
        rules)
            case ${2:-} in
                list)
                    return 1
                    ;;
                sync)
                    case ${3:-} in
                        list|watch) return 1 ;;
                    esac
                    ;;
            esac
            return 0
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

_guard_dispatch() {
    _guard_dispatch_cmd=${1:-}
    [ -n "$_guard_dispatch_cmd" ] || return 2
    shift
    if _guard_cmd_needs_lock "$_guard_dispatch_cmd" "${1:-}" "${2:-}"; then
        _guard_lock_acquire || return $?
        trap _guard_lock_release EXIT INT TERM
    fi
    _guard_dispatch_rc=0
    case $_guard_dispatch_cmd in
        apply) guard_cmd_apply || _guard_dispatch_rc=$? ;;
        reconcile) guard_cmd_reconcile || _guard_dispatch_rc=$? ;;
        status) guard_cmd_status || _guard_dispatch_rc=$? ;;
        doctor) guard_cmd_doctor "$@" || _guard_dispatch_rc=$? ;;
        health-check) guard_cmd_health_check "$@" || _guard_dispatch_rc=$? ;;
        refresh) guard_cmd_refresh "$@" || _guard_dispatch_rc=$? ;;
        remove) guard_cmd_remove || _guard_dispatch_rc=$? ;;
        eval) guard_cmd_eval "$@" || _guard_dispatch_rc=$? ;;
        template) guard_cmd_template "$@" || _guard_dispatch_rc=$? ;;
        install) guard_cmd_install "$@" || _guard_dispatch_rc=$? ;;
        uninstall) guard_cmd_uninstall "$@" || _guard_dispatch_rc=$? ;;
        geo) guard_cmd_geo "$@" || _guard_dispatch_rc=$? ;;
        rules) guard_cmd_rules "$@" || _guard_dispatch_rc=$? ;;
        *) guard_usage >&2; _guard_dispatch_rc=2 ;;
    esac
    _guard_lock_release
    trap - EXIT INT TERM
    return "$_guard_dispatch_rc"
}

main() {
    _GUARD_JSON=0
    _guard_cmd=
    if [ "$#" -eq 0 ]; then
        if cli_has_controlling_tty; then
            guard_menu
            return $?
        fi
        cli_error "no controlling terminal; pass a subcommand for headless use"
        guard_usage >&2
        return 2
    fi
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
                # shellcheck disable=SC2034
                GUARD_POLICY_FILE=$2
                shift 2
                ;;
            -h|--help)
                guard_usage
                return 0
                ;;
            apply|reconcile|status|doctor|health-check|refresh|remove|eval|template|install|uninstall|geo|rules)
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
    _guard_dispatch "$_guard_cmd" "$@"
}
# END MODULE: guard-main

main "$@"
