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

_guard_dns_add_bypass_client() {
    _guard_dns_client=$1
    [ -n "$_guard_dns_client" ] || return 0
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

    _guard_dns_p53_clients=$(printf '%s\n' "$_guard_dns_forward" | awk '
        /ip saddr/ && /dport/ && /jump accept_to_wan/ && /(^|[^0-9])53([^0-9]|$)/ {
            for (i = 1; i <= NF; i++) if ($i == "saddr" && i < NF) print $(i + 1)
        }
    ')
    _guard_dns_p853_clients=$(printf '%s\n' "$_guard_dns_forward" | awk '
        /ip saddr/ && /dport/ && /jump accept_to_wan/ && /(^|[^0-9])853([^0-9]|$)/ {
            for (i = 1; i <= NF; i++) if ($i == "saddr" && i < NF) print $(i + 1)
        }
    ')
    _guard_dns_hijack_clients=$(printf '%s\n' "$_guard_dns_dstnat" | awk '
        /ip saddr/ && /dport/ && /return/ && /(^|[^0-9])53([^0-9]|$)/ {
            for (i = 1; i <= NF; i++) if ($i == "saddr" && i < NF) print $(i + 1)
        }
    ')

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
