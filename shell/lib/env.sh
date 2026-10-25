#!/bin/sh
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
