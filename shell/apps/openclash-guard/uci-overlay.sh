#!/bin/sh
# Normalized OpenClash Guard UCI overlay.
#
# Single authority for reading local operator intent from
# /etc/config/openclash_guard. It does NOT touch nft or any subsystem; it only
# reads UCI, validates against the #122 runtime contract, and exposes a
# normalized snapshot plus redacted diagnostics.
#
# Wiring status (see docs/openclash-guard-uci-overlay-integration.md):
#   Intentionally UNWIRED from the release bundle while the sequence-6
#   candidate (#98) is pending. shell/manifest.json is unchanged, so
#   dist/openclash-guard.sh is unaffected. Consumer migration, manifest wiring,
#   the _guard_prepare() pipeline reorder, and nft-coupled integration are
#   deferred until the authenticated seq6 baseline lands on main.
#
# Trust model (per #122; contract at internal/config/openclash-guard/
# uci-runtime-contract.json):
#   - UCI is operator INTENT, not policy authority. It never widens signed
#     policy. Authority resolution (signed ceiling/floor, live-capability
#     gating) lives in uci-overlay-resolve.sh (depends on guard-policy /
#     guard-environment).
#   - A KNOWN option with an invalid value is a hard error: the overlay becomes
#     invalid and the error is surfaced so reconcile/apply refuses BEFORE any
#     nft mutation. No silent fallback to a weaker state. This applies to every
#     contract-covered option, including the effective legacy controls
#     (main.enabled, main.kill_switch, main.dns_kill_switch, udp.enabled,
#     udp.src_ip).
#   - An UNKNOWN option is ignored-and-reported: it gains no runtime authority
#     and never invalidates an otherwise-valid config (forward compatibility).
#
# Contract parity: the option table mirrors internal/config/openclash-guard/
# uci-runtime-contract.json. POSIX shell cannot parse that JSON, so the table
# is kept in sync manually and verified by
# tests/test_openclash_guard_uci_overlay.py. Change both together.
#
# Deliberate omissions: rules.direct_rule/proxy_rule/direct_source/
# proxy_source are NOT modeled (no grammar/canonicalization/duplicate/conflict/
# precedence semantics exist yet). See docs "Contract gaps". They are not
# validated, not normalized, and gain no runtime authority.
#
# Prefix: guard_uci_overlay_
set -eu

# spec line: option_path|type|default|authority
_GUARD_UCI_OVERLAY_SPEC='
main.enabled|boolean|1|uci-runtime
main.kill_switch|boolean|1|uci-runtime
main.dns_kill_switch|boolean|0|uci-runtime
main.profile_mode|enum|remote_ini|uci-overlay
main.profile_url|https-url-or-empty||uci-overlay
main.distribution_source|enum|auto|uci-overlay
main.auto_refresh|boolean|1|uci-overlay
routing.direct_region|region-ref|hk|signed-policy-gated
routing.proxy_region|region-ref|us|signed-policy-gated
routing.chatgpt|service-route-mode|proxy|signed-policy-gated
routing.claude|service-route-mode|proxy|signed-policy-gated
routing.grok|service-route-mode|proxy|signed-policy-gated
dns.backend|enum|auto|live-capability-gated
dns.resolver_sync|boolean|1|live-capability-gated
dns.fail_closed|boolean|1|signed-policy-floor
udp.enabled|boolean|1|signed-policy-gated
udp.src_ip|ipv4-list||signed-policy-gated
monitoring.enabled|boolean|0|monitor-service
monitoring.interval|integer-enum|900|monitor-service
monitoring.chatgpt|boolean|1|monitor-service
monitoring.claude|boolean|1|monitor-service
monitoring.grok|boolean|1|monitor-service
'

# Region catalog twin of internal/config/ai-routing/catalogs/regions.json.
_GUARD_UCI_OVERLAY_REGIONS='us jp sg tw kr hk mo uk fr de it no ca au ru ua tr'
_GUARD_UCI_OVERLAY_PRIMARY_ORDER='us jp sg tw kr'

_GUARD_UCI_OVERLAY_LOADED=0
_GUARD_UCI_OVERLAY_VALID=1
_GUARD_UCI_OVERLAY_ERRORS=''
_GUARD_UCI_OVERLAY_UNKNOWN=''
# Availability of the local UCI store this session. 1 = read OK (or absent
# package, a valid empty config), 0 = uci missing or package read failed.
_GUARD_UCI_OVERLAY_UCI_AVAILABLE=1

_guard_uci_overlay_reset() {
    _GUARD_UCI_OVERLAY_LOADED=0
    _GUARD_UCI_OVERLAY_VALID=1
    _GUARD_UCI_OVERLAY_ERRORS=''
    _GUARD_UCI_OVERLAY_UNKNOWN=''
    _GUARD_UCI_OVERLAY_UCI_AVAILABLE=1
}

_guard_uci_overlay_add_error() {
    if [ -z "$_GUARD_UCI_OVERLAY_ERRORS" ]; then
        _GUARD_UCI_OVERLAY_ERRORS="$1"
    else
        _GUARD_UCI_OVERLAY_ERRORS="$_GUARD_UCI_OVERLAY_ERRORS
$1"
    fi
    _GUARD_UCI_OVERLAY_VALID=0
}

_guard_uci_overlay_add_unknown() {
    if [ -z "$_GUARD_UCI_OVERLAY_UNKNOWN" ]; then
        _GUARD_UCI_OVERLAY_UNKNOWN="$1"
    else
        _GUARD_UCI_OVERLAY_UNKNOWN="$_GUARD_UCI_OVERLAY_UNKNOWN
$1"
    fi
}

_guard_uci_overlay_var_name() {
    printf '_GUARD_UCO_%s' "$(printf '%s' "$1" | tr '[:lower:].' '[:upper:]_')"
}

_guard_uci_overlay_field() {
    # _guard_uci_overlay_field PATH FIELDNO -> prints the spec field.
    # Match is exact: the spec line for PATH is "PATH|type|default|authority",
    # so we require PATH terminated by the field separator (a bare prefix such
    # as main.enabled matching main.enabledX would be a false positive).
    _guard_uci_of_path=$1
    _guard_uci_of_no=$2
    _guard_uci_of_found=1
    for _guard_uci_of_line in $_GUARD_UCI_OVERLAY_SPEC
    do
        case $_guard_uci_of_line in
            "$_guard_uci_of_path"?*)
                # Candidate shares PATH as prefix; require the very next char
                # to be the field separator.
                _guard_uci_of_rest=${_guard_uci_of_line#"$_guard_uci_of_path"}
                case $_guard_uci_of_rest in
                    '|'*)
                        printf '%s' "$_guard_uci_of_rest" | cut -d'|' -f"$_guard_uci_of_no"
                        _guard_uci_of_found=0
                        break
                        ;;
                esac
                ;;
        esac
    done
    return $_guard_uci_of_found
}

_guard_uci_overlay_known() {
    _guard_uci_overlay_field "$1" 1 >/dev/null
}

_guard_uci_overlay_type() { _guard_uci_overlay_field "$1" 2; }
_guard_uci_overlay_default() { _guard_uci_overlay_field "$1" 3; }
_guard_uci_overlay_authority() { _guard_uci_overlay_field "$1" 4; }

_guard_uci_overlay_enum_values() {
    case $1 in
        main.profile_mode) printf 'remote_ini local' ;;
        main.distribution_source) printf 'auto github-raw jsdelivr' ;;
        dns.backend) printf 'auto adguardhome dnsmasq' ;;
        routing.chatgpt|routing.claude|routing.grok) printf 'proxy direct auto block' ;;
        monitoring.interval) printf '300 900 1800 3600' ;;
        *) printf '' ;;
    esac
}

_guard_uci_overlay_is_boolean() {
    case $1 in
        1|true|TRUE|True|yes|YES|on|ON|enabled|ENABLED) return 0 ;;
        0|false|FALSE|False|no|NO|off|OFF|disabled|DISABLED|'') return 0 ;;
        *) return 1 ;;
    esac
}

_guard_uci_overlay_normalize_boolean() {
    case $1 in
        1|true|TRUE|True|yes|YES|on|ON|enabled|ENABLED) printf '1' ;;
        *) printf '0' ;;
    esac
}

_guard_uci_overlay_in_list() {
    # _guard_uci_overlay_in_list NEEDLE item1 item2 ...
    _guard_uci_il_needle=$1
    shift || return 1
    for _guard_uci_il_item in "$@"
    do
        [ "$_guard_uci_il_item" = "$_guard_uci_il_needle" ] && return 0
    done
    return 1
}

_guard_uci_overlay_region_set_for() {
    case $1 in
        routing.proxy_region) printf 'primaryOrder' ;;
        *) printf 'registry' ;;
    esac
}

_guard_uci_overlay_valid_region() {
    # $1=value $2=regionSet(registry|primaryOrder)
    if [ "$2" = "primaryOrder" ]; then
        # shellcheck disable=SC2086
        _guard_uci_overlay_in_list "$1" $_GUARD_UCI_OVERLAY_PRIMARY_ORDER
    else
        # shellcheck disable=SC2086
        _guard_uci_overlay_in_list "$1" $_GUARD_UCI_OVERLAY_REGIONS
    fi
}

_guard_uci_overlay_valid_ipv4() {
    _guard_uci_v4=$1
    case $_guard_uci_v4 in
        *[!0-9.]*|'') return 1 ;;
    esac
    _guard_uci_v4_oldifs=$IFS
    IFS='.'
    # shellcheck disable=SC2086
    set -- $_guard_uci_v4
    IFS=$_guard_uci_v4_oldifs
    [ "$#" -eq 4 ] || return 1
    for _guard_uci_v4_octet in "$@"
    do
        case $_guard_uci_v4_octet in
            0|[1-9]|[1-9][0-9]|[1-9][0-9][0-9]) : ;;
            *) return 1 ;;
        esac
        [ "$_guard_uci_v4_octet" -le 255 ] 2>/dev/null || return 1
    done
    return 0
}

_guard_uci_overlay_check_https_url() {
    # On failure prints a REASON (never the URL) and returns 1.
    _guard_uci_url=$1
    case $_guard_uci_url in
        *[\ \	]*) printf 'URL contains whitespace'; return 1 ;;
    esac
    case $_guard_uci_url in
        https://*) : ;;
        http://*) printf 'URL is not HTTPS'; return 1 ;;
        *) printf 'URL is malformed (must start with https://)'; return 1 ;;
    esac
    _guard_uci_url_rest=${_guard_uci_url#https://}
    case $_guard_uci_url_rest in
        '') printf 'URL is malformed (empty host)'; return 1 ;;
        *@*) printf 'URL contains credentials'; return 1 ;;
    esac
    _guard_uci_url_host=${_guard_uci_url_rest%%/*}
    case $_guard_uci_url_host in
        ''|*[\ \	]*) printf 'URL is malformed (empty host)'; return 1 ;;
    esac
    return 0
}

# Validate an ipv4-list (space-separated). Success assigns the canonical
# de-duplicated list into the variable named by $3. Failure records an error
# and returns 1. Runs in the CURRENT shell (no command substitution) so the
# recorded error persists.
_guard_uci_overlay_validate_ipv4_list() {
    _guard_uci_vl_path=$1
    _guard_uci_vl_value=$2
    _guard_uci_vl_resultvar=$3
    _guard_uci_vl_out=''
    for _guard_uci_vl_item in $_guard_uci_vl_value
    do
        [ -n "$_guard_uci_vl_item" ] || continue
        if ! _guard_uci_overlay_valid_ipv4 "$_guard_uci_vl_item"; then
            _guard_uci_overlay_add_error "$_guard_uci_vl_path|invalid IPv4 address in list"
            return 1
        fi
        # shellcheck disable=SC2086
        if _guard_uci_overlay_in_list "$_guard_uci_vl_item" $_guard_uci_vl_out; then
            continue
        fi
        if [ -z "$_guard_uci_vl_out" ]; then
            _guard_uci_vl_out=$_guard_uci_vl_item
        else
            _guard_uci_vl_out="$_guard_uci_vl_out $_guard_uci_vl_item"
        fi
    done
    eval "$_guard_uci_vl_resultvar=\$_guard_uci_vl_out"
    return 0
}

# Validate one known option value. On success assigns the NORMALIZED value to
# the variable named by $4 and returns 0; on failure records "path|reason" and
# returns 1. IMPORTANT: this mutates shell state (_GUARD_UCI_OVERLAY_ERRORS /
# _GUARD_UCI_OVERLAY_VALID), so it must be called in the current shell — never
# via $( command substitution ), which forks and discards the recorded error.
_guard_uci_overlay_validate_value() {
    _guard_uci_ovv_path=$1
    _guard_uci_ovv_type=$2
    _guard_uci_ovv_value=$3
    _guard_uci_ovv_resultvar=$4
    case $_guard_uci_ovv_type in
        boolean)
            if _guard_uci_overlay_is_boolean "$_guard_uci_ovv_value"; then
                eval "$_guard_uci_ovv_resultvar=\$(_guard_uci_overlay_normalize_boolean "\$_guard_uci_ovv_value")"
                return 0
            fi
            _guard_uci_overlay_add_error "$_guard_uci_ovv_path|invalid boolean (expected 0/1)"
            return 1
            ;;
        enum|integer-enum|service-route-mode)
            _guard_uci_ovv_allowed=$(_guard_uci_overlay_enum_values "$_guard_uci_ovv_path")
            # shellcheck disable=SC2086
            if _guard_uci_overlay_in_list "$_guard_uci_ovv_value" $_guard_uci_ovv_allowed; then
                eval "$_guard_uci_ovv_resultvar=\$_guard_uci_ovv_value"
                return 0
            fi
            _guard_uci_overlay_add_error "$_guard_uci_ovv_path|invalid value (allowed: $_guard_uci_ovv_allowed)"
            return 1
            ;;
        region-ref)
            _guard_uci_ovv_set=$(_guard_uci_overlay_region_set_for "$_guard_uci_ovv_path")
            if _guard_uci_overlay_valid_region "$_guard_uci_ovv_value" "$_guard_uci_ovv_set"; then
                eval "$_guard_uci_ovv_resultvar=\$_guard_uci_ovv_value"
                return 0
            fi
            if [ "$_guard_uci_ovv_set" = "primaryOrder" ]; then
                _guard_uci_overlay_add_error "$_guard_uci_ovv_path|invalid region (must be a routable proxy-exit region)"
            else
                _guard_uci_overlay_add_error "$_guard_uci_ovv_path|invalid region (unknown region id)"
            fi
            return 1
            ;;
        https-url-or-empty)
            if [ -z "$_guard_uci_ovv_value" ]; then
                eval "$_guard_uci_ovv_resultvar=''"
                return 0
            fi
            _guard_uci_ovv_reason=$(_guard_uci_overlay_check_https_url "$_guard_uci_ovv_value") || {
                _guard_uci_overlay_add_error "$_guard_uci_ovv_path|$_guard_uci_ovv_reason"
                return 1
            }
            eval "$_guard_uci_ovv_resultvar=\$_guard_uci_ovv_value"
            return 0
            ;;
        ipv4-list)
            _guard_uci_overlay_validate_ipv4_list "$_guard_uci_ovv_path" "$_guard_uci_ovv_value" "$_guard_uci_ovv_resultvar"
            return $?
            ;;
        *)
            # rule-list / https-url-list intentionally not modeled.
            eval "$_guard_uci_ovv_resultvar=\$_guard_uci_ovv_value"
            return 0
            ;;
    esac
}

# Read the whole package, strictly validate known options, collect unknowns.
# Populates the normalized snapshot. Returns 0 when valid, 1 when any known
# option was invalid (errors recorded before any caller can mutate nft).
guard_uci_overlay_load() {
    _guard_uci_overlay_reset
    # A new snapshot invalidates any previously resolved Layer-B effective
    # state. The resolver is an optional higher layer; call its invalidation
    # hook only when present (guarded, so this module stays dependency-free and
    # the manifest can wire Layer B after Layer A without a cycle).
    if command -v guard_uci_overlay_invalidate_resolved_state >/dev/null 2>&1; then
        guard_uci_overlay_invalidate_resolved_state
    fi
    # Seed normalized vars with contract defaults (eval name is contract-only).
    for _guard_uci_ol_line in $_GUARD_UCI_OVERLAY_SPEC
    do
        _guard_uci_ol_path=$(printf '%s' "$_guard_uci_ol_line" | cut -d'|' -f1)
        _guard_uci_ol_dflt=$(printf '%s' "$_guard_uci_ol_line" | cut -d'|' -f3)
        _guard_uci_ol_var=$(_guard_uci_overlay_var_name "$_guard_uci_ol_path")
        eval "$_guard_uci_ol_var=\$_guard_uci_ol_dflt"
        eval "${_guard_uci_ol_var}_RAW=''"
    done

    # uci must exist AND the package must be readable; otherwise treat the
    # overlay as unavailable/invalid and fail (never quietly default).
    if ! command -v uci >/dev/null 2>&1; then
        _GUARD_UCI_OVERLAY_UCI_AVAILABLE=0
        _guard_uci_overlay_add_error 'openclash_guard|uci command unavailable'
        _GUARD_UCI_OVERLAY_LOADED=1
        return 1
    fi
    if ! uci -q show openclash_guard >/dev/null 2>&1; then
        # Distinguish "package absent" (valid empty config) from a real read
        # failure. `uci show` exits non-zero when the package does not exist;
        # an existing-but-empty or a read failure must not be conflated.
        # Use `uci -q show` of the package with output captured: absence of the
        # package config file is reported by uci as a specific message; treat
        # any non-zero with NO config present as "absent" only when the config
        # file itself is missing. If we cannot tell, conservatively fail.
        _guard_uci_ol_show=$(uci show openclash_guard 2>&1) || _guard_uci_ol_show_rc=$?
        case ${_guard_uci_ol_show_rc:-0} in
            0) : ;;
            *)
                # uci reports "Entry not found" for a package that does not
                # exist. Anything else is an unexpected read failure.
                case $_guard_uci_ol_show in
                    *'Entry not found'*|*'not found'*)
                        # Package absent: valid empty config; defaults apply.
                        _GUARD_UCI_OVERLAY_LOADED=1
                        return 0
                        ;;
                    *)
                        _GUARD_UCI_OVERLAY_UCI_AVAILABLE=0
                        _guard_uci_overlay_add_error 'openclash_guard|package read failed'
                        _GUARD_UCI_OVERLAY_LOADED=1
                        return 1
                        ;;
                esac
                ;;
        esac
    fi

    # Snapshot-coherent collection. `uci show` is used ONLY as a coherence
    # fingerprint (before/after); semantic VALUES are read with the real `uci
    # get` CLI so UCI itself decodes quoting/escaping (never a home-grown shell
    # quote parser, never `eval` of `uci show`). The before/after fingerprint
    # comparison provides drift detection with a bounded retry; it is NOT a
    # UCI transaction (see ABA caveat in the design doc).
    _guard_uci_ol_attempt=0
    _guard_uci_ol_coherent=0
    while [ "$_guard_uci_ol_attempt" -lt "${GUARD_UCI_OVERLAY_MAX_ATTEMPTS:-2}" ]
    do
        _guard_uci_ol_attempt=$((_guard_uci_ol_attempt + 1))
        # BEFORE fingerprint: explicit exit-status check, never `|| true` (a
        # failed capture must not masquerade as an empty catalog).
        if ! _guard_uci_ol_catalog_before=$(uci show openclash_guard 2>/dev/null); then
            _guard_uci_overlay_add_error 'openclash_guard|coherence fingerprint capture failed (before)'
            continue
        fi
        # Reset per-attempt state (unknown/errors/norm vars) without clearing
        # the Layer-B invalidation already done above.
        _GUARD_UCI_OVERLAY_VALID=1
        _GUARD_UCI_OVERLAY_ERRORS=''
        _GUARD_UCI_OVERLAY_UNKNOWN=''
        for _guard_uci_ol_line in $_GUARD_UCI_OVERLAY_SPEC
        do
            _guard_uci_ol_path=$(printf '%s' "$_guard_uci_ol_line" | cut -d'|' -f1)
            _guard_uci_ol_dflt=$(printf '%s' "$_guard_uci_ol_line" | cut -d'|' -f3)
            _guard_uci_ol_var=$(_guard_uci_overlay_var_name "$_guard_uci_ol_path")
            eval "$_guard_uci_ol_var=\$_guard_uci_ol_dflt"
            eval "${_guard_uci_ol_var}_RAW=''"
        done
        if _guard_uci_overlay_populate_from_uci "$_guard_uci_ol_catalog_before"; then
            # AFTER fingerprint: explicit exit-status check.
            if ! _guard_uci_ol_catalog_after=$(uci show openclash_guard 2>/dev/null); then
                _guard_uci_overlay_add_error 'openclash_guard|coherence fingerprint capture failed (after)'
                continue
            fi
            if [ "$_guard_uci_ol_catalog_before" = "$_guard_uci_ol_catalog_after" ]; then
                _guard_uci_ol_coherent=1
                break
            fi
            # Generation changed mid-read: discard candidate and retry.
        fi
        # populate failed (a semantic field read failed): discard and retry.
    done
    if [ "$_guard_uci_ol_coherent" != 1 ]; then
        _GUARD_UCI_OVERLAY_UCI_AVAILABLE=0
        _guard_uci_overlay_add_error 'openclash_guard|snapshot not coherent (config changed or read failed)'
        _GUARD_UCI_OVERLAY_LOADED=1
        return 1
    fi

    _GUARD_UCI_OVERLAY_LOADED=1
    [ "$_GUARD_UCI_OVERLAY_VALID" = 1 ]
}

# Derive option PATHS from the captured fingerprint catalog (paths only; values
# are read separately with the real CLI). Prints one section.option per line.
_guard_uci_overlay_catalog_paths() {
    printf '%s\n' "$1" \
        | sed -n "s/^openclash_guard\.\([A-Za-z0-9_]*\.[A-Za-z0-9_]*\)=.*/\1/p" \
        | sed "s/\[[0-9]*\]\$//" \
        | sort -u
}

# Read and validate semantic values for every option path present in the
# fingerprint catalog, using the real `uci get` CLI. A failed semantic read on
# an enumerated option DISCARDS the candidate (returns non-zero) instead of
# validating an empty/partial value. Returns 0 when every option read cleanly
# (validity of the VALUES is tracked separately in the overlay state).
_guard_uci_overlay_populate_from_uci() {
    _guard_uci_pf_catalog=$1
    _guard_uci_pf_paths=$(_guard_uci_overlay_catalog_paths "$_guard_uci_pf_catalog")
    for _guard_uci_pf_path in $_guard_uci_pf_paths
    do
        if ! _guard_uci_overlay_known "$_guard_uci_pf_path"; then
            _guard_uci_overlay_add_unknown "$_guard_uci_pf_path"
            continue
        fi
        _guard_uci_pf_type=$(_guard_uci_overlay_type "$_guard_uci_pf_path")
        case $_guard_uci_pf_type in
            ipv4-list|rule-list|https-url-list)
                _guard_uci_pf_nl='
'
                # Explicit exit-status check BEFORE the tr pipe (CLI decodes the
                # list form; a failed read discards the candidate).
                if ! _guard_uci_pf_items=$(uci -d "$_guard_uci_pf_nl" -q get "openclash_guard.$_guard_uci_pf_path" 2>/dev/null); then
                    _guard_uci_overlay_add_error "$_guard_uci_pf_path|read failed"
                    return 1
                fi
                _guard_uci_pf_raw=$(printf '%s' "$_guard_uci_pf_items" | tr '\n' ' ')
                ;;
            *)
                if ! _guard_uci_pf_raw=$(uci -q get "openclash_guard.$_guard_uci_pf_path" 2>/dev/null); then
                    _guard_uci_overlay_add_error "$_guard_uci_pf_path|read failed"
                    return 1
                fi
                ;;
        esac
        _guard_uci_pf_var=$(_guard_uci_overlay_var_name "$_guard_uci_pf_path")
        eval "${_guard_uci_pf_var}_RAW=\$_guard_uci_pf_raw"
        # Validate in the current shell so any recorded error persists (never
        # wrap in $(...) — that would fork and lose _GUARD_UCI_OVERLAY_VALID).
        _guard_uci_pf_norm=
        if _guard_uci_overlay_validate_value "$_guard_uci_pf_path" "$_guard_uci_pf_type" "$_guard_uci_pf_raw" _guard_uci_pf_norm; then
            eval "$_guard_uci_pf_var=\$_guard_uci_pf_norm"
        fi
        # On failure: keep the default; the error was recorded and VALID is 0.
    done
    return 0
}

guard_uci_overlay_read_raw() {
    guard_uci_overlay_load
}

guard_uci_overlay_validate() {
    if [ "$_GUARD_UCI_OVERLAY_LOADED" != 1 ]; then
        guard_uci_overlay_load
    fi
    [ "$_GUARD_UCI_OVERLAY_VALID" = 1 ]
}

guard_uci_overlay_valid() {
    printf '%s' "$_GUARD_UCI_OVERLAY_VALID"
}

# 1 when the local UCI store was read successfully this session (or the package
# is legitimately absent); 0 when uci is missing or the package read failed.
guard_uci_overlay_available() {
    printf '%s' "$_GUARD_UCI_OVERLAY_UCI_AVAILABLE"
}

guard_uci_overlay_errors() {
    printf '%s\n' "$_GUARD_UCI_OVERLAY_ERRORS"
}

guard_uci_overlay_unknown_options() {
    printf '%s\n' "$_GUARD_UCI_OVERLAY_UNKNOWN"
}

guard_uci_overlay_get() {
    _guard_uci_og_var=$(_guard_uci_overlay_var_name "$1")
    eval "printf '%s' \"\${$_guard_uci_og_var:-}\""
}

guard_uci_overlay_get_raw() {
    _guard_uci_ogr_var=$(_guard_uci_overlay_var_name "$1")
    eval "printf '%s' \"\${${_guard_uci_ogr_var}_RAW:-}\""
}

# JSON-escape and quote a scalar. No secret values are ever passed in reasons.
_guard_uci_overlay_json_q() {
    _guard_uci_jq=$1
    _guard_uci_jq_out=
    _guard_uci_jq_i=1
    _guard_uci_jq_len=${#_guard_uci_jq}
    while [ "$_guard_uci_jq_i" -le "$_guard_uci_jq_len" ]
    do
        _guard_uci_jq_c=$(printf '%s' "$_guard_uci_jq" | cut -c "$_guard_uci_jq_i")
        case $_guard_uci_jq_c in
            '"') _guard_uci_jq_out="$_guard_uci_jq_out\\\"" ;;
            '\') _guard_uci_jq_out="$_guard_uci_jq_out\\\\" ;;
            *) _guard_uci_jq_out="$_guard_uci_jq_out$_guard_uci_jq_c" ;;
        esac
        _guard_uci_jq_i=$((_guard_uci_jq_i + 1))
    done
    printf '"%s"' "$_guard_uci_jq_out"
}

_guard_uci_overlay_json_errors() {
    printf '['
    _guard_uci_je_first=1
    _guard_uci_je_oldifs=$IFS
    IFS='
'
    for _guard_uci_je_line in $_GUARD_UCI_OVERLAY_ERRORS
    do
        IFS=$_guard_uci_je_oldifs
        [ -n "$_guard_uci_je_line" ] || continue
        _guard_uci_je_path=${_guard_uci_je_line%%|*}
        _guard_uci_je_reason=${_guard_uci_je_line#*|}
        [ "$_guard_uci_je_first" = 1 ] || printf ','
        _guard_uci_je_first=0
        printf '{"option":%s,"reason":%s}' \
            "$(_guard_uci_overlay_json_q "$_guard_uci_je_path")" \
            "$(_guard_uci_overlay_json_q "$_guard_uci_je_reason")"
        IFS='
'
    done
    IFS=$_guard_uci_je_oldifs
    printf ']'
}

_guard_uci_overlay_json_unknown() {
    printf '['
    _guard_uci_ju_first=1
    _guard_uci_ju_oldifs=$IFS
    IFS='
'
    for _guard_uci_ju_line in $_GUARD_UCI_OVERLAY_UNKNOWN
    do
        IFS=$_guard_uci_ju_oldifs
        [ -n "$_guard_uci_ju_line" ] || continue
        [ "$_guard_uci_ju_first" = 1 ] || printf ','
        _guard_uci_ju_first=0
        printf '{"option":%s}' "$(_guard_uci_overlay_json_q "$_guard_uci_ju_line")"
        IFS='
'
    done
    IFS=$_guard_uci_ju_oldifs
    printf ']'
}

# Diagnostics JSON (redacted), per #124. No secret values.
# {"uciOverlay":{"available":bool,"valid":bool,"errors":[...],"unknownOptions":[...]}}
guard_uci_overlay_json() {
    if [ "$_GUARD_UCI_OVERLAY_LOADED" != 1 ]; then
        guard_uci_overlay_load || true
    fi
    printf '{"uciOverlay":{"available":%s,"valid":%s,"errors":%s,"unknownOptions":%s}}' \
        "$([ "$_GUARD_UCI_OVERLAY_UCI_AVAILABLE" = 1 ] && printf true || printf false)" \
        "$([ "$_GUARD_UCI_OVERLAY_VALID" = 1 ] && printf true || printf false)" \
        "$(_guard_uci_overlay_json_errors)" \
        "$(_guard_uci_overlay_json_unknown)"
}
