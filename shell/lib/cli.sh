#!/bin/sh
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
