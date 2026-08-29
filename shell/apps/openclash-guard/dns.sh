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
            # resolver-sync is not implemented; do not claim dest-set protection.
            printf '%s\n' "unavailable"
            ;;
        *)
            printf '%s\n' "unavailable"
            ;;
    esac
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
}

# Guard never resurrects DNS daemons; detection is observation-only.
