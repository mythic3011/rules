#!/bin/sh
# Remove stale project-owned nft/dnsmasq artifacts from apply_ai_failclosed.sh.
# Prefix: guard_migrate_
set -eu

_GUARD_STALE_COMMENT=rules-ai-failclosed
_GUARD_STALE_CHAIN=rules_ai_failclosed
_GUARD_STALE_SET_PREFIX=rules_ai
_GUARD_STALE_CONF=rules-ai-failclosed.conf
_GUARD_STALE_PROVIDERS="chatgpt copilot claude gemini notebooklm perplexity grok poe"

_guard_migrate_conf_dirs() {
    if [ -n "${GUARD_STALE_CONF_DIRS:-}" ]; then
        printf '%s\n' $GUARD_STALE_CONF_DIRS
        return 0
    fi
    printf '%s\n' /tmp/dnsmasq.d /etc/dnsmasq.d
    if [ -d /tmp ]; then
        for _guard_md_dir in /tmp/dnsmasq.*.d
        do
            if [ -d "$_guard_md_dir" ]; then
                printf '%s\n' "$_guard_md_dir"
            fi
        done
    fi
}

guard_migrate_dnsmasq_conf() {
    _guard_mdc_dirs=$(_guard_migrate_conf_dirs)
    for _guard_mdc_dir in $_guard_mdc_dirs
    do
        [ -n "$_guard_mdc_dir" ] || continue
        _guard_mdc_file="$_guard_mdc_dir/$_GUARD_STALE_CONF"
        if [ -f "$_guard_mdc_file" ]; then
            rm -f "$_guard_mdc_file"
        fi
    done
    # Never restart/enable dnsmasq after cleanup.
}

guard_migrate_nft() {
    if [ "$_GUARD_NFT_AVAILABLE" != 1 ]; then
        return 0
    fi
    if nft_chain_exists inet fw4 forward 2>/dev/null; then
        nft_delete_rules_by_comment inet fw4 forward "$_GUARD_STALE_COMMENT" 2>/dev/null || true
    fi
    if nft_chain_exists inet fw4 "$_GUARD_STALE_CHAIN" 2>/dev/null; then
        nft delete chain inet fw4 "$_GUARD_STALE_CHAIN" 2>/dev/null || true
    fi
    for _guard_mn_prov in $_GUARD_STALE_PROVIDERS
    do
        nft_delete_owned_set inet fw4 "${_GUARD_STALE_SET_PREFIX}_${_guard_mn_prov}_v4" "$_GUARD_STALE_SET_PREFIX" 2>/dev/null || true
        nft_delete_owned_set inet fw4 "${_GUARD_STALE_SET_PREFIX}_${_guard_mn_prov}_v6" "$_GUARD_STALE_SET_PREFIX" 2>/dev/null || true
    done
}

guard_migrate_stale() {
    guard_migrate_nft
    guard_migrate_dnsmasq_conf
}
