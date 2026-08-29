#!/bin/sh
# Generated distribution catalog for cold-start runtime policy refresh.
# Prefix: guard_distribution_
set -eu

# BEGIN GENERATED DISTRIBUTION CATALOG
_GUARD_DISTRIBUTION_RAW_BASE="https://raw.githubusercontent.com/mythic3011/rules/main"
_GUARD_DISTRIBUTION_CDN_BASE="https://cdn.jsdelivr.net/gh/mythic3011/rules@main"
# END GENERATED DISTRIBUTION CATALOG

_guard_distribution_policy_url() {
    _guard_ds_source=${1:-}
    _guard_ds_override=${2:-}
    if [ -n "$_guard_ds_override" ]; then
        printf '%s/cfg/runtime/openclash-guard.json\n' "${_guard_ds_override%/}"
        return 0
    fi
    case $_guard_ds_source in
        github-raw|raw) printf '%s/cfg/runtime/openclash-guard.json\n' "$_GUARD_DISTRIBUTION_RAW_BASE" ;;
        jsdelivr|cdn) printf '%s/cfg/runtime/openclash-guard.json\n' "$_GUARD_DISTRIBUTION_CDN_BASE" ;;
        *) return 1 ;;
    esac
}
