#!/bin/sh
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
