#!/bin/sh
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
