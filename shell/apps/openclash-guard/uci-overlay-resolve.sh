#!/bin/sh
# Authority resolution for the OpenClash Guard UCI overlay (Layer B).
#
# Consumes the validated normalized snapshot produced by uci-overlay.sh and the
# signed runtime policy + live capability observation, and computes the single
# EFFECTIVE value for each gated option. UCI is operator intent; it never
# widens signed policy. See:
#   - internal/config/openclash-guard/uci-overlay-resolution.json (contract)
#   - docs/openclash-guard-uci-overlay-integration.md (integration design)
#
# Wiring status: UNWIRED (same as uci-overlay.sh). Depends conceptually on
# guard-policy and guard-environment but is written to be testable offline: it
# reads the signed policy JSON via shell/lib/json.sh against an explicit file
# and accepts the live DNS backend as an input so tests can drive it without a
# router.
#
# Prefix: guard_uci_overlay_resolve_
set -eu

# Inputs (set explicitly; no hidden global coupling beyond these). These use
# the _GUARD_UCOR_ prefix to avoid colliding with the overlay's per-option
# snapshot variables (_GUARD_UCO_<PATH>; for dns.backend that var is _GUARD_UCO_DNS_BACKEND).
#   _GUARD_UCOR_POLICY_FILE   : path to signed runtime policy JSON
#   _GUARD_UCOR_DNS_BACKEND   : live detected DNS backend (adguardhome|dnsmasq|
#                               dnsmasq-nftset|dnsmasq-hosts|unavailable); when
#                               empty, resolution treats capability as unknown.
_GUARD_UCOR_POLICY_FILE=''
_GUARD_UCOR_DNS_BACKEND=''

# Resolution output: one notes list newline-separated "path|requested|effective|reason".
_GUARD_UCO_RESOLUTION_NOTES=''

_guard_uci_resolve_note() {
    if [ -z "$_GUARD_UCO_RESOLUTION_NOTES" ]; then
        _GUARD_UCO_RESOLUTION_NOTES="$1"
    else
        _GUARD_UCO_RESOLUTION_NOTES="$_GUARD_UCO_RESOLUTION_NOTES
$1"
    fi
}

_guard_uci_resolve_json_get() {
    # _guard_uci_resolve_json_get PATH -> value (empty on absence). Pure read.
    [ -n "$_GUARD_UCOR_POLICY_FILE" ] || return 1
    json_get "$_GUARD_UCOR_POLICY_FILE" "$1" 2>/dev/null
}

_guard_uci_resolve_json_has() {
    [ -n "$_GUARD_UCOR_POLICY_FILE" ] || return 1
    json_has "$_GUARD_UCOR_POLICY_FILE" "$1" 2>/dev/null
}

_guard_uci_resolve_json_list() {
    [ -n "$_GUARD_UCOR_POLICY_FILE" ] || { printf ''; return 0; }
    json_list "$_GUARD_UCOR_POLICY_FILE" "$1" 2>/dev/null || printf ''
}

_guard_uci_resolve_class_field() {
    # _guard_uci_resolve_class_field SERVICE FIELD
    _guard_uci_rcf_svc=$1
    _guard_uci_rcf_field=$2
    _guard_uci_rcf_class=$(_guard_uci_resolve_json_get "services.${_guard_uci_rcf_svc}.protectionClass") || return 1
    [ -n "$_guard_uci_rcf_class" ] || return 1
    _guard_uci_resolve_json_get "protectionClasses.${_guard_uci_rcf_class}.${_guard_uci_rcf_field}"
}

# True when the live DNS backend supports resolver sync to a managed cache.
_guard_uci_resolve_dns_sync_capable() {
    case $_GUARD_UCOR_DNS_BACKEND in
        adguardhome|dnsmasq|dnsmasq-nftset|dnsmasq-hosts) return 0 ;;
        *) return 1 ;;
    esac
}

# Resolve a per-service route-mode option (routing.<svc>). Assigns the effective
# mode into the variable named by $2 ("direct" only when signed policy permits).
_guard_uci_overlay_resolve_service_route() {
    _guard_uci_rsr_svc=$1
    _guard_uci_rsr_resultvar=$2
    _guard_uci_rsr_requested=$(guard_uci_overlay_get "routing.${_guard_uci_rsr_svc}")
    _guard_uci_rsr_effective=$_guard_uci_rsr_requested
    _guard_uci_rsr_reason=honoured
    if [ "$_guard_uci_rsr_requested" = "direct" ]; then
        _guard_uci_rsr_da=$(_guard_uci_resolve_class_field "$_guard_uci_rsr_svc" directAllowed 2>/dev/null) || _guard_uci_rsr_da=false
        _guard_uci_rsr_direct_ok=0
        if [ "$_guard_uci_rsr_da" = true ]; then
            _guard_uci_rsr_direct_ok=1
            _guard_uci_rsr_reqregion=$(_guard_uci_resolve_class_field "$_guard_uci_rsr_svc" directRequiresSupportedRegion 2>/dev/null) || _guard_uci_rsr_reqregion=false
            if [ "$_guard_uci_rsr_reqregion" = true ]; then
                _guard_uci_rsr_region=$(guard_uci_overlay_get "routing.direct_region")
                _guard_uci_rsr_allowed=$(_guard_uci_resolve_json_list "services.${_guard_uci_rsr_svc}.regions")
                if [ -n "$_guard_uci_rsr_allowed" ]; then
                    # shellcheck disable=SC2086
                    if ! _guard_uci_overlay_in_list "$_guard_uci_rsr_region" $_guard_uci_rsr_allowed; then
                        _guard_uci_rsr_direct_ok=0
                    fi
                fi
            fi
        fi
        if [ "$_guard_uci_rsr_direct_ok" != 1 ]; then
            _guard_uci_rsr_effective=proxy
            _guard_uci_rsr_reason='direct not permitted by signed policy'
        fi
    fi
    _guard_uci_resolve_note "routing.${_guard_uci_rsr_svc}|${_guard_uci_rsr_requested}|${_guard_uci_rsr_effective}|${_guard_uci_rsr_reason}"
    eval "$_guard_uci_rsr_resultvar=\$_guard_uci_rsr_effective"
}

# Apply the dns.fail_closed signed-policy FLOOR. Assigns effective into $1.
_guard_uci_overlay_resolve_fail_closed() {
    _guard_uci_rfc_resultvar=$1
    _guard_uci_rfc_requested=$(guard_uci_overlay_get dns.fail_closed)
    _guard_uci_rfc_effective=$_guard_uci_rfc_requested
    _guard_uci_rfc_reason=honoured
    # Signed floor: any class with firewallKillSwitch=true OR directAllowed=false.
    _guard_uci_rfc_svcs=$(json_keys "$_GUARD_UCOR_POLICY_FILE" services 2>/dev/null) || _guard_uci_rfc_svcs=
    _guard_uci_rfc_floor=0
    for _guard_uci_rfc_svc in $_guard_uci_rfc_svcs
    do
        [ -n "$_guard_uci_rfc_svc" ] || continue
        _guard_uci_rfc_ks=$(_guard_uci_resolve_class_field "$_guard_uci_rfc_svc" firewallKillSwitch 2>/dev/null) || _guard_uci_rfc_ks=false
        _guard_uci_rfc_da=$(_guard_uci_resolve_class_field "$_guard_uci_rfc_svc" directAllowed 2>/dev/null) || _guard_uci_rfc_da=true
        if [ "$_guard_uci_rfc_ks" = true ] || [ "$_guard_uci_rfc_da" = false ]; then
            _guard_uci_rfc_floor=1
            break
        fi
    done
    if [ "$_guard_uci_rfc_floor" = 1 ] && [ "$_guard_uci_rfc_requested" != 1 ]; then
        _guard_uci_rfc_effective=1
        _guard_uci_rfc_reason='fail-closed floor required by signed policy'
    fi
    _guard_uci_resolve_note "dns.fail_closed|${_guard_uci_rfc_requested}|${_guard_uci_rfc_effective}|${_guard_uci_rfc_reason}"
    eval "$_guard_uci_rfc_resultvar=\$_guard_uci_rfc_effective"
}

# Resolve dns.backend against live capability. Assigns effective into $1.
_guard_uci_overlay_resolve_dns_backend() {
    _guard_uci_rdb_resultvar=$1
    _guard_uci_rdb_requested=$(guard_uci_overlay_get dns.backend)
    _guard_uci_rdb_live=$_GUARD_UCOR_DNS_BACKEND
    # Normalize the detected backend family.
    case $_guard_uci_rdb_live in
        adguardhome) _guard_uci_rdb_live_family=adguardhome ;;
        dnsmasq|dnsmasq-nftset|dnsmasq-hosts) _guard_uci_rdb_live_family=dnsmasq ;;
        '') _guard_uci_rdb_live_family=unknown ;;
        *) _guard_uci_rdb_live_family=unavailable ;;
    esac
    _guard_uci_rdb_effective=$_guard_uci_rdb_requested
    _guard_uci_rdb_reason=honoured
    if [ "$_guard_uci_rdb_requested" = "auto" ]; then
        case $_guard_uci_rdb_live_family in
            adguardhome|dnsmasq) _guard_uci_rdb_effective=$_guard_uci_rdb_live_family ;;
            *) _guard_uci_rdb_effective=unavailable ;;
        esac
    else
        if [ "$_guard_uci_rdb_live_family" = "$_guard_uci_rdb_requested" ]; then
            _guard_uci_rdb_effective=$_guard_uci_rdb_requested
        else
            _guard_uci_rdb_effective=unavailable
            _guard_uci_rdb_reason='requested DNS backend not available live'
        fi
    fi
    _guard_uci_resolve_note "dns.backend|${_guard_uci_rdb_requested}|${_guard_uci_rdb_effective}|${_guard_uci_rdb_reason}"
    eval "$_guard_uci_rdb_resultvar=\$_guard_uci_rdb_effective"
}

# Resolve dns.resolver_sync against live capability. Assigns effective into $1.
_guard_uci_overlay_resolve_resolver_sync() {
    _guard_uci_rrs_resultvar=$1
    _guard_uci_rrs_requested=$(guard_uci_overlay_get dns.resolver_sync)
    _guard_uci_rrs_effective=$_guard_uci_rrs_requested
    _guard_uci_rrs_reason=honoured
    if ! _guard_uci_resolve_dns_sync_capable; then
        if [ "$_guard_uci_rrs_requested" = 1 ]; then
            _guard_uci_rrs_effective=0
            _guard_uci_rrs_reason='no sync-capable DNS backend available live'
        fi
    fi
    _guard_uci_resolve_note "dns.resolver_sync|${_guard_uci_rrs_requested}|${_guard_uci_rrs_effective}|${_guard_uci_rrs_reason}"
    eval "$_guard_uci_rrs_resultvar=\$_guard_uci_rrs_effective"
}

# Compute effective values for every gated option. The snapshot (raw) is left
# untouched; effective values are written into _GUARD_UCO_EFFECTIVE_<PATH> and
# a notes list records requested->effective for diagnostics.
guard_uci_overlay_resolve() {
    _GUARD_UCO_RESOLUTION_NOTES=
    for _guard_uci_r_svc in chatgpt claude grok
    do
        _guard_uci_overlay_resolve_service_route "$_guard_uci_r_svc" "_GUARD_UCO_EFFECTIVE_ROUTING_$(printf '%s' "$_guard_uci_r_svc" | tr '[:lower:]' '[:upper:]')"
    done
    _guard_uci_overlay_resolve_fail_closed _GUARD_UCO_EFFECTIVE_DNS_FAIL_CLOSED
    _guard_uci_overlay_resolve_dns_backend _GUARD_UCO_EFFECTIVE_DNS_BACKEND
    _guard_uci_overlay_resolve_resolver_sync _GUARD_UCO_EFFECTIVE_DNS_RESOLVER_SYNC
    return 0
}

# Get an effective (resolved) value by option path; falls back to the
# normalized (non-gated) value for options with no authority constraint.
guard_uci_overlay_effective() {
    _guard_uci_eff_var="_GUARD_UCO_EFFECTIVE_$(printf '%s' "$1" | tr '[:lower:].' '[:upper:]_')"
    eval "_guard_uci_eff_val=\${$_guard_uci_eff_var-}"
    if [ -n "$_guard_uci_eff_val" ]; then
        printf '%s' "$_guard_uci_eff_val"
    else
        guard_uci_overlay_get "$1"
    fi
}

# Diagnostics notes (requested/effective/reason), one per line, redacted.
guard_uci_overlay_resolve_notes() {
    printf '%s\n' "$_GUARD_UCO_RESOLUTION_NOTES"
}
