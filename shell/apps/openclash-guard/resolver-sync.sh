#!/bin/sh
# Read-only capability verification for a structured DNS resolver-sync helper.
# Prefix: guard_resolver_sync_
set -eu

_GUARD_RESOLVER_SYNC_BACKEND=adguardhome-resolver-sync
_GUARD_RESOLVER_SYNC_HELPER=openclash-guard-resolver-sync
_GUARD_RESOLVER_SYNC_FAMILY=inet
_GUARD_RESOLVER_SYNC_TABLE=openclash_guard
_GUARD_RESOLVER_SYNC_CHAIN=forward
_GUARD_RESOLVER_SYNC_V4_SET=resolver_sync_v4
_GUARD_RESOLVER_SYNC_V6_SET=resolver_sync_v6
_GUARD_RESOLVER_SYNC_V4_SET_COMMENT=openclash-guard:resolver-sync-v4-set
_GUARD_RESOLVER_SYNC_V6_SET_COMMENT=openclash-guard:resolver-sync-v6-set
_GUARD_RESOLVER_SYNC_V4_RULE_COMMENT=openclash-guard:resolver-sync-v4
_GUARD_RESOLVER_SYNC_V6_RULE_COMMENT=openclash-guard:resolver-sync-v6

_guard_resolver_sync_state_path() {
    if [ -n "${GUARD_RESOLVER_SYNC_STATE_FILE:-}" ]; then
        printf '%s\n' "$GUARD_RESOLVER_SYNC_STATE_FILE"
    else
        printf '%s/var/run/openclash-guard/resolver-sync.json\n' "${GUARD_PREFIX:-}"
    fi
}

_guard_resolver_sync_uint() {
    case ${1:-} in
        ''|*[!0-9]*) return 1 ;;
        *) return 0 ;;
    esac
}

_guard_resolver_sync_expect() {
    _guard_rs_e_file=$1
    _guard_rs_e_path=$2
    _guard_rs_e_expected=$3
    _guard_rs_e_actual=$(json_get "$_guard_rs_e_file" "$_guard_rs_e_path" 2>/dev/null) || return 1
    [ "$_guard_rs_e_actual" = "$_guard_rs_e_expected" ]
}

_guard_resolver_sync_contract_valid() {
    _guard_rs_cv_file=$1
    [ -f "$_guard_rs_cv_file" ] || return 1
    [ ! -L "$_guard_rs_cv_file" ] || return 1

    _guard_resolver_sync_expect "$_guard_rs_cv_file" schemaVersion 1 || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" helper "$_GUARD_RESOLVER_SYNC_HELPER" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" backend "$_GUARD_RESOLVER_SYNC_BACKEND" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" status ready || return 1

    # The state file describes the contract version, but never supplies nft
    # command arguments. All identifiers used below are fixed constants.
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.family "$_GUARD_RESOLVER_SYNC_FAMILY" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.table "$_GUARD_RESOLVER_SYNC_TABLE" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.chain "$_GUARD_RESOLVER_SYNC_CHAIN" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.ipv4Set "$_GUARD_RESOLVER_SYNC_V4_SET" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.ipv6Set "$_GUARD_RESOLVER_SYNC_V6_SET" || return 1
    return 0
}

_guard_resolver_sync_process_alive() {
    _guard_rs_pa_file=$1
    _guard_rs_pa_pid=$(json_get "$_guard_rs_pa_file" pid 2>/dev/null) || return 1
    _guard_resolver_sync_uint "$_guard_rs_pa_pid" || return 1
    [ "$_guard_rs_pa_pid" -gt 1 ] 2>/dev/null || return 1
    kill -0 "$_guard_rs_pa_pid" 2>/dev/null
}

_guard_resolver_sync_fresh() {
    _guard_rs_f_file=$1
    _guard_rs_f_updated=$(json_get "$_guard_rs_f_file" updatedAtEpoch 2>/dev/null) || return 1
    _guard_resolver_sync_uint "$_guard_rs_f_updated" || return 1

    _guard_rs_f_max=${GUARD_RESOLVER_SYNC_MAX_AGE:-120}
    _guard_resolver_sync_uint "$_guard_rs_f_max" || return 1
    [ "$_guard_rs_f_max" -ge 1 ] 2>/dev/null || return 1
    [ "$_guard_rs_f_max" -le 3600 ] 2>/dev/null || return 1

    if [ -n "${GUARD_RESOLVER_SYNC_NOW_EPOCH:-}" ]; then
        _guard_rs_f_now=$GUARD_RESOLVER_SYNC_NOW_EPOCH
    else
        _guard_rs_f_now=$(date +%s 2>/dev/null) || return 1
    fi
    _guard_resolver_sync_uint "$_guard_rs_f_now" || return 1
    [ "$_guard_rs_f_updated" -le "$_guard_rs_f_now" ] 2>/dev/null || return 1
    _guard_rs_f_age=$((_guard_rs_f_now - _guard_rs_f_updated))
    [ "$_guard_rs_f_age" -le "$_guard_rs_f_max" ]
}

_guard_resolver_sync_set_ready() {
    _guard_rs_sr_set=$1
    _guard_rs_sr_type=$2
    _guard_rs_sr_comment=$3
    _guard_rs_sr_listing=$(nft list set \
        "$_GUARD_RESOLVER_SYNC_FAMILY" \
        "$_GUARD_RESOLVER_SYNC_TABLE" \
        "$_guard_rs_sr_set" 2>/dev/null) || return 1
    printf '%s\n' "$_guard_rs_sr_listing" | awk \
        -v want_type="$_guard_rs_sr_type" \
        -v want_comment="$_guard_rs_sr_comment" '
        $1 == "type" && $2 == want_type { have_type = 1 }
        $1 == "flags" && index($0, "timeout") { have_timeout = 1 }
        index($0, "comment \"" want_comment "\"") { have_comment = 1 }
        END { exit !(have_type && have_timeout && have_comment) }
    '
}

_guard_resolver_sync_consumer_ready() {
    _guard_rs_cr_listing=$(nft -a list chain \
        "$_GUARD_RESOLVER_SYNC_FAMILY" \
        "$_GUARD_RESOLVER_SYNC_TABLE" \
        "$_GUARD_RESOLVER_SYNC_CHAIN" 2>/dev/null) || return 1

    printf '%s\n' "$_guard_rs_cr_listing" | awk \
        -v set_name="$_GUARD_RESOLVER_SYNC_V4_SET" \
        -v comment="$_GUARD_RESOLVER_SYNC_V4_RULE_COMMENT" '
        index($0, "ip daddr @" set_name) && index($0, "reject") &&
        index($0, "comment \"" comment "\"") { found = 1 }
        END { exit !found }
    ' || return 1

    printf '%s\n' "$_guard_rs_cr_listing" | awk \
        -v set_name="$_GUARD_RESOLVER_SYNC_V6_SET" \
        -v comment="$_GUARD_RESOLVER_SYNC_V6_RULE_COMMENT" '
        index($0, "ip6 daddr @" set_name) && index($0, "reject") &&
        index($0, "comment \"" comment "\"") { found = 1 }
        END { exit !found }
    '
}

guard_resolver_sync_ready() {
    _guard_rs_r_file=$(_guard_resolver_sync_state_path)
    command -v nft >/dev/null 2>&1 || return 1
    _guard_resolver_sync_contract_valid "$_guard_rs_r_file" || return 1
    _guard_resolver_sync_process_alive "$_guard_rs_r_file" || return 1
    _guard_resolver_sync_fresh "$_guard_rs_r_file" || return 1
    _guard_resolver_sync_set_ready \
        "$_GUARD_RESOLVER_SYNC_V4_SET" ipv4_addr "$_GUARD_RESOLVER_SYNC_V4_SET_COMMENT" || return 1
    _guard_resolver_sync_set_ready \
        "$_GUARD_RESOLVER_SYNC_V6_SET" ipv6_addr "$_GUARD_RESOLVER_SYNC_V6_SET_COMMENT" || return 1
    _guard_resolver_sync_consumer_ready || return 1
    return 0
}

guard_resolver_sync_backend() {
    if guard_resolver_sync_ready; then
        printf '%s\n' "$_GUARD_RESOLVER_SYNC_BACKEND"
    else
        printf '%s\n' unavailable
    fi
}
