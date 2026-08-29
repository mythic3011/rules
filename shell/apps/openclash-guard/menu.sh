#!/bin/sh
# Interactive /dev/tty frontend over the existing guard command functions.
# Prefix: guard_menu_
set -eu

_guard_menu_value() {
    if [ -n "${1:-}" ]; then
        printf '%s\n' "$1"
    else
        printf '%s\n' "unknown"
    fi
}

_guard_menu_environment() {
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    _guard_me_policy=$(_guard_policy_default_path)
    _guard_me_policy_state=missing
    if [ -f "$_guard_me_policy" ] && guard_policy_load "$_guard_me_policy" 2>/dev/null; then
        _guard_me_policy_state=loaded
    fi
    _guard_me_openclash=not-installed
    if [ "$_GUARD_OC_INSTALLED" = 1 ]; then
        _guard_me_openclash=stopped
        [ "$_GUARD_OC_RUNNING" = 1 ] && _guard_me_openclash=running
    fi
    _guard_me_dns=$_GUARD_DNS_BACKEND
    [ "$_guard_me_dns" = adguardhome ] && _guard_me_dns="AdGuard Home"
    [ "$_guard_me_dns" = none ] && _guard_me_dns=unknown

    cli_section "OpenClash Guard"
    printf '\nEnvironment\n'
    cli_kv "  OpenClash" "$_guard_me_openclash"
    cli_kv "  DNS backend" "$_guard_me_dns"
    cli_kv "  Direct region" "$(_guard_menu_value "$_GUARD_NET_DIRECT_REGION")"
    cli_kv "  Proxy region" "$(_guard_menu_value "$_GUARD_PROXY_REGION")"
    cli_kv "  Policy" "$_guard_me_policy_state"
    cli_kv "  Source" "$(_guard_distribution_selected 2>/dev/null || printf 'auto')"
}

_guard_menu_setup() {
    _guard_dispatch install --no-refresh || return $?
    _guard_dispatch refresh --source auto || return $?
    cli_success "setup complete"
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
    while :; do
        printf '\n'
        _guard_menu_environment
        printf '\nActions\n'
        printf '%s\n' \
            "  1. Setup / initialize        [mutating]" \
            "  2. Refresh policy            [mutating]" \
            "  3. Apply / reconcile         [mutating]" \
            "  4. Status                    [read-only]" \
            "  5. Doctor                    [read-only]" \
            "  6. Template suggestions      [read-only]" \
            "  7. Geo / route detection     [read-only]" \
            "  8. Remove firewall rules     [mutating]" \
            "  0. Exit"
        printf '\nSelect an action: ' >&2
        _guard_menu_choice=$(cli_read_tty) || return 0
        printf '\n'
        case $_guard_menu_choice in
            1) _guard_menu_setup || true ;;
            2) _guard_menu_confirm_dispatch "Refresh the runtime policy?" refresh --source auto || true ;;
            3) _guard_menu_confirm_dispatch "Apply OpenClash Guard firewall policy?" reconcile || true ;;
            4) _guard_dispatch status || true ;;
            5) _guard_dispatch doctor || true ;;
            6) _guard_dispatch template suggest || true ;;
            7) _guard_dispatch geo direct || true ;;
            8) _guard_dispatch remove || true ;;
            0) return 0 ;;
            *) cli_warn "unknown menu choice: $_guard_menu_choice" ;;
        esac
    done
}
