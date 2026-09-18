#!/bin/sh
# Guard-owned OpenClash gaming dataplane reconciliation.
# Prefix: guard_dataplane_
set -eu

_GUARD_DATAPLANE_FAMILY=${GUARD_OPENCLASH_NFT_FAMILY:-inet}
_GUARD_DATAPLANE_TABLE=${GUARD_OPENCLASH_NFT_TABLE:-fw4}
_GUARD_DATAPLANE_TARGET_CHAIN=${GUARD_OPENCLASH_MANGLE_CHAIN:-openclash_mangle}
_GUARD_DATAPLANE_CHAIN=${GUARD_DATAPLANE_CHAIN:-openclash_guard_gaming_direct}
_GUARD_DATAPLANE_SET_PREFIX=${GUARD_DATAPLANE_SET_PREFIX:-openclash_guard_gaming_}
_GUARD_DATAPLANE_COMMENT_PREFIX=${GUARD_DATAPLANE_COMMENT_PREFIX:-openclash-guard:gaming-direct}
_GUARD_DATAPLANE_CAPABILITY_MARK=${GUARD_DATAPLANE_CAPABILITY_MARK:-0x40000000}
_GUARD_DATAPLANE_READY=0
_GUARD_DATAPLANE_TABLE_EXISTS=0
_GUARD_DATAPLANE_TARGET_EXISTS=0
_GUARD_DATAPLANE_CHAIN_EXISTS=0
_GUARD_DATAPLANE_SRC_SET_EXISTS=0
_GUARD_DATAPLANE_SPORT_SET_EXISTS=0
_GUARD_DATAPLANE_DPORT_SET_EXISTS=0
_GUARD_DATAPLANE_DST_SET_EXISTS=0
_GUARD_DATAPLANE_PROTECTED_SET_EXISTS=0
_GUARD_DATAPLANE_TARGET_HANDLE=
_GUARD_DATAPLANE_OLD_JUMP_HANDLES=
_GUARD_DATAPLANE_DIRECT_IFACE=
_GUARD_DATAPLANE_SRCS=
_GUARD_DATAPLANE_SOURCE_PORTS=
_GUARD_DATAPLANE_DESTINATION_PORTS=
_GUARD_DATAPLANE_DESTINATION_CIDRS=
_GUARD_DATAPLANE_PROTECTED_PORTS=

_guard_dataplane_src_set() { printf '%ssrc\n' "$_GUARD_DATAPLANE_SET_PREFIX"; }
_guard_dataplane_sport_set() { printf '%ssport\n' "$_GUARD_DATAPLANE_SET_PREFIX"; }
_guard_dataplane_dport_set() { printf '%sdport\n' "$_GUARD_DATAPLANE_SET_PREFIX"; }
_guard_dataplane_dst_set() { printf '%sdst\n' "$_GUARD_DATAPLANE_SET_PREFIX"; }
_guard_dataplane_protected_set() { printf '%sprotected\n' "$_GUARD_DATAPLANE_SET_PREFIX"; }

guard_dataplane_capability_mark() {
    case $_GUARD_DATAPLANE_CAPABILITY_MARK in
        0x[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]) ;;
        *) return 1 ;;
    esac
    [ "$_GUARD_DATAPLANE_CAPABILITY_MARK" != 0x00000000 ] || return 1
    printf '%s\n' "$_GUARD_DATAPLANE_CAPABILITY_MARK"
}

_guard_dataplane_reset() {
    _GUARD_DATAPLANE_READY=0
    _GUARD_DATAPLANE_TABLE_EXISTS=0
    _GUARD_DATAPLANE_TARGET_EXISTS=0
    _GUARD_DATAPLANE_CHAIN_EXISTS=0
    _GUARD_DATAPLANE_SRC_SET_EXISTS=0
    _GUARD_DATAPLANE_SPORT_SET_EXISTS=0
    _GUARD_DATAPLANE_DPORT_SET_EXISTS=0
    _GUARD_DATAPLANE_DST_SET_EXISTS=0
    _GUARD_DATAPLANE_PROTECTED_SET_EXISTS=0
    _GUARD_DATAPLANE_TARGET_HANDLE=
    _GUARD_DATAPLANE_OLD_JUMP_HANDLES=
    _GUARD_DATAPLANE_DIRECT_IFACE=
}

_guard_dataplane_valid_iface() {
    case ${1:-} in
        ''|*[!A-Za-z0-9_.:@-]*) return 1 ;;
        *) return 0 ;;
    esac
}

_guard_dataplane_iface_usable() {
    _guard_dp_iu_iface=${1:-}
    _guard_dataplane_valid_iface "$_guard_dp_iu_iface" || return 1
    if command -v ip >/dev/null 2>&1; then
        ip link show dev "$_guard_dp_iu_iface" >/dev/null 2>&1 || return 1
    fi
    return 0
}

guard_dataplane_resolve_direct_iface() {
    _guard_dp_rd_iface=${GUARD_DIRECT_WAN_IFACE:-}
    if [ -z "$_guard_dp_rd_iface" ] && command -v uci >/dev/null 2>&1; then
        _guard_dp_rd_iface=$(uci -q get openclash_guard.udp.direct_iface 2>/dev/null) || _guard_dp_rd_iface=
    fi
    if [ -z "$_guard_dp_rd_iface" ] && command -v ubus >/dev/null 2>&1 && command -v jsonfilter >/dev/null 2>&1; then
        _guard_dp_rd_status=$(ubus call network.interface.wan status 2>/dev/null) || _guard_dp_rd_status=
        if [ -n "$_guard_dp_rd_status" ]; then
            _guard_dp_rd_iface=$(jsonfilter -s "$_guard_dp_rd_status" -e '@.l3_device' 2>/dev/null) || _guard_dp_rd_iface=
        fi
    fi
    if [ -z "$_guard_dp_rd_iface" ] && command -v uci >/dev/null 2>&1; then
        _guard_dp_rd_iface=$(uci -q get network.wan.device 2>/dev/null) || _guard_dp_rd_iface=
        if [ -z "$_guard_dp_rd_iface" ]; then
            _guard_dp_rd_iface=$(uci -q get network.wan.ifname 2>/dev/null) || _guard_dp_rd_iface=
            set -- $_guard_dp_rd_iface
            _guard_dp_rd_iface=${1:-}
        fi
    fi
    if [ -z "$_guard_dp_rd_iface" ] && command -v ip >/dev/null 2>&1; then
        _guard_dp_rd_iface=$(ip -4 route show default 2>/dev/null | awk '
            $1 == "default" {
                for (i = 1; i <= NF; i++) if ($i == "dev" && (i + 1) <= NF) { print $(i + 1); exit }
            }
        ') || _guard_dp_rd_iface=
    fi
    _guard_dataplane_iface_usable "$_guard_dp_rd_iface" || return 1
    printf '%s\n' "$_guard_dp_rd_iface"
}

_guard_dataplane_handle_from_line() {
    awk '
        {
            if (match($0, /# handle [0-9]+/)) {
                value = substr($0, RSTART + 9)
                gsub(/[^0-9].*/, "", value)
                if (value != "") { print value; exit }
            }
        }
    '
}

guard_dataplane_find_target_handle() {
    _guard_dp_ft_listing=$(nft -a list chain "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_TARGET_CHAIN" 2>/dev/null) || return 1
    _guard_dp_ft_anchor=${GUARD_OPENCLASH_UDP_ANCHOR:-jump openclash_upnp}
    _guard_dp_ft_handle=$(printf '%s\n' "$_guard_dp_ft_listing" | awk -v anchor="$_guard_dp_ft_anchor" '
        index($0, anchor) && ($0 ~ /ip protocol udp/ || $0 ~ /meta l4proto udp/) &&
        $0 !~ /saddr|daddr|sport|dport|iifname|oifname/ {
            if (match($0, /# handle [0-9]+/)) {
                value = substr($0, RSTART + 9)
                gsub(/[^0-9].*/, "", value)
                if (value != "") { print value; exit }
            }
        }
    ')
    if [ -z "$_guard_dp_ft_handle" ]; then
        _guard_dp_ft_handle=$(printf '%s\n' "$_guard_dp_ft_listing" | awk '
            /meta l4proto udp/ && /meta mark set/ &&
            $0 !~ /saddr|daddr|sport|dport|iifname|oifname/ {
                if (match($0, /# handle [0-9]+/)) {
                    value = substr($0, RSTART + 9)
                    gsub(/[^0-9].*/, "", value)
                    if (value != "") { print value; exit }
                }
            }
        ')
    fi
    [ -n "$_guard_dp_ft_handle" ] || return 1
    printf '%s\n' "$_guard_dp_ft_handle"
}

_guard_dataplane_capture_owned_state() {
    [ "$_GUARD_DATAPLANE_TABLE_EXISTS" = 1 ] || return 0
    if nft_chain_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_TARGET_CHAIN"; then
        _GUARD_DATAPLANE_TARGET_EXISTS=1
        _GUARD_DATAPLANE_OLD_JUMP_HANDLES=$(nft_rule_handles_by_comment \
            "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_TARGET_CHAIN" \
            "$_GUARD_DATAPLANE_COMMENT_PREFIX" 2>/dev/null) || _GUARD_DATAPLANE_OLD_JUMP_HANDLES=
    fi
    if nft_chain_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_CHAIN"; then
        _GUARD_DATAPLANE_CHAIN_EXISTS=1
    fi
    if nft_set_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_src_set)"; then
        _GUARD_DATAPLANE_SRC_SET_EXISTS=1
    fi
    if nft_set_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_sport_set)"; then
        _GUARD_DATAPLANE_SPORT_SET_EXISTS=1
    fi
    if nft_set_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_dport_set)"; then
        _GUARD_DATAPLANE_DPORT_SET_EXISTS=1
    fi
    if nft_set_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_dst_set)"; then
        _GUARD_DATAPLANE_DST_SET_EXISTS=1
    fi
    if nft_set_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_protected_set)"; then
        _GUARD_DATAPLANE_PROTECTED_SET_EXISTS=1
    fi
}

guard_dataplane_prepare() {
    _guard_dataplane_reset
    _GUARD_DATAPLANE_SRCS=${1:-}
    _GUARD_DATAPLANE_SOURCE_PORTS=${2:-}
    _GUARD_DATAPLANE_DESTINATION_PORTS=${3:-}
    _GUARD_DATAPLANE_DESTINATION_CIDRS=${4:-}
    _GUARD_DATAPLANE_PROTECTED_PORTS=${5:-}

    if ! nft_table_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE"; then
        return 0
    fi
    _GUARD_DATAPLANE_TABLE_EXISTS=1
    _guard_dataplane_capture_owned_state

    [ "${_GUARD_OC_HEALTHY:-0}" = 1 ] || return 0
    [ -n "$_GUARD_DATAPLANE_SRCS" ] || return 0
    if [ -z "$_GUARD_DATAPLANE_SOURCE_PORTS" ] && [ -z "$_GUARD_DATAPLANE_DESTINATION_PORTS" ]; then
        return 0
    fi
    # Missing protected-destination metadata disables DIRECT bypass creation.
    [ -n "$_GUARD_DATAPLANE_PROTECTED_PORTS" ] || return 0
    guard_dataplane_capability_mark >/dev/null 2>&1 || return 0
    [ "$_GUARD_DATAPLANE_TARGET_EXISTS" = 1 ] || return 0

    _GUARD_DATAPLANE_DIRECT_IFACE=$(guard_dataplane_resolve_direct_iface 2>/dev/null) || _GUARD_DATAPLANE_DIRECT_IFACE=
    [ -n "$_GUARD_DATAPLANE_DIRECT_IFACE" ] || return 0
    _GUARD_DATAPLANE_TARGET_HANDLE=$(guard_dataplane_find_target_handle 2>/dev/null) || _GUARD_DATAPLANE_TARGET_HANDLE=
    [ -n "$_GUARD_DATAPLANE_TARGET_HANDLE" ] || return 0
    _GUARD_DATAPLANE_READY=1
}

guard_dataplane_ready() {
    [ "$_GUARD_DATAPLANE_READY" = 1 ]
}

guard_dataplane_direct_iface() {
    guard_dataplane_ready || return 1
    printf '%s\n' "$_GUARD_DATAPLANE_DIRECT_IFACE"
}

_guard_dataplane_csv() {
    _guard_dp_csv_out=
    for _guard_dp_csv_item in "$@"
    do
        [ -n "$_guard_dp_csv_item" ] || continue
        if [ -z "$_guard_dp_csv_out" ]; then
            _guard_dp_csv_out=$_guard_dp_csv_item
        else
            _guard_dp_csv_out="$_guard_dp_csv_out, $_guard_dp_csv_item"
        fi
    done
    printf '%s' "$_guard_dp_csv_out"
}

_guard_dataplane_render_set() {
    _guard_dp_rs_name=$1
    _guard_dp_rs_type=$2
    _guard_dp_rs_exists=$3
    _guard_dp_rs_flags=${4:-}
    if [ "$_guard_dp_rs_exists" = 1 ]; then
        printf 'flush set %s %s %s\n' "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_guard_dp_rs_name"
    else
        _guard_dp_rs_extra=
        [ -n "$_guard_dp_rs_flags" ] && _guard_dp_rs_extra=" flags $_guard_dp_rs_flags;"
        printf 'add set %s %s %s { type %s;%s comment "%s:set"; }\n' \
            "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_guard_dp_rs_name" \
            "$_guard_dp_rs_type" "$_guard_dp_rs_extra" "$_GUARD_DATAPLANE_COMMENT_PREFIX"
    fi
}

_guard_dataplane_render_elements() {
    _guard_dp_re_name=$1
    shift
    _guard_dp_re_csv=$(_guard_dataplane_csv "$@")
    [ -n "$_guard_dp_re_csv" ] || return 0
    printf 'add element %s %s %s { %s }\n' \
        "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_guard_dp_re_name" "$_guard_dp_re_csv"
}

guard_dataplane_render() {
    [ "$_GUARD_DATAPLANE_TABLE_EXISTS" = 1 ] || return 0

    for _guard_dp_rr_handle in $_GUARD_DATAPLANE_OLD_JUMP_HANDLES
    do
        [ -n "$_guard_dp_rr_handle" ] || continue
        printf 'delete rule %s %s %s handle %s\n' \
            "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_TARGET_CHAIN" "$_guard_dp_rr_handle"
    done

    # Migrate away from the old child-chain jump. A child-chain return
    # resumes at the next rule in openclash_mangle, so it cannot bypass the
    # later generic OpenClash UDP mark. Direct verdicts must live in the
    # OpenClash mangle chain itself.
    if [ "$_GUARD_DATAPLANE_CHAIN_EXISTS" = 1 ]; then
        printf 'flush chain %s %s %s\n' "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_CHAIN"
        printf 'delete chain %s %s %s\n' "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_CHAIN"
    fi
    [ "$_GUARD_DATAPLANE_SRC_SET_EXISTS" = 1 ] && printf 'flush set %s %s %s\n' "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_src_set)"
    [ "$_GUARD_DATAPLANE_SPORT_SET_EXISTS" = 1 ] && printf 'flush set %s %s %s\n' "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_sport_set)"
    [ "$_GUARD_DATAPLANE_DPORT_SET_EXISTS" = 1 ] && printf 'flush set %s %s %s\n' "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_dport_set)"
    [ "$_GUARD_DATAPLANE_DST_SET_EXISTS" = 1 ] && printf 'flush set %s %s %s\n' "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_dst_set)"
    [ "$_GUARD_DATAPLANE_PROTECTED_SET_EXISTS" = 1 ] && printf 'flush set %s %s %s\n' "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_protected_set)"

    guard_dataplane_ready || return 0

    _guard_dp_rr_src_set=$(_guard_dataplane_src_set)
    _guard_dataplane_render_set "$_guard_dp_rr_src_set" ipv4_addr "$_GUARD_DATAPLANE_SRC_SET_EXISTS" interval
    # shellcheck disable=SC2086
    _guard_dataplane_render_elements "$_guard_dp_rr_src_set" $_GUARD_DATAPLANE_SRCS

    _guard_dp_rr_protected_set=$(_guard_dataplane_protected_set)
    _guard_dataplane_render_set "$_guard_dp_rr_protected_set" inet_service "$_GUARD_DATAPLANE_PROTECTED_SET_EXISTS"
    # shellcheck disable=SC2086
    _guard_dataplane_render_elements "$_guard_dp_rr_protected_set" $_GUARD_DATAPLANE_PROTECTED_PORTS

    _guard_dp_rr_dst_match=
    if [ -n "$_GUARD_DATAPLANE_DESTINATION_CIDRS" ]; then
        _guard_dp_rr_dst_set=$(_guard_dataplane_dst_set)
        _guard_dataplane_render_set "$_guard_dp_rr_dst_set" ipv4_addr "$_GUARD_DATAPLANE_DST_SET_EXISTS" interval
        # shellcheck disable=SC2086
        _guard_dataplane_render_elements "$_guard_dp_rr_dst_set" $_GUARD_DATAPLANE_DESTINATION_CIDRS
        _guard_dp_rr_dst_match="ip daddr @$_guard_dp_rr_dst_set "
    fi

    if [ -n "$_GUARD_DATAPLANE_SOURCE_PORTS" ]; then
        _guard_dp_rr_sport_set=$(_guard_dataplane_sport_set)
        _guard_dataplane_render_set "$_guard_dp_rr_sport_set" inet_service "$_GUARD_DATAPLANE_SPORT_SET_EXISTS"
        # shellcheck disable=SC2086
        _guard_dataplane_render_elements "$_guard_dp_rr_sport_set" $_GUARD_DATAPLANE_SOURCE_PORTS
        _guard_dp_rr_cap=$(guard_dataplane_capability_mark) || return 1
        printf 'insert rule %s %s %s position %s meta mark 0 ip saddr @%s %sudp dport != @%s udp sport @%s meta mark set %s return comment "%s:source"\n' \
            "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_TARGET_CHAIN" \
            "$_GUARD_DATAPLANE_TARGET_HANDLE" "$_guard_dp_rr_src_set" "$_guard_dp_rr_dst_match" \
            "$_guard_dp_rr_protected_set" "$_guard_dp_rr_sport_set" "$_guard_dp_rr_cap" "$_GUARD_DATAPLANE_COMMENT_PREFIX"
    fi

    if [ -n "$_GUARD_DATAPLANE_DESTINATION_PORTS" ]; then
        _guard_dp_rr_dport_set=$(_guard_dataplane_dport_set)
        _guard_dataplane_render_set "$_guard_dp_rr_dport_set" inet_service "$_GUARD_DATAPLANE_DPORT_SET_EXISTS"
        # shellcheck disable=SC2086
        _guard_dataplane_render_elements "$_guard_dp_rr_dport_set" $_GUARD_DATAPLANE_DESTINATION_PORTS
        _guard_dp_rr_cap=$(guard_dataplane_capability_mark) || return 1
        printf 'insert rule %s %s %s position %s meta mark 0 ip saddr @%s %sudp dport != @%s udp dport @%s meta mark set %s return comment "%s:destination"\n' \
            "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_TARGET_CHAIN" \
            "$_GUARD_DATAPLANE_TARGET_HANDLE" "$_guard_dp_rr_src_set" "$_guard_dp_rr_dst_match" \
            "$_guard_dp_rr_protected_set" "$_guard_dp_rr_dport_set" "$_guard_dp_rr_cap" "$_GUARD_DATAPLANE_COMMENT_PREFIX"
    fi
}

guard_dataplane_remove() {
    [ "${GUARD_DRY_RUN:-0}" != 1 ] || return 0
    command -v nft >/dev/null 2>&1 || return 0
    nft_table_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" || return 0

    if nft_chain_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_TARGET_CHAIN"; then
        nft_delete_rules_by_comment \
            "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_TARGET_CHAIN" \
            "$_GUARD_DATAPLANE_COMMENT_PREFIX" || return $?
    fi
    if nft_chain_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_CHAIN"; then
        nft flush chain "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_CHAIN" || return $?
        nft delete chain "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_CHAIN" || return $?
    fi
    nft_delete_owned_set "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_src_set)" "$_GUARD_DATAPLANE_SET_PREFIX" || return $?
    nft_delete_owned_set "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_sport_set)" "$_GUARD_DATAPLANE_SET_PREFIX" || return $?
    nft_delete_owned_set "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_dport_set)" "$_GUARD_DATAPLANE_SET_PREFIX" || return $?
    nft_delete_owned_set "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_dst_set)" "$_GUARD_DATAPLANE_SET_PREFIX" || return $?
    nft_delete_owned_set "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$(_guard_dataplane_protected_set)" "$_GUARD_DATAPLANE_SET_PREFIX" || return $?
}
