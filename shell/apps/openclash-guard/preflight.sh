#!/bin/sh
# Complete read-only bootstrap discovery for OpenClash Guard.
# Prefix: guard_preflight_
set -eu

_GUARD_PREFLIGHT_COMPLETE=0
_GUARD_PREFLIGHT_POLICY_FILE=
_GUARD_PREFLIGHT_TEMPLATES_FILE=
_GUARD_PREFLIGHT_SOURCE=
_GUARD_PREFLIGHT_POLICY_URL=
_GUARD_PREFLIGHT_TEMPLATES_URL=
_GUARD_PREFLIGHT_SOURCE_REASON=
_GUARD_PREFLIGHT_DIRECT_REASON=
_GUARD_PREFLIGHT_PROXY_REASON=
_GUARD_PREFLIGHT_TEMPLATE_IDS=
_GUARD_PREFLIGHT_TEMPLATE_REASON=
_GUARD_PREFLIGHT_SETUP_VALID=0
_GUARD_PREFLIGHT_SETUP_REASON=
_GUARD_PREFLIGHT_GUARD_INSTALLED=0
_GUARD_PREFLIGHT_CACHE_DIR=
_GUARD_PREFLIGHT_CACHE_TEMP=0
_GUARD_PREFLIGHT_POLICY_TEMP=0
_GUARD_PREFLIGHT_TEMPLATES_TEMP=0

_guard_preflight_remove_file() {
    [ -n "${1:-}" ] && [ -f "$1" ] && rm -f "$1"
}

guard_preflight_cleanup() {
    if [ "${_GUARD_PREFLIGHT_POLICY_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_POLICY_FILE:-}"
    fi
    if [ "${_GUARD_PREFLIGHT_TEMPLATES_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}"
    fi
    if [ "${_GUARD_PREFLIGHT_CACHE_TEMP:-0}" = 1 ] && [ -n "${_GUARD_PREFLIGHT_CACHE_DIR:-}" ] && [ -d "$_GUARD_PREFLIGHT_CACHE_DIR" ]; then
        _guard_preflight_remove_file "$_GUARD_PREFLIGHT_CACHE_DIR/direct.json"
        for _guard_pc_file in "$_GUARD_PREFLIGHT_CACHE_DIR"/route-*.json
        do
            [ -f "$_guard_pc_file" ] && rm -f "$_guard_pc_file"
        done
        rmdir "$_GUARD_PREFLIGHT_CACHE_DIR" 2>/dev/null || true
    fi
    _GUARD_PREFLIGHT_POLICY_FILE=
    _GUARD_PREFLIGHT_TEMPLATES_FILE=
    _GUARD_PREFLIGHT_CACHE_DIR=
    _GUARD_PREFLIGHT_CACHE_TEMP=0
    _GUARD_PREFLIGHT_POLICY_TEMP=0
    _GUARD_PREFLIGHT_TEMPLATES_TEMP=0
}

_guard_preflight_source_list() {
    case ${1:-auto} in
        auto) printf '%s\n' "github-raw jsdelivr" ;;
        github-raw|raw|jsdelivr|cdn) printf '%s\n' "$1" ;;
        *) return 2 ;;
    esac
}

guard_preflight_stage_distribution() {
    _guard_ps_source=${1:-auto}
    _guard_ps_base=${2:-}
    _guard_ps_sources=$(_guard_preflight_source_list "$_guard_ps_source") || {
        _GUARD_PREFLIGHT_SOURCE_REASON="unsupported distribution source: $_guard_ps_source"
        return 2
    }
    if [ "${_GUARD_PREFLIGHT_POLICY_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_POLICY_FILE:-}"
    fi
    if [ "${_GUARD_PREFLIGHT_TEMPLATES_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}"
    fi
    _GUARD_PREFLIGHT_POLICY_FILE=
    _GUARD_PREFLIGHT_TEMPLATES_FILE=
    _GUARD_PREFLIGHT_SOURCE=
    _GUARD_PREFLIGHT_POLICY_URL=
    _GUARD_PREFLIGHT_TEMPLATES_URL=
    _GUARD_PREFLIGHT_SOURCE_REASON=
    _GUARD_PREFLIGHT_POLICY_TEMP=0
    _GUARD_PREFLIGHT_TEMPLATES_TEMP=0
    for _guard_ps_item in $_guard_ps_sources
    do
        _guard_ps_policy=$(file_mktemp) || return 1
        _guard_ps_templates=$(file_mktemp) || {
            rm -f "$_guard_ps_policy"
            return 1
        }
        _guard_ps_policy_url=$(_guard_distribution_policy_url "$_guard_ps_item" "$_guard_ps_base") || {
            rm -f "$_guard_ps_policy" "$_guard_ps_templates"
            continue
        }
        _guard_ps_templates_url=$(_guard_distribution_templates_url "$_guard_ps_item" "$_guard_ps_base") || {
            rm -f "$_guard_ps_policy" "$_guard_ps_templates"
            continue
        }
        _guard_ps_ok=1
        fetch_http "$_guard_ps_policy_url" "$_guard_ps_policy" || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && guard_policy_validate_file "$_guard_ps_policy" || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && fetch_http "$_guard_ps_templates_url" "$_guard_ps_templates" || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && guard_template_validate_file "$_guard_ps_templates" || _guard_ps_ok=0
        if [ "$_guard_ps_ok" = 1 ]; then
            _GUARD_PREFLIGHT_POLICY_FILE=$_guard_ps_policy
            _GUARD_PREFLIGHT_TEMPLATES_FILE=$_guard_ps_templates
            _GUARD_PREFLIGHT_SOURCE=$_guard_ps_item
            _GUARD_PREFLIGHT_POLICY_URL=$_guard_ps_policy_url
            _GUARD_PREFLIGHT_TEMPLATES_URL=$_guard_ps_templates_url
            _GUARD_PREFLIGHT_POLICY_TEMP=1
            _GUARD_PREFLIGHT_TEMPLATES_TEMP=1
            return 0
        fi
        rm -f "$_guard_ps_policy" "$_guard_ps_templates"
    done
    _GUARD_PREFLIGHT_SOURCE_REASON="no distribution source supplied a valid policy and template catalog"
    return 1
}

_guard_preflight_installed_policy() {
    _guard_pi_policy=$(_guard_policy_default_path)
    if guard_policy_validate_file "$_guard_pi_policy" >/dev/null 2>&1; then
        printf '%s\n' "$_guard_pi_policy"
        return 0
    fi
    return 1
}

_guard_preflight_installed_templates() {
    _guard_pi_templates=$(_guard_template_catalog_path)
    if guard_template_validate_file "$_guard_pi_templates" >/dev/null 2>&1; then
        printf '%s\n' "$_guard_pi_templates"
        return 0
    fi
    return 1
}

_guard_preflight_last_error() {
    _guard_pe_file=$1
    _guard_pe_fallback=$2
    _guard_pe_line=$(tail -n 1 "$_guard_pe_file" 2>/dev/null) || _guard_pe_line=
    rm -f "$_guard_pe_file"
    if [ -n "$_guard_pe_line" ]; then
        printf '%s\n' "$_guard_pe_line"
    else
        printf '%s\n' "$_guard_pe_fallback"
    fi
}

_guard_preflight_geo_cache() {
    if [ -n "${GUARD_GEO_CACHE_DIR:-}" ] && [ -d "$GUARD_GEO_CACHE_DIR" ]; then
        _GUARD_PREFLIGHT_CACHE_DIR=$GUARD_GEO_CACHE_DIR
        _GUARD_PREFLIGHT_CACHE_TEMP=0
        return 0
    fi
    _guard_pg_marker=$(file_mktemp) || return 1
    rm -f "$_guard_pg_marker"
    mkdir "$_guard_pg_marker" || return 1
    _GUARD_PREFLIGHT_CACHE_DIR=$_guard_pg_marker
    _GUARD_PREFLIGHT_CACHE_TEMP=1
    GUARD_GEO_CACHE_DIR=$_guard_pg_marker
    export GUARD_GEO_CACHE_DIR
}

_guard_preflight_detect_direct() {
    if [ -n "${GUARD_DIRECT_REGION:-}" ]; then
        _GUARD_NET_DIRECT_REGION=$GUARD_DIRECT_REGION
        _GUARD_PREFLIGHT_DIRECT_REASON="provided by GUARD_DIRECT_REGION"
        return 0
    fi
    _GUARD_NET_DIRECT_REGION=
    _guard_pd_err=$(file_mktemp) || return 1
    if guard_geo_detect_direct >/dev/null 2>"$_guard_pd_err"; then
        _GUARD_NET_DIRECT_REGION=$(guard_geo_cached_country direct 2>/dev/null) || _GUARD_NET_DIRECT_REGION=
        rm -f "$_guard_pd_err"
        if [ -n "$_GUARD_NET_DIRECT_REGION" ]; then
            _GUARD_PREFLIGHT_DIRECT_REASON="direct HTTPS geo probe bypassed proxy environment"
            return 0
        fi
    fi
    _GUARD_PREFLIGHT_DIRECT_REASON=$(_guard_preflight_last_error "$_guard_pd_err" "direct geo providers returned no usable country")
    return 1
}

_guard_preflight_detect_proxy() {
    _GUARD_PROXY_HEALTHY=0
    if [ "$_GUARD_OC_INSTALLED" != 1 ]; then
        _GUARD_PROXY_REGION=
        _GUARD_PREFLIGHT_PROXY_REASON="OpenClash is not installed"
        return 1
    fi
    if [ "$_GUARD_OC_RUNNING" != 1 ]; then
        _GUARD_PROXY_REGION=
        _GUARD_PREFLIGHT_PROXY_REASON="OpenClash is not running"
        return 1
    fi
    if [ "$_GUARD_OC_HEALTHY" != 1 ]; then
        _GUARD_PROXY_REGION=
        _GUARD_PREFLIGHT_PROXY_REASON="OpenClash runtime health probe failed"
        return 1
    fi
    if [ -n "${GUARD_PROXY_REGION:-}" ]; then
        _GUARD_PROXY_REGION=$GUARD_PROXY_REGION
        _GUARD_PROXY_HEALTHY=$(_guard_env_proxy_healthy)
        if guard_geo_discover_proxy_route; then
            _GUARD_PROXY_HEALTHY=1
            _GUARD_PREFLIGHT_PROXY_REASON="provided by GUARD_PROXY_REGION; route capability discovered"
        else
            _GUARD_PREFLIGHT_PROXY_REASON="provided by GUARD_PROXY_REGION; route was not testable: ${_GUARD_GEO_ROUTE_REASON:-unavailable}"
        fi
        return 0
    fi
    if ! guard_geo_discover_proxy_route; then
        _GUARD_PROXY_REGION=
        _GUARD_PREFLIGHT_PROXY_REASON=${_GUARD_GEO_ROUTE_REASON:-OpenClash proxy route is unavailable}
        return 1
    fi
    _GUARD_PROXY_REGION=
    _guard_pp_err=$(file_mktemp) || return 1
    if guard_geo_detect_route "$_GUARD_GEO_ROUTE" >/dev/null 2>"$_guard_pp_err"; then
        _GUARD_PROXY_REGION=$(guard_geo_cached_country route "$_GUARD_GEO_ROUTE" 2>/dev/null) || _GUARD_PROXY_REGION=
        rm -f "$_guard_pp_err"
        if [ -n "$_GUARD_PROXY_REGION" ]; then
            _GUARD_PROXY_HEALTHY=1
            _GUARD_PREFLIGHT_PROXY_REASON="geo probe traversed $_GUARD_GEO_ROUTE"
            return 0
        fi
    fi
    _GUARD_PREFLIGHT_PROXY_REASON=$(_guard_preflight_last_error "$_guard_pp_err" "no active OpenClash proxy route could be tested successfully")
    return 1
}

_guard_preflight_match_templates() {
    _GUARD_PREFLIGHT_TEMPLATE_IDS=
    _GUARD_PREFLIGHT_TEMPLATE_REASON=
    _guard_pt_catalog=${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}
    if [ -z "$_guard_pt_catalog" ] || [ ! -f "$_guard_pt_catalog" ]; then
        _guard_pt_catalog=$(_guard_preflight_installed_templates 2>/dev/null) || _guard_pt_catalog=
    fi
    if [ -z "$_guard_pt_catalog" ]; then
        _GUARD_PREFLIGHT_TEMPLATE_REASON="no validated template catalog is available"
        return 1
    fi
    _guard_pt_env=$(file_mktemp) || return 1
    guard_env_json > "$_guard_pt_env"
    _GUARD_PREFLIGHT_TEMPLATE_IDS=$(guard_template_matches "$_guard_pt_catalog" "$_guard_pt_env") || _GUARD_PREFLIGHT_TEMPLATE_IDS=
    rm -f "$_guard_pt_env"
    if [ -n "$_GUARD_PREFLIGHT_TEMPLATE_IDS" ]; then
        _GUARD_PREFLIGHT_TEMPLATE_REASON="matched against complete preflight environment"
    else
        _GUARD_PREFLIGHT_TEMPLATE_REASON="validated catalog has no matching template"
    fi
}

_guard_preflight_local_policy() {
    # Accept a locally-provided policy file from the environment without a network fetch.
    # This keeps preflight non-mutating and allows tests/operators to supply known-good files.
    _guard_plp_file=${GUARD_POLICY_FILE:-}
    if [ -n "$_guard_plp_file" ] && guard_policy_validate_file "$_guard_plp_file" >/dev/null 2>&1; then
        printf '%s\n' "$_guard_plp_file"
        return 0
    fi
    return 1
}

_guard_preflight_local_templates() {
    # Accept a locally-provided templates file from the environment.
    for _guard_plt_f in "${GUARD_TEMPLATES_FILE:-}" "${GUARD_TEMPLATES_SOURCE:-}"
    do
        [ -n "$_guard_plt_f" ] && guard_template_validate_file "$_guard_plt_f" >/dev/null 2>&1 || continue
        printf '%s\n' "$_guard_plt_f"
        return 0
    done
    # Try sibling of GUARD_POLICY_FILE
    _guard_plt_pol=${GUARD_POLICY_FILE:-}
    if [ -n "$_guard_plt_pol" ]; then
        _guard_plt_sib=$(dirname "$_guard_plt_pol")/openclash-guard-templates.json
        if guard_template_validate_file "$_guard_plt_sib" >/dev/null 2>&1; then
            printf '%s\n' "$_guard_plt_sib"
            return 0
        fi
    fi
    return 1
}

guard_preflight_run() {
    guard_preflight_cleanup
    _GUARD_PREFLIGHT_COMPLETE=0
    _GUARD_PREFLIGHT_SETUP_VALID=0
    _GUARD_PREFLIGHT_SETUP_REASON=
    _GUARD_PREFLIGHT_GUARD_INSTALLED=0
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    [ -x "$(_guard_install_bin)" ] && _GUARD_PREFLIGHT_GUARD_INSTALLED=1
    # Use locally-provided files when available; only fetch from network when none exist.
    _guard_pf_local_pol=$(_guard_preflight_local_policy 2>/dev/null) || _guard_pf_local_pol=
    _guard_pf_local_tpl=$(_guard_preflight_local_templates 2>/dev/null) || _guard_pf_local_tpl=
    if [ -n "$_guard_pf_local_pol" ] && [ -n "$_guard_pf_local_tpl" ]; then
        _GUARD_PREFLIGHT_POLICY_FILE=$_guard_pf_local_pol
        _GUARD_PREFLIGHT_TEMPLATES_FILE=$_guard_pf_local_tpl
        _GUARD_PREFLIGHT_SOURCE=local
        _GUARD_PREFLIGHT_POLICY_URL=
        _GUARD_PREFLIGHT_TEMPLATES_URL=
        _GUARD_PREFLIGHT_POLICY_TEMP=0
        _GUARD_PREFLIGHT_TEMPLATES_TEMP=0
    elif [ -n "$_guard_pf_local_pol" ] && [ -z "$_guard_pf_local_tpl" ]; then
        # Have policy but no templates: try network for templates only.
        guard_preflight_stage_distribution "${GUARD_DISTRIBUTION_SOURCE:-auto}" "${GUARD_POLICY_BASE_URL:-}" || true
    else
        guard_preflight_stage_distribution "${GUARD_DISTRIBUTION_SOURCE:-auto}" "${GUARD_POLICY_BASE_URL:-}" || true
    fi
    if [ -z "$_GUARD_PREFLIGHT_POLICY_FILE" ]; then
        # Network fetch may have failed or no network pair was found; fall back to local policy.
        if [ -n "$_guard_pf_local_pol" ]; then
            _GUARD_PREFLIGHT_POLICY_FILE=$_guard_pf_local_pol
        else
            _GUARD_PREFLIGHT_POLICY_FILE=$(_guard_preflight_installed_policy 2>/dev/null) || _GUARD_PREFLIGHT_POLICY_FILE=
        fi
    fi
    if [ -z "$_GUARD_PREFLIGHT_TEMPLATES_FILE" ]; then
        _GUARD_PREFLIGHT_TEMPLATES_FILE=$(_guard_preflight_installed_templates 2>/dev/null) || _GUARD_PREFLIGHT_TEMPLATES_FILE=
    fi
    _guard_preflight_geo_cache || {
        _GUARD_PREFLIGHT_DIRECT_REASON="unable to create temporary geo cache"
        _GUARD_PREFLIGHT_PROXY_REASON="unable to create temporary geo cache"
    }
    if [ -n "$_GUARD_PREFLIGHT_POLICY_FILE" ] && [ -n "$_GUARD_PREFLIGHT_CACHE_DIR" ]; then
        _guard_preflight_detect_direct || true
        _guard_preflight_detect_proxy || true
    else
        _GUARD_NET_DIRECT_REGION=
        _GUARD_PROXY_REGION=
        [ -n "$_GUARD_PREFLIGHT_DIRECT_REASON" ] || _GUARD_PREFLIGHT_DIRECT_REASON="no validated runtime policy is available for geo providers"
        [ -n "$_GUARD_PREFLIGHT_PROXY_REASON" ] || _GUARD_PREFLIGHT_PROXY_REASON="no validated runtime policy is available for geo providers"
    fi
    _guard_preflight_match_templates || true
    if guard_install_validate >/dev/null 2>&1; then
        _GUARD_PREFLIGHT_SETUP_VALID=1
        _GUARD_PREFLIGHT_SETUP_REASON="complete runtime validated"
    elif [ -n "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ] && \
         [ -f "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ] && \
         command -v uci >/dev/null 2>&1 && \
         [ "$(uci_get_default openclash_guard.main.enabled 0 2>/dev/null || printf 0)" = 1 ]; then
        _GUARD_PREFLIGHT_SETUP_VALID=1
        _GUARD_PREFLIGHT_SETUP_REASON="operational: policy loaded and Guard enabled in UCI"
    else
        _GUARD_PREFLIGHT_SETUP_REASON=${_GUARD_SETUP_INVALID_REASON:-runtime is not fully provisioned}
    fi
    _GUARD_PREFLIGHT_COMPLETE=1
}

guard_preflight_require_stage() {
    if [ "${_GUARD_PREFLIGHT_COMPLETE:-0}" != 1 ]; then
        guard_preflight_run
    fi
    if [ -f "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ] && \
       [ -f "${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}" ]; then
        return 0
    fi
    cli_error "Setup requires a validated policy/template pair: ${_GUARD_PREFLIGHT_SOURCE_REASON:-unavailable}"
    return 1
}
