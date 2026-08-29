#!/bin/sh
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
