#!/bin/sh
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
