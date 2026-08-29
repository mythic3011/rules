#!/bin/sh
# Load/validate runtime policy JSON and decide path verdicts.
# Prefix: guard_policy_
set -eu

_GUARD_POLICY_FILE=
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=openclash-guard
_GUARD_POLICY_REVISION=
_GUARD_POLICY_STATE=disabled
_GUARD_POLICY_ENFORCEMENT=reject

_guard_policy_default_path() {
    if [ -n "${GUARD_POLICY_FILE:-}" ]; then
        printf '%s\n' "$GUARD_POLICY_FILE"
        return 0
    fi
    printf '%s\n' "/etc/openclash-guard/openclash-guard.json"
}

_guard_policy_is_bool() {
    case $1 in
        true|false)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

_guard_policy_class_field() {
    _guard_pc_svc=$1
    _guard_pc_field=$2
    _guard_pc_class=$(json_get "$_GUARD_POLICY_FILE" "services.${_guard_pc_svc}.protectionClass") || return 1
    json_get "$_GUARD_POLICY_FILE" "protectionClasses.${_guard_pc_class}.${_guard_pc_field}"
}

guard_policy_validate_file() {
    _guard_pv_file=${1:-}
    if [ -z "$_guard_pv_file" ] || [ ! -f "$_guard_pv_file" ]; then
        printf '%s\n' "guard_policy: missing policy file: ${_guard_pv_file:-}" >&2
        return 1
    fi
    if ! json_load "$_guard_pv_file"; then
        printf '%s\n' "guard_policy: invalid JSON: $_guard_pv_file" >&2
        return 1
    fi
    _guard_pv_ver=$(json_get "$_guard_pv_file" schemaVersion) || _guard_pv_ver=
    if [ "$_guard_pv_ver" != 1 ]; then
        printf '%s\n' "guard_policy: unsupported schemaVersion: ${_guard_pv_ver:-missing}" >&2
        return 1
    fi
    for _guard_pv_key in nft.family nft.table nft.commentPrefix
    do
        _guard_pv_val=$(json_get "$_guard_pv_file" "$_guard_pv_key") || _guard_pv_val=
        if [ -z "$_guard_pv_val" ]; then
            printf '%s\n' "guard_policy: missing $_guard_pv_key" >&2
            return 1
        fi
    done
    if ! json_has "$_guard_pv_file" protectionClasses; then
        printf '%s\n' "guard_policy: missing protectionClasses" >&2
        return 1
    fi
    if ! json_has "$_guard_pv_file" services; then
        printf '%s\n' "guard_policy: missing services" >&2
        return 1
    fi
    _guard_pv_classes=$(json_keys "$_guard_pv_file" protectionClasses)
    for _guard_pv_class in $_guard_pv_classes
    do
        [ -n "$_guard_pv_class" ] || continue
        _guard_pv_da=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.directAllowed") || _guard_pv_da=
        _guard_pv_dr=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.directRequiresSupportedRegion" 2>/dev/null) || _guard_pv_dr=false
        _guard_pv_fm=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.failMode") || _guard_pv_fm=
        _guard_pv_quic=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.quic") || _guard_pv_quic=
        _guard_pv_ks=$(json_get "$_guard_pv_file" "protectionClasses.${_guard_pv_class}.firewallKillSwitch") || _guard_pv_ks=
        if ! _guard_policy_is_bool "$_guard_pv_da"; then
            printf '%s\n' "guard_policy: invalid directAllowed on $_guard_pv_class" >&2
            return 1
        fi
        if ! _guard_policy_is_bool "$_guard_pv_dr"; then
            printf '%s\n' "guard_policy: invalid directRequiresSupportedRegion on $_guard_pv_class" >&2
            return 1
        fi
        case $_guard_pv_fm in
            reject|drop)
                ;;
            *)
                printf '%s\n' "guard_policy: invalid failMode on $_guard_pv_class" >&2
                return 1
                ;;
        esac
        case $_guard_pv_quic in
            proxy-or-reject|reject|allow)
                ;;
            *)
                printf '%s\n' "guard_policy: invalid quic on $_guard_pv_class" >&2
                return 1
                ;;
        esac
        if ! _guard_policy_is_bool "$_guard_pv_ks"; then
            printf '%s\n' "guard_policy: invalid firewallKillSwitch on $_guard_pv_class" >&2
            return 1
        fi
    done
    _guard_pv_svcs=$(json_keys "$_guard_pv_file" services)
    for _guard_pv_svc in $_guard_pv_svcs
    do
        [ -n "$_guard_pv_svc" ] || continue
        _guard_pv_cls=$(json_get "$_guard_pv_file" "services.${_guard_pv_svc}.protectionClass") || _guard_pv_cls=
        if [ -z "$_guard_pv_cls" ]; then
            printf '%s\n' "guard_policy: service $_guard_pv_svc missing protectionClass" >&2
            return 1
        fi
        if ! json_has "$_guard_pv_file" "protectionClasses.${_guard_pv_cls}"; then
            printf '%s\n' "guard_policy: service $_guard_pv_svc references unknown class $_guard_pv_cls" >&2
            return 1
        fi
    done
    if ! json_has "$_guard_pv_file" gaming; then
        printf '%s\n' "guard_policy: missing gaming" >&2
        return 1
    fi
    return 0
}

guard_policy_load() {
    _guard_pl_path=${1:-$(_guard_policy_default_path)}
    guard_policy_validate_file "$_guard_pl_path" || return $?
    _GUARD_POLICY_FILE=$_guard_pl_path
    _GUARD_NFT_FAMILY=$(json_get "$_GUARD_POLICY_FILE" nft.family)
    _GUARD_NFT_TABLE=$(json_get "$_GUARD_POLICY_FILE" nft.table)
    _GUARD_NFT_PREFIX=$(json_get "$_GUARD_POLICY_FILE" nft.commentPrefix)
    _GUARD_POLICY_REVISION=$(json_get "$_GUARD_POLICY_FILE" revision 2>/dev/null) || _GUARD_POLICY_REVISION=
}

guard_policy_needs_failclosed() {
    _guard_nf_svcs=$(json_keys "$_GUARD_POLICY_FILE" services) || _guard_nf_svcs=
    for _guard_nf_svc in $_guard_nf_svcs
    do
        [ -n "$_guard_nf_svc" ] || continue
        _guard_nf_ks=$(_guard_policy_class_field "$_guard_nf_svc" firewallKillSwitch) || _guard_nf_ks=false
        _guard_nf_da=$(_guard_policy_class_field "$_guard_nf_svc" directAllowed) || _guard_nf_da=true
        if [ "$_guard_nf_ks" = true ] || [ "$_guard_nf_da" = false ]; then
            return 0
        fi
    done
    return 1
}

guard_policy_refresh_state() {
    _GUARD_POLICY_STATE=ok
    _GUARD_POLICY_ENFORCEMENT=allow-proxy
    if [ "${_GUARD_UCI_ENABLED:-1}" = 0 ]; then
        _GUARD_POLICY_STATE=disabled
        _GUARD_POLICY_ENFORCEMENT=disabled
        return 0
    fi
    _guard_ps_failclosed=0
    if guard_policy_needs_failclosed; then
        _guard_ps_failclosed=1
    fi
    if [ "$_guard_ps_failclosed" = 1 ] && [ "$_GUARD_DNS_DOMAIN_SET" = unavailable ]; then
        _GUARD_POLICY_STATE=degraded
        _GUARD_POLICY_ENFORCEMENT=reject
    fi
    if [ "$_GUARD_OC_HEALTHY" != 1 ]; then
        if [ "${_GUARD_UCI_KILL_SWITCH:-1}" = 1 ] || [ "$_guard_ps_failclosed" = 1 ]; then
            _GUARD_POLICY_ENFORCEMENT=reject
            if [ "$_GUARD_POLICY_STATE" = ok ]; then
                _GUARD_POLICY_STATE=degraded
            fi
        fi
    fi
}

guard_policy_port_in_list() {
    _guard_pil_port=$1
    _guard_pil_path=$2
    _guard_pil_items=$(json_list "$_GUARD_POLICY_FILE" "$_guard_pil_path" 2>/dev/null) || _guard_pil_items=
    for _guard_pil_item in $_guard_pil_items
    do
        if [ "$_guard_pil_item" = "$_guard_pil_port" ]; then
            return 0
        fi
    done
    return 1
}

guard_policy_region_allowed() {
    _guard_pra_svc=$1
    _guard_pra_region=$2
    if [ -z "$_guard_pra_region" ]; then
        return 1
    fi
    _guard_pra_items=$(json_list "$_GUARD_POLICY_FILE" "services.${_guard_pra_svc}.allowedRegions" 2>/dev/null) || _guard_pra_items=
    for _guard_pra_item in $_guard_pra_items
    do
        if [ "$_guard_pra_item" = "$_guard_pra_region" ]; then
            return 0
        fi
    done
    return 1
}

# Verdict: allow-proxy | reject-direct | reject | allow-direct
# UDP/443 and other protected UDP ports are never classified as gaming.
guard_policy_eval() {
    _guard_pe_svc=${1:-}
    _guard_pe_proto=${2:-}
    _guard_pe_dport=${3:-}
    _guard_pe_src=${4:-}
    _guard_pe_dest=${5:-}
    _guard_pe_gaming=0
    if [ -n "$_guard_pe_dport" ] && guard_policy_port_in_list "$_guard_pe_dport" gaming.protectedUdpPorts; then
        _guard_pe_gaming=0
    elif guard_game_flow_eligible "$_guard_pe_proto" "$_guard_pe_dport" "$_guard_pe_src" "$_guard_pe_dest"; then
        _guard_pe_gaming=1
    fi
    if [ "$_GUARD_POLICY_ENFORCEMENT" = reject ] || [ "$_GUARD_OC_HEALTHY" != 1 ]; then
        if [ -n "$_guard_pe_svc" ]; then
            _guard_pe_ks=$(_guard_policy_class_field "$_guard_pe_svc" firewallKillSwitch 2>/dev/null) || _guard_pe_ks=false
            if [ "$_guard_pe_ks" = true ] || [ "${_GUARD_UCI_KILL_SWITCH:-1}" = 1 ]; then
                printf '%s\n' "reject"
                return 0
            fi
        else
            printf '%s\n' "reject"
            return 0
        fi
    fi
    if [ -n "$_guard_pe_svc" ]; then
        _guard_pe_da=$(_guard_policy_class_field "$_guard_pe_svc" directAllowed) || _guard_pe_da=false
        _guard_pe_fm=$(_guard_policy_class_field "$_guard_pe_svc" failMode) || _guard_pe_fm=reject
        if [ "$_guard_pe_da" = false ]; then
            if [ "$_GUARD_PROXY_HEALTHY" = 1 ] && guard_policy_region_allowed "$_guard_pe_svc" "$_GUARD_PROXY_REGION"; then
                printf '%s\n' "reject-direct"
                return 0
            fi
            printf '%s\n' "reject"
            return 0
        fi
        _guard_pe_direct_required=$(_guard_policy_class_field "$_guard_pe_svc" directRequiresSupportedRegion 2>/dev/null) || _guard_pe_direct_required=false
        if [ "$_guard_pe_direct_required" = true ]; then
            if guard_policy_region_allowed "$_guard_pe_svc" "$_GUARD_NET_DIRECT_REGION"; then
                printf '%s\n' "allow-direct"
                return 0
            fi
            if [ "$_GUARD_PROXY_HEALTHY" = 1 ] && guard_policy_region_allowed "$_guard_pe_svc" "$_GUARD_PROXY_REGION"; then
                printf '%s\n' "allow-proxy"
                return 0
            fi
            printf '%s\n' "reject"
            return 0
        fi
        if [ "$_guard_pe_gaming" = 1 ]; then
            printf '%s\n' "allow-direct"
            return 0
        fi
        if [ "$_GUARD_PROXY_HEALTHY" = 1 ] && guard_policy_region_allowed "$_guard_pe_svc" "$_GUARD_PROXY_REGION"; then
            printf '%s\n' "allow-proxy"
            return 0
        fi
        printf '%s\n' "$_guard_pe_fm"
        return 0
    fi
    if [ "$_guard_pe_gaming" = 1 ]; then
        printf '%s\n' "allow-direct"
        return 0
    fi
    printf '%s\n' "allow-proxy"
}

guard_policy_json_extra() {
    printf '"state":"%s","enforcement":"%s","policyRevision":"%s"' \
        "$(_guard_env_json_string "$_GUARD_POLICY_STATE")" \
        "$(_guard_env_json_string "$_GUARD_POLICY_ENFORCEMENT")" \
        "$(_guard_env_json_string "$_GUARD_POLICY_REVISION")"
}
