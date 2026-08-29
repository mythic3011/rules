#!/bin/sh
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
