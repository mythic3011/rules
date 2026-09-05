#!/bin/sh
# openclash-guard CLI: lifecycle, diagnostics, templates, geo, and custom rules.
set -eu

_GUARD_JSON=0
_GUARD_LOCK_HELD=0

guard_usage() {
    printf '%s\n' "usage: openclash-guard apply|reconcile|status|doctor [SERVICE]|health-check|refresh|remove|eval|template|install|uninstall|geo|rules [--json] [--yes] [--dry-run] [--policy-file FILE]"
}

_guard_lock_path() {
    printf '%s\n' "${GUARD_LOCK_PATH:-/var/lock/openclash-guard.lock}"
}

_guard_lock_acquire() {
    _guard_lp=$(_guard_lock_path)
    lock_acquire "$_guard_lp" "${GUARD_LOCK_TIMEOUT:-30}" || return $?
    _GUARD_LOCK_HELD=1
}

_guard_lock_release() {
    if [ "$_GUARD_LOCK_HELD" = 1 ]; then
        lock_release "$(_guard_lock_path)" || true
        _GUARD_LOCK_HELD=0
    fi
}

_guard_distribution_state_path() {
    if [ -n "${GUARD_DISTRIBUTION_STATE_FILE:-}" ]; then
        printf '%s\n' "$GUARD_DISTRIBUTION_STATE_FILE"
    elif [ -n "${GUARD_POLICY_FILE:-}" ]; then
        printf '%s/distribution-state\n' "$(dirname "$GUARD_POLICY_FILE")"
    else
        printf '%s/etc/openclash-guard/distribution-state\n' "${GUARD_PREFIX:-}"
    fi
}

_guard_distribution_selected() {
    _guard_ds_file=$(_guard_distribution_state_path)
    [ -f "$_guard_ds_file" ] || return 1
    sed -n 's/^selectedSource=//p' "$_guard_ds_file" | head -n 1
}

_guard_distribution_record() {
    [ "${GUARD_DRY_RUN:-0}" = 1 ] && return 0
    _guard_dr_file=$(_guard_distribution_state_path)
    _guard_dr_preserve=${4:-0}
    if [ "$_guard_dr_preserve" = 1 ] && [ -f "$_guard_dr_file" ]; then
        _guard_dr_source=$(sed -n 's/^selectedSource=//p' "$_guard_dr_file" | head -n 1)
        _guard_dr_policy=$(sed -n 's/^policyURL=//p' "$_guard_dr_file" | head -n 1)
        _guard_dr_templates=$(sed -n 's/^templatesURL=//p' "$_guard_dr_file" | head -n 1)
        if [ "$_guard_dr_source" = "$1" ] && \
           [ "$_guard_dr_policy" = "${2:-}" ] && \
           [ "$_guard_dr_templates" = "${3:-}" ]; then
            return 0
        fi
    fi
    mkdir -p "$(dirname "$_guard_dr_file")"
    _guard_dr_tmp=$(file_mktemp "$(dirname "$_guard_dr_file")") || return 1
    printf 'selectedSource=%s\npolicyURL=%s\ntemplatesURL=%s\nlastRefresh=%s\n' \
        "$1" "${2:-}" "${3:-}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$_guard_dr_tmp"
    file_atomic_replace "$_guard_dr_file" "$_guard_dr_tmp"
    _guard_dr_rc=$?
    rm -f "$_guard_dr_tmp"
    return "$_guard_dr_rc"
}

_guard_prepare() {
    _guard_pp_direct=${_GUARD_NET_DIRECT_REGION:-}
    _guard_pp_proxy=${_GUARD_PROXY_REGION:-}
    _guard_pp_proxy_healthy=${_GUARD_PROXY_HEALTHY:-0}
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    if [ "${_GUARD_PREFLIGHT_COMPLETE:-0}" = 1 ]; then
        _GUARD_NET_DIRECT_REGION=$_guard_pp_direct
        _GUARD_PROXY_REGION=$_guard_pp_proxy
        _GUARD_PROXY_HEALTHY=$_guard_pp_proxy_healthy
    fi
    guard_policy_load "$(_guard_policy_default_path)" || return $?
    if [ -z "$_GUARD_NET_DIRECT_REGION" ]; then
        guard_geo_detect_direct >/dev/null 2>&1 || true
        _GUARD_NET_DIRECT_REGION=$(guard_geo_cached_country direct 2>/dev/null) || _GUARD_NET_DIRECT_REGION=
    fi
    if [ -z "$_GUARD_PROXY_REGION" ] && [ -n "${GUARD_GEO_ROUTE:-}" ]; then
        guard_geo_detect_route "$GUARD_GEO_ROUTE" >/dev/null 2>&1 || true
        _GUARD_PROXY_REGION=$(guard_geo_cached_country route "$GUARD_GEO_ROUTE" 2>/dev/null) || _GUARD_PROXY_REGION=
    fi
    guard_policy_refresh_state
}

_guard_prepare_readonly() {
    if [ "${_GUARD_PREFLIGHT_COMPLETE:-0}" != 1 ]; then
        guard_preflight_run
    fi
    _guard_pr_policy=$(_guard_policy_default_path)
    if [ ! -f "$_guard_pr_policy" ] && [ -f "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ]; then
        _guard_pr_policy=$_GUARD_PREFLIGHT_POLICY_FILE
    fi
    if guard_policy_load "$_guard_pr_policy" >/dev/null 2>&1; then
        guard_policy_refresh_state
        return 0
    fi
    _GUARD_POLICY_STATE=uninitialized
    _GUARD_POLICY_ENFORCEMENT=unavailable
    return 1
}

_guard_require_setup_for_apply() {
    if guard_install_validate >/dev/null 2>&1; then
        return 0
    fi
    if [ -n "${GUARD_POLICY_FILE:-}" ] && \
       guard_policy_validate_file "$GUARD_POLICY_FILE" >/dev/null 2>&1 && \
       command -v uci >/dev/null 2>&1 && \
       [ "$(uci_get_default openclash_guard.main.enabled 0 2>/dev/null || printf 0)" = 1 ]; then
        return 0
    fi
    cli_error "Apply is blocked until Setup validates: ${_GUARD_SETUP_INVALID_REASON:-runtime is incomplete}"
    return 1
}

_guard_write_batch() {
    _guard_wb=$1
    : > "$_guard_wb"
    {
        guard_kill_render
        guard_game_render
    } >> "$_guard_wb"
}

guard_cmd_reconcile() {
    if [ "${_GUARD_PREFLIGHT_COMPLETE:-0}" != 1 ]; then
        guard_preflight_run
    fi
    _guard_require_setup_for_apply || return $?
    _guard_prepare || return $?
    if [ "$_GUARD_NFT_AVAILABLE" != 1 ]; then
        cli_error "nft is required"
        return 1
    fi
    guard_migrate_stale
    if [ "$_GUARD_UCI_ENABLED" != 1 ]; then
        guard_kill_delete_table
        cli_info "openclash-guard disabled"
        return 0
    fi
    _guard_batch=$(file_mktemp)
    _GUARD_NFT_TABLE_EXISTS=0
    if nft_table_exists "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE"; then
        _GUARD_NFT_TABLE_EXISTS=1
    fi
    _guard_write_batch "$_guard_batch"
    guard_kill_apply_batch "$_guard_batch"
    _guard_rc=$?
    rm -f "$_guard_batch"
    if [ "$_guard_rc" -ne 0 ]; then
        return "$_guard_rc"
    fi
    cli_info "reconciled table $_GUARD_NFT_FAMILY $_GUARD_NFT_TABLE (state=$_GUARD_POLICY_STATE enforcement=$_GUARD_POLICY_ENFORCEMENT)"
}

guard_cmd_apply() {
    guard_cmd_reconcile
}

guard_cmd_remove() {
    if ! cli_confirm "Remove openclash-guard nft table?"; then
        cli_warn "aborted"
        return 1
    fi
    guard_kill_read_uci
    guard_env_detect
    if [ -f "$(_guard_policy_default_path)" ]; then
        guard_policy_load "$(_guard_policy_default_path)" 2>/dev/null || true
    fi
    guard_migrate_stale
    guard_kill_delete_table
    cli_info "removed openclash-guard table"
}

guard_cmd_refresh() {
    _guard_refresh_source=${GUARD_DISTRIBUTION_SOURCE:-auto}
    _guard_refresh_base=${GUARD_POLICY_BASE_URL:-}
    _guard_refresh_url=
    _guard_refresh_templates_url=
    while [ "$#" -gt 0 ]; do
        case $1 in
            --source) _guard_refresh_source=$2; shift 2 ;;
            --base-url) _guard_refresh_base=$2; shift 2 ;;
            --policy-url) _guard_refresh_url=$2; shift 2 ;;
            --templates-url) _guard_refresh_templates_url=$2; shift 2 ;;
            *) cli_error "unknown refresh option: $1"; return 2 ;;
        esac
    done
    if [ -n "$_guard_refresh_url" ] || [ -n "$_guard_refresh_templates_url" ]; then
        if [ -z "$_guard_refresh_url" ] || [ -z "$_guard_refresh_templates_url" ]; then
            cli_error "--policy-url and --templates-url must be supplied together"
            return 2
        fi
        _guard_refresh_policy=$(file_mktemp) || return 1
        _guard_refresh_templates=$(file_mktemp) || {
            rm -f "$_guard_refresh_policy"
            return 1
        }
        if ! fetch_http "$_guard_refresh_url" "$_guard_refresh_policy" || \
           ! guard_policy_validate_file "$_guard_refresh_policy" || \
           ! fetch_http "$_guard_refresh_templates_url" "$_guard_refresh_templates" || \
           ! guard_template_validate_file "$_guard_refresh_templates"; then
            rm -f "$_guard_refresh_policy" "$_guard_refresh_templates"
            cli_error "refresh failed; keeping the installed runtime pair"
            return 1
        fi
        _GUARD_PREFLIGHT_POLICY_FILE=$_guard_refresh_policy
        _GUARD_PREFLIGHT_TEMPLATES_FILE=$_guard_refresh_templates
        _GUARD_PREFLIGHT_POLICY_TEMP=1
        _GUARD_PREFLIGHT_TEMPLATES_TEMP=1
        _GUARD_PREFLIGHT_SOURCE=override
        _GUARD_PREFLIGHT_POLICY_URL=$_guard_refresh_url
        _GUARD_PREFLIGHT_TEMPLATES_URL=$_guard_refresh_templates_url
    elif ! guard_preflight_stage_distribution "$_guard_refresh_source" "$_guard_refresh_base"; then
        cli_error "refresh failed; keeping the installed runtime pair: $_GUARD_PREFLIGHT_SOURCE_REASON"
        return 1
    fi
    _guard_dest=$(_guard_policy_default_path)
    _guard_dir=$(dirname "$_guard_dest")
    if [ ! -d "$_guard_dir" ]; then
        cli_error "policy directory missing: $_guard_dir"
        return 1
    fi
    _guard_templates_dest="$_guard_dir/openclash-guard-templates.json"
    if ! file_atomic_replace "$_guard_dest" "$_GUARD_PREFLIGHT_POLICY_FILE" || \
       ! file_atomic_replace "$_guard_templates_dest" "$_GUARD_PREFLIGHT_TEMPLATES_FILE"; then
        cli_error "refresh failed while publishing the validated runtime pair"
        return 1
    fi
    GUARD_POLICY_FILE=$_guard_dest
    GUARD_TEMPLATES_FILE=$_guard_templates_dest
    if ! guard_policy_validate_file "$_guard_dest" || ! guard_template_validate_file "$_guard_templates_dest"; then
        cli_error "published runtime pair failed post-write validation"
        return 1
    fi
    _guard_distribution_record "$_GUARD_PREFLIGHT_SOURCE" "$_GUARD_PREFLIGHT_POLICY_URL" "$_GUARD_PREFLIGHT_TEMPLATES_URL" || return $?
    cli_success "runtime policy and template catalog refreshed; Apply remains pending"
}

_guard_emit_status_json() {
    _guard_sj=$(guard_env_json)
    _guard_sj=${_guard_sj%?}
    printf '%s,' "$_guard_sj"
    guard_policy_json_extra
    guard_doctor_json_extra
    printf '}\n'
}

guard_doctor_json_extra() {
    [ -n "${_guard_doctor_service:-}" ] || return 0
    printf ',"dependencies":{'
    _guard_dj_first=1
    # shellcheck disable=SC2153
    _guard_dj_deps=$(json_keys "$_GUARD_POLICY_FILE" "services.$_guard_doctor_service.dependencies" 2>/dev/null) || _guard_dj_deps=
    for _guard_dj_dep in $_guard_dj_deps; do
        _guard_dj_base="services.$_guard_doctor_service.dependencies.$_guard_dj_dep"
        _guard_dj_required=$(json_get "$_GUARD_POLICY_FILE" "$_guard_dj_base.required" 2>/dev/null) || _guard_dj_required=true
        _guard_dj_status=PASS
        if [ "$_guard_dj_required" = true ]; then
            _guard_dj_healthy=$(json_get "${GUARD_DEPENDENCY_STATUS_FILE:-}" "$_guard_dj_base.healthy" 2>/dev/null) || _guard_dj_healthy=unknown
            _guard_dj_compatible=$(json_get "${GUARD_DEPENDENCY_STATUS_FILE:-}" "$_guard_dj_base.routeCompatible" 2>/dev/null) || _guard_dj_compatible=true
            if [ "$_guard_dj_healthy" = false ] || [ "$_guard_dj_compatible" = false ]; then
                _guard_dj_status=FAIL
            elif [ "$_guard_dj_healthy" = unknown ]; then
                _guard_dj_status=UNKNOWN
            fi
        fi
        [ "$_guard_dj_first" = 1 ] || printf ','
        _guard_dj_first=0
        printf '"%s":{"status":"%s","required":%s}' \
            "$(_guard_env_json_string "$_guard_dj_dep")" "$_guard_dj_status" "$_guard_dj_required"
    done
    printf '}'
}

guard_cmd_status() {
    _guard_prepare_readonly || true
    if [ "$_GUARD_JSON" = 1 ]; then
        _guard_emit_status_json
        return 0
    fi
    cli_section "openclash-guard status"
    cli_kv openclash.installed "$(guard_env_get openclash.installed)"
    cli_kv openclash.enabled "$(guard_env_get openclash.enabled)"
    cli_kv openclash.running "$(guard_env_get openclash.running)"
    cli_kv openclash.healthy "$(guard_env_get openclash.healthy)"
    cli_kv dns.backend "$(guard_env_get dns.backend)"
    cli_kv dns.domainSetBackend "$(guard_env_get dns.domainSetBackend)"
    cli_kv network.directRegion "$(guard_env_get network.directRegion)"
    if [ -z "$_GUARD_NET_DIRECT_REGION" ]; then
        cli_kv network.directRegionReason "$(guard_env_get network.directRegionReason)"
    fi
    cli_kv proxy.region "$(guard_env_get proxy.region)"
    if [ -z "$_GUARD_PROXY_REGION" ]; then
        cli_kv proxy.regionReason "$(guard_env_get proxy.regionReason)"
    fi
    cli_kv proxy.route "$(guard_env_get proxy.route)"
    cli_kv proxy.healthy "$(guard_env_get proxy.healthy)"
    cli_kv gaming.clients.count "$(guard_env_get gaming.clients.count)"
    cli_kv nft.available "$(guard_env_get nft.available)"
    cli_kv state "$_GUARD_POLICY_STATE"
    cli_kv enforcement "$_GUARD_POLICY_ENFORCEMENT"
    cli_kv distribution.selectedSource "$(_guard_distribution_selected 2>/dev/null || printf 'none')"
}

guard_cmd_doctor() {
    _guard_doctor_service=
    while [ "$#" -gt 0 ]; do
        case $1 in
            --json) _GUARD_JSON=1; shift ;;
            --yes) shift ;;
            *)
                [ -z "$_guard_doctor_service" ] || { cli_error "unknown doctor option: $1"; return 2; }
                _guard_doctor_service=$1
                shift
                ;;
        esac
    done
    guard_cmd_status
    if [ "$_GUARD_JSON" = 1 ]; then
        return 0
    fi
    cli_section "doctor"
    cli_kv dns.dnsmasqEnabled "$(guard_env_get dns.dnsmasqEnabled)"
    cli_kv dns.dnsmasqRunning "$(guard_env_get dns.dnsmasqRunning)"
    cli_kv dns.adguardhomeEnabled "$(guard_env_get dns.adguardhomeEnabled)"
    cli_kv dns.adguardhomeRunning "$(guard_env_get dns.adguardhomeRunning)"
    if [ "$_GUARD_DNS_BACKEND" = adguardhome ]; then
        cli_info "AdGuard Home owns DNS; dnsmasq will not be enabled, started, or restarted"
    fi
    if [ "$_GUARD_DNS_DOMAIN_SET" = unavailable ] && guard_policy_needs_failclosed 2>/dev/null; then
        cli_warn "domain-set backend unavailable; fail-closed enforcement=reject (not fail-open)"
    fi
    cli_info "gaming bypass never matches protected UDP ports (including 443)"
    if [ -n "$_guard_doctor_service" ]; then
        # shellcheck disable=SC2153
        if ! json_has "$_GUARD_POLICY_FILE" "services.$_guard_doctor_service"; then
            cli_error "unknown service: $_guard_doctor_service"
            return 2
        fi
        cli_section "$_guard_doctor_service dependency check"
        _guard_doctor_dependencies=$(json_keys "$_GUARD_POLICY_FILE" "services.$_guard_doctor_service.dependencies" 2>/dev/null) || _guard_doctor_dependencies=
        if [ -z "$_guard_doctor_dependencies" ]; then
            cli_info "no configured dependencies"
            return 0
        fi
        for _guard_doctor_dep in $_guard_doctor_dependencies
        do
            _guard_doctor_base="services.$_guard_doctor_service.dependencies.$_guard_doctor_dep"
            _guard_doctor_host=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.host") || _guard_doctor_host=
            _guard_doctor_role=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.role") || _guard_doctor_role=
            _guard_doctor_required=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.required") || _guard_doctor_required=false
            _guard_doctor_route=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.routePolicy") || _guard_doctor_route=
            _guard_doctor_path=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.path") || _guard_doctor_path=/
            _guard_doctor_granularity=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.matcher.availableGranularity") || _guard_doctor_granularity=host
            _guard_doctor_scope=$(json_get "$_GUARD_POLICY_FILE" "$_guard_doctor_base.matcher.scopeExpansion") || _guard_doctor_scope=false
            _guard_doctor_status=PASS
            if [ "$_guard_doctor_required" = true ]; then
                _guard_doctor_healthy=$(json_get "${GUARD_DEPENDENCY_STATUS_FILE:-}" "$_guard_doctor_base.healthy" 2>/dev/null) || _guard_doctor_healthy=unknown
                _guard_doctor_compatible=$(json_get "${GUARD_DEPENDENCY_STATUS_FILE:-}" "$_guard_doctor_base.routeCompatible" 2>/dev/null) || _guard_doctor_compatible=true
                if [ "$_guard_doctor_healthy" = false ] || [ "$_guard_doctor_compatible" = false ]; then
                    _guard_doctor_status=FAIL
                elif [ "$_guard_doctor_healthy" = unknown ]; then
                    _guard_doctor_status=UNKNOWN
                fi
            fi
            printf '  %s [%s] %s\n' "$_guard_doctor_dep" "$_guard_doctor_status" "$_guard_doctor_host"
            cli_kv role "$_guard_doctor_role"
            cli_kv required "$_guard_doctor_required"
            cli_kv routePolicy "$_guard_doctor_route"
            cli_kv path "$_guard_doctor_path"
            cli_kv matcher "$_guard_doctor_granularity"
            if [ "$_guard_doctor_scope" = true ]; then
                cli_warn "host matcher broadens path scope; explicit approval required"
            fi
        done
    fi
}

guard_cmd_geo() {
    _guard_geo_sub=${1:-}
    if [ "$#" -gt 0 ]; then
        shift
    fi
    case $_guard_geo_sub in
        direct)
            _guard_prepare_readonly || true
            guard_geo_detect_direct
            ;;
        route)
            if [ -z "${1:-}" ]; then
                cli_error "usage: openclash-guard geo route <id>"
                return 2
            fi
            _guard_prepare_readonly || true
            if [ -z "${_GUARD_GEO_PROXY_URL:-}" ]; then
                guard_geo_discover_proxy_route || {
                    cli_error "${_GUARD_GEO_ROUTE_REASON:-OpenClash proxy route is unavailable}"
                    return 1
                }
            fi
            guard_geo_detect_route "$1"
            ;;
        *)
            printf '%s\n' "usage: openclash-guard geo direct|route <id>" >&2
            return 2
            ;;
    esac
}

guard_cmd_eval() {
    _guard_ev_svc=
    _guard_ev_proto=udp
    _guard_ev_dport=
    _guard_ev_src=
    _guard_ev_dest=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --service)
                _guard_ev_svc=$2
                shift 2
                ;;
            --proto)
                _guard_ev_proto=$2
                shift 2
                ;;
            --dport)
                _guard_ev_dport=$2
                shift 2
                ;;
            --src)
                _guard_ev_src=$2
                shift 2
                ;;
            --dest)
                _guard_ev_dest=$2
                shift 2
                ;;
            *)
                cli_die "unknown eval option: $1" 2
                ;;
        esac
    done
    _guard_prepare || return $?
    _guard_ev_verdict=$(guard_policy_eval "$_guard_ev_svc" "$_guard_ev_proto" "$_guard_ev_dport" "$_guard_ev_src" "$_guard_ev_dest")
    if [ "$_GUARD_JSON" = 1 ]; then
        printf '{"verdict":"%s","service":"%s","proto":"%s","dport":"%s","src":"%s","dest":"%s"}\n' \
            "$(_guard_env_json_string "$_guard_ev_verdict")" \
            "$(_guard_env_json_string "$_guard_ev_svc")" \
            "$(_guard_env_json_string "$_guard_ev_proto")" \
            "$(_guard_env_json_string "$_guard_ev_dport")" \
            "$(_guard_env_json_string "$_guard_ev_src")" \
            "$(_guard_env_json_string "$_guard_ev_dest")"
        return 0
    fi
    printf '%s\n' "$_guard_ev_verdict"
}

_guard_cmd_needs_lock() {
    case $1 in
        status|doctor|health-check|eval|geo)
            return 1
            ;;
        rules)
            case ${2:-} in
                list)
                    return 1
                    ;;
                sync)
                    case ${3:-} in
                        list|watch) return 1 ;;
                    esac
                    ;;
            esac
            return 0
            ;;
        template)
            case $2 in
                apply)
                    return 0
                    ;;
                *)
                    return 1
                    ;;
            esac
            ;;
        *)
            return 0
            ;;
    esac
}

_guard_dispatch() {
    _guard_dispatch_cmd=${1:-}
    [ -n "$_guard_dispatch_cmd" ] || return 2
    shift
    if _guard_cmd_needs_lock "$_guard_dispatch_cmd" "${1:-}" "${2:-}"; then
        _guard_lock_acquire || return $?
        trap _guard_lock_release EXIT INT TERM
    fi
    _guard_dispatch_rc=0
    case $_guard_dispatch_cmd in
        apply) guard_cmd_apply || _guard_dispatch_rc=$? ;;
        reconcile) guard_cmd_reconcile || _guard_dispatch_rc=$? ;;
        status) guard_cmd_status || _guard_dispatch_rc=$? ;;
        doctor) guard_cmd_doctor "$@" || _guard_dispatch_rc=$? ;;
        health-check) guard_cmd_health_check "$@" || _guard_dispatch_rc=$? ;;
        refresh) guard_cmd_refresh "$@" || _guard_dispatch_rc=$? ;;
        remove) guard_cmd_remove || _guard_dispatch_rc=$? ;;
        eval) guard_cmd_eval "$@" || _guard_dispatch_rc=$? ;;
        template) guard_cmd_template "$@" || _guard_dispatch_rc=$? ;;
        install) guard_cmd_install "$@" || _guard_dispatch_rc=$? ;;
        uninstall) guard_cmd_uninstall "$@" || _guard_dispatch_rc=$? ;;
        geo) guard_cmd_geo "$@" || _guard_dispatch_rc=$? ;;
        rules) guard_cmd_rules "$@" || _guard_dispatch_rc=$? ;;
        *) guard_usage >&2; _guard_dispatch_rc=2 ;;
    esac
    _guard_lock_release
    trap - EXIT INT TERM
    return "$_guard_dispatch_rc"
}

main() {
    _GUARD_JSON=0
    _guard_cmd=
    if [ "$#" -eq 0 ]; then
        if cli_has_controlling_tty; then
            guard_menu
            return $?
        fi
        cli_error "no controlling terminal; pass a subcommand for headless use"
        guard_usage >&2
        return 2
    fi
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --json)
                _GUARD_JSON=1
                shift
                ;;
            --yes|-y)
                cli_set_assume_yes 1
                shift
                ;;
            --dry-run)
                GUARD_DRY_RUN=1
                shift
                ;;
            --policy-file)
                # shellcheck disable=SC2034
                GUARD_POLICY_FILE=$2
                shift 2
                ;;
            -h|--help)
                guard_usage
                return 0
                ;;
            apply|reconcile|status|doctor|health-check|refresh|remove|eval|template|install|uninstall|geo|rules)
                [ -z "$_guard_cmd" ] || break
                _guard_cmd=$1
                shift
                ;;
            *)
                [ -n "$_guard_cmd" ] && break
                cli_die "unknown argument: $1" 2
                ;;
        esac
    done
    if [ -z "$_guard_cmd" ]; then
        guard_usage >&2
        return 2
    fi
    _guard_dispatch "$_guard_cmd" "$@"
}

main "$@"
