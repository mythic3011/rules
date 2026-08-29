#!/bin/sh
# Tiny synthetic entry used to prove source and bundle share the same libs.
set -eu

main() {
    _demo_cmd=${1:-}
    if [ -z "$_demo_cmd" ]; then
        printf '%s\n' "usage: sha256 FILE | bool NAME [default] | info MSG" >&2
        return 2
    fi
    shift
    case $_demo_cmd in
        sha256)
            file_sha256 "$1"
            ;;
        bool)
            env_bool "$1" "${2:-}"
            ;;
        info)
            cli_info "$*"
            ;;
        *)
            printf '%s\n' "unknown: $_demo_cmd" >&2
            return 2
            ;;
    esac
}
