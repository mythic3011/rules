#!/bin/sh
# Persistent inet table independent of disposable OpenClash/fw4 chains.
# Prefix: guard_kill_
set -eu

_GUARD_UCI_ENABLED=1
_GUARD_UCI_MODE=auto
_GUARD_UCI_KILL_SWITCH=1
_GUARD_UCI_DNS_KILL_SWITCH=0
_GUARD_NFT_TABLE_EXISTS=0

_guard_kill_comment() {
    printf '%s:%s' "$_GUARD_NFT_PREFIX" "$1"
}
guard_kill_read_uci() {
    _GUARD_UCI_ENABLED=1
    _GUARD_UCI_MODE=auto
    _GUARD_UCI_KILL_SWITCH=1
    _GUARD_UCI_DNS_KILL_SWITCH=0
    if command -v uci >/dev/null 2>&1; then
        _GUARD_UCI_ENABLED=$(uci_get_bool openclash_guard.main.enabled 1 2>/dev/null) || _GUARD_UCI_ENABLED=1
        _GUARD_UCI_MODE=$(uci_get_default openclash_guard.main.mode auto 2>/dev/null) || _GUARD_UCI_MODE=auto
        _GUARD_UCI_KILL_SWITCH=$(uci_get_bool openclash_guard.main.kill_switch 1 2>/dev/null) || _GUARD_UCI_KILL_SWITCH=1
        _GUARD_UCI_DNS_KILL_SWITCH=$(uci_get_bool openclash_guard.main.dns_kill_switch 0 2>/dev/null) || _GUARD_UCI_DNS_KILL_SWITCH=0
    fi
}

_guard_kill_csv_set() {
    _guard_ks_out=
    _guard_ks_first=1
    for _guard_ks_item in "$@"
    do
        [ -n "$_guard_ks_item" ] || continue
        if [ "$_guard_ks_first" = 1 ]; then
            _guard_ks_out=$_guard_ks_item
            _guard_ks_first=0
        else
            _guard_ks_out="$_guard_ks_out, $_guard_ks_item"
        fi
    done
    printf '%s' "$_guard_ks_out"
}

_guard_kill_add_set() {
    _guard_as_name=$1
    _guard_as_type=$2
    _guard_as_tag=$3
    _guard_as_flags=${4:-}
    _guard_as_extra=
    if [ -n "$_guard_as_flags" ]; then
        _guard_as_extra=" flags $_guard_as_flags;"
    fi
    printf 'add set %s %s %s { type %s;%s comment "%s"; }\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE" "$_guard_as_name" "$_guard_as_type" \
        "$_guard_as_extra" "$(_guard_kill_comment "$_guard_as_tag")"
}

_guard_kill_add_elements() {
    _guard_ae_name=$1
    shift
    _guard_ae_csv=$(_guard_kill_csv_set "$@")
    if [ -z "$_guard_ae_csv" ]; then
        return 0
    fi
    printf 'add element %s %s %s { %s }\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE" "$_guard_ae_name" "$_guard_ae_csv"
}

_guard_kill_add_rule() {
    printf 'add rule %s %s %s %s comment "%s"\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE" "$1" "$2" "$(_guard_kill_comment "$3")"
}

guard_kill_delete_table() {
    if [ "$_GUARD_NFT_AVAILABLE" != 1 ]; then
        return 0
    fi
    # The OpenClash dataplane exemption and the Guard allow are one policy.
    # Remove Guard-owned pre-TUN state first so disabling/removing Guard cannot
    # leave a stale direct-routing bypass behind.
    if command -v guard_dataplane_remove >/dev/null 2>&1; then
        guard_dataplane_remove || return $?
    fi
    if nft_table_exists "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"; then
        nft delete table "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    fi
}

_guard_kill_render_resolver_sync_sets() {
    [ "${_GUARD_DNS_BACKEND:-}" = adguardhome ] || return 0
    printf 'add set %s %s %s { type ipv4_addr; flags timeout; comment "%s"; }\n' \
        "$_GUARD_RESOLVER_SYNC_FAMILY" "$_GUARD_RESOLVER_SYNC_TABLE" "$_GUARD_RESOLVER_SYNC_V4_SET" \
        "$_GUARD_RESOLVER_SYNC_V4_SET_COMMENT"
    printf 'add set %s %s %s { type ipv6_addr; flags timeout; comment "%s"; }\n' \
        "$_GUARD_RESOLVER_SYNC_FAMILY" "$_GUARD_RESOLVER_SYNC_TABLE" "$_GUARD_RESOLVER_SYNC_V6_SET" \
        "$_GUARD_RESOLVER_SYNC_V6_SET_COMMENT"
}

_guard_kill_render_resolver_sync_rules() {
    [ "${_GUARD_DNS_BACKEND:-}" = adguardhome ] || return 0
    _guard_krrs_iface=$(_guard_resolver_sync_direct_iface 2>/dev/null) || return 0
    printf 'add rule %s %s %s oifname "%s" ip daddr @%s reject comment "%s"\n' \
        "$_GUARD_RESOLVER_SYNC_FAMILY" "$_GUARD_RESOLVER_SYNC_TABLE" "$_GUARD_RESOLVER_SYNC_CHAIN" \
        "$_guard_krrs_iface" "$_GUARD_RESOLVER_SYNC_V4_SET" "$_GUARD_RESOLVER_SYNC_V4_RULE_COMMENT"
    printf 'add rule %s %s %s oifname "%s" ip6 daddr @%s reject comment "%s"\n' \
        "$_GUARD_RESOLVER_SYNC_FAMILY" "$_GUARD_RESOLVER_SYNC_TABLE" "$_GUARD_RESOLVER_SYNC_CHAIN" \
        "$_guard_krrs_iface" "$_GUARD_RESOLVER_SYNC_V6_SET" "$_GUARD_RESOLVER_SYNC_V6_RULE_COMMENT"
}

# Base order: local accepts and protected-port rejects. Scoped direct exceptions
# are appended by their feature modules before guard_kill_render_final() emits
# the OpenClash tunnel capability and, only for an infrastructure-wide failure,
# the global fail-closed rule.
guard_kill_render() {
    if [ "${_GUARD_NFT_TABLE_EXISTS:-0}" = 1 ]; then
        printf 'flush table %s %s\n' "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    else
        printf 'add table %s %s\n' "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    fi
    _guard_kill_add_set lan_rfc1918 ipv4_addr lan interval
    _guard_kill_add_elements lan_rfc1918 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
    _guard_kill_add_set protected_udp inet_service protected-udp
    _guard_ku_ports=$(json_list "$_GUARD_POLICY_FILE" gaming.protectedUdpPorts 2>/dev/null) || _guard_ku_ports=
    _guard_ku_has443=0
    for _guard_ku_port in $_guard_ku_ports
    do
        if [ "$_guard_ku_port" = 443 ]; then
            _guard_ku_has443=1
            break
        fi
    done
    if [ "$_guard_ku_has443" != 1 ]; then
        _guard_ku_ports="$_guard_ku_ports 443"
    fi
    # shellcheck disable=SC2086
    _guard_kill_add_elements protected_udp $_guard_ku_ports
    _guard_kill_render_resolver_sync_sets

    printf 'add chain %s %s input { type filter hook input priority -150; policy accept; }\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    printf 'add chain %s %s forward { type filter hook forward priority -150; policy accept; }\n' \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"

    _guard_kill_add_rule input 'ct state established,related accept' est-in
    if [ "$_GUARD_UCI_DNS_KILL_SWITCH" = 1 ]; then
        _guard_kill_add_rule input 'iifname != "lo" udp dport 53 reject' dns-ks
        _guard_kill_add_rule input 'iifname != "lo" tcp dport 53 reject' dns-ks-tcp
    fi

    _guard_kill_add_rule forward 'ct state established,related accept' est
    _guard_kill_add_rule forward 'iifname "lo" accept' lo
    _guard_kill_add_rule forward 'udp dport { 67, 68 } accept' dhcp
    _guard_kill_add_rule forward 'ip daddr @lan_rfc1918 accept' lan-dst
    _guard_kill_add_rule forward 'udp dport @protected_udp reject' protected-udp
    # Resolver-derived direct-WAN rejects precede all scoped direct exceptions
    # rendered by feature modules, so a protected destination cannot be allowed
    # out directly merely because another policy also matches it.
    _guard_kill_render_resolver_sync_rules
}

_guard_kill_valid_iface() {
    case ${1:-} in
        ''|*[!A-Za-z0-9_.:@-]*) return 1 ;;
        *) return 0 ;;
    esac
}

# Discover the generic OpenClash UDP routing mark from the current mangle chain
# instead of pinning a version-specific value. Scoped rules are deliberately
# excluded. Multiple distinct generic marks are ambiguous and therefore fail
# closed. nft may render the same mark compactly (0x162) or padded
# (0x00000162), so normalize equivalent spellings before deciding uniqueness.
_guard_kill_openclash_tunnel_mark() {
    _guard_ktm_family=${GUARD_OPENCLASH_NFT_FAMILY:-inet}
    _guard_ktm_table=${GUARD_OPENCLASH_NFT_TABLE:-fw4}
    _guard_ktm_chain=${GUARD_OPENCLASH_MANGLE_CHAIN:-openclash_mangle}
    _guard_ktm_listing=$(nft -a list chain "$_guard_ktm_family" "$_guard_ktm_table" "$_guard_ktm_chain" 2>/dev/null) || return 1
    printf '%s\n' "$_guard_ktm_listing" | awk '
        function normalize_mark(raw, hex) {
            hex = tolower(raw)
            sub(/^0x/, "", hex)
            if (hex !~ /^[0-9a-f]+$/ || length(hex) > 8) {
                return ""
            }
            sub(/^0+/, "", hex)
            if (hex == "") {
                hex = "0"
            }
            return "0x" hex
        }
        ($0 ~ /ip protocol udp/ || $0 ~ /meta l4proto udp/) &&
        $0 ~ /meta mark set 0x[0-9A-Fa-f]+/ &&
        $0 !~ /saddr|daddr|sport|dport|iifname|oifname/ {
            if (match($0, /meta mark set 0x[0-9A-Fa-f]+/)) {
                value = substr($0, RSTART, RLENGTH)
                sub(/^meta mark set /, "", value)
                value = normalize_mark(value)
                if (value != "") {
                    seen[value] = 1
                }
            }
        }
        END {
            count = 0
            result = ""
            for (value in seen) {
                count++
                result = value
            }
            if (count == 1) {
                print result
            }
        }
    '
}

# Only emit allows for OpenClash TUN interface candidates that exist at the
# current reconciliation point. A generic tun0 is intentionally not a default:
# it is too easy for an unrelated VPN to own that name. Deployments that really
# use tun0 can opt in explicitly through GUARD_OPENCLASH_TUN_IFACES.
_guard_kill_openclash_tunnel_ifaces() {
    command -v ip >/dev/null 2>&1 || return 1
    _guard_kti_seen=' '
    _guard_kti_found=0
    for _guard_kti_iface in ${GUARD_OPENCLASH_TUN_IFACES:-utun Meta utun0}
    do
        _guard_kill_valid_iface "$_guard_kti_iface" || continue
        case $_guard_kti_seen in
            *" $_guard_kti_iface "*) continue ;;
        esac
        ip link show dev "$_guard_kti_iface" >/dev/null 2>&1 || continue
        printf '%s\n' "$_guard_kti_iface"
        _guard_kti_seen="$_guard_kti_seen$_guard_kti_iface "
        _guard_kti_found=1
    done
    [ "$_guard_kti_found" = 1 ]
}

guard_kill_render_tunnel_egress() {
    # If OpenClash is unhealthy or its current dataplane cannot be identified,
    # preserve fail-closed behavior rather than broadening the allow to an
    # interface-only exception.
    [ "${_GUARD_OC_HEALTHY:-0}" = 1 ] || return 0
    [ "${_GUARD_NFT_AVAILABLE:-0}" = 1 ] || return 0
    _guard_kte_mark=$(_guard_kill_openclash_tunnel_mark) || return 0
    [ -n "$_guard_kte_mark" ] || return 0
    _guard_kte_ifaces=$(_guard_kill_openclash_tunnel_ifaces) || return 0
    for _guard_kte_iface in $_guard_kte_ifaces
    do
        _guard_kill_add_rule forward \
            "meta mark $_guard_kte_mark oifname \"$_guard_kte_iface\" accept" \
            tunnel-egress
    done
}

guard_kill_render_final() {
    if [ "${_GUARD_POLICY_GLOBAL_FAILCLOSED:-0}" = 1 ]; then
        guard_kill_render_tunnel_egress
        _guard_kill_add_rule forward reject kill-switch
    fi
}

guard_kill_apply_batch() {
    _guard_ka_file=${1:-}
    if [ -z "$_guard_ka_file" ] || [ ! -f "$_guard_ka_file" ]; then
        printf '%s\n' "guard_kill_apply_batch: missing batch" >&2
        return 2
    fi
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        cat "$_guard_ka_file"
        return 0
    fi
    if [ "$_GUARD_NFT_AVAILABLE" != 1 ]; then
        printf '%s\n' "guard_kill: nft not available" >&2
        return 1
    fi
    nft_apply_batch "$_guard_ka_file"
}
