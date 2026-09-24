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

_guard_uci_overlay_reset() {
    _GUARD_UCI_OVERLAY_LOADED=0
    _GUARD_UCI_OVERLAY_VALID=1
    _GUARD_UCI_OVERLAY_ERRORS=''
    _GUARD_UCI_OVERLAY_UNKNOWN=''
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
    # Seed normalized vars with contract defaults (eval name is contract-only).
    for _guard_uci_ol_line in $_GUARD_UCI_OVERLAY_SPEC
    do
        _guard_uci_ol_path=$(printf '%s' "$_guard_uci_ol_line" | cut -d'|' -f1)
        _guard_uci_ol_dflt=$(printf '%s' "$_guard_uci_ol_line" | cut -d'|' -f3)
        _guard_uci_ol_var=$(_guard_uci_overlay_var_name "$_guard_uci_ol_path")
        eval "$_guard_uci_ol_var=\$_guard_uci_ol_dflt"
        eval "${_guard_uci_ol_var}_RAW=''"
    done

    if ! command -v uci >/dev/null 2>&1; then
        _GUARD_UCI_OVERLAY_LOADED=1
        return 0
    fi

    # Enumerate option paths present under the package.
    _guard_uci_ol_paths=$(uci -q show openclash_guard 2>/dev/null | sed -n 's/^openclash_guard\.\([^=]*\)=.*/\1/p' | sed 's/\[[0-9]*\]$//' | sort -u)

    for _guard_uci_ol_path in $_guard_uci_ol_paths
    do
        if ! _guard_uci_overlay_known "$_guard_uci_ol_path"; then
            _guard_uci_overlay_add_unknown "$_guard_uci_ol_path"
            continue
        fi
        _guard_uci_ol_type=$(_guard_uci_overlay_type "$_guard_uci_ol_path")
        case $_guard_uci_ol_type in
            ipv4-list|rule-list|https-url-list)
                _guard_uci_ol_nl='
'
                _guard_uci_ol_raw=$(uci -d "$_guard_uci_ol_nl" -q get "openclash_guard.$_guard_uci_ol_path" 2>/dev/null | tr '\n' ' ' || true)
                ;;
            *)
                _guard_uci_ol_raw=$(uci -q get "openclash_guard.$_guard_uci_ol_path" 2>/dev/null || true)
                ;;
        esac
        _guard_uci_ol_var=$(_guard_uci_overlay_var_name "$_guard_uci_ol_path")
        eval "${_guard_uci_ol_var}_RAW=\$_guard_uci_ol_raw"
        # Validate in the current shell so any recorded error persists (never
        # wrap in $(...) — that would fork and lose _GUARD_UCI_OVERLAY_VALID).
        _guard_uci_ol_norm=
        if _guard_uci_overlay_validate_value "$_guard_uci_ol_path" "$_guard_uci_ol_type" "$_guard_uci_ol_raw" _guard_uci_ol_norm; then
            eval "$_guard_uci_ol_var=\$_guard_uci_ol_norm"
        fi
        # On failure: keep the default in the normalized var; the error has
        # been recorded and _GUARD_UCI_OVERLAY_VALID is now 0.
    done

    _GUARD_UCI_OVERLAY_LOADED=1
    [ "$_GUARD_UCI_OVERLAY_VALID" = 1 ]
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
# {"uciOverlay":{"valid":bool,"errors":[...],"unknownOptions":[...]}}
guard_uci_overlay_json() {
    if [ "$_GUARD_UCI_OVERLAY_LOADED" != 1 ]; then
        guard_uci_overlay_load || true
    fi
    printf '{"uciOverlay":{"valid":%s,"errors":%s,"unknownOptions":%s}}' \
        "$([ "$_GUARD_UCI_OVERLAY_VALID" = 1 ] && printf true || printf false)" \
        "$(_guard_uci_overlay_json_errors)" \
        "$(_guard_uci_overlay_json_unknown)"
}
