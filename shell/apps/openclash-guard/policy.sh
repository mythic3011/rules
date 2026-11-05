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
_GUARD_POLICY_STATE_REASON=
_GUARD_POLICY_DEGRADED_COMPONENTS=
_GUARD_POLICY_PROTECTED_UDP_PORTS=
_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID=0

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

_guard_policy_protected_udp_ports_from_file() {
    _guard_ppf_file=${1:-}
    _guard_ppf_items=$(json_array_items_typed "$_guard_ppf_file" gaming.protectedUdpPorts) || return $?
    printf '%s\n' "$_guard_ppf_items" | awk -F '\t' '
        function normalize_port(raw,    exp_pos, mantissa, exp_text, exp_negative, exp_value,
                                exp_limit, i, int_part, frac_part, dot_pos, digits, scale,
                                suffix, append, port_value) {
            if (raw !~ /^(-)?(0|[1-9][0-9]*)([.][0-9]+)?([eE][+-]?[0-9]+)?$/ ||
                substr(raw, 1, 1) == "-") {
                return ""
            }

            exp_pos = match(raw, /[eE]/)
            if (exp_pos > 0) {
                mantissa = substr(raw, 1, exp_pos - 1)
                exp_text = substr(raw, exp_pos + 1)
                if (substr(exp_text, 1, 1) == "-") {
                    exp_negative = 1
                    exp_text = substr(exp_text, 2)
                } else if (substr(exp_text, 1, 1) == "+") {
                    exp_text = substr(exp_text, 2)
                }
            } else {
                mantissa = raw
                exp_text = "0"
            }

            exp_limit = length(raw) + 6
            exp_value = 0
            for (i = 1; i <= length(exp_text); i++) {
                exp_value = exp_value * 10 + substr(exp_text, i, 1)
                if (exp_value > exp_limit) {
                    return ""
                }
            }
            if (exp_negative) {
                exp_value = -exp_value
            }

            dot_pos = index(mantissa, ".")
            if (dot_pos > 0) {
                int_part = substr(mantissa, 1, dot_pos - 1)
                frac_part = substr(mantissa, dot_pos + 1)
            } else {
                int_part = mantissa
                frac_part = ""
            }
            digits = int_part frac_part
            sub(/^0+/, "", digits)
            if (digits == "") {
                return ""
            }

            scale = length(frac_part) - exp_value
            if (scale > 0) {
                if (scale >= length(digits)) {
                    return ""
                }
                suffix = substr(digits, length(digits) - scale + 1)
                if (suffix !~ /^0+$/) {
                    return ""
                }
                digits = substr(digits, 1, length(digits) - scale)
            } else if (scale < 0) {
                append = -scale
                if (length(digits) + append > 5) {
                    return ""
                }
                for (i = 0; i < append; i++) {
                    digits = digits "0"
                }
            }

            sub(/^0+/, "", digits)
            if (digits == "" || length(digits) > 5) {
                return ""
            }
            port_value = digits + 0
            if (port_value < 1 || port_value > 65535) {
                return ""
            }
            return sprintf("%.0f", port_value)
        }

        NF != 3 || $2 != "number" {
            invalid = 1
            next
        }
        {
            port = normalize_port($3)
            if (port == "" || seen[port]++) {
                invalid = 1
                next
            }
            ports[count++] = port
            if (port == "443") {
                has443 = 1
            }
        }
        END {
            if (invalid || count < 1 || !has443) {
                exit 1
            }
            for (i = 0; i < count; i++) {
                print ports[i]
            }
        }
    '
}

guard_policy_clear_protected_udp_ports() {
    _GUARD_POLICY_PROTECTED_UDP_PORTS=
    _GUARD_POLICY_PROTECTED_UDP_PORTS_VALID=0
}

guard_policy_protected_udp_ports() {
    if [ "${_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID:-0}" = 1 ]; then
        printf '%s\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
        return 0
    fi
    _guard_pp_file=${1:-${_GUARD_POLICY_FILE:-}}
    _guard_policy_protected_udp_ports_from_file "$_guard_pp_file"
}

guard_policy_validate_file() {
    _guard_policy_validate_file_impl "${1:-}" "" 0
}

_guard_policy_validate_file_impl() {
    _guard_pv_file=${1:-}
    _guard_pv_protected=${2:-}
    _guard_pv_has_protected=${3:-0}
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
            reject|allow)
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
    if [ "$_guard_pv_has_protected" != 1 ]; then
        _guard_pv_protected=$(_guard_policy_protected_udp_ports_from_file "$_guard_pv_file") || {
            printf '%s\n' "guard_policy: invalid gaming.protectedUdpPorts" >&2
            return 1
        }
    fi
    return 0
}

guard_policy_load() {
    _guard_pl_path=${1:-$(_guard_policy_default_path)}
    guard_policy_clear_protected_udp_ports
    _GUARD_POLICY_FILE=
    _GUARD_POLICY_PROTECTED_UDP_PORTS=$(_guard_policy_protected_udp_ports_from_file "$_guard_pl_path") || {
        printf '%s\n' "guard_policy: invalid gaming.protectedUdpPorts" >&2
        return 1
    }
    _guard_policy_validate_file_impl \
        "$_guard_pl_path" \
        "$_GUARD_POLICY_PROTECTED_UDP_PORTS" \
        1 || {
        guard_policy_clear_protected_udp_ports
        return 1
    }
    _GUARD_POLICY_FILE=$_guard_pl_path
    _GUARD_NFT_FAMILY=$(json_get "$_GUARD_POLICY_FILE" nft.family) || return $?
    _GUARD_NFT_TABLE=$(json_get "$_GUARD_POLICY_FILE" nft.table) || return $?
    _GUARD_NFT_PREFIX=$(json_get "$_GUARD_POLICY_FILE" nft.commentPrefix) || return $?
    _GUARD_POLICY_REVISION=$(json_get "$_GUARD_POLICY_FILE" revision 2>/dev/null) || _GUARD_POLICY_REVISION=
    _GUARD_POLICY_PROTECTED_UDP_PORTS_VALID=1
}

# Guard nft table lifecycle: active | absent | unavailable.
# Distinct from policy enforcement and from overlay rules.activation.
guard_firewall_table_state() {
    if ! command -v nft >/dev/null 2>&1; then
        printf '%s\n' "unavailable"
        return 0
    fi
    if nft_table_exists "${_GUARD_NFT_FAMILY:-inet}" "${_GUARD_NFT_TABLE:-openclash_guard}"; then
        printf '%s\n' "active"
        return 0
    fi
    printf '%s\n' "absent"
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

_guard_policy_add_degraded_component() {
    _guard_padc_component=$1
    case " $_GUARD_POLICY_DEGRADED_COMPONENTS " in
        *" $_guard_padc_component "*) return 0 ;;
    esac
    if [ -n "$_GUARD_POLICY_DEGRADED_COMPONENTS" ]; then
        _GUARD_POLICY_DEGRADED_COMPONENTS="$_GUARD_POLICY_DEGRADED_COMPONENTS $_guard_padc_component"
    else
        _GUARD_POLICY_DEGRADED_COMPONENTS=$_guard_padc_component
    fi
}

_guard_policy_mark_degraded() {
    _guard_pmd_reason=$1
    _guard_pmd_component=$2
    _GUARD_POLICY_STATE=degraded
    if [ -z "$_GUARD_POLICY_STATE_REASON" ]; then
        _GUARD_POLICY_STATE_REASON=$_guard_pmd_reason
    elif [ "$_GUARD_POLICY_STATE_REASON" != "$_guard_pmd_reason" ]; then
        _GUARD_POLICY_STATE_REASON=multiple-degraded-components
    fi
    _guard_policy_add_degraded_component "$_guard_pmd_component"
}

guard_policy_refresh_state() {
    _GUARD_POLICY_STATE=ok
    _GUARD_POLICY_ENFORCEMENT=allow-proxy
    _GUARD_POLICY_STATE_REASON=
    _GUARD_POLICY_DEGRADED_COMPONENTS=
    if [ "${_GUARD_UCI_ENABLED:-1}" = 0 ]; then
        _GUARD_POLICY_STATE=disabled
        _GUARD_POLICY_ENFORCEMENT=disabled
        _GUARD_POLICY_STATE_REASON=guard-disabled
        return 0
    fi
    _guard_ps_failclosed=0
    if guard_policy_needs_failclosed; then
        _guard_ps_failclosed=1
    fi
    if [ "$_guard_ps_failclosed" = 1 ] && [ "$_GUARD_DNS_DOMAIN_SET" = unavailable ]; then
        _GUARD_POLICY_ENFORCEMENT=reject
        _guard_policy_mark_degraded domain-set-backend-unavailable dns.domainSetBackend
    fi
    if [ "$_GUARD_OC_HEALTHY" != 1 ]; then
        if [ "${_GUARD_UCI_KILL_SWITCH:-1}" = 1 ] || [ "$_guard_ps_failclosed" = 1 ]; then
            _GUARD_POLICY_ENFORCEMENT=reject
            _guard_policy_mark_degraded openclash-unhealthy openclash.healthy
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
    _guard_pe_sport=${6:-}
    _guard_pe_gaming=0
    if [ -n "$_guard_pe_dport" ] && guard_policy_port_in_list "$_guard_pe_dport" gaming.protectedUdpPorts; then
        _guard_pe_gaming=0
    elif guard_game_flow_eligible "$_guard_pe_proto" "$_guard_pe_sport" "$_guard_pe_dport" "$_guard_pe_src" "$_guard_pe_dest"; then
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
    printf '"state":"%s","enforcement":"%s","policyRevision":"%s","stateReason":"%s","degradedComponents":[' \
        "$(_guard_env_json_string "$_GUARD_POLICY_STATE")" \
        "$(_guard_env_json_string "$_GUARD_POLICY_ENFORCEMENT")" \
        "$(_guard_env_json_string "$_GUARD_POLICY_REVISION")" \
        "$(_guard_env_json_string "$_GUARD_POLICY_STATE_REASON")"
    _guard_pje_first=1
    for _guard_pje_component in $_GUARD_POLICY_DEGRADED_COMPONENTS
    do
        [ "$_guard_pje_first" = 1 ] || printf ','
        _guard_pje_first=0
        printf '"%s"' "$(_guard_env_json_string "$_guard_pje_component")"
    done
    printf ']'
}
