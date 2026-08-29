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
                    "$_guard_gd_pfx"*)
                        return 0
                        ;;
                esac
                ;;
            */16)
                _guard_gd_net=${_guard_gd_cidr%/*}
                _guard_gd_a=${_guard_gd_net%%.*}
                _guard_gd_rest=${_guard_gd_net#*.}
                _guard_gd_b=${_guard_gd_rest%%.*}
                _guard_gd_pfx="${_guard_gd_a}.${_guard_gd_b}."
                case $_guard_gd_dest in
                    "$_guard_gd_pfx"*)
                        return 0
                        ;;
                esac
                ;;
            */24)
                _guard_gd_net=${_guard_gd_cidr%/*}
                _guard_gd_pfx=${_guard_gd_net%.*}.
                case $_guard_gd_dest in
                    "$_guard_gd_pfx"*)
                        return 0
                        ;;
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
    if [ "$_GUARD_GAME_ENABLED" != 1 ]; then
        return 1
    fi
    case $_guard_gf_proto in
        udp|UDP)
            ;;
        *)
            return 1
            ;;
    esac
    if [ -z "$_guard_gf_dport" ] || guard_policy_port_in_list "$_guard_gf_dport" gaming.protectedUdpPorts; then
        return 1
    fi
    if ! guard_policy_port_in_list "$_guard_gf_dport" gaming.udpPorts; then
        return 1
    fi
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

# Gaming runs AFTER kill/protect. Skipped entirely when enforcement=reject
# so it cannot override the global kill switch or directAllowed=false.
guard_game_render() {
    if [ "$_GUARD_GAME_ENABLED" != 1 ]; then
        return 0
    fi
    if [ "$_GUARD_POLICY_ENFORCEMENT" = reject ]; then
        return 0
    fi
    _guard_gr_srcs=$(guard_game_src_ips)
    if [ -z "$_guard_gr_srcs" ]; then
        return 0
    fi
    _guard_gr_ports=$(json_list "$_GUARD_POLICY_FILE" gaming.udpPorts 2>/dev/null) || _guard_gr_ports=
    _guard_gr_keep=
    for _guard_gr_port in $_guard_gr_ports
    do
        [ -n "$_guard_gr_port" ] || continue
        if guard_policy_port_in_list "$_guard_gr_port" gaming.protectedUdpPorts; then
            continue
        fi
        _guard_gr_keep="$_guard_gr_keep $_guard_gr_port"
    done
    if [ -z "$_guard_gr_keep" ]; then
        return 0
    fi
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
