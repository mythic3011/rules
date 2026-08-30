#!/bin/sh
# Interactive and headless installer. Headless never prompts.
# Prefix: guard_install_
set -eu

_guard_install_root() {
    printf '%s\n' "${GUARD_PREFIX:-}"
}

_guard_install_bin() {
    printf '%s/usr/bin/openclash-guard\n' "$(_guard_install_root)"
}

_guard_install_etc() {
    printf '%s/etc/openclash-guard\n' "$(_guard_install_root)"
}

_guard_install_init() {
    printf '%s/etc/init.d/openclash-guard\n' "$(_guard_install_root)"
}

_guard_install_hotplug() {
    printf '%s/etc/hotplug.d/firewall/99-openclash-guard\n' "$(_guard_install_root)"
}

_guard_install_fw4() {
    printf '%s/etc/openclash-guard/fw4.include\n' "$(_guard_install_root)"
}

_guard_install_oc_hook() {
    printf '%s/usr/lib/openclash-guard/on-openclash-restart\n' "$(_guard_install_root)"
}

_guard_install_observations() {
    printf '%s/environment.json\n' "$(_guard_install_etc)"
}

_guard_install_write() {
    _guard_iw_dest=$1
    _guard_iw_mode=${2:-0644}
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would write %s\n' "$_guard_iw_dest"
        cat >/dev/null
        return 0
    fi
    mkdir -p "$(dirname "$_guard_iw_dest")"
    cat > "$_guard_iw_dest"
    chmod "$_guard_iw_mode" "$_guard_iw_dest"
}

_guard_install_copy() {
    _guard_ic_src=$1
    _guard_ic_dest=$2
    _guard_ic_mode=${3:-0644}
    if [ ! -f "$_guard_ic_src" ]; then
        return 1
    fi
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would copy %s -> %s\n' "$_guard_ic_src" "$_guard_ic_dest"
        return 0
    fi
    mkdir -p "$(dirname "$_guard_ic_dest")"
    cp "$_guard_ic_src" "$_guard_ic_dest"
    chmod "$_guard_ic_mode" "$_guard_ic_dest"
}

_guard_install_self() {
    _guard_is_dest=$(_guard_install_bin)
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would install %s\n' "$_guard_is_dest"
        return 0
    fi
    mkdir -p "$(dirname "$_guard_is_dest")"
    _guard_is_source=${GUARD_SELF_PATH:-$0}
    if [ -f "$_guard_is_source" ] && guard_distribution_validate_bundle "$_guard_is_source"; then
        file_atomic_replace "$_guard_is_dest" "$_guard_is_source" || return $?
        chmod 0755 "$_guard_is_dest"
        return 0
    fi
    cli_info "script is running from stdin; fetching the verified published bundle"
    if ! guard_distribution_fetch_bundle "$_guard_is_dest" auto; then
        cli_error "unable to install a verified OpenClash Guard bundle"
        return 1
    fi
}

_guard_install_shebang() {
    printf '%s%s\n' '#!' "${1:-/bin/sh}"
}

_guard_install_script() {
    _guard_is_dest=$1
    _guard_is_interp=$2
    _guard_is_body=$3
    {
        _guard_install_shebang "$_guard_is_interp"
        printf '%s' "$_guard_is_body"
    } | _guard_install_write "$_guard_is_dest" 0755
}

_guard_install_hooks() {
    _guard_ih_bin=$(_guard_install_bin)
    _guard_install_script "$(_guard_install_init)" "/bin/sh /etc/rc.common" "\
# OpenClash Guard boot reconcile. Does not enable OpenClash.
START=99
STOP=10

start() {
	${_guard_ih_bin} reconcile
}

reload() {
	start
}

restart() {
	start
}
"
    _guard_ih_body="# Re-apply owned table. Does not enable OpenClash.
[ -x ${_guard_ih_bin} ] || exit 0
${_guard_ih_bin} reconcile
"
    _guard_install_script "$(_guard_install_hotplug)" "/bin/sh" "# fw4/firewall reload hook.
${_guard_ih_body}"
    _guard_install_script "$(_guard_install_fw4)" "/bin/sh" "# fw4 include.
${_guard_ih_body}"
    _guard_install_script "$(_guard_install_oc_hook)" "/bin/sh" "# Observe OpenClash restart.
${_guard_ih_body}"
    _guard_ih_oc="$(_guard_install_root)/etc/openclash"
    if [ -d "$_guard_ih_oc" ]; then
        _guard_install_script "${_guard_ih_oc}/openclash-guard-hook.sh" "/bin/sh" "# Drop-in observer.
${_guard_ih_body}"
    fi
}

_guard_install_policy_files() {
    _guard_ip_etc=$(_guard_install_etc)
    _guard_ip_pol=${_GUARD_PREFLIGHT_POLICY_FILE:-}
    _guard_ip_tpl=${_GUARD_PREFLIGHT_TEMPLATES_FILE:-${GUARD_TEMPLATES_SOURCE:-}}
    if [ -z "$_guard_ip_pol" ] && [ -n "${GUARD_POLICY_FILE:-}" ] && [ -f "${GUARD_POLICY_FILE}" ]; then
        _guard_ip_pol=$GUARD_POLICY_FILE
    fi
    if [ -n "$_guard_ip_pol" ] && [ -f "$_guard_ip_pol" ]; then
        # GUARD_POLICY_FILE may identify a staged source. Installation always
        # publishes the validated runtime into the installer-owned directory.
        _guard_ip_dest=$(_guard_install_etc)/openclash-guard.json
        _guard_install_copy "$_guard_ip_pol" "$_guard_ip_dest" 0644 || return $?
        if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
            GUARD_POLICY_FILE=$_guard_ip_dest
        fi
    fi
    if [ -z "$_guard_ip_tpl" ] && [ -n "$_guard_ip_pol" ]; then
        _guard_ip_sib=$(dirname "$_guard_ip_pol")/openclash-guard-templates.json
        if [ -f "$_guard_ip_sib" ]; then
            _guard_ip_tpl=$_guard_ip_sib
        fi
    fi
    if [ -z "$_guard_ip_tpl" ] && [ -n "${GUARD_TEMPLATES_FILE:-}" ] && [ -f "${GUARD_TEMPLATES_FILE}" ]; then
        _guard_ip_tpl=$GUARD_TEMPLATES_FILE
    fi
    if [ -n "$_guard_ip_tpl" ] && [ -f "$_guard_ip_tpl" ]; then
        _guard_ip_tpl_dest="$(_guard_install_etc)/openclash-guard-templates.json"
        _guard_install_copy "$_guard_ip_tpl" "$_guard_ip_tpl_dest" 0644 || return $?
        if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
            GUARD_TEMPLATES_FILE=$_guard_ip_tpl_dest
        fi
    fi
}

_guard_install_apply_preflight_templates() {
    _guard_iat_catalog=${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}
    [ -f "$_guard_iat_catalog" ] || return 0
    for _guard_iat_id in ${_GUARD_PREFLIGHT_TEMPLATE_IDS:-}
    do
        [ -n "$_guard_iat_id" ] || continue
        for _guard_iat_key in $_GUARD_TEMPLATE_APPLY_KEYS
        do
            if json_has "$_guard_iat_catalog" "templates.${_guard_iat_id}.apply.${_guard_iat_key}"; then
                _guard_iat_val=$(json_get "$_guard_iat_catalog" "templates.${_guard_iat_id}.apply.${_guard_iat_key}") || return 1
                _guard_template_apply_key "$_guard_iat_key" "$_guard_iat_val" || return $?
            fi
        done
    done
}

_guard_install_write_uci() {
    _guard_iu_mode=$1
    _guard_iu_ks=$2
    _guard_iu_dns=$3
    _guard_iu_game=$4
    _guard_iu_url=$5
    _guard_iu_clients=$6
    guard_intent_ensure_sections || return $?
    _guard_template_set openclash_guard.main.enabled 1
    _guard_template_set openclash_guard.main.mode "$_guard_iu_mode"
    _guard_template_set openclash_guard.main.kill_switch "$_guard_iu_ks"
    _guard_template_set openclash_guard.main.dns_kill_switch "$_guard_iu_dns"
    _guard_template_set openclash_guard.main.dns_ownership preserve
    _guard_template_set openclash_guard.main.policy_refresh 1
    if [ -n "$_guard_iu_url" ]; then
        _guard_template_set openclash_guard.main.policy_url "$_guard_iu_url"
    fi
    _guard_template_set openclash_guard.udp.enabled "$_guard_iu_game"
    _guard_template_set openclash_guard.udp.blanket_udp_bypass 0
    _guard_template_set openclash_guard.udp.protect_udp_443 1
    if [ -n "$_guard_iu_clients" ]; then
        if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
            for _guard_iu_c in $_guard_iu_clients
            do
                [ -n "$_guard_iu_c" ] || continue
                printf 'would add_list openclash_guard.udp.src_ip=%s\n' "$_guard_iu_c"
            done
        else
            uci_delete openclash_guard.udp.src_ip
            for _guard_iu_c in $_guard_iu_clients
            do
                [ -n "$_guard_iu_c" ] || continue
                uci_add_list openclash_guard.udp.src_ip "$_guard_iu_c"
            done
        fi
    fi
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        return 0
    fi
    uci_commit_if_changed openclash_guard || return $?
}

_guard_install_write_observations() {
    _guard_iwo_dest=$(_guard_install_observations)
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would write %s\n' "$_guard_iwo_dest"
        return 0
    fi
    mkdir -p "$(dirname "$_guard_iwo_dest")"
    _guard_iwo_tmp=$(file_mktemp "$(dirname "$_guard_iwo_dest")") || return 1
    {
        printf '{"schemaVersion":1,'
        printf '"detectedAt":"%s",' "$(_guard_env_json_string "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
        printf '"dns":{"backend":"%s","domainSetBackend":"%s"},' \
            "$(_guard_env_json_string "$_GUARD_DNS_BACKEND")" \
            "$(_guard_env_json_string "$_GUARD_DNS_DOMAIN_SET")"
        printf '"direct":{"region":"%s","reason":"%s"},' \
            "$(_guard_env_json_string "$_GUARD_NET_DIRECT_REGION")" \
            "$(_guard_env_json_string "${_GUARD_PREFLIGHT_DIRECT_REASON:-}")"
        printf '"proxy":{"region":"%s","healthy":%s,"route":"%s","reason":"%s"},' \
            "$(_guard_env_json_string "$_GUARD_PROXY_REGION")" \
            "$(_guard_env_json_bool "$_GUARD_PROXY_HEALTHY")" \
            "$(_guard_env_json_string "${_GUARD_GEO_ROUTE:-}")" \
            "$(_guard_env_json_string "${_GUARD_PREFLIGHT_PROXY_REASON:-}")"
        printf '"templates":['
        _guard_iwo_first=1
        for _guard_iwo_id in ${_GUARD_PREFLIGHT_TEMPLATE_IDS:-}
        do
            [ -n "$_guard_iwo_id" ] || continue
            [ "$_guard_iwo_first" = 1 ] || printf ','
            _guard_iwo_first=0
            printf '"%s"' "$(_guard_env_json_string "$_guard_iwo_id")"
        done
        printf ']}\n'
    } > "$_guard_iwo_tmp"
    json_load "$_guard_iwo_tmp" || {
        rm -f "$_guard_iwo_tmp"
        return 1
    }
    file_atomic_replace "$_guard_iwo_dest" "$_guard_iwo_tmp"
    _guard_iwo_rc=$?
    rm -f "$_guard_iwo_tmp"
    return "$_guard_iwo_rc"
}

_GUARD_SETUP_INVALID_REASON=

guard_install_validate() {
    _GUARD_SETUP_INVALID_REASON=
    _guard_iv_bin=$(_guard_install_bin)
    _guard_iv_policy=$(_guard_policy_default_path)
    _guard_iv_templates=$(dirname "$_guard_iv_policy")/openclash-guard-templates.json
    _guard_iv_observations=$(_guard_install_observations)
    _guard_iv_state=$(_guard_distribution_state_path)
    if [ ! -x "$_guard_iv_bin" ] || ! guard_distribution_validate_bundle "$_guard_iv_bin" >/dev/null 2>&1; then
        _GUARD_SETUP_INVALID_REASON="verified Guard runtime bundle is missing"
        return 1
    fi
    if ! guard_policy_validate_file "$_guard_iv_policy" >/dev/null 2>&1; then
        _GUARD_SETUP_INVALID_REASON="runtime policy is missing or invalid"
        return 1
    fi
    if ! guard_template_validate_file "$_guard_iv_templates" >/dev/null 2>&1; then
        _GUARD_SETUP_INVALID_REASON="template catalog is missing or invalid"
        return 1
    fi
    if ! json_load "$_guard_iv_observations" >/dev/null 2>&1 || \
       [ "$(json_get "$_guard_iv_observations" schemaVersion 2>/dev/null || printf 0)" != 1 ]; then
        _GUARD_SETUP_INVALID_REASON="validated environment observations are missing"
        return 1
    fi
    if [ ! -f "$_guard_iv_state" ] || [ -z "$(_guard_distribution_selected 2>/dev/null || true)" ]; then
        _GUARD_SETUP_INVALID_REASON="distribution source metadata is missing"
        return 1
    fi
    for _guard_iv_hook in "$(_guard_install_init)" "$(_guard_install_hotplug)" "$(_guard_install_fw4)" "$(_guard_install_oc_hook)"
    do
        if [ ! -x "$_guard_iv_hook" ]; then
            _GUARD_SETUP_INVALID_REASON="required runtime hook is missing: $_guard_iv_hook"
            return 1
        fi
    done
    if ! command -v uci >/dev/null 2>&1 || \
       [ "$(uci_get_default openclash_guard.main.enabled 0 2>/dev/null || printf 0)" != 1 ] || \
       [ "$(uci_get_default openclash_guard.main.dns_ownership "" 2>/dev/null || true)" != preserve ] || \
       [ "$(uci_get_default openclash_guard.udp.protect_udp_443 0 2>/dev/null || printf 0)" != 1 ]; then
        _GUARD_SETUP_INVALID_REASON="required Guard UCI configuration is incomplete"
        return 1
    fi
}

_guard_install_print_env() {
    cli_section "Environment"
    cli_kv "OpenWrt/fw4" "$(guard_env_get nft.available)"
    cli_kv "OpenClash" "$(guard_env_get openclash.running)"
    cli_kv "DNS backend" "$(guard_env_get dns.backend)"
    cli_kv "dnsmasq DNS" "$(guard_env_get dns.dnsmasqEnabled)"
    cli_kv "Direct region" "$(guard_env_get network.directRegion)"
    cli_kv "Gaming clients" "$(guard_env_get gaming.clients.count)"
}

_guard_install_print_proposed() {
    _guard_ipp_ks=$1
    _guard_ipp_dns=$2
    _guard_ipp_game=$3
    cli_section "Proposed policy"
    if [ "$_guard_ipp_ks" = 1 ]; then
        cli_kv "Global kill switch" enabled
    else
        cli_kv "Global kill switch" disabled
    fi
    cli_kv "AI service guard" enabled
    if [ "$_guard_ipp_game" = 1 ]; then
        cli_kv "Gaming UDP bypass" scoped
    else
        cli_kv "Gaming UDP bypass" disabled
    fi
    if [ "$_guard_ipp_dns" = 1 ]; then
        cli_kv "DNS kill switch" enabled
    else
        cli_kv "DNS kill switch" disabled
    fi
    cli_kv "Policy refresh" enabled
}

guard_cmd_install() {
    _guard_in_mode=auto
    _guard_in_url=
    _guard_in_ks=
    _guard_in_dns=
    _guard_in_game=
    _guard_in_norefresh=0
    _guard_in_clients=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --mode)
                _guard_in_mode=$2
                shift 2
                ;;
            --policy-url)
                _guard_in_url=$2
                shift 2
                ;;
            --enable-kill-switch)
                _guard_in_ks=1
                shift
                ;;
            --disable-kill-switch)
                _guard_in_ks=0
                shift
                ;;
            --enable-dns-kill-switch)
                _guard_in_dns=1
                shift
                ;;
            --disable-dns-kill-switch)
                _guard_in_dns=0
                shift
                ;;
            --enable-gaming-bypass)
                _guard_in_game=1
                shift
                ;;
            --disable-gaming-bypass)
                _guard_in_game=0
                shift
                ;;
            --gaming-client)
                _guard_in_clients="${_guard_in_clients} $2"
                shift 2
                ;;
            --no-refresh)
                _guard_in_norefresh=1
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
            --json)
                _GUARD_JSON=1
                shift
                ;;
            *)
                cli_die "unknown install option: $1" 2
                ;;
        esac
    done
    case $_guard_in_mode in
        auto|strict|manual)
            ;;
        *)
            cli_error "invalid --mode: $_guard_in_mode (auto|strict|manual)"
            return 2
            ;;
    esac
    guard_preflight_require_stage || return $?
    _guard_in_ks_eff=${_guard_in_ks:-1}
    _guard_in_dns_eff=${_guard_in_dns:-0}
    _guard_in_game_eff=${_guard_in_game:-1}
    if [ "$_guard_in_mode" = strict ]; then
        _guard_in_ks_eff=${_guard_in_ks:-1}
    fi
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    if [ -f "$(_guard_policy_default_path)" ]; then
        guard_policy_load "$(_guard_policy_default_path)" 2>/dev/null || true
        guard_geo_detect_direct >/dev/null 2>&1 || true
        guard_env_detect
    fi
    if [ "$_GUARD_JSON" != 1 ]; then
        cli_section "OpenClash Guard Setup"
        _guard_install_print_env
        printf '\n'
        _guard_install_print_proposed "$_guard_in_ks_eff" "$_guard_in_dns_eff" "$_guard_in_game_eff"
        printf '\n'
        if [ -f "$(_guard_template_catalog_path)" ]; then
            GUARD_TEMPLATES_FILE=${GUARD_TEMPLATES_FILE:-$(_guard_template_catalog_path)}
            _guard_in_env=$(_guard_template_env_file) || _guard_in_env=
            if [ -n "$_guard_in_env" ]; then
                _guard_in_ids=$(guard_template_matches "${GUARD_TEMPLATES_FILE}" "$_guard_in_env") || _guard_in_ids=
                rm -f "$_guard_in_env"
                if [ -n "$_guard_in_ids" ]; then
                    cli_section "Suggested Templates"
                    for _guard_in_id in $_guard_in_ids
                    do
                        [ -n "$_guard_in_id" ] || continue
                        printf '\n'
                        _guard_template_print_one "${GUARD_TEMPLATES_FILE}" "$_guard_in_id" 0
                    done
                    printf '\n'
                    cli_info "suggestions are not auto-applied"
                fi
            fi
        fi
    fi
    if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
        if ! cli_confirm "Provision the complete OpenClash Guard runtime?"; then
            cli_error "refusing to install without confirmation (pass --yes)"
            return 1
        fi
    fi
    _guard_install_self || return $?
    _guard_install_policy_files || return $?
    _guard_install_hooks || return $?
    _guard_install_write_uci "$_guard_in_mode" "$_guard_in_ks_eff" "$_guard_in_dns_eff" "$_guard_in_game_eff" "$_guard_in_url" "$_guard_in_clients" || return $?
    _guard_install_write_observations || return $?
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        cli_info "dry-run: install not written"
        return 0
    fi
    _guard_distribution_record "$_GUARD_PREFLIGHT_SOURCE" "$_GUARD_PREFLIGHT_POLICY_URL" "$_GUARD_PREFLIGHT_TEMPLATES_URL" || return $?
    if ! guard_install_validate; then
        cli_error "Setup validation failed: $_GUARD_SETUP_INVALID_REASON"
        return 1
    fi
    cli_success "setup complete; runtime is valid and not yet applied"
}
