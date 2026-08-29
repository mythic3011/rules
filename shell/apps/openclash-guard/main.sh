#!/bin/sh
# openclash-guard CLI: apply/reconcile/status/doctor/refresh/remove.
set -eu

_GUARD_JSON=0
_GUARD_LOCK_HELD=0

guard_usage() {
    printf '%s\n' "usage: openclash-guard apply|reconcile|status|doctor|refresh|remove|eval [--json] [--yes] [--dry-run] [--policy-file FILE]"
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

_guard_prepare() {
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    guard_policy_load "$(_guard_policy_default_path)" || return $?
    guard_policy_refresh_state
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
    if [ "$_GUARD_JSON" != 1 ]; then
        if ! cli_confirm "Remove openclash-guard nft table?"; then
            cli_warn "aborted"
            return 1
        fi
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
    _guard_url=${GUARD_POLICY_URL:-}
    if [ -z "$_guard_url" ] && command -v uci >/dev/null 2>&1; then
        _guard_url=$(uci_get_default openclash_guard.main.policy_url "" 2>/dev/null) || _guard_url=
    fi
    if [ -z "$_guard_url" ]; then
        cli_error "no policy URL (set GUARD_POLICY_URL or openclash_guard.main.policy_url)"
        return 1
    fi
    _guard_dest=$(_guard_policy_default_path)
    _guard_dir=$(dirname "$_guard_dest")
    if [ ! -d "$_guard_dir" ]; then
        cli_error "policy directory missing: $_guard_dir"
        return 1
    fi
    if ! fetch_atomic "$_guard_url" "$_guard_dest" guard_policy_validate_file; then
        cli_error "refresh failed; keeping last-known-good policy and firewall state"
        return 1
    fi
    guard_cmd_reconcile
}

_guard_emit_status_json() {
    _guard_sj=$(guard_env_json)
    _guard_sj=${_guard_sj%?}
    printf '%s,' "$_guard_sj"
    guard_policy_json_extra
    printf '}\n'
}

guard_cmd_status() {
    _guard_prepare || true
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
    cli_kv proxy.region "$(guard_env_get proxy.region)"
    cli_kv proxy.healthy "$(guard_env_get proxy.healthy)"
    cli_kv gaming.clients.count "$(guard_env_get gaming.clients.count)"
    cli_kv nft.available "$(guard_env_get nft.available)"
    cli_kv state "$_GUARD_POLICY_STATE"
    cli_kv enforcement "$_GUARD_POLICY_ENFORCEMENT"
}

guard_cmd_doctor() {
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

main() {
    _GUARD_JSON=0
    _guard_cmd=
    _guard_eval_args=
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
                GUARD_POLICY_FILE=$2
                shift 2
                ;;
            -h|--help)
                guard_usage
                return 0
                ;;
            apply|reconcile|status|doctor|refresh|remove|eval)
                if [ -n "$_guard_cmd" ]; then
                    cli_die "duplicate command" 2
                fi
                _guard_cmd=$1
                shift
                ;;
            --service|--proto|--dport|--src|--dest)
                _guard_eval_args="$_guard_eval_args $1 $2"
                shift 2
                ;;
            *)
                cli_die "unknown argument: $1" 2
                ;;
        esac
    done
    if [ -z "$_guard_cmd" ]; then
        guard_usage >&2
        return 2
    fi
    case $_guard_cmd in
        status|doctor|eval)
            ;;
        *)
            _guard_lock_acquire || return $?
            trap _guard_lock_release EXIT INT TERM
            ;;
    esac
    _guard_rc=0
    case $_guard_cmd in
        apply) guard_cmd_apply || _guard_rc=$? ;;
        reconcile) guard_cmd_reconcile || _guard_rc=$? ;;
        status) guard_cmd_status || _guard_rc=$? ;;
        doctor) guard_cmd_doctor || _guard_rc=$? ;;
        refresh) guard_cmd_refresh || _guard_rc=$? ;;
        remove) guard_cmd_remove || _guard_rc=$? ;;
        eval)
            # shellcheck disable=SC2086
            guard_cmd_eval $_guard_eval_args || _guard_rc=$?
            ;;
        *)
            guard_usage >&2
            _guard_rc=2
            ;;
    esac
    _guard_lock_release
    trap - EXIT INT TERM
    return "$_guard_rc"
}

main "$@"
