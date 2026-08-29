#!/bin/sh
# Persistent inet table independent of disposable OpenClash/fw4 chains.
# Prefix: guard_kill_
set -eu

_GUARD_UCI_ENABLED=1
_GUARD_UCI_MODE=auto
_GUARD_UCI_KILL_SWITCH=1
_GUARD_UCI_DNS_KILL_SWITCH=0

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
    if nft_table_exists "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"; then
        nft delete table "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
    fi
}

# Order: local accepts, kill/protect reject, (gaming appended later), remaining.
guard_kill_render() {
    printf 'add table %s %s\n' "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"
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
    if [ "$_GUARD_POLICY_ENFORCEMENT" = reject ]; then
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
    guard_kill_delete_table || return $?
    nft_apply_batch "$_guard_ka_file"
}
