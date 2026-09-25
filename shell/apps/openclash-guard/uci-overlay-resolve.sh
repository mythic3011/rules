#!/bin/sh
# Authority resolution for the OpenClash Guard UCI overlay (Layer B).
#
# Consumes the VALIDATED normalized snapshot produced by uci-overlay.sh plus the
# signed runtime policy + live capability observation, and computes effective
# values for the options whose signed/live gate is defined by an AUTHORITATIVE
# source today. UCI is operator intent; it never widens signed policy. See:
#   - internal/config/openclash-guard/uci-overlay-resolution.json (contract)
#   - docs/openclash-guard-uci-overlay-integration.md (integration design)
#
# Wiring status: UNWIRED (same as uci-overlay.sh). Reads the signed policy JSON
# via shell/lib/json.sh and accepts the live DNS backend as an explicit input so
# it is testable offline.
#
# SCOPE DISCIPLINE (do not invent semantics): this resolver computes effective
# values ONLY where an authoritative contract/runtime defines the gate:
#   - routing.<svc> direct ceiling (signed policy class directAllowed)
#   - dns.fail_closed signed-policy floor (firewallKillSwitch || !directAllowed)
#   - dns.backend live-capability gating (mirrors guard_dns_backend detection)
# The following are contract GAPS (see the resolution contract's gaps section)
# and are NOT resolved here; they surface as PASSTHROUGH (normalized value) and
# are explicitly flagged, never silently treated as resolved:
#   - dns.resolver_sync capability semantics
#   - routing.direct_region / routing.proxy_region signed-policy gate
#   - udp.enabled / udp.src_ip signed-policy gate
#
# Prefix: guard_uci_overlay_resolve_
set -eu

# Inputs (set explicitly; no hidden global coupling beyond these). These use
# the _GUARD_UCOR_ prefix to avoid colliding with the overlay's per-option
# snapshot variables (_GUARD_UCO_<PATH>, e.g. dns.backend -> _GUARD_UCO_DNS_BACKEND).
#   _GUARD_UCOR_POLICY_FILE   : path to signed runtime policy JSON
#   _GUARD_UCOR_DNS_BACKEND   : live detected DNS backend as guard_dns_backend()
#                               reports it (adguardhome|dnsmasq|none); empty
#                               means capability unknown.
_GUARD_UCOR_POLICY_FILE=''
_GUARD_UCOR_DNS_BACKEND=''

# Options whose Layer-B gate is NOT defined by an authoritative contract. These
# are surfaced as passthrough (identity) with a "deferred" flag; they are NOT
# treated as resolved and MUST NOT be consumed as an authoritative effective
# value without a future contract update.
_GUARD_UCOR_DEFERRED_OPTIONS='routing.direct_region routing.proxy_region udp.enabled udp.src_ip dns.resolver_sync'

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
    [ -n "$_GUARD_UCOR_POLICY_FILE" ] || return 1
    json_get "$_GUARD_UCOR_POLICY_FILE" "$1" 2>/dev/null
}

_guard_uci_resolve_class_field() {
    # _guard_uci_resolve_class_field SERVICE CLASSFIELD
    _guard_uci_rcf_svc=$1
    _guard_uci_rcf_field=$2
    _guard_uci_rcf_class=$(_guard_uci_resolve_json_get "services.${_guard_uci_rcf_svc}.protectionClass") || return 1
    [ -n "$_guard_uci_rcf_class" ] || return 1
    _guard_uci_resolve_json_get "protectionClasses.${_guard_uci_rcf_class}.${_guard_uci_rcf_field}"
}

_guard_uci_resolve_is_deferred() {
    # shellcheck disable=SC2086
    _guard_uci_overlay_in_list "$1" $_GUARD_UCOR_DEFERRED_OPTIONS
}

# Resolve a per-service route-mode option (routing.<svc>). The ONLY signed gate
# defined by an authoritative source today is the directAllowed ceiling: a
# requested "direct" is honoured only when the service's protection class has
# directAllowed=true; otherwise effective falls back to "proxy". Region gating
# is NOT part of the config-time gate (allowedRegions constrains live route
# eval in guard_policy_region_allowed, not this snapshot) and is deferred.
_guard_uci_overlay_resolve_service_route() {
    _guard_uci_rsr_svc=$1
    _guard_uci_rsr_resultvar=$2
    _guard_uci_rsr_requested=$(guard_uci_overlay_get "routing.${_guard_uci_rsr_svc}")
    _guard_uci_rsr_effective=$_guard_uci_rsr_requested
    _guard_uci_rsr_reason=honoured
    if [ "$_guard_uci_rsr_requested" = "direct" ]; then
        _guard_uci_rsr_da=$(_guard_uci_resolve_class_field "$_guard_uci_rsr_svc" directAllowed 2>/dev/null) || _guard_uci_rsr_da=false
        if [ "$_guard_uci_rsr_da" != true ]; then
            _guard_uci_rsr_effective=proxy
            _guard_uci_rsr_reason='direct not permitted by signed policy'
        fi
    fi
    _guard_uci_resolve_note "routing.${_guard_uci_rsr_svc}|${_guard_uci_rsr_requested}|${_guard_uci_rsr_effective}|${_guard_uci_rsr_reason}"
    eval "$_guard_uci_rsr_resultvar=\$_guard_uci_rsr_effective"
}

# Apply the dns.fail_closed signed-policy FLOOR. Mirrors
# guard_policy_needs_failclosed: any class with firewallKillSwitch=true OR
# directAllowed=false forces fail-closed; an operator 0 cannot lower the floor.
_guard_uci_overlay_resolve_fail_closed() {
    _guard_uci_rfc_resultvar=$1
    _guard_uci_rfc_requested=$(guard_uci_overlay_get dns.fail_closed)
    _guard_uci_rfc_effective=$_guard_uci_rfc_requested
    _guard_uci_rfc_reason=honoured
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

# Resolve dns.backend against live capability, mirroring guard_dns_backend()
# detection semantics exactly (adguardhome | dnsmasq | none). "auto" resolves
# to the detected backend, else "none". An explicit request is honoured only
# when it equals the detected backend; otherwise effective is "none" — a
# preference cannot install capability. Downstream (resolver-sync, port
# availability) keys off this EFFECTIVE value, not the raw live input.
_guard_uci_overlay_resolve_dns_backend() {
    _guard_uci_rdb_resultvar=$1
    _guard_uci_rdb_requested=$(guard_uci_overlay_get dns.backend)
    _guard_uci_rdb_live=$_GUARD_UCOR_DNS_BACKEND
    case $_guard_uci_rdb_live in
        adguardhome|dnsmasq) : ;;
        *) _guard_uci_rdb_live=none ;;
    esac
    _guard_uci_rdb_effective=$_guard_uci_rdb_requested
    _guard_uci_rdb_reason=honoured
    if [ "$_guard_uci_rdb_requested" = "auto" ]; then
        _guard_uci_rdb_effective=$_guard_uci_rdb_live
    elif [ "$_guard_uci_rdb_requested" = "$_guard_uci_rdb_live" ]; then
        _guard_uci_rdb_effective=$_guard_uci_rdb_requested
    else
        _guard_uci_rdb_effective=none
        _guard_uci_rdb_reason='requested DNS backend not detected live'
    fi
    _guard_uci_resolve_note "dns.backend|${_guard_uci_rdb_requested}|${_guard_uci_rdb_effective}|${_guard_uci_rdb_reason}"
    eval "$_guard_uci_rdb_resultvar=\$_guard_uci_rdb_effective"
}

# Compute effective values for the gated options defined by authoritative
# sources. Requires a LOADED and VALID Layer-A snapshot; otherwise refuses
# (non-zero) and presents NO effective state as usable. Use
# guard_uci_overlay_resolve_diagnostics for the diagnostics-only path.
guard_uci_overlay_resolve() {
    if [ "${_GUARD_UCI_OVERLAY_LOADED:-0}" != 1 ]; then
        printf '%s\n' 'guard_uci_overlay_resolve: overlay snapshot not loaded' >&2
        return 2
    fi
    if ! guard_uci_overlay_validate; then
        printf '%s\n' 'guard_uci_overlay_resolve: refusing to resolve an invalid overlay; fix openclash_guard values first' >&2
        return 1
    fi
    _guard_uci_overlay_resolve_apply
}

# Diagnostics-only resolution insight for an already-loaded snapshot, including
# an invalid one. Never mutates runtime state and never treats the result as an
# authoritative effective value; intended for status/doctor reporting of what
# the overlay WOULD resolve to. Returns 0 always (it is a read-only projection).
guard_uci_overlay_resolve_diagnostics() {
    if [ "${_GUARD_UCI_OVERLAY_LOADED:-0}" != 1 ]; then
        printf '%s\n' '{"error":"overlay not loaded"}'
        return 0
    fi
    if guard_uci_overlay_validate; then
        _guard_uci_overlay_resolve_apply
    fi
    printf '{"valid":%s,"inferred":%s}' \
        "$(guard_uci_overlay_valid | sed 's/1/true/;s/0/false/')" \
        "$(guard_uci_overlay_json)"
}

# Internal: run resolution. Shared by the normal path (only when valid) and the
# diagnostics path.
_guard_uci_overlay_resolve_apply() {
    _GUARD_UCO_RESOLUTION_NOTES=
    for _guard_uci_r_svc in chatgpt claude grok
    do
        _guard_uci_overlay_resolve_service_route "$_guard_uci_r_svc" "_GUARD_UCO_EFFECTIVE_ROUTING_$(printf '%s' "$_guard_uci_r_svc" | tr '[:lower:]' '[:upper:]')"
    done
    _guard_uci_overlay_resolve_fail_closed _GUARD_UCO_EFFECTIVE_DNS_FAIL_CLOSED
    _guard_uci_overlay_resolve_dns_backend _GUARD_UCO_EFFECTIVE_DNS_BACKEND
    # Deferred (contract gap) options: NO _GUARD_UCO_EFFECTIVE_<PATH> is set, so
    # guard_uci_overlay_effective() falls through to the passthrough flag.
    return 0
}

# True when guard_uci_overlay_resolve() has produced effective state for a
# LOADED, VALID snapshot this session.
guard_uci_overlay_resolve_state_valid() {
    [ "${_GUARD_UCI_OVERLAY_LOADED:-0}" = 1 ] && guard_uci_overlay_validate
}

# Get an effective (resolved) value by option path.
#   - computed gated options (routing.<svc>, dns.fail_closed, dns.backend):
#     returns the resolved effective value.
#   - deferred contract-gap options: prints the NORMALIZED UCI value prefixed
#     with the exact marker "DEFERRED:" so callers can distinguish "not yet
#     resolved" from a real resolved value; these MUST NOT be consumed as an
#     authoritative effective value.
#   - other options (no authority constraint): the normalized UCI value.
guard_uci_overlay_effective() {
    if _guard_uci_resolve_is_deferred "$1"; then
        printf 'DEFERRED:%s' "$(guard_uci_overlay_get "$1")"
        return 0
    fi
    _guard_uci_eff_var="_GUARD_UCO_EFFECTIVE_$(printf '%s' "$1" | tr '[:lower:].' '[:upper:]_')"
    eval "_guard_uci_eff_val=\${$_guard_uci_eff_var-}"
    if [ -n "$_guard_uci_eff_val" ]; then
        printf '%s' "$_guard_uci_eff_val"
    else
        guard_uci_overlay_get "$1"
    fi
}

# List the options whose Layer-B gate is a documented contract gap (deferred).
guard_uci_overlay_deferred_options() {
    printf '%s\n' "$_GUARD_UCOR_DEFERRED_OPTIONS"
}

# Diagnostics notes (requested/effective/reason), one per line, redacted.
guard_uci_overlay_resolve_notes() {
    printf '%s\n' "$_GUARD_UCO_RESOLUTION_NOTES"
}
