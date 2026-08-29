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
