#!/bin/sh
# Read-only health probes for OpenClash Guard runtime state.
# Prefix: guard_health_
set -eu

_GUARD_HEALTH_DP_EXPECTED=0
_GUARD_HEALTH_DP_STATE=inactive
_GUARD_HEALTH_DP_SOURCE_RULE=not-required
_GUARD_HEALTH_DP_DESTINATION_RULE=not-required
_GUARD_HEALTH_DP_REASON=

_guard_health_dataplane_reset() {
    _GUARD_HEALTH_DP_EXPECTED=0
    _GUARD_HEALTH_DP_STATE=inactive
    _GUARD_HEALTH_DP_SOURCE_RULE=not-required
    _GUARD_HEALTH_DP_DESTINATION_RULE=not-required
    _GUARD_HEALTH_DP_REASON=
}

_guard_health_dataplane_fail() {
    _GUARD_HEALTH_DP_STATE=failed
    _GUARD_HEALTH_DP_REASON=$1
    return 1
}

_guard_health_dataplane_anchor_line() {
    _guard_hda_listing=$1
    _guard_hda_anchor=${GUARD_OPENCLASH_UDP_ANCHOR:-jump openclash_upnp}
    _guard_hda_line=$(printf '%s\n' "$_guard_hda_listing" | awk -v anchor="$_guard_hda_anchor" '
        index($0, anchor) && ($0 ~ /ip protocol udp/ || $0 ~ /meta l4proto udp/) &&
        $0 !~ /saddr|daddr|sport|dport|iifname|oifname/ { print NR; exit }
    ')
    if [ -z "$_guard_hda_line" ]; then
        _guard_hda_line=$(printf '%s\n' "$_guard_hda_listing" | awk '
            /meta l4proto udp/ && /meta mark set/ &&
            $0 !~ /saddr|daddr|sport|dport|iifname|oifname/ { print NR; exit }
        ')
    fi
    [ -n "$_guard_hda_line" ] || return 1
    printf '%s\n' "$_guard_hda_line"
}

_guard_health_dataplane_comment_count() {
    _guard_hcc_listing=$1
    _guard_hcc_suffix=$2
    printf '%s\n' "$_guard_hcc_listing" | awk \
        -v marker="comment \"${_GUARD_DATAPLANE_COMMENT_PREFIX}:${_guard_hcc_suffix}\"" \
        'index($0, marker) { count++ } END { print count + 0 }'
}

_guard_health_dataplane_rule_line() {
    _guard_hrl_listing=$1
    _guard_hrl_kind=$2
    _guard_hrl_need_dst=$3
    _guard_hrl_src=$(_guard_dataplane_src_set)
    _guard_hrl_protected=$(_guard_dataplane_protected_set)
    _guard_hrl_dst=$(_guard_dataplane_dst_set)
    _guard_hrl_cap=$(guard_dataplane_capability_mark) || return 1
    case $_guard_hrl_kind in
        source)
            _guard_hrl_port=$(_guard_dataplane_sport_set)
            _guard_hrl_port_expr="udp sport @$_guard_hrl_port"
            ;;
        destination)
            _guard_hrl_port=$(_guard_dataplane_dport_set)
            _guard_hrl_port_expr="udp dport @$_guard_hrl_port"
            ;;
        *) return 2 ;;
    esac
    printf '%s\n' "$_guard_hrl_listing" | awk \
        -v marker="comment \"${_GUARD_DATAPLANE_COMMENT_PREFIX}:${_guard_hrl_kind}\"" \
        -v src="ip saddr @$_guard_hrl_src" \
        -v protected="udp dport != @$_guard_hrl_protected" \
        -v port="$_guard_hrl_port_expr" \
        -v cap="meta mark set $_guard_hrl_cap" \
        -v dst="ip daddr @$_guard_hrl_dst" \
        -v needdst="$_guard_hrl_need_dst" '
        index($0, marker) && index($0, src) && index($0, protected) &&
        index($0, port) && index($0, cap) && $0 ~ /(^|[[:space:]])return([[:space:]]|$)/ {
            hasdst = index($0, dst) > 0
            if ((needdst == "1" && hasdst) || (needdst != "1" && !hasdst)) {
                print NR
                exit
            }
        }
    '
}

_guard_health_dataplane_check_rule() {
    _guard_hcr_listing=$1
    _guard_hcr_kind=$2
    _guard_hcr_required=$3
    _guard_hcr_need_dst=$4
    _guard_hcr_anchor=$5
    _guard_hcr_count=$(_guard_health_dataplane_comment_count "$_guard_hcr_listing" "$_guard_hcr_kind")

    if [ "$_guard_hcr_required" != 1 ]; then
        if [ "$_guard_hcr_count" -ne 0 ]; then
            printf '%s\n' unexpected
            return 1
        fi
        printf '%s\n' not-required
        return 0
    fi
    if [ "$_guard_hcr_count" -eq 0 ]; then
        printf '%s\n' missing
        return 1
    fi
    if [ "$_guard_hcr_count" -ne 1 ]; then
        printf '%s\n' duplicate
        return 1
    fi
    _guard_hcr_line=$(_guard_health_dataplane_rule_line "$_guard_hcr_listing" "$_guard_hcr_kind" "$_guard_hcr_need_dst") || _guard_hcr_line=
    if [ -z "$_guard_hcr_line" ]; then
        printf '%s\n' malformed
        return 1
    fi
    if [ "$_guard_hcr_line" -ge "$_guard_hcr_anchor" ]; then
        printf '%s\n' misordered
        return 1
    fi
    printf '%s\n' present
}

guard_health_dataplane_probe() {
    _guard_hp_need_source=${1:-0}
    _guard_hp_need_destination=${2:-0}
    _guard_hp_need_dst_scope=${3:-0}
    _GUARD_HEALTH_DP_STATE=failed
    _GUARD_HEALTH_DP_REASON=
    _GUARD_HEALTH_DP_SOURCE_RULE=not-required
    _GUARD_HEALTH_DP_DESTINATION_RULE=not-required

    command -v nft >/dev/null 2>&1 || {
        _guard_health_dataplane_fail nft-unavailable
        return $?
    }
    _guard_hp_listing=$(nft -a list chain \
        "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_TARGET_CHAIN" 2>/dev/null) || {
        _guard_health_dataplane_fail target-chain-unavailable
        return $?
    }

    if printf '%s\n' "$_guard_hp_listing" | grep -F "jump $_GUARD_DATAPLANE_CHAIN" >/dev/null 2>&1 || \
       nft_chain_exists "$_GUARD_DATAPLANE_FAMILY" "$_GUARD_DATAPLANE_TABLE" "$_GUARD_DATAPLANE_CHAIN"; then
        _guard_health_dataplane_fail stale-legacy-dataplane
        return $?
    fi

    _guard_hp_anchor=$(_guard_health_dataplane_anchor_line "$_guard_hp_listing" 2>/dev/null) || _guard_hp_anchor=
    if [ -z "$_guard_hp_anchor" ]; then
        _guard_health_dataplane_fail generic-udp-anchor-unavailable
        return $?
    fi

    _guard_hp_ok=1
    _GUARD_HEALTH_DP_SOURCE_RULE=$(_guard_health_dataplane_check_rule \
        "$_guard_hp_listing" source "$_guard_hp_need_source" "$_guard_hp_need_dst_scope" "$_guard_hp_anchor") || _guard_hp_ok=0
    _GUARD_HEALTH_DP_DESTINATION_RULE=$(_guard_health_dataplane_check_rule \
        "$_guard_hp_listing" destination "$_guard_hp_need_destination" "$_guard_hp_need_dst_scope" "$_guard_hp_anchor") || _guard_hp_ok=0

    if [ "$_guard_hp_ok" != 1 ]; then
        if [ "$_GUARD_HEALTH_DP_SOURCE_RULE" != present ] && [ "$_GUARD_HEALTH_DP_SOURCE_RULE" != not-required ]; then
            _guard_health_dataplane_fail "source-rule-$_GUARD_HEALTH_DP_SOURCE_RULE"
        else
            _guard_health_dataplane_fail "destination-rule-$_GUARD_HEALTH_DP_DESTINATION_RULE"
        fi
        return $?
    fi
    _GUARD_HEALTH_DP_STATE=ready
    return 0
}

guard_health_dataplane_assess() {
    _guard_health_dataplane_reset
    guard_game_read_uci
    guard_env_detect

    if [ "$_GUARD_GAME_ENABLED" != 1 ]; then
        _GUARD_HEALTH_DP_REASON=gaming-bypass-disabled
        return 0
    fi
    if [ "${_GUARD_OC_HEALTHY:-0}" != 1 ]; then
        _GUARD_HEALTH_DP_REASON=openclash-unhealthy
        return 0
    fi

    _guard_ha_policy=$(_guard_policy_default_path)
    if ! guard_policy_load "$_guard_ha_policy" >/dev/null 2>&1; then
        _GUARD_HEALTH_DP_REASON=runtime-policy-unavailable
        return 0
    fi
    _guard_ha_srcs=$(guard_game_src_ips)
    if [ -z "$_guard_ha_srcs" ]; then
        _GUARD_HEALTH_DP_REASON=no-trusted-gaming-clients
        return 0
    fi
    _guard_ha_source_ports=$(guard_game_udp_source_ports)
    _guard_ha_destination_ports=$(guard_game_safe_udp_destination_ports)
    if [ -z "$_guard_ha_source_ports" ] && [ -z "$_guard_ha_destination_ports" ]; then
        _GUARD_HEALTH_DP_REASON=no-directional-gaming-ports
        return 0
    fi
    _guard_ha_protected=$(guard_game_protected_udp_ports)
    if [ -z "$_guard_ha_protected" ]; then
        _GUARD_HEALTH_DP_REASON=protected-udp-metadata-unavailable
        return 0
    fi

    _guard_ha_need_source=0
    _guard_ha_need_destination=0
    _guard_ha_need_dst_scope=0
    [ -n "$_guard_ha_source_ports" ] && _guard_ha_need_source=1
    [ -n "$_guard_ha_destination_ports" ] && _guard_ha_need_destination=1
    _guard_ha_cidrs=$(json_list "$_GUARD_POLICY_FILE" gaming.destinationCidrs 2>/dev/null) || _guard_ha_cidrs=
    [ -n "$_guard_ha_cidrs" ] && _guard_ha_need_dst_scope=1

    _GUARD_HEALTH_DP_EXPECTED=1
    guard_health_dataplane_probe \
        "$_guard_ha_need_source" "$_guard_ha_need_destination" "$_guard_ha_need_dst_scope"
}

guard_health_check_run() {
    _guard_hc_json=${_GUARD_JSON:-0}
    while [ "$#" -gt 0 ]; do
        case $1 in
            --json) _guard_hc_json=1; shift ;;
            *) cli_error "unknown health-check option: $1"; return 2 ;;
        esac
    done

    _guard_hc_valid=1
    _guard_hc_reason=
    if ! guard_install_validate; then
        _guard_hc_valid=0
        _guard_hc_reason=$_GUARD_SETUP_INVALID_REASON
    fi
    _guard_hc_service=$(_guard_install_service_state 2>/dev/null) || true
    [ -n "$_guard_hc_service" ] || _guard_hc_service=missing
    if [ "$_guard_hc_service" = missing ] || [ "$_guard_hc_service" = disabled ]; then
        _guard_hc_valid=0
        [ -n "$_guard_hc_reason" ] || _guard_hc_reason="Guard service is $_guard_hc_service"
    fi
    _guard_hc_overlay=$(guard_overlay_activation)

    if ! guard_health_dataplane_assess; then
        _guard_hc_valid=0
        [ -n "$_guard_hc_reason" ] || _guard_hc_reason="gaming DIRECT dataplane: $_GUARD_HEALTH_DP_REASON"
    fi
    if ! guard_health_tunnel_assess; then
        _guard_hc_valid=0
        [ -n "$_guard_hc_reason" ] || _guard_hc_reason="classified tunnel egress: $_GUARD_HEALTH_TUN_REASON"
    fi

    if [ "$_guard_hc_json" = 1 ]; then
        printf '{"healthy":%s,"service":"%s","firewallHooks":%s,"rules":{"activation":"%s","data":"preserved"},"dataplane":{"expected":%s,"state":"%s","sourceRule":"%s","destinationRule":"%s","reason":"%s"},"tunnelEgress":{"expected":%s,"state":"%s","mark":"%s","interfaces":"%s","rules":"%s","reason":"%s"},"reason":"%s"}\n' \
            "$(_guard_env_json_bool "$_guard_hc_valid")" \
            "$(_guard_env_json_string "$_guard_hc_service")" \
            "$(_guard_env_json_bool "$([ -x "$(_guard_install_hotplug)" ] && [ -x "$(_guard_install_fw4)" ] && printf 1 || printf 0)")" \
            "$(_guard_env_json_string "$_guard_hc_overlay")" \
            "$(_guard_env_json_bool "$_GUARD_HEALTH_DP_EXPECTED")" \
            "$(_guard_env_json_string "$_GUARD_HEALTH_DP_STATE")" \
            "$(_guard_env_json_string "$_GUARD_HEALTH_DP_SOURCE_RULE")" \
            "$(_guard_env_json_string "$_GUARD_HEALTH_DP_DESTINATION_RULE")" \
            "$(_guard_env_json_string "$_GUARD_HEALTH_DP_REASON")" \
            "$(_guard_env_json_bool "$_GUARD_HEALTH_TUN_EXPECTED")" \
            "$(_guard_env_json_string "$_GUARD_HEALTH_TUN_STATE")" \
            "$(_guard_env_json_string "$_GUARD_HEALTH_TUN_MARK")" \
            "$(_guard_env_json_string "$_GUARD_HEALTH_TUN_IFACES")" \
            "$(_guard_env_json_string "$_GUARD_HEALTH_TUN_RULES")" \
            "$(_guard_env_json_string "$_GUARD_HEALTH_TUN_REASON")" \
            "$(_guard_env_json_string "$_guard_hc_reason")"
    else
        cli_section "OpenClash Guard health check"
        cli_kv install "$([ "$_guard_hc_valid" = 1 ] && printf healthy || printf unhealthy)"
        cli_kv service "$_guard_hc_service"
        cli_kv firewall.hotplug "$([ -x "$(_guard_install_hotplug)" ] && printf present || printf missing)"
        cli_kv firewall.fw4 "$([ -x "$(_guard_install_fw4)" ] && printf present || printf missing)"
        cli_kv rules.activation "$_guard_hc_overlay"
        cli_kv gaming.dataplane.expected "$_GUARD_HEALTH_DP_EXPECTED"
        cli_kv gaming.dataplane.state "$_GUARD_HEALTH_DP_STATE"
        cli_kv gaming.dataplane.sourceRule "$_GUARD_HEALTH_DP_SOURCE_RULE"
        cli_kv gaming.dataplane.destinationRule "$_GUARD_HEALTH_DP_DESTINATION_RULE"
        [ -z "$_GUARD_HEALTH_DP_REASON" ] || cli_kv gaming.dataplane.reason "$_GUARD_HEALTH_DP_REASON"
        cli_kv tunnel.egress.expected "$_GUARD_HEALTH_TUN_EXPECTED"
        cli_kv tunnel.egress.state "$_GUARD_HEALTH_TUN_STATE"
        [ -z "$_GUARD_HEALTH_TUN_MARK" ] || cli_kv tunnel.egress.mark "$_GUARD_HEALTH_TUN_MARK"
        [ -z "$_GUARD_HEALTH_TUN_IFACES" ] || cli_kv tunnel.egress.interfaces "$_GUARD_HEALTH_TUN_IFACES"
        cli_kv tunnel.egress.rules "$_GUARD_HEALTH_TUN_RULES"
        [ -z "$_GUARD_HEALTH_TUN_REASON" ] || cli_kv tunnel.egress.reason "$_GUARD_HEALTH_TUN_REASON"
        [ -z "$_guard_hc_reason" ] || cli_kv reason "$_guard_hc_reason"
    fi
    [ "$_guard_hc_valid" = 1 ]
}
