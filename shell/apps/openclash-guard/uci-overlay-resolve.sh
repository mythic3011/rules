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
#   _GUARD_UCOR_POLICY_FILE   : path to runtime policy JSON. Consumption implies
#                               it has already passed the authoritative
#                               guard_policy_load() validation in production;
#                               this module only performs surface/schema sanity
#                               (it does NOT authenticate provenance).
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

# --- Policy surface / schema sanity (defense-in-depth, NOT provenance) ----
#
# Resolution consumes validated UCI intent + a signed runtime policy that has
# ALREADY been accepted by the real Guard policy authority + OBSERVED live
# capability. This module performs a SURFACE/SCHEMA sanity check over the
# policy fields the resolver reads (schema, services, protectionClasses,
# class-field consistency); it does NOT authenticate provenance, verify the
# detached signature, or establish that the file came from the trusted release
# chain. Production wiring must feed the resolver a policy file ONLY after
# guard_policy_load() (the authoritative policy validation) has succeeded, and
# the resolved provenance is owned by the signed-runtime pipeline — not by a
# caller-supplied _GUARD_UCOR_POLICY_FILE. Never duplicate cryptographic /
# provenance logic here.

# True when the supplied policy file is well-formed, declares a supported
# schemaVersion, and contains services + protectionClasses with consistent
# references. This is a schema-sanity gate, NOT provenance authentication.
_guard_uci_resolve_policy_available() {
    _guard_uci_rpa_file=$_GUARD_UCOR_POLICY_FILE
    if [ -z "$_guard_uci_rpa_file" ] || [ ! -f "$_guard_uci_rpa_file" ]; then
        return 1
    fi
    if ! json_load "$_guard_uci_rpa_file" 2>/dev/null; then
        return 1
    fi
    # Must declare the supported schema version (mirrors the authoritative
    # guard_policy_validate_file requirement of schemaVersion 1).
    _guard_uci_rpa_ver=$(json_get "$_guard_uci_rpa_file" schemaVersion 2>/dev/null) || _guard_uci_rpa_ver=
    [ "$_guard_uci_rpa_ver" = "1" ] || return 1
    if ! json_has "$_guard_uci_rpa_file" services 2>/dev/null; then
        return 1
    fi
    if ! json_has "$_guard_uci_rpa_file" protectionClasses 2>/dev/null; then
        return 1
    fi
    # Every service must reference an existing protectionClass.
    _guard_uci_rpa_svcs=$(json_keys "$_guard_uci_rpa_file" services 2>/dev/null) || _guard_uci_rpa_svcs=
    for _guard_uci_rpa_svc in $_guard_uci_rpa_svcs
    do
        [ -n "$_guard_uci_rpa_svc" ] || continue
        _guard_uci_rpa_cls=$(json_get "$_guard_uci_rpa_file" "services.${_guard_uci_rpa_svc}.protectionClass" 2>/dev/null) || _guard_uci_rpa_cls=
        [ -n "$_guard_uci_rpa_cls" ] || return 1
        json_has "$_guard_uci_rpa_file" "protectionClasses.${_guard_uci_rpa_cls}" 2>/dev/null || return 1
        # The class fields the resolver reads must be present and boolean.
        _guard_uci_rpa_da=$(json_get "$_guard_uci_rpa_file" "protectionClasses.${_guard_uci_rpa_cls}.directAllowed" 2>/dev/null) || _guard_uci_rpa_da=
        case $_guard_uci_rpa_da in true|false) : ;; *) return 1 ;; esac
        _guard_uci_rpa_ks=$(json_get "$_guard_uci_rpa_file" "protectionClasses.${_guard_uci_rpa_cls}.firewallKillSwitch" 2>/dev/null) || _guard_uci_rpa_ks=
        case $_guard_uci_rpa_ks in true|false) : ;; *) return 1 ;; esac
    done
    return 0
}

# True when the live DNS backend observation is a VALID observed value
# (adguardhome | dnsmasq | none). An empty/unset/other value means the
# observation is unavailable or not performed — NOT the same as "none" (a
# real observation that no backend is live).
_guard_uci_resolve_dns_observation_valid() {
    case $_GUARD_UCOR_DNS_BACKEND in
        adguardhome|dnsmasq|none) return 0 ;;
        *) return 1 ;;
    esac
}

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

# Options whose effective value REQUIRES a completed Layer-B resolution. For
# these, guard_uci_overlay_effective() must never fall back to the normalized
# (unresolved) UCI value: an unset resolved value means "not yet resolved",
# which is a hard refusal, not a passthrough.
_GUARD_UCOR_RESOLVED_OPTIONS='routing.chatgpt routing.claude routing.grok dns.fail_closed dns.backend'

# Explicit Layer-B resolved-state lifecycle flag. 1 only after the complete
# normal resolution path succeeds; 0 at every other time (initial, and after
# any overlay re-load invalidates prior effective state).
_GUARD_UCO_RESOLVED=0

# Invalidate every piece of Layer-B resolved state. Called on sourcing (initial
# state) and by the Layer-A overlay whenever a new snapshot is loaded, so a
# previously-resolved effective value can never leak across snapshots.
guard_uci_overlay_invalidate_resolved_state() {
    _GUARD_UCO_RESOLVED=0
    _GUARD_UCO_EFFECTIVE_ROUTING_CHATGPT=
    _GUARD_UCO_EFFECTIVE_ROUTING_CLAUDE=
    _GUARD_UCO_EFFECTIVE_ROUTING_GROK=
    _GUARD_UCO_EFFECTIVE_DNS_FAIL_CLOSED=
    _GUARD_UCO_EFFECTIVE_DNS_BACKEND=
    _GUARD_UCO_RESOLUTION_NOTES=
}

# Establish the initial (unresolved) state.
guard_uci_overlay_invalidate_resolved_state

_guard_uci_resolve_is_resolved_option() {
    # shellcheck disable=SC2086
    _guard_uci_overlay_in_list "$1" $_GUARD_UCOR_RESOLVED_OPTIONS
}

# Compute effective values for the gated options defined by authoritative
# sources. Requires a LOADED and VALID Layer-A snapshot; otherwise refuses
# (non-zero) and presents NO effective state as usable. On success sets
# _GUARD_UCO_RESOLVED=1. Use guard_uci_overlay_resolve_diagnostics for the
# read-only diagnostics-only path.
guard_uci_overlay_resolve() {
    if [ "${_GUARD_UCI_OVERLAY_LOADED:-0}" != 1 ]; then
        printf '%s\n' 'guard_uci_overlay_resolve: overlay snapshot not loaded' >&2
        return 2
    fi
    if ! guard_uci_overlay_validate; then
        printf '%s\n' 'guard_uci_overlay_resolve: refusing to resolve an invalid overlay; fix openclash_guard values first' >&2
        return 1
    fi
    # Trust boundary: require ALL authority inputs. A missing/malformed signed
    # policy must not degrade into permissive defaults (e.g. an empty service
    # list would hide the fail-closed floor). An unavailable/invalid DNS
    # observation is NOT the same as the observed value "none".
    if ! _guard_uci_resolve_policy_available; then
        printf '%s\n' 'guard_uci_overlay_resolve: policy file unavailable or failed schema sanity (authority input)' >&2
        guard_uci_overlay_invalidate_resolved_state
        return 3
    fi
    if ! _guard_uci_resolve_dns_observation_valid; then
        printf '%s\n' 'guard_uci_overlay_resolve: live DNS backend observation unavailable or invalid (expected adguardhome|dnsmasq|none)' >&2
        guard_uci_overlay_invalidate_resolved_state
        return 3
    fi
    # Atomic commit: invalidate, compute, and only mark resolved on success so a
    # partial computation never leaves partial effective globals behind.
    guard_uci_overlay_invalidate_resolved_state
    if ! _guard_uci_overlay_resolve_apply; then
        guard_uci_overlay_invalidate_resolved_state
        printf '%s\n' 'guard_uci_overlay_resolve: computation failed; no effective state committed' >&2
        return 1
    fi
    _GUARD_UCO_RESOLVED=1
}

# Diagnostics-only resolution insight for an already-loaded snapshot, including
# an invalid one. Read-only: runs any inference in a SUBSHELL so it cannot
# mutate the caller's _GUARD_UCO_RESOLVED, _GUARD_UCO_EFFECTIVE_*, or notes.
# Never treats the result as an authoritative effective value; returns 0.
guard_uci_overlay_resolve_diagnostics() {
    if [ "${_GUARD_UCI_OVERLAY_LOADED:-0}" != 1 ]; then
        printf '%s\n' '{"error":"overlay not loaded"}'
        return 0
    fi
    _guard_uci_diag_notes=
    # Report which authority inputs are available (diagnostic read-only; does
    # not commit anything).
    _guard_uci_diag_policy=0
    _guard_uci_diag_dns=0
    _guard_uci_resolve_policy_available && _guard_uci_diag_policy=1
    _guard_uci_resolve_dns_observation_valid && _guard_uci_diag_dns=1
    if guard_uci_overlay_validate && [ "$_guard_uci_diag_policy" = 1 ] && [ "$_guard_uci_diag_dns" = 1 ]; then
        # Subshell: apply-side-effects (effective vars, RESOLVED, notes) are
        # discarded; only the notes text is captured out.
        _guard_uci_diag_notes=$(
            guard_uci_overlay_invalidate_resolved_state
            _guard_uci_overlay_resolve_apply
            guard_uci_overlay_resolve_notes
        )
    fi
    _guard_uci_diag_overlay=$(guard_uci_overlay_json)
    # guard_uci_overlay_json yields {"uciOverlay":{...}}; unwrap to the inner
    # diagnostics object so the projection is a single-level document.
    _guard_uci_diag_overlay=${_guard_uci_diag_overlay#'{"uciOverlay":'}
    _guard_uci_diag_overlay=${_guard_uci_diag_overlay%'}'}
    _guard_uci_diag_auth=$(printf '{"policy":%s,"dns":%s}' \
        "$([ "$_guard_uci_diag_policy" = 1 ] && printf true || printf false)" \
        "$([ "$_guard_uci_diag_dns" = 1 ] && printf true || printf false)")
    if [ -n "$_guard_uci_diag_notes" ]; then
        printf '{"resolvedPreviewNotes":"%s","valid":%s,"authorityInputs":%s,"uciOverlay":%s}\n' \
            "$(printf '%s' "$_guard_uci_diag_notes" | tr '\n' ';' | sed 's/"/\\"/g')" \
            "$([ "$(guard_uci_overlay_valid)" = 1 ] && printf true || printf false)" \
            "$_guard_uci_diag_auth" \
            "$_guard_uci_diag_overlay"
    else
        printf '{"valid":%s,"authorityInputs":%s,"uciOverlay":%s}\n' \
            "$([ "$(guard_uci_overlay_valid)" = 1 ] && printf true || printf false)" \
            "$_guard_uci_diag_auth" \
            "$_guard_uci_diag_overlay"
    fi
}

# Internal: run resolution into the current shell's effective vars + notes.
# Caller is responsible for having invalidated state first. Does NOT set
# _GUARD_UCO_RESOLVED (the normal path does, the diagnostics path must not).
_guard_uci_overlay_resolve_apply() {
    _GUARD_UCO_RESOLUTION_NOTES=
    for _guard_uci_r_svc in chatgpt claude grok
    do
        _guard_uci_overlay_resolve_service_route "$_guard_uci_r_svc" "_GUARD_UCO_EFFECTIVE_ROUTING_$(printf '%s' "$_guard_uci_r_svc" | tr '[:lower:]' '[:upper:]')"
    done
    _guard_uci_overlay_resolve_fail_closed _GUARD_UCO_EFFECTIVE_DNS_FAIL_CLOSED
    _guard_uci_overlay_resolve_dns_backend _GUARD_UCO_EFFECTIVE_DNS_BACKEND
    # Deferred (contract gap) options: intentionally NOT given an effective var.
    return 0
}

# True only when a snapshot is LOADED, Layer-A VALID, AND a full Layer-B
# resolution has completed successfully for THIS snapshot. Distinct from
# "loaded && valid": it becomes false again as soon as a new snapshot is
# loaded (which invalidates the prior resolution) until re-resolved.
guard_uci_overlay_resolve_state_valid() {
    [ "${_GUARD_UCI_OVERLAY_LOADED:-0}" = 1 ] \
        && [ "$_GUARD_UCO_RESOLVED" = 1 ] \
        && guard_uci_overlay_validate
}

# Get an effective (resolved) value by option path.
#   - resolved-gated options (routing.<svc>, dns.fail_closed, dns.backend):
#     returns the Layer-B resolved value. REFUSES (non-zero, no output) when no
#     completed resolution exists for the current snapshot — never falls back
#     to the normalized UCI value, so a stale or unresolved value can't leak.
#   - deferred contract-gap options: prints "DEFERRED:<normalized>" (explicitly
#     flagged, never a usable effective value).
#   - other options (no authority constraint): the normalized UCI value.
guard_uci_overlay_effective() {
    if _guard_uci_resolve_is_deferred "$1"; then
        printf 'DEFERRED:%s' "$(guard_uci_overlay_get "$1")"
        return 0
    fi
    if _guard_uci_resolve_is_resolved_option "$1"; then
        if [ "$_GUARD_UCO_RESOLVED" != 1 ]; then
            printf '%s\n' "guard_uci_overlay_effective: $1 requires a completed resolution (call guard_uci_overlay_resolve first)" >&2
            return 1
        fi
        _guard_uci_eff_var="_GUARD_UCO_EFFECTIVE_$(printf '%s' "$1" | tr '[:lower:].' '[:upper:]_')"
        eval "_guard_uci_eff_val=\${$_guard_uci_eff_var-}"
        # A resolved option must have a concrete value; absence here would be a
        # resolver bug, so treat it as a refusal rather than a silent fallback.
        if [ -z "$_guard_uci_eff_val" ]; then
            printf '%s\n' "guard_uci_overlay_effective: $1 has no resolved value" >&2
            return 1
        fi
        printf '%s' "$_guard_uci_eff_val"
        return 0
    fi
    guard_uci_overlay_get "$1"
}

# List the options whose Layer-B gate is a documented contract gap (deferred).
guard_uci_overlay_deferred_options() {
    printf '%s\n' "$_GUARD_UCOR_DEFERRED_OPTIONS"
}

# List the options whose effective value requires a completed Layer-B resolution.
guard_uci_overlay_resolved_options() {
    printf '%s\n' "$_GUARD_UCOR_RESOLVED_OPTIONS"
}

# Diagnostics notes (requested/effective/reason), one per line, redacted.
guard_uci_overlay_resolve_notes() {
    printf '%s\n' "$_GUARD_UCO_RESOLUTION_NOTES"
}
