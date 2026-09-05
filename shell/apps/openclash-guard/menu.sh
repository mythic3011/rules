#!/bin/sh
# Interactive /dev/tty frontend over the existing guard command functions.
# Prefix: guard_menu_
set -eu

_guard_menu_value() {
    if [ -n "${1:-}" ]; then
        printf '%s\n' "$1" | tr 'a-z' 'A-Z'
    else
        printf '%s\n' "unknown"
    fi
}

_guard_menu_environment() {
    _guard_me_openclash="installed=$_GUARD_OC_INSTALLED enabled=$_GUARD_OC_ENABLED running=$_GUARD_OC_RUNNING healthy=$_GUARD_OC_HEALTHY"
    _guard_me_dns=$_GUARD_DNS_BACKEND
    [ "$_guard_me_dns" = adguardhome ] && _guard_me_dns="AdGuard Home"
    [ "$_guard_me_dns" = none ] && _guard_me_dns=unknown
    _guard_me_guard=uninitialized
    [ "$_GUARD_PREFLIGHT_SETUP_VALID" = 1 ] && _guard_me_guard=valid
    _guard_me_source=$_GUARD_PREFLIGHT_SOURCE
    if [ -z "$_guard_me_source" ]; then
        _guard_me_source=$(_guard_distribution_selected 2>/dev/null) || _guard_me_source=unknown
    fi
    _guard_me_templates=$(printf '%s' "$_GUARD_PREFLIGHT_TEMPLATE_IDS" | tr '\n' ' ')
    [ -n "$_guard_me_templates" ] || _guard_me_templates=none

    cli_section "OpenClash Guard"
    printf '\nDetected environment\n'
    cli_kv "  OpenClash" "$_guard_me_openclash"
    cli_kv "  DNS backend / ownership" "$_guard_me_dns / $_GUARD_DNS_DOMAIN_SET"
    cli_kv "  Direct region" "$(_guard_menu_value "$_GUARD_NET_DIRECT_REGION")"
    [ -n "$_GUARD_NET_DIRECT_REGION" ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_DIRECT_REASON"
    cli_kv "  Proxy region" "$(_guard_menu_value "$_GUARD_PROXY_REGION")"
    [ -n "$_GUARD_PROXY_REGION" ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_PROXY_REASON"
    cli_kv "  Proxy health" "$_GUARD_PROXY_HEALTHY"
    cli_kv "  Routing capability" "${_GUARD_GEO_ROUTE:-unavailable}"
    cli_kv "  Guard runtime" "$_guard_me_guard"
    [ "$_GUARD_PREFLIGHT_SETUP_VALID" = 1 ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_SETUP_REASON"
    cli_kv "  Distribution source" "$_guard_me_source"
    [ -n "$_GUARD_PREFLIGHT_SOURCE" ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_SOURCE_REASON"
    cli_kv "  Matching templates" "$_guard_me_templates"
    [ -n "$_GUARD_PREFLIGHT_TEMPLATE_IDS" ] || cli_kv "    Reason" "$_GUARD_PREFLIGHT_TEMPLATE_REASON"
}

_guard_menu_setup() {
    _guard_dispatch install || return $?
    guard_preflight_run
    if [ "$_GUARD_PREFLIGHT_SETUP_VALID" != 1 ]; then
        cli_error "Setup returned without a valid runtime: $_GUARD_PREFLIGHT_SETUP_REASON"
        return 1
    fi
    if cli_confirm "Setup is valid. Apply / reconcile now?"; then
        _guard_dispatch reconcile
    else
        cli_info "Setup is valid; Apply remains pending"
    fi
}

_guard_menu_confirm_dispatch() {
    _guard_mc_prompt=$1
    shift
    if ! cli_confirm "$_guard_mc_prompt"; then
        cli_warn "aborted"
        return 1
    fi
    _guard_dispatch "$@"
}

guard_menu() {
    guard_preflight_run
    while :; do
        printf '\n'
        _guard_menu_environment
        printf '\nActions\n'
        if [ "$_GUARD_PREFLIGHT_SETUP_VALID" = 1 ]; then
            printf '%s\n' \
                "  1. Refresh runtime assets    [mutating]" \
                "  2. Apply / reconcile         [mutating]" \
                "  3. Status                    [read-only]" \
                "  4. Doctor                    [read-only]" \
                "  5. Remove firewall rules     [mutating]" \
                "  6. Health check              [read-only]" \
                "  7. List staged custom rules  [read-only]" \
                "  8. Uninstall Guard           [mutating]" \
                "  0. Exit"
        else
            printf '%s\n' \
                "  1. Setup                     [mutating]" \
                "  2. Status                    [read-only]" \
                "  3. Doctor                    [read-only]" \
                "  0. Exit"
        fi
        printf '\nSelect an action: ' >&2
        _guard_menu_choice=$(cli_read_tty) || return 0
        printf '\n'
        if [ "$_GUARD_PREFLIGHT_SETUP_VALID" = 1 ]; then
            case $_guard_menu_choice in
                1) _guard_menu_confirm_dispatch "Refresh the validated runtime assets?" refresh --source auto || true; guard_preflight_run || true ;;
                2) _guard_menu_confirm_dispatch "Apply OpenClash Guard firewall policy?" reconcile || true; guard_preflight_run || true ;;
                3) _guard_dispatch status || true ;;
                4) _guard_dispatch doctor || true ;;
                5) _guard_dispatch remove || true; guard_preflight_run || true ;;
                6) _guard_dispatch health-check || true ;;
                7) _guard_dispatch rules list || true ;;
                8) if _guard_menu_confirm_dispatch "Uninstall OpenClash Guard and preserve staged rule data?" uninstall --yes; then return 0; fi ;;
                0) return 0 ;;
                *) cli_warn "unknown menu choice: $_guard_menu_choice" ;;
            esac
        else
            case $_guard_menu_choice in
                1) _guard_menu_setup || true; guard_preflight_run || true ;;
                2) _guard_dispatch status || true ;;
                3) _guard_dispatch doctor || true ;;
                0) return 0 ;;
                *) cli_warn "unknown menu choice: $_guard_menu_choice" ;;
            esac
        fi
    done
}
