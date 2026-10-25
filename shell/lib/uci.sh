#!/bin/sh
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
