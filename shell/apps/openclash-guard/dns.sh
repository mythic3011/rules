#!/bin/sh
# DNS backend detection. Never starts, enables, or restarts dnsmasq.
# Prefix: guard_dns_
set -eu

_GUARD_DNS_NAMES="adguardhome AdGuardHome adguard-home"

_GUARD_DNS_BYPASS_SCAN_AVAILABLE=0
_GUARD_DNS_BYPASS_DETECTED=0
_GUARD_DNS_BYPASS_RULES=0
_GUARD_DNS_BYPASS_PORT53=0
_GUARD_DNS_BYPASS_DOT853=0
_GUARD_DNS_HIJACK_BYPASS=0
_GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES=0
_GUARD_DNS_BYPASS_CLIENTS=0
_GUARD_DNS_BYPASS_SOURCES=

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
            # See docs/openclash-guard.md "AdGuard Home Domain-Set Backend".
            printf '%s\n' "unavailable"
            ;;
        *)
            printf '%s\n' "unavailable"
            ;;
    esac
}

guard_dns_bypass_reset() {
    _GUARD_DNS_BYPASS_SCAN_AVAILABLE=0
    _GUARD_DNS_BYPASS_DETECTED=0
    _GUARD_DNS_BYPASS_RULES=0
    _GUARD_DNS_BYPASS_PORT53=0
    _GUARD_DNS_BYPASS_DOT853=0
    _GUARD_DNS_HIJACK_BYPASS=0
    _GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES=0
    _GUARD_DNS_BYPASS_CLIENTS=0
    _GUARD_DNS_BYPASS_SOURCES=
}

_guard_dns_scan_forward_text() {
    awk '
        function literal_source(    i, v) {
            for (i = 1; i < NF; i++) {
                if ($i == "saddr") {
                    v = $(i + 1)
                    gsub(/[{},]/, "", v)
                    if (v ~ /^[0-9A-Fa-f:.]+(\/[0-9]+)?$/) return v
                    return "-"
                }
            }
            return "-"
        }
        function dport_has(port,    s, re) {
            s = $0
            sub(/^.*dport[[:space:]]+/, "", s)
            sub(/[[:space:]]+(jump|accept|counter|return|reject|drop).*/, "", s)
            re = "(^|[^0-9])" port "([^0-9]|$)"
            return s ~ re
        }
        /dport/ && /jump[[:space:]]+accept_to_wan/ {
            has53 = dport_has(53)
            has853 = dport_has(853)
            if (!has53 && !has853) next
            rules++
            if (has53) port53++
            if (has853) dot853++
            src = literal_source()
            if (src == "-") {
                unknown++
            } else if (!seen[src]++) {
                sources = sources (sources == "" ? "" : ",") src
            }
        }
        END {
            if (sources == "") sources = "-"
            printf "%d|%d|%d|%s|%d\n", rules + 0, port53 + 0, dot853 + 0, sources, unknown + 0
        }
    '
}

_guard_dns_scan_dstnat_text() {
    awk '
        function literal_source(    i, v) {
            for (i = 1; i < NF; i++) {
                if ($i == "saddr") {
                    v = $(i + 1)
                    gsub(/[{},]/, "", v)
                    if (v ~ /^[0-9A-Fa-f:.]+(\/[0-9]+)?$/) return v
                    return "-"
                }
            }
            return "-"
        }
        function dport_has(port,    s, re) {
            s = $0
            sub(/^.*dport[[:space:]]+/, "", s)
            sub(/[[:space:]]+(jump|accept|counter|return|reject|drop).*/, "", s)
            re = "(^|[^0-9])" port "([^0-9]|$)"
            return s ~ re
        }
        /dport/ && /(^|[[:space:]])return([[:space:]]|$)/ {
            if (!dport_has(53)) next
            rules++
            src = literal_source()
            if (src == "-") {
                unknown++
            } else if (!seen[src]++) {
                sources = sources (sources == "" ? "" : ",") src
            }
        }
        END {
            if (sources == "") sources = "-"
            printf "%d|%s|%d\n", rules + 0, sources, unknown + 0
        }
    '
}

_guard_dns_merge_sources() {
    printf '%s\n%s\n' "$1" "$2" |
        tr ',' '\n' |
        awk '$0 != "" && $0 != "-" && !seen[$0]++ { out = out (out == "" ? "" : " ") $0 } END { print out }'
}

# This scan is intentionally limited to explicit port 53/853 firewall and
# port-53 hijack escapes. Generic encrypted DNS over HTTPS/HTTP3 on port 443
# cannot be attributed reliably from fw4 port rules and is not claimed clean.
guard_dns_detect_client_bypass() {
    guard_dns_bypass_reset
    command -v nft >/dev/null 2>&1 || return 0

    _guard_dns_fw_family=${GUARD_DNS_FW4_FAMILY:-inet}
    _guard_dns_fw_table=${GUARD_DNS_FW4_TABLE:-fw4}
    _guard_dns_fw_forward=${GUARD_DNS_FW4_FORWARD_CHAIN:-forward_lan}
    _guard_dns_fw_dstnat=${GUARD_DNS_FW4_DSTNAT_CHAIN:-dstnat}

    if ! _guard_dns_forward_text=$(nft -a list chain "$_guard_dns_fw_family" "$_guard_dns_fw_table" "$_guard_dns_fw_forward" 2>/dev/null); then
        return 0
    fi
    if ! _guard_dns_dstnat_text=$(nft -a list chain "$_guard_dns_fw_family" "$_guard_dns_fw_table" "$_guard_dns_fw_dstnat" 2>/dev/null); then
        return 0
    fi
    _GUARD_DNS_BYPASS_SCAN_AVAILABLE=1

    _guard_dns_forward_summary=$(printf '%s\n' "$_guard_dns_forward_text" | _guard_dns_scan_forward_text)
    _guard_dns_oldifs=$IFS
    IFS='|'
    read -r _GUARD_DNS_BYPASS_RULES _GUARD_DNS_BYPASS_PORT53 _GUARD_DNS_BYPASS_DOT853 _guard_dns_forward_sources _guard_dns_forward_unknown <<EOF
$_guard_dns_forward_summary
EOF
    IFS=$_guard_dns_oldifs

    _guard_dns_dstnat_summary=$(printf '%s\n' "$_guard_dns_dstnat_text" | _guard_dns_scan_dstnat_text)
    IFS='|'
    read -r _GUARD_DNS_HIJACK_BYPASS _guard_dns_dstnat_sources _guard_dns_dstnat_unknown <<EOF
$_guard_dns_dstnat_summary
EOF
    IFS=$_guard_dns_oldifs

    _GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES=$((_guard_dns_forward_unknown + _guard_dns_dstnat_unknown))
    _GUARD_DNS_BYPASS_SOURCES=$(_guard_dns_merge_sources "$_guard_dns_forward_sources" "$_guard_dns_dstnat_sources")
    for _guard_dns_src in $_GUARD_DNS_BYPASS_SOURCES
    do
        [ -n "$_guard_dns_src" ] || continue
        _GUARD_DNS_BYPASS_CLIENTS=$((_GUARD_DNS_BYPASS_CLIENTS + 1))
    done
    if [ "$_GUARD_DNS_BYPASS_RULES" -gt 0 ] || [ "$_GUARD_DNS_HIJACK_BYPASS" -gt 0 ]; then
        _GUARD_DNS_BYPASS_DETECTED=1
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
    guard_dns_detect_client_bypass
}

# Guard never resurrects DNS daemons; detection is observation-only.
