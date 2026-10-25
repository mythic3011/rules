#!/bin/sh
# DNS backend detection. Never starts, enables, or restarts dnsmasq.
# Prefix: guard_dns_
set -eu

_GUARD_DNS_NAMES="adguardhome AdGuardHome adguard-home"

_GUARD_DNS_BYPASS_RULES=0
_GUARD_DNS_BYPASS_PORT53_RULES=0
_GUARD_DNS_BYPASS_DOT853_RULES=0
_GUARD_DNS_HIJACK_BYPASS_RULES=0
_GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES=0
_GUARD_DNS_BYPASS_UNKNOWN_DPORT_RULES=0
_GUARD_DNS_BYPASS_CLIENT_COUNT=0
_GUARD_DNS_BYPASS_CLIENTS=

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

_guard_dns_source_is_literal() {
    _guard_dns_sl_family=$1
    _guard_dns_sl_value=$2
    _guard_dns_sl_address=$_guard_dns_sl_value
    _guard_dns_sl_prefix=

    case $_guard_dns_sl_value in
        */*)
            _guard_dns_sl_address=${_guard_dns_sl_value%/*}
            _guard_dns_sl_prefix=${_guard_dns_sl_value#*/}
            case $_guard_dns_sl_prefix in
                ''|*[!0-9]*) return 1 ;;
            esac
            [ "${#_guard_dns_sl_prefix}" -le 3 ] || return 1
            case $_guard_dns_sl_prefix in
                0|[1-9]|[1-9][0-9]) ;;
                1[01][0-9]|12[0-8]) ;;
                *) return 1 ;;
            esac
            ;;
    esac

    case $_guard_dns_sl_family in
        ipv4)
            _guard_resolver_sync_valid_ipv4 "$_guard_dns_sl_address" || return 1
            if [ -n "$_guard_dns_sl_prefix" ]; then
                [ "$_guard_dns_sl_prefix" -le 32 ] 2>/dev/null || return 1
            fi
            ;;
        ipv6)
            _guard_resolver_sync_valid_ipv6 "$_guard_dns_sl_address" || return 1
            ;;
        *)
            return 1
            ;;
    esac
}

_guard_dns_scan_rule_records() {
    _guard_dns_srr_chain=$1
    awk -v scan_chain="$_guard_dns_srr_chain" '
        function has_jump(target,    i) {
            for (i = 1; i < NF; i++) {
                if ($i == "jump" && $(i + 1) == target) return 1
            }
            return 0
        }
        function has_return(    i) {
            for (i = 1; i <= NF; i++) if ($i == "return") return 1
            return 0
        }
        function port_number(value,    number) {
            if (value !~ /^[0-9]+$/ || length(value) > 5) return -1
            number = value + 0
            if (number > 65535) return -1
            return number
        }
        function include_interval(first, last,    low, high) {
            low = port_number(first)
            high = port_number(last)
            if (low < 0 || high < 0 || low > high) {
                port_unknown = 1
                return
            }
            if (low <= 53 && high >= 53) port53_match = 1
            if (low <= 853 && high >= 853) port853_match = 1
        }
        function include_atom(atom,    separator, bounds) {
            if (atom ~ /^[0-9]+$/) {
                include_interval(atom, atom)
                return
            }
            if (atom ~ /^[0-9]+-[0-9]+$/) {
                split(atom, bounds, "-")
                include_interval(bounds[1], bounds[2])
                return
            }
            port_unknown = 1
        }
        function include_comparison(operator, value,    number) {
            number = port_number(value)
            if (number < 0) {
                port_unknown = 1
                return
            }
            if (operator == "!=" || operator == "<" || operator == "<=") {
                if (operator == "!=" && number != 53) port53_match = 1
                if (operator == "!=" && number != 853) port853_match = 1
                if (operator == "<" && number > 53) port53_match = 1
                if (operator == "<" && number > 853) port853_match = 1
                if (operator == "<=" && number >= 53) port53_match = 1
                if (operator == "<=" && number >= 853) port853_match = 1
                return
            }
            if (operator == ">" && number < 53) port53_match = 1
            if (operator == ">" && number < 853) port853_match = 1
            if (operator == ">=" && number <= 53) port53_match = 1
            if (operator == ">=" && number <= 853) port853_match = 1
            if (operator == "=" || operator == "==") {
                if (number == 53) port53_match = 1
                if (number == 853) port853_match = 1
            }
        }
        function analyze_dport(    i, j, token, operator, saw_value, closed, count) {
            port53_match = 0
            port853_match = 0
            port_unknown = 0
            count = 0
            for (i = 1; i <= NF; i++) {
                if ($i != "dport") continue
                count++
                j = i + 1
                if (j > NF) {
                    port_unknown = 1
                    continue
                }
                if ($j == "{") {
                    saw_value = 0
                    closed = 0
                    j++
                    while (j <= NF && $j != "}") {
                        token = $j
                        gsub(/,/, "", token)
                        if (token != "") {
                            include_atom(token)
                            saw_value = 1
                        }
                        j++
                    }
                    if (j <= NF && $j == "}") closed = 1
                    if (!closed || !saw_value) port_unknown = 1
                    i = j
                    continue
                }
                token = $j
                if (token == "!=" || token == "<" || token == "<=" ||
                    token == ">" || token == ">=" || token == "=" || token == "==") {
                    operator = token
                    j++
                    if (j > NF) {
                        port_unknown = 1
                    } else {
                        token = $j
                        gsub(/,/, "", token)
                        include_comparison(operator, token)
                    }
                    i = j
                    continue
                }
                gsub(/,/, "", token)
                include_atom(token)
                i = j
            }
            if (count > 1) port_unknown = 1
            return count
        }
        function source_value(    i, family, value) {
            for (i = 1; i < NF; i++) {
                if ($i != "saddr") continue
                if ($(i - 1) == "ip") family = "ipv4"
                else if ($(i - 1) == "ip6") family = "ipv6"
                else return "unknown|-"
                value = $(i + 1)
                gsub(/,/, "", value)
                if (value == "{" || value == "}" || value == "" || value == "!") return "unknown|-"
                return family "|" value
            }
            return "unknown|-"
        }
        {
            for (i = 1; i <= NF; i++) {
                if ($i == "comment" || $i == "#") {
                    NF = i - 1
                    break
                }
            }
            if (scan_chain == "forward") {
                if (!has_jump("accept_to_wan")) next
                if (!analyze_dport()) next
                if (port_unknown) {
                    print "unknownPort|0|0|unknown|-"
                    next
                }
                has53 = port53_match
                has853 = port853_match
                if (!has53 && !has853) next
                split(source_value(), source, "|")
                printf "forward|%d|%d|%s|%s\n", has53, has853, source[1], source[2]
                next
            }
            if (!has_return() || !analyze_dport()) next
            if (port_unknown) {
                print "unknownPort|0|0|unknown|-"
                next
            }
            if (!port53_match) next
            split(source_value(), source, "|")
            printf "dstnat|1|0|%s|%s\n", source[1], source[2]
        }
    '
}

guard_dns_detect_firewall_bypasses() {
    _GUARD_DNS_BYPASS_AVAILABLE=0
    _GUARD_DNS_BYPASS_DETECTED=0
    _GUARD_DNS_BYPASS_RULES=0
    _GUARD_DNS_BYPASS_PORT53_RULES=0
    _GUARD_DNS_BYPASS_DOT853_RULES=0
    _GUARD_DNS_HIJACK_BYPASS_RULES=0
    _GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES=0
    _GUARD_DNS_BYPASS_UNKNOWN_DPORT_RULES=0
    _GUARD_DNS_BYPASS_CLIENTS=
    _GUARD_DNS_BYPASS_CLIENT_COUNT=0
    _GUARD_DNS_BYPASS_PORT53=0
    _GUARD_DNS_BYPASS_DOT853=0
    _GUARD_DNS_HIJACK_BYPASS=0

    command -v nft >/dev/null 2>&1 || return 0

    _guard_dns_forward=$(nft -a list chain inet fw4 forward_lan 2>/dev/null) || return 0
    _guard_dns_dstnat=$(nft -a list chain inet fw4 dstnat 2>/dev/null) || return 0
    _GUARD_DNS_BYPASS_AVAILABLE=1

    while IFS='|' read -r _guard_dns_kind _guard_dns_has53 _guard_dns_has853 _guard_dns_family _guard_dns_source; do
        [ -n "$_guard_dns_kind" ] || continue
        case $_guard_dns_kind in
            forward)
                _GUARD_DNS_BYPASS_RULES=$((_GUARD_DNS_BYPASS_RULES + 1))
                _GUARD_DNS_BYPASS_PORT53_RULES=$((_GUARD_DNS_BYPASS_PORT53_RULES + _guard_dns_has53))
                _GUARD_DNS_BYPASS_DOT853_RULES=$((_GUARD_DNS_BYPASS_DOT853_RULES + _guard_dns_has853))
                ;;
            dstnat)
                _GUARD_DNS_HIJACK_BYPASS_RULES=$((_GUARD_DNS_HIJACK_BYPASS_RULES + 1))
                ;;
            unknownPort)
                _GUARD_DNS_BYPASS_UNKNOWN_DPORT_RULES=$((_GUARD_DNS_BYPASS_UNKNOWN_DPORT_RULES + 1))
                continue
                ;;
        esac
        if _guard_dns_source_is_literal "$_guard_dns_family" "$_guard_dns_source"; then
            _guard_dns_add_bypass_client "$_guard_dns_source"
        else
            _GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES=$((_GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES + 1))
        fi
    done <<EOF
$(printf '%s\n' "$_guard_dns_forward" | _guard_dns_scan_rule_records forward)
$(printf '%s\n' "$_guard_dns_dstnat" | _guard_dns_scan_rule_records dstnat)
EOF

    [ "$_GUARD_DNS_BYPASS_PORT53_RULES" -eq 0 ] || _GUARD_DNS_BYPASS_PORT53=1
    [ "$_GUARD_DNS_BYPASS_DOT853_RULES" -eq 0 ] || _GUARD_DNS_BYPASS_DOT853=1
    [ "$_GUARD_DNS_HIJACK_BYPASS_RULES" -eq 0 ] || _GUARD_DNS_HIJACK_BYPASS=1
    if [ "$_GUARD_DNS_BYPASS_RULES" -gt 0 ] || [ "$_GUARD_DNS_HIJACK_BYPASS_RULES" -gt 0 ]; then
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
    guard_dns_detect_firewall_bypasses
}

# Guard never resurrects DNS daemons; detection is observation-only.
