#!/bin/sh
# Read-only normalized environment model for openclash-guard.
# Prefix: guard_env_
set -eu

_GUARD_OC_INSTALLED=0
_GUARD_OC_ENABLED=0
_GUARD_OC_RUNNING=0
_GUARD_OC_HEALTHY=0
_GUARD_DNS_BACKEND=none
_GUARD_DNS_MSQ_ENABLED=0
_GUARD_DNS_MSQ_RUNNING=0
_GUARD_DNS_AGH_ENABLED=0
_GUARD_DNS_AGH_RUNNING=0
_GUARD_DNS_DOMAIN_SET=unavailable
_GUARD_NET_IPV6=0
_GUARD_NET_DIRECT_REGION=
_GUARD_PROXY_HEALTHY=0
_GUARD_PROXY_REGION=
_GUARD_GAME_CLIENTS=0
_GUARD_GAME_CLIENT_ITEMS=
_GUARD_GAME_BLANKET=0
_GUARD_NFT_AVAILABLE=0
_GUARD_DEPENDENCY_FAILURE=0

_guard_env_dependency_failed() {
    _guard_ed_service=${GUARD_SERVICE_ID:-}
    _guard_ed_file=${GUARD_DEPENDENCY_STATUS_FILE:-}
    [ -n "$_guard_ed_service" ] && [ -f "$_guard_ed_file" ] || return 1
    _guard_ed_deps=$(json_keys "$_guard_ed_file" "services.$_guard_ed_service.dependencies" 2>/dev/null) || return 1
    for _guard_ed_dep in $_guard_ed_deps
    do
        _guard_ed_required=$(json_get "$_guard_ed_file" "services.$_guard_ed_service.dependencies.$_guard_ed_dep.required" 2>/dev/null) || _guard_ed_required=true
        [ "$_guard_ed_required" = true ] || continue
        _guard_ed_healthy=$(json_get "$_guard_ed_file" "services.$_guard_ed_service.dependencies.$_guard_ed_dep.healthy" 2>/dev/null) || _guard_ed_healthy=unknown
        _guard_ed_compatible=$(json_get "$_guard_ed_file" "services.$_guard_ed_service.dependencies.$_guard_ed_dep.routeCompatible" 2>/dev/null) || _guard_ed_compatible=true
        if [ "$_guard_ed_healthy" = false ] || [ "$_guard_ed_compatible" = false ]; then
            return 0
        fi
    done
    return 1
}

_guard_env_json_bool() {
    if [ "$1" = 1 ]; then
        printf 'true'
    else
        printf 'false'
    fi
}

_guard_env_json_string() {
    printf '%s' "$1" | awk '
        BEGIN { ORS = "" }
        {
            gsub(/\\/, "\\\\")
            gsub(/"/, "\\\"")
            gsub(/\t/, "\\t")
            print
        }
    '
}

_guard_env_oc_probe_healthy() {
    case ${GUARD_OPENCLASH_HEALTHY:-} in
        1|true|TRUE|yes|YES|on|ON)
            return 0
            ;;
        0|false|FALSE|no|NO|off|OFF)
            return 1
            ;;
    esac
    _guard_env_pidf=${GUARD_OPENCLASH_PID_FILE:-/tmp/etc/openclash/clash.pid}
    if [ -f "$_guard_env_pidf" ]; then
        _guard_env_pid=$(cat "$_guard_env_pidf" 2>/dev/null) || _guard_env_pid=
        case $_guard_env_pid in
            ''|*[!0-9]*)
                ;;
            *)
                if kill -0 "$_guard_env_pid" 2>/dev/null; then
                    return 0
                fi
                ;;
        esac
    fi
    for _guard_env_if in ${GUARD_OPENCLASH_TUN_IFACES:-utun Meta tun0 utun0}
    do
        if [ -e "/sys/class/net/$_guard_env_if" ]; then
            return 0
        fi
    done
    return 1
}

_guard_env_ipv6() {
    case ${GUARD_IPV6:-} in
        1|true|TRUE|yes|YES|on|ON)
            printf '1\n'
            return 0
            ;;
        0|false|FALSE|no|NO|off|OFF)
            printf '0\n'
            return 0
            ;;
    esac
    if [ -s /proc/net/if_inet6 ]; then
        printf '1\n'
        return 0
    fi
    printf '0\n'
}

_guard_env_proxy_healthy() {
    case ${GUARD_PROXY_HEALTHY:-} in
        1|true|TRUE|yes|YES|on|ON)
            printf '1\n'
            return 0
            ;;
        0|false|FALSE|no|NO|off|OFF)
            printf '0\n'
            return 0
            ;;
    esac
    if [ "$_GUARD_OC_HEALTHY" = 1 ]; then
        printf '1\n'
    else
        printf '0\n'
    fi
}

_guard_env_load_clients() {
    _GUARD_GAME_CLIENTS=0
    _GUARD_GAME_CLIENT_ITEMS=
    if ! command -v uci >/dev/null 2>&1; then
        return 0
    fi
    _guard_env_nl='
'
    _guard_env_items=$(uci -d "$_guard_env_nl" -q get openclash_guard.udp.src_ip 2>/dev/null) || _guard_env_items=
    for _guard_env_item in $_guard_env_items
    do
        [ -n "$_guard_env_item" ] || continue
        _GUARD_GAME_CLIENTS=$((_GUARD_GAME_CLIENTS + 1))
        if [ -z "$_GUARD_GAME_CLIENT_ITEMS" ]; then
            _GUARD_GAME_CLIENT_ITEMS=$_guard_env_item
        else
            _GUARD_GAME_CLIENT_ITEMS="$_GUARD_GAME_CLIENT_ITEMS $_guard_env_item"
        fi
    done
}

_guard_env_json_items() {
    printf '['
    _guard_env_ji_first=1
    for _guard_env_ji in $_GUARD_GAME_CLIENT_ITEMS
    do
        [ -n "$_guard_env_ji" ] || continue
        if [ "$_guard_env_ji_first" = 1 ]; then
            _guard_env_ji_first=0
        else
            printf ','
        fi
        printf '"%s"' "$(_guard_env_json_string "$_guard_env_ji")"
    done
    printf ']'
}

guard_env_detect() {
    _GUARD_OC_INSTALLED=0
    _GUARD_OC_ENABLED=0
    _GUARD_OC_RUNNING=0
    _GUARD_OC_HEALTHY=0
    if svc_exists openclash; then
        _GUARD_OC_INSTALLED=1
        if svc_enabled openclash; then
            _GUARD_OC_ENABLED=1
        fi
        if svc_running openclash; then
            _GUARD_OC_RUNNING=1
        fi
    fi
    if [ "$_GUARD_OC_RUNNING" = 1 ] && _guard_env_oc_probe_healthy; then
        _GUARD_OC_HEALTHY=1
    fi
    guard_dns_detect
    _GUARD_NET_IPV6=$(_guard_env_ipv6)
    if [ -n "${GUARD_DIRECT_REGION:-}" ]; then
        _GUARD_NET_DIRECT_REGION=$GUARD_DIRECT_REGION
    else
        _GUARD_NET_DIRECT_REGION=$(guard_geo_cached_country direct 2>/dev/null) || _GUARD_NET_DIRECT_REGION=
    fi
    _GUARD_PROXY_HEALTHY=$(_guard_env_proxy_healthy)
    if [ -n "${GUARD_PROXY_REGION:-}" ]; then
        _GUARD_PROXY_REGION=$GUARD_PROXY_REGION
    elif [ -n "${GUARD_GEO_ROUTE:-}" ]; then
        _GUARD_PROXY_REGION=$(guard_geo_cached_country route "$GUARD_GEO_ROUTE" 2>/dev/null) || _GUARD_PROXY_REGION=
    else
        _GUARD_PROXY_REGION=
    fi
    _guard_env_load_clients
    _GUARD_GAME_BLANKET=0
    if command -v uci >/dev/null 2>&1; then
        _GUARD_GAME_BLANKET=$(uci_get_bool openclash_guard.udp.blanket_udp_bypass 0 2>/dev/null) || _GUARD_GAME_BLANKET=0
    fi
    case ${GUARD_GAMING_BLANKET:-} in
        1|true|TRUE|yes|YES|on|ON)
            _GUARD_GAME_BLANKET=1
            ;;
        0|false|FALSE|no|NO|off|OFF)
            _GUARD_GAME_BLANKET=0
            ;;
    esac
    _GUARD_NFT_AVAILABLE=0
    if command -v nft >/dev/null 2>&1; then
        _GUARD_NFT_AVAILABLE=1
    fi
    case ${GUARD_DEPENDENCY_FAILED:-} in
        1|true|TRUE|yes|YES|on|ON) _GUARD_DEPENDENCY_FAILURE=1 ;;
        *) _GUARD_DEPENDENCY_FAILURE=0 ;;
    esac
    if _guard_env_dependency_failed; then
        _GUARD_DEPENDENCY_FAILURE=1
    fi
}

guard_env_get() {
    case ${1:-} in
        openclash.installed) printf '%s\n' "$_GUARD_OC_INSTALLED" ;;
        openclash.enabled) printf '%s\n' "$_GUARD_OC_ENABLED" ;;
        openclash.running) printf '%s\n' "$_GUARD_OC_RUNNING" ;;
        openclash.healthy) printf '%s\n' "$_GUARD_OC_HEALTHY" ;;
        dns.backend) printf '%s\n' "$_GUARD_DNS_BACKEND" ;;
        dns.dnsmasqEnabled) printf '%s\n' "$_GUARD_DNS_MSQ_ENABLED" ;;
        dns.dnsmasqRunning) printf '%s\n' "$_GUARD_DNS_MSQ_RUNNING" ;;
        dns.adguardhomeEnabled) printf '%s\n' "$_GUARD_DNS_AGH_ENABLED" ;;
        dns.adguardhomeRunning) printf '%s\n' "$_GUARD_DNS_AGH_RUNNING" ;;
        dns.domainSetBackend) printf '%s\n' "$_GUARD_DNS_DOMAIN_SET" ;;
        network.ipv6) printf '%s\n' "$_GUARD_NET_IPV6" ;;
        network.directRegion) printf '%s\n' "$_GUARD_NET_DIRECT_REGION" ;;
        proxy.healthy) printf '%s\n' "$_GUARD_PROXY_HEALTHY" ;;
        proxy.region) printf '%s\n' "$_GUARD_PROXY_REGION" ;;
        gaming.clients.count) printf '%s\n' "$_GUARD_GAME_CLIENTS" ;;
        gaming.clients.items) printf '%s\n' "$_GUARD_GAME_CLIENT_ITEMS" ;;
        gaming.blanketUdpBypassDetected) printf '%s\n' "$_GUARD_GAME_BLANKET" ;;
        nft.available) printf '%s\n' "$_GUARD_NFT_AVAILABLE" ;;
        dependency.requiredFailure) printf '%s\n' "$_GUARD_DEPENDENCY_FAILURE" ;;
        *)
            printf '%s\n' "guard_env_get: unknown key: ${1:-}" >&2
            return 2
            ;;
    esac
}

guard_env_json() {
    printf '{'
    printf '"dependency":{"requiredFailure":%s},' \
        "$(_guard_env_json_bool "$_GUARD_DEPENDENCY_FAILURE")"
    printf '"openclash":{"installed":%s,"enabled":%s,"running":%s,"healthy":%s},' \
        "$(_guard_env_json_bool "$_GUARD_OC_INSTALLED")" \
        "$(_guard_env_json_bool "$_GUARD_OC_ENABLED")" \
        "$(_guard_env_json_bool "$_GUARD_OC_RUNNING")" \
        "$(_guard_env_json_bool "$_GUARD_OC_HEALTHY")"
    printf '"dns":{"backend":"%s","dnsmasqEnabled":%s,"dnsmasqRunning":%s,"adguardhomeEnabled":%s,"adguardhomeRunning":%s,"domainSetBackend":"%s"},' \
        "$(_guard_env_json_string "$_GUARD_DNS_BACKEND")" \
        "$(_guard_env_json_bool "$_GUARD_DNS_MSQ_ENABLED")" \
        "$(_guard_env_json_bool "$_GUARD_DNS_MSQ_RUNNING")" \
        "$(_guard_env_json_bool "$_GUARD_DNS_AGH_ENABLED")" \
        "$(_guard_env_json_bool "$_GUARD_DNS_AGH_RUNNING")" \
        "$(_guard_env_json_string "$_GUARD_DNS_DOMAIN_SET")"
    printf '"network":{"ipv6":%s,"directRegion":"%s"},' \
        "$(_guard_env_json_bool "$_GUARD_NET_IPV6")" \
        "$(_guard_env_json_string "$_GUARD_NET_DIRECT_REGION")"
    printf '"proxy":{"healthy":%s,"region":"%s"},' \
        "$(_guard_env_json_bool "$_GUARD_PROXY_HEALTHY")" \
        "$(_guard_env_json_string "$_GUARD_PROXY_REGION")"
    printf '"gaming":{"clients":{"count":%s,"items":%s},"blanketUdpBypassDetected":%s},' \
        "$_GUARD_GAME_CLIENTS" \
        "$(_guard_env_json_items)" \
        "$(_guard_env_json_bool "$_GUARD_GAME_BLANKET")"
    printf '"nft":{"available":%s}' "$(_guard_env_json_bool "$_GUARD_NFT_AVAILABLE")"
    printf '}\n'
}
