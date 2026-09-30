#!/bin/sh
# DNS backend detection. Never starts, enables, or restarts dnsmasq.
# Prefix: guard_dns_
set -eu

_GUARD_DNS_NAMES="adguardhome AdGuardHome adguard-home"

guard_dns_agh_name() {
    _guard_dns_agh=
    for _guard_dns_cand in $_GUARD_DNS_NAMES
    do
        if svc_exists "$_guard_dns_cand"; then
            _guard_dns_agh=$_guard_dns_cand
            break
        fi
    done
    if [ -n "$_guard_dns_agh" ]; then
        printf '%s\n' "$_guard_dns_agh"
        return 0
    fi
    return 1
}

guard_dns_dnsmasq_port() {
    _guard_dns_port=
    if command -v uci >/dev/null 2>&1; then
        _guard_dns_port=$(uci -q get dhcp.@dnsmasq[0].port 2>/dev/null) || _guard_dns_port=
        if [ -z "$_guard_dns_port" ]; then
            _guard_dns_port=$(uci -q get dhcp.dnsmasq.port 2>/dev/null) || _guard_dns_port=
        fi
    fi
    if [ -z "$_guard_dns_port" ]; then
        _guard_dns_port=53
    fi
    printf '%s\n' "$_guard_dns_port"
}

guard_dns_backend() {
    _guard_dns_agh_en=0
    _guard_dns_agh_run=0
    if _guard_dns_agh=$(guard_dns_agh_name 2>/dev/null); then
        if svc_enabled "$_guard_dns_agh"; then
            _guard_dns_agh_en=1
        fi
        if svc_running "$_guard_dns_agh"; then
            _guard_dns_agh_run=1
        fi
    fi
    if [ "$_guard_dns_agh_en" = 1 ] && [ "$_guard_dns_agh_run" = 1 ]; then
        printf '%s\n' "adguardhome"
        return 0
    fi
    _guard_dns_msq_en=0
    _guard_dns_msq_run=0
    if svc_exists dnsmasq; then
        if svc_enabled dnsmasq; then
            _guard_dns_msq_en=1
        fi
        if svc_running dnsmasq; then
            _guard_dns_msq_run=1
        fi
    fi
    if [ "$_guard_dns_msq_en" = 1 ] && [ "$_guard_dns_msq_run" = 1 ]; then
        _guard_dns_port=$(guard_dns_dnsmasq_port)
        if [ "$_guard_dns_port" != 0 ]; then
            printf '%s\n' "dnsmasq"
            return 0
        fi
    fi
    printf '%s\n' "none"
}

guard_dns_domain_set_backend() {
    _guard_dns_be=${1:-}
    if [ -z "$_guard_dns_be" ]; then
        _guard_dns_be=$(guard_dns_backend)
    fi
    case $_guard_dns_be in
        dnsmasq)
            printf '%s\n' "dnsmasq-nftset"
            ;;
        adguardhome)
            # Promote AdGuard Home only when a separate structured resolver-sync
            # helper proves the complete capability contract. Missing, stale, or
            # contradictory evidence remains fail-closed.
            if command -v guard_resolver_sync_backend >/dev/null 2>&1; then
                guard_resolver_sync_backend
            else
                printf '%s\n' "unavailable"
            fi
            ;;
        *)
            printf '%s\n' "unavailable"
            ;;
    esac
}

_guard_dns_is_ipv4() {
    _guard_dns_ip=$1
    case $_guard_dns_ip in
        *[!0-9.]*) return 1 ;;
    esac
    _guard_dns_old_ifs=$IFS
    IFS=.
    # shellcheck disable=SC2086
    set -- $_guard_dns_ip
    IFS=$_guard_dns_old_ifs
    [ "$#" -eq 4 ] || return 1
    for _guard_dns_octet; do
        case $_guard_dns_octet in
            ''|*[!0-9]*) return 1 ;;
        esac
        [ "${#_guard_dns_octet}" -le 3 ] || return 1
        # reject leading zeros like "01" (but allow plain "0")
        case $_guard_dns_octet in
            0?*) return 1 ;;
        esac
        [ "$_guard_dns_octet" -le 255 ] 2>/dev/null || return 1
    done
    return 0
}

_guard_dns_add_bypass_client() {
    _guard_dns_client=$1
    [ -n "$_guard_dns_client" ] || return 0
    _guard_dns_is_ipv4 "$_guard_dns_client" || return 0
    case " ${_GUARD_DNS_BYPASS_CLIENTS:-} " in
        *" $_guard_dns_client "*) return 0 ;;
    esac
    if [ -n "${_GUARD_DNS_BYPASS_CLIENTS:-}" ]; then
        _GUARD_DNS_BYPASS_CLIENTS="$_GUARD_DNS_BYPASS_CLIENTS $_guard_dns_client"
    else
        _GUARD_DNS_BYPASS_CLIENTS=$_guard_dns_client
    fi
    _GUARD_DNS_BYPASS_CLIENT_COUNT=$((_GUARD_DNS_BYPASS_CLIENT_COUNT + 1))
}

# Emit saddr IPv4 tokens for nft rules that:
#   - match the wanted dport EXACTLY (token == want) or via a braced anonymous
#     port set whose elements are all numerics (e.g. "{ 53, 853 }"),
#   - do NOT reference a named set (@name) for ports,
#   - carry the wanted action pattern (jump/return).
# The saddr may be a single IPv4 token or a braced anonymous set
# "{ ip1, ip2 }" — every IPv4-shaped token in the set is emitted, one per line.
_guard_dns_nft_emit_bypass_saddr() {
    _guard_dns_text=$1
    _guard_dns_action_mode=$2
    _guard_dns_want_port=$3
    printf '%s\n' "$_guard_dns_text" | awk \
        -v action_mode="$_guard_dns_action_mode" \
        -v want="$_guard_dns_want_port" '
        function port_match(idx,    j, tok, inner) {
            if (idx > NF) return 0
            tok = $(idx)
            if (tok == "{") {
                for (j = idx + 1; j <= NF; j++) {
                    if ($j == "}") break
                    inner = $j
                    sub(/,$/, "", inner)
                    if (inner ~ /^[0-9]+$/ && inner == want) return 1
                }
                return 0
            }
            # named-set reference (e.g. "@my_853set") — never matches
            if (tok ~ /^@/) return 0
            sub(/,$/, "", tok)
            if (tok !~ /^[0-9]+$/) return 0
            return (tok == want)
        }
        function action_match(    i, in_comment) {
            in_comment = 0
            for (i = 1; i <= NF; i++) {
                if ($i == "comment") in_comment = 1
                if (in_comment) continue
                if (action_mode == "jump_accept_to_wan") {
                    if ($i == "jump" && i < NF && $(i + 1) == "accept_to_wan") return 1
                } else if (action_mode == "return") {
                    if ($i == "return") return 1
                }
            }
            return 0
        }
        /ip saddr/ && /dport/ && action_match() {
            si = 0; di = 0
            for (i = 1; i <= NF; i++) {
                if ($i == "saddr" && si == 0) si = i
                if ($i == "dport" && di == 0) di = i
            }
            if (si == 0 || di == 0) next
            if (si + 1 > NF) next
            if (!port_match(di + 1)) next
            if ($(si + 1) == "{") {
                for (j = si + 2; j <= NF; j++) {
                    if ($j == "}") break
                    tok = $j
                    sub(/,$/, "", tok)
                    if (tok != "") print tok
                }
            } else {
                tok = $(si + 1)
                sub(/,$/, "", tok)
                if (tok != "") print tok
            }
        }'
}

guard_dns_detect_firewall_bypasses() {
    _GUARD_DNS_BYPASS_AVAILABLE=0
    _GUARD_DNS_BYPASS_CLIENTS=
    _GUARD_DNS_BYPASS_CLIENT_COUNT=0
    _GUARD_DNS_BYPASS_PORT53=0
    _GUARD_DNS_BYPASS_DOT853=0
    _GUARD_DNS_HIJACK_BYPASS=0

    command -v nft >/dev/null 2>&1 || return 0

    _guard_dns_forward=$(nft -a list chain inet fw4 forward_lan 2>/dev/null) || return 0
    _guard_dns_dstnat=$(nft -a list chain inet fw4 dstnat 2>/dev/null) || return 0
    _GUARD_DNS_BYPASS_AVAILABLE=1

    _guard_dns_p53_clients=$(_guard_dns_nft_emit_bypass_saddr \
        "$_guard_dns_forward" "jump_accept_to_wan" 53)
    _guard_dns_p853_clients=$(_guard_dns_nft_emit_bypass_saddr \
        "$_guard_dns_forward" "jump_accept_to_wan" 853)
    _guard_dns_hijack_clients=$(_guard_dns_nft_emit_bypass_saddr \
        "$_guard_dns_dstnat" "return" 53)

    if [ -n "$_guard_dns_p53_clients" ]; then
        _GUARD_DNS_BYPASS_PORT53=1
        for _guard_dns_client in $_guard_dns_p53_clients; do
            _guard_dns_add_bypass_client "$_guard_dns_client"
        done
    fi
    if [ -n "$_guard_dns_p853_clients" ]; then
        _GUARD_DNS_BYPASS_DOT853=1
        for _guard_dns_client in $_guard_dns_p853_clients; do
            _guard_dns_add_bypass_client "$_guard_dns_client"
        done
    fi
    if [ -n "$_guard_dns_hijack_clients" ]; then
        _GUARD_DNS_HIJACK_BYPASS=1
        for _guard_dns_client in $_guard_dns_hijack_clients; do
            _guard_dns_add_bypass_client "$_guard_dns_client"
        done
    fi
}

guard_dns_detect() {
    _GUARD_DNS_BACKEND=$(guard_dns_backend)
    _GUARD_DNS_AGH_ENABLED=0
    _GUARD_DNS_AGH_RUNNING=0
    _GUARD_DNS_MSQ_ENABLED=0
    _GUARD_DNS_MSQ_RUNNING=0
    if _guard_dns_agh=$(guard_dns_agh_name 2>/dev/null); then
        if svc_enabled "$_guard_dns_agh"; then
            _GUARD_DNS_AGH_ENABLED=1
        fi
        if svc_running "$_guard_dns_agh"; then
            _GUARD_DNS_AGH_RUNNING=1
        fi
    fi
    if svc_exists dnsmasq; then
        if svc_enabled dnsmasq; then
            _GUARD_DNS_MSQ_ENABLED=1
        fi
        if svc_running dnsmasq; then
            _GUARD_DNS_MSQ_RUNNING=1
        fi
    fi
    _GUARD_DNS_DOMAIN_SET=$(guard_dns_domain_set_backend "$_GUARD_DNS_BACKEND")
    guard_dns_detect_firewall_bypasses
}

# Guard never resurrects DNS daemons; detection is observation-only.
