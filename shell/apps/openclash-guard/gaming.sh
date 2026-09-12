#!/bin/sh
# Scoped gaming exceptions. Never saddr+any-UDP. Never UDP/443 blanket.
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
    _guard_gs_nl='
'
    uci -d "$_guard_gs_nl" -q get openclash_guard.udp.src_ip 2>/dev/null || true
}

guard_game_safe_udp_ports() {
    _guard_gsp_ports=$(json_list "$_GUARD_POLICY_FILE" gaming.udpPorts 2>/dev/null) || _guard_gsp_ports=
    for _guard_gsp_port in $_guard_gsp_ports
    do
        [ -n "$_guard_gsp_port" ] || continue
        if guard_policy_port_in_list "$_guard_gsp_port" gaming.protectedUdpPorts; then
            continue
        fi
        printf '%s\n' "$_guard_gsp_port"
    done
}

guard_game_port_enabled() {
    _guard_gpe_want=$1
    _guard_gpe_ports=$(json_list "$_GUARD_POLICY_FILE" gaming.udpPorts 2>/dev/null) || _guard_gpe_ports=
    for _guard_gpe_port in $_guard_gpe_ports
    do
        if [ "$_guard_gpe_port" = "$_guard_gpe_want" ]; then
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
    _guard_gf_dport=$2
    _guard_gf_src=$3
    _guard_gf_dest=$4
    guard_game_direct_available || return 1
    case $_guard_gf_proto in
        udp|UDP) ;;
        *) return 1 ;;
    esac
    if [ -z "$_guard_gf_dport" ] || guard_policy_port_in_list "$_guard_gf_dport" gaming.protectedUdpPorts; then
        return 1
    fi
    guard_game_port_enabled "$_guard_gf_dport" || return 1
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
    _guard_gr_keep=$(guard_game_safe_udp_ports)
    [ -n "$_guard_gr_keep" ] || return 0

    _guard_kill_add_set gaming_src ipv4_addr gaming-src interval
    # shellcheck disable=SC2086
    _guard_kill_add_elements gaming_src $_guard_gr_srcs
    _guard_kill_add_set gaming_udp inet_service gaming-udp
    # shellcheck disable=SC2086
    _guard_kill_add_elements gaming_udp $_guard_gr_keep

    _guard_gr_cidrs=$(json_list "$_GUARD_POLICY_FILE" gaming.destinationCidrs 2>/dev/null) || _guard_gr_cidrs=
    if [ -n "$_guard_gr_cidrs" ]; then
        _guard_kill_add_set gaming_dst ipv4_addr gaming-dst interval
        # shellcheck disable=SC2086
        _guard_kill_add_elements gaming_dst $_guard_gr_cidrs
        _guard_kill_add_rule forward 'ip saddr @gaming_src ip daddr @gaming_dst udp dport @gaming_udp accept' game-udp
    else
        _guard_kill_add_rule forward 'ip saddr @gaming_src udp dport @gaming_udp accept' game-udp
    fi
}

# Render only the scoped gaming exception. Global firewall finalization belongs
# to the orchestration layer so other scoped exception modules can be ordered
# explicitly before the final fail-closed rule.
guard_game_render() {
    _guard_game_render_scoped
}
