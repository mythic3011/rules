#!/bin/sh
# Scoped gaming exceptions. Never saddr+any-UDP. Protected UDP ports are destination-only.
# Prefix: guard_game_
set -eu

_GUARD_GAME_ENABLED=1

guard_game_read_uci() {
    _GUARD_GAME_ENABLED=1
    if command -v uci >/dev/null 2>&1; then
        _GUARD_GAME_ENABLED=$(uci_get_bool openclash_guard.udp.enabled 1 2>/dev/null) || _GUARD_GAME_ENABLED=1
    fi
}

guard_game_src_ips() {
    if ! command -v uci >/dev/null 2>&1; then
        return 0
    fi
    _guard_gs_nl='\n'
    uci -d "$_guard_gs_nl" -q get openclash_guard.udp.src_ip 2>/dev/null || true
}

guard_game_udp_source_ports() {
    json_list "$_GUARD_POLICY_FILE" gaming.udpSourcePorts 2>/dev/null || true
}

guard_game_udp_destination_ports() {
    if json_has "$_GUARD_POLICY_FILE" gaming.udpDestinationPorts; then
        json_list "$_GUARD_POLICY_FILE" gaming.udpDestinationPorts 2>/dev/null || true
        return 0
    fi
    # Backward compatibility for installed schema-v1 runtime files. The
    # ambiguous legacy field is interpreted only as a destination-port list.
    json_list "$_GUARD_POLICY_FILE" gaming.udpPorts 2>/dev/null || true
}

guard_game_safe_udp_destination_ports() {
    _guard_gsdp_ports=$(guard_game_udp_destination_ports)
    for _guard_gsdp_port in $_guard_gsdp_ports
    do
        [ -n "$_guard_gsdp_port" ] || continue
        if guard_policy_port_in_list "$_guard_gsdp_port" gaming.protectedUdpPorts; then
            continue
        fi
        printf '%s\n' "$_guard_gsdp_port"
    done
}

guard_game_source_port_enabled() {
    _guard_gspe_want=$1
    _guard_gspe_ports=$(guard_game_udp_source_ports)
    for _guard_gspe_port in $_guard_gspe_ports
    do
        if [ "$_guard_gspe_port" = "$_guard_gspe_want" ]; then
            return 0
        fi
    done
    return 1
}

guard_game_destination_port_enabled() {
    _guard_gdpe_want=$1
    _guard_gdpe_ports=$(guard_game_udp_destination_ports)
    for _guard_gdpe_port in $_guard_gdpe_ports
    do
        if [ "$_guard_gdpe_port" = "$_guard_gdpe_want" ]; then
            return 0
        fi
    done
    return 1
}

guard_game_direct_available() {
    [ "$_GUARD_GAME_ENABLED" = 1 ] || return 1
    [ "${_GUARD_OC_HEALTHY:-0}" = 1 ] || return 1
    return 0
}

_guard_game_ip_in() {
    _guard_gi_ip=$1
    shift
    for _guard_gi_item in "$@"
    do
        if [ "$_guard_gi_item" = "$_guard_gi_ip" ]; then
            return 0
        fi
    done
    return 1
}

# Prefix match for /8 /16 /24 plus exact host. Sufficient for the contract schema.
_guard_game_dest_ok() {
    _guard_gd_dest=$1
    if [ -z "$_guard_gd_dest" ]; then
        return 1
    fi
    _guard_gd_cidrs=$(json_list "$_GUARD_POLICY_FILE" gaming.destinationCidrs 2>/dev/null) || _guard_gd_cidrs=
    if [ -z "$_guard_gd_cidrs" ]; then
        return 0
    fi
    for _guard_gd_cidr in $_guard_gd_cidrs
    do
        [ -n "$_guard_gd_cidr" ] || continue
        case $_guard_gd_cidr in
            */8)
                _guard_gd_net=${_guard_gd_cidr%/*}
                _guard_gd_pfx=${_guard_gd_net%%.*}.
                case $_guard_gd_dest in
                    "$_guard_gd_pfx"*) return 0 ;;
                esac
                ;;
            */16)
                _guard_gd_net=${_guard_gd_cidr%/*}
                _guard_gd_a=${_guard_gd_net%%.*}
                _guard_gd_rest=${_guard_gd_net#*.}
                _guard_gd_b=${_guard_gd_rest%%.*}
                _guard_gd_pfx="${_guard_gd_a}.${_guard_gd_b}."
                case $_guard_gd_dest in
                    "$_guard_gd_pfx"*) return 0 ;;
                esac
                ;;
            */24)
                _guard_gd_net=${_guard_gd_cidr%/*}
                _guard_gd_pfx=${_guard_gd_net%.*}.
                case $_guard_gd_dest in
                    "$_guard_gd_pfx"*) return 0 ;;
                esac
                ;;
            */*)
                _guard_gd_net=${_guard_gd_cidr%/*}
                if [ "$_guard_gd_dest" = "$_guard_gd_net" ]; then
                    return 0
                fi
                ;;
            *)
                if [ "$_guard_gd_dest" = "$_guard_gd_cidr" ]; then
                    return 0
                fi
                ;;
        esac
    done
    return 1
}

guard_game_flow_eligible() {
    _guard_gf_proto=$1
    _guard_gf_sport=$2
    _guard_gf_dport=$3
    _guard_gf_src=$4
    _guard_gf_dest=$5
    guard_game_direct_available || return 1
    case $_guard_gf_proto in
        udp|UDP) ;;
        *) return 1 ;;
    esac
    # Protected ports describe the remote/destination endpoint. A trusted
    # source-port exception must never override this fail-closed boundary.
    if [ -n "$_guard_gf_dport" ] && guard_policy_port_in_list "$_guard_gf_dport" gaming.protectedUdpPorts; then
        return 1
    fi
    _guard_gf_port_match=0
    if [ -n "$_guard_gf_sport" ] && guard_game_source_port_enabled "$_guard_gf_sport"; then
        _guard_gf_port_match=1
    fi
    if [ -n "$_guard_gf_dport" ] && guard_game_destination_port_enabled "$_guard_gf_dport"; then
        _guard_gf_port_match=1
    fi
    [ "$_guard_gf_port_match" = 1 ] || return 1
    _guard_gf_srcs=$(guard_game_src_ips)
    if [ -z "$_guard_gf_srcs" ]; then
        return 1
    fi
    if ! _guard_game_ip_in "$_guard_gf_src" $_guard_gf_srcs; then
        return 1
    fi
    if json_has "$_GUARD_POLICY_FILE" gaming.destinationCidrs; then
        _guard_gf_any=$(json_list "$_GUARD_POLICY_FILE" gaming.destinationCidrs 2>/dev/null) || _guard_gf_any=
        if [ -n "$_guard_gf_any" ]; then
            _guard_game_dest_ok "$_guard_gf_dest" || return 1
        fi
    fi
    return 0
}

_guard_game_render_scoped() {
    guard_game_direct_available || return 0
    _guard_gr_srcs=$(guard_game_src_ips)
    [ -n "$_guard_gr_srcs" ] || return 0
    _guard_gr_source_ports=$(guard_game_udp_source_ports)
    _guard_gr_destination_ports=$(guard_game_safe_udp_destination_ports)
    if [ -z "$_guard_gr_source_ports" ] && [ -z "$_guard_gr_destination_ports" ]; then
        return 0
    fi

    _guard_kill_add_set gaming_src ipv4_addr gaming-src interval
    # shellcheck disable=SC2086
    _guard_kill_add_elements gaming_src $_guard_gr_srcs

    _guard_gr_cidrs=$(json_list "$_GUARD_POLICY_FILE" gaming.destinationCidrs 2>/dev/null) || _guard_gr_cidrs=
    _guard_gr_dst_match=
    if [ -n "$_guard_gr_cidrs" ]; then
        _guard_kill_add_set gaming_dst ipv4_addr gaming-dst interval
        # shellcheck disable=SC2086
        _guard_kill_add_elements gaming_dst $_guard_gr_cidrs
        _guard_gr_dst_match='ip daddr @gaming_dst '
    fi

    if [ -n "$_guard_gr_source_ports" ]; then
        _guard_kill_add_set gaming_udp_source inet_service gaming-udp-source
        # shellcheck disable=SC2086
        _guard_kill_add_elements gaming_udp_source $_guard_gr_source_ports
        _guard_kill_add_rule forward "ip saddr @gaming_src ${_guard_gr_dst_match}udp sport @gaming_udp_source accept" game-udp-source
    fi
    if [ -n "$_guard_gr_destination_ports" ]; then
        _guard_kill_add_set gaming_udp_destination inet_service gaming-udp-destination
        # shellcheck disable=SC2086
        _guard_kill_add_elements gaming_udp_destination $_guard_gr_destination_ports
        _guard_kill_add_rule forward "ip saddr @gaming_src ${_guard_gr_dst_match}udp dport @gaming_udp_destination accept" game-udp-destination
    fi
}

# Render only the scoped gaming exception. Global firewall finalization belongs
# to the orchestration layer so other scoped exception modules can be ordered
# explicitly before the final fail-closed rule.
guard_game_render() {
    _guard_game_render_scoped
}
