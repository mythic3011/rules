#!/bin/sh
# Data-driven template matcher and apply. Detection never auto-applies.
# Prefix: guard_template_
set -eu

_GUARD_TEMPLATE_APPLY_KEYS="guard.kill_switch guard.dns_kill_switch dns.ownership gaming.blanket_udp_bypass gaming.protect_udp_443 mode policy.refresh"

_guard_template_catalog_path() {
    if [ -n "${GUARD_TEMPLATES_FILE:-}" ]; then
        printf '%s\n' "$GUARD_TEMPLATES_FILE"
        return 0
    fi
    _guard_tc_pol=$(_guard_policy_default_path)
    printf '%s/openclash-guard-templates.json\n' "$(dirname "$_guard_tc_pol")"
}

guard_template_validate_file() {
    _guard_tv_file=${1:-}
    [ -f "$_guard_tv_file" ] || return 1
    json_load "$_guard_tv_file" || return 1
    _guard_tv_ver=$(json_get "$_guard_tv_file" schemaVersion 2>/dev/null) || _guard_tv_ver=
    [ "$_guard_tv_ver" = 1 ] || return 1
    json_has "$_guard_tv_file" templates
}

_guard_template_is_int() {
    case ${1:-} in
        ''|*[!0-9]*)
            return 1
            ;;
        *)
            return 0
            ;;
    esac
}

_guard_template_severity_rank() {
    case ${1:-} in
        high)
            printf '0\n'
            ;;
        medium)
            printf '1\n'
            ;;
        info)
            printf '2\n'
            ;;
        *)
            printf '9\n'
            ;;
    esac
}

_guard_template_severity_label() {
    printf '%s' "$1" | tr 'a-z' 'A-Z'
}

_guard_template_eval_all() {
    _guard_te_cat=$1
    _guard_te_pfx=$2
    _guard_te_env=$3
    _guard_te_keys=$(json_keys "$_guard_te_cat" "$_guard_te_pfx") || return 1
    if [ -z "$_guard_te_keys" ]; then
        return 1
    fi
    for _guard_te_i in $_guard_te_keys
    do
        [ -n "$_guard_te_i" ] || continue
        _guard_template_eval_node "$_guard_te_cat" "${_guard_te_pfx}.${_guard_te_i}" "$_guard_te_env" || return 1
    done
    return 0
}

_guard_template_eval_any() {
    _guard_ty_cat=$1
    _guard_ty_pfx=$2
    _guard_ty_env=$3
    _guard_ty_keys=$(json_keys "$_guard_ty_cat" "$_guard_ty_pfx") || return 1
    for _guard_ty_i in $_guard_ty_keys
    do
        [ -n "$_guard_ty_i" ] || continue
        if _guard_template_eval_node "$_guard_ty_cat" "${_guard_ty_pfx}.${_guard_ty_i}" "$_guard_ty_env"; then
            return 0
        fi
    done
    return 1
}

_guard_template_contains() {
    _guard_tcn_cat=$1
    _guard_tcn_pfx=$2
    _guard_tcn_env=$3
    _guard_tcn_path=$4
    _guard_tcn_needle=$(json_get "$_guard_tcn_cat" "${_guard_tcn_pfx}.contains") || return 1
    if json_list "$_guard_tcn_env" "$_guard_tcn_path" >/dev/null 2>&1; then
        _guard_tcn_items=$(json_list "$_guard_tcn_env" "$_guard_tcn_path") || return 1
        for _guard_tcn_item in $_guard_tcn_items
        do
            if [ "$_guard_tcn_item" = "$_guard_tcn_needle" ]; then
                return 0
            fi
        done
        return 1
    fi
    _guard_tcn_hay=$(json_get "$_guard_tcn_env" "$_guard_tcn_path" 2>/dev/null) || return 1
    case $_guard_tcn_hay in
        *"$_guard_tcn_needle"*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

_guard_template_eval_leaf() {
    _guard_tl_cat=$1
    _guard_tl_pfx=$2
    _guard_tl_env=$3
    _guard_tl_path=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.path") || return 1
    _guard_tl_lhs=$(json_get "$_guard_tl_env" "$_guard_tl_path" 2>/dev/null) || _guard_tl_lhs=
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.eq"; then
        _guard_tl_rhs=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.eq") || return 1
        [ "$_guard_tl_lhs" = "$_guard_tl_rhs" ]
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.ne"; then
        _guard_tl_rhs=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.ne") || return 1
        [ "$_guard_tl_lhs" != "$_guard_tl_rhs" ]
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.in"; then
        _guard_tl_items=$(json_list "$_guard_tl_cat" "${_guard_tl_pfx}.in") || return 1
        for _guard_tl_item in $_guard_tl_items
        do
            if [ "$_guard_tl_item" = "$_guard_tl_lhs" ]; then
                return 0
            fi
        done
        return 1
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.contains"; then
        _guard_template_contains "$_guard_tl_cat" "$_guard_tl_pfx" "$_guard_tl_env" "$_guard_tl_path"
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.gte"; then
        _guard_tl_rhs=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.gte") || return 1
        if ! _guard_template_is_int "$_guard_tl_lhs" || ! _guard_template_is_int "$_guard_tl_rhs"; then
            return 1
        fi
        [ "$_guard_tl_lhs" -ge "$_guard_tl_rhs" ]
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.lte"; then
        _guard_tl_rhs=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.lte") || return 1
        if ! _guard_template_is_int "$_guard_tl_lhs" || ! _guard_template_is_int "$_guard_tl_rhs"; then
            return 1
        fi
        [ "$_guard_tl_lhs" -le "$_guard_tl_rhs" ]
        return $?
    fi
    if json_has "$_guard_tl_cat" "${_guard_tl_pfx}.exists"; then
        _guard_tl_want=$(json_get "$_guard_tl_cat" "${_guard_tl_pfx}.exists") || _guard_tl_want=true
        if json_has "$_guard_tl_env" "$_guard_tl_path"; then
            _guard_tl_has=1
        else
            _guard_tl_has=0
        fi
        case $_guard_tl_want in
            true|1)
                [ "$_guard_tl_has" = 1 ]
                ;;
            false|0)
                [ "$_guard_tl_has" = 0 ]
                ;;
            *)
                return 1
                ;;
        esac
        return $?
    fi
    return 1
}

_guard_template_eval_node() {
    _guard_tn_cat=$1
    _guard_tn_pfx=$2
    _guard_tn_env=$3
    if json_has "$_guard_tn_cat" "${_guard_tn_pfx}.all"; then
        _guard_template_eval_all "$_guard_tn_cat" "${_guard_tn_pfx}.all" "$_guard_tn_env"
        return $?
    fi
    if json_has "$_guard_tn_cat" "${_guard_tn_pfx}.any"; then
        _guard_template_eval_any "$_guard_tn_cat" "${_guard_tn_pfx}.any" "$_guard_tn_env"
        return $?
    fi
    if json_has "$_guard_tn_cat" "${_guard_tn_pfx}.not"; then
        if _guard_template_eval_node "$_guard_tn_cat" "${_guard_tn_pfx}.not" "$_guard_tn_env"; then
            return 1
        fi
        return 0
    fi
    _guard_template_eval_leaf "$_guard_tn_cat" "$_guard_tn_pfx" "$_guard_tn_env"
}

guard_template_match() {
    _guard_tm_cat=${1:-}
    _guard_tm_id=${2:-}
    _guard_tm_env=${3:-}
    if [ -z "$_guard_tm_cat" ] || [ -z "$_guard_tm_id" ] || [ -z "$_guard_tm_env" ]; then
        printf '%s\n' "guard_template_match: usage: catalog id env.json" >&2
        return 2
    fi
    if ! json_has "$_guard_tm_cat" "templates.${_guard_tm_id}"; then
        return 1
    fi
    _guard_template_eval_node "$_guard_tm_cat" "templates.${_guard_tm_id}.when" "$_guard_tm_env"
}

guard_template_matches() {
    _guard_tms_cat=$1
    _guard_tms_env=$2
    _guard_tms_ids=$(json_keys "$_guard_tms_cat" templates) || _guard_tms_ids=
    _guard_tms_out=$(file_mktemp) || return 1
    : > "$_guard_tms_out"
    for _guard_tms_id in $_guard_tms_ids
    do
        [ -n "$_guard_tms_id" ] || continue
        if guard_template_match "$_guard_tms_cat" "$_guard_tms_id" "$_guard_tms_env"; then
            _guard_tms_sev=$(json_get "$_guard_tms_cat" "templates.${_guard_tms_id}.recommendation.severity") || _guard_tms_sev=info
            _guard_tms_rank=$(_guard_template_severity_rank "$_guard_tms_sev")
            printf '%s\t%s\n' "$_guard_tms_rank" "$_guard_tms_id" >> "$_guard_tms_out"
        fi
    done
    sort -n "$_guard_tms_out" | awk -F '\t' '{print $2}'
    rm -f "$_guard_tms_out"
}

_guard_template_require_catalog() {
    _GUARD_TEMPLATE_FILE=$(_guard_template_catalog_path)
    if [ ! -f "$_GUARD_TEMPLATE_FILE" ]; then
        cli_error "template catalog missing: $_GUARD_TEMPLATE_FILE"
        return 1
    fi
    if ! guard_template_validate_file "$_GUARD_TEMPLATE_FILE"; then
        cli_error "invalid template catalog: $_GUARD_TEMPLATE_FILE"
        return 1
    fi
}

_guard_template_env_file() {
    guard_kill_read_uci
    guard_game_read_uci
    guard_env_detect
    _guard_tef=$(file_mktemp) || return 1
    guard_env_json > "$_guard_tef"
    printf '%s\n' "$_guard_tef"
}

guard_intent_ensure_sections() {
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        return 0
    fi
    if ! command -v uci >/dev/null 2>&1; then
        printf '%s\n' "uci: command not found" >&2
        return 127
    fi
    uci_set openclash_guard.main openclash_guard
    uci_set openclash_guard.udp udp
}

_guard_template_bool_uci() {
    case $1 in
        true|1)
            printf '1\n'
            ;;
        false|0)
            printf '0\n'
            ;;
        *)
            return 1
            ;;
    esac
}

_guard_template_set() {
    _guard_ts_opt=$1
    _guard_ts_val=$2
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        printf 'would set %s=%s\n' "$_guard_ts_opt" "$_guard_ts_val"
        return 0
    fi
    uci_set "$_guard_ts_opt" "$_guard_ts_val"
}

_guard_template_apply_key() {
    _guard_tak_key=$1
    _guard_tak_val=$2
    case $_guard_tak_key in
        guard.kill_switch)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            _guard_template_set openclash_guard.main.kill_switch "$_guard_tak_uci"
            ;;
        guard.dns_kill_switch)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            _guard_template_set openclash_guard.main.dns_kill_switch "$_guard_tak_uci"
            ;;
        dns.ownership)
            if [ "$_guard_tak_val" != preserve ]; then
                cli_error "dns.ownership must be preserve"
                return 1
            fi
            _guard_template_set openclash_guard.main.dns_ownership preserve
            ;;
        gaming.blanket_udp_bypass)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            if [ "$_guard_tak_uci" = 1 ]; then
                cli_error "refusing to enable blanket UDP bypass"
                return 1
            fi
            _guard_template_set openclash_guard.udp.blanket_udp_bypass 0
            ;;
        gaming.protect_udp_443)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            if [ "$_guard_tak_uci" != 1 ]; then
                cli_error "UDP/443 protection cannot be disabled"
                return 1
            fi
            _guard_template_set openclash_guard.udp.protect_udp_443 1
            ;;
        mode)
            case $_guard_tak_val in
                auto|strict|manual)
                    ;;
                *)
                    cli_error "invalid mode: $_guard_tak_val"
                    return 1
                    ;;
            esac
            _guard_template_set openclash_guard.main.mode "$_guard_tak_val"
            ;;
        policy.refresh)
            _guard_tak_uci=$(_guard_template_bool_uci "$_guard_tak_val") || return 1
            _guard_template_set openclash_guard.main.policy_refresh "$_guard_tak_uci"
            ;;
        *)
            cli_error "unknown apply key: $_guard_tak_key"
            return 1
            ;;
    esac
}

_guard_template_dump_apply() {
    _guard_td_cat=$1
    _guard_td_id=$2
    for _guard_td_key in $_GUARD_TEMPLATE_APPLY_KEYS
    do
        if json_has "$_guard_td_cat" "templates.${_guard_td_id}.apply.${_guard_td_key}"; then
            _guard_td_val=$(json_get "$_guard_td_cat" "templates.${_guard_td_id}.apply.${_guard_td_key}") || continue
            printf '%s=%s\n' "$_guard_td_key" "$_guard_td_val"
        fi
    done
}

_guard_template_print_one() {
    _guard_tp_cat=$1
    _guard_tp_id=$2
    _guard_tp_explain=${3:-0}
    _guard_tp_title=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.title") || _guard_tp_title=$_guard_tp_id
    _guard_tp_sev=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.recommendation.severity") || _guard_tp_sev=info
    _guard_tp_reason=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.recommendation.reason") || _guard_tp_reason=
    printf '[%s] %s\n' "$(_guard_template_severity_label "$_guard_tp_sev")" "$_guard_tp_id"
    printf '  %s\n' "$_guard_tp_reason"
    if [ "$_guard_tp_explain" = 1 ]; then
        _guard_tp_risk=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.recommendation.risk") || _guard_tp_risk=
        _guard_tp_desc=$(json_get "$_guard_tp_cat" "templates.${_guard_tp_id}.description") || _guard_tp_desc=
        printf '  title: %s\n' "$_guard_tp_title"
        printf '  detected: %s\n' "$_guard_tp_desc"
        printf '  risk: %s\n' "$_guard_tp_risk"
        printf '  proposed:\n'
        _guard_template_dump_apply "$_guard_tp_cat" "$_guard_tp_id" | sed 's/^/    /'
    fi
    printf '\n  Apply:\n    openclash-guard template apply %s\n' "$_guard_tp_id"
}

guard_cmd_template_list() {
    _guard_template_require_catalog || return $?
    _guard_tl_json=0
    _guard_tl_explain=0
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --json)
                _guard_tl_json=1
                shift
                ;;
            --explain)
                _guard_tl_explain=1
                shift
                ;;
            *)
                cli_die "unknown template list option: $1" 2
                ;;
        esac
    done
    _guard_tl_ids=$(json_keys "$_GUARD_TEMPLATE_FILE" templates) || _guard_tl_ids=
    if [ "$_guard_tl_json" = 1 ] || [ "$_GUARD_JSON" = 1 ]; then
        printf '{"templates":['
        _guard_tl_first=1
        for _guard_tl_id in $_guard_tl_ids
        do
            [ -n "$_guard_tl_id" ] || continue
            if [ "$_guard_tl_first" = 1 ]; then
                _guard_tl_first=0
            else
                printf ','
            fi
            printf '"%s"' "$(_guard_env_json_string "$_guard_tl_id")"
        done
        printf ']}\n'
        return 0
    fi
    cli_section "Templates"
    for _guard_tl_id in $_guard_tl_ids
    do
        [ -n "$_guard_tl_id" ] || continue
        _guard_tl_title=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tl_id}.title") || _guard_tl_title=
        cli_kv "$_guard_tl_id" "$_guard_tl_title"
        if [ "$_guard_tl_explain" = 1 ]; then
            _guard_template_dump_apply "$_GUARD_TEMPLATE_FILE" "$_guard_tl_id" | sed 's/^/  /'
        fi
    done
}

guard_cmd_template_suggest() {
    _guard_tsg_json=0
    _guard_tsg_explain=0
    _guard_tsg_service=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --json)
                _guard_tsg_json=1
                shift
                ;;
            --explain)
                _guard_tsg_explain=1
                shift
                ;;
            --service)
                _guard_tsg_service=$2
                shift 2
                ;;
            *)
                cli_die "unknown template suggest option: $1" 2
                ;;
        esac
    done
    if [ "$_GUARD_JSON" = 1 ]; then
        _guard_tsg_json=1
    fi
    _guard_template_require_catalog || return $?
    export GUARD_SERVICE_ID=$_guard_tsg_service
    _guard_tsg_env=$(_guard_template_env_file) || return $?
    _guard_tsg_ids=$(guard_template_matches "$_GUARD_TEMPLATE_FILE" "$_guard_tsg_env") || _guard_tsg_ids=
    if [ "$_guard_tsg_json" = 1 ]; then
        printf '{"suggestions":['
        _guard_tsg_first=1
        for _guard_tsg_id in $_guard_tsg_ids
        do
            [ -n "$_guard_tsg_id" ] || continue
            _guard_tsg_sev=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsg_id}.recommendation.severity") || _guard_tsg_sev=info
            _guard_tsg_conf=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsg_id}.recommendation.confidence") || _guard_tsg_conf=high
            _guard_tsg_reason=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsg_id}.recommendation.reason") || _guard_tsg_reason=
            if [ "$_guard_tsg_first" = 1 ]; then
                _guard_tsg_first=0
            else
                printf ','
            fi
            printf '{"id":"%s","severity":"%s","confidence":"%s","reason":"%s","applyCommand":"openclash-guard template apply %s"}' \
                "$(_guard_env_json_string "$_guard_tsg_id")" \
                "$(_guard_env_json_string "$_guard_tsg_sev")" \
                "$(_guard_env_json_string "$_guard_tsg_conf")" \
                "$(_guard_env_json_string "$_guard_tsg_reason")" \
                "$(_guard_env_json_string "$_guard_tsg_id")"
        done
        printf ']}\n'
        rm -f "$_guard_tsg_env"
        return 0
    fi
    cli_section "Suggested Templates"
    _guard_tsg_any=0
    for _guard_tsg_id in $_guard_tsg_ids
    do
        [ -n "$_guard_tsg_id" ] || continue
        _guard_tsg_any=1
        printf '\n'
        _guard_template_print_one "$_GUARD_TEMPLATE_FILE" "$_guard_tsg_id" "$_guard_tsg_explain"
    done
    rm -f "$_guard_tsg_env"
    if [ "$_guard_tsg_any" != 1 ]; then
        cli_info "no templates matched"
    fi
}

guard_cmd_template_show() {
    _guard_tsh_json=0
    _guard_tsh_explain=0
    _guard_tsh_id=
    while [ "$#" -gt 0 ]
    do
        case $1 in
            --json)
                _guard_tsh_json=1
                shift
                ;;
            --explain)
                _guard_tsh_explain=1
                shift
                ;;
            --*)
                cli_die "unknown template show option: $1" 2
                ;;
            *)
                if [ -n "$_guard_tsh_id" ]; then
                    cli_die "duplicate template id" 2
                fi
                _guard_tsh_id=$1
                shift
                ;;
        esac
    done
    if [ "$_GUARD_JSON" = 1 ]; then
        _guard_tsh_json=1
    fi
    if [ -z "$_guard_tsh_id" ]; then
        cli_error "usage: openclash-guard template show <id>"
        return 2
    fi
    _guard_template_require_catalog || return $?
    if ! json_has "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}"; then
        cli_error "unknown template: $_guard_tsh_id"
        return 1
    fi
    if [ "$_guard_tsh_json" = 1 ]; then
        printf '{"id":"%s","title":"%s","description":"%s","severity":"%s","confidence":"%s","reason":"%s","risk":"%s","apply":{' \
            "$(_guard_env_json_string "$_guard_tsh_id")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.title")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.description")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.recommendation.severity")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.recommendation.confidence")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.recommendation.reason")")" \
            "$(_guard_env_json_string "$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.recommendation.risk")")"
        _guard_tsh_first=1
        for _guard_tsh_key in $_GUARD_TEMPLATE_APPLY_KEYS
        do
            if json_has "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.apply.${_guard_tsh_key}"; then
                _guard_tsh_val=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_tsh_id}.apply.${_guard_tsh_key}") || continue
                if [ "$_guard_tsh_first" = 1 ]; then
                    _guard_tsh_first=0
                else
                    printf ','
                fi
                case $_guard_tsh_val in
                    true|false)
                        printf '"%s":%s' "$(_guard_env_json_string "$_guard_tsh_key")" "$_guard_tsh_val"
                        ;;
                    *)
                        printf '"%s":"%s"' "$(_guard_env_json_string "$_guard_tsh_key")" "$(_guard_env_json_string "$_guard_tsh_val")"
                        ;;
                esac
            fi
        done
        printf '}}\n'
        return 0
    fi
    cli_section "$_guard_tsh_id"
    _guard_template_print_one "$_GUARD_TEMPLATE_FILE" "$_guard_tsh_id" 1
}

guard_cmd_template_apply() {
    _guard_ta_id=
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
            --*)
                cli_die "unknown template apply option: $1" 2
                ;;
            *)
                if [ -n "$_guard_ta_id" ]; then
                    cli_die "duplicate template id" 2
                fi
                _guard_ta_id=$1
                shift
                ;;
        esac
    done
    if [ -z "$_guard_ta_id" ]; then
        cli_error "usage: openclash-guard template apply <id> [--dry-run] [--yes]"
        return 2
    fi
    _guard_template_require_catalog || return $?
    if ! json_has "$_GUARD_TEMPLATE_FILE" "templates.${_guard_ta_id}"; then
        cli_error "unknown template: $_guard_ta_id"
        return 1
    fi
    _guard_ta_env=$(_guard_template_env_file) || return $?
    rm -f "$_guard_ta_env"
    if [ "${GUARD_DRY_RUN:-0}" != 1 ]; then
        if ! cli_confirm "Apply template ${_guard_ta_id}?"; then
            cli_error "refusing to apply without confirmation (pass --yes)"
            return 1
        fi
    fi
    cli_section "template ${_guard_ta_id}"
    _guard_template_dump_apply "$_GUARD_TEMPLATE_FILE" "$_guard_ta_id"
    guard_intent_ensure_sections || return $?
    for _guard_ta_key in $_GUARD_TEMPLATE_APPLY_KEYS
    do
        if json_has "$_GUARD_TEMPLATE_FILE" "templates.${_guard_ta_id}.apply.${_guard_ta_key}"; then
            _guard_ta_val=$(json_get "$_GUARD_TEMPLATE_FILE" "templates.${_guard_ta_id}.apply.${_guard_ta_key}") || continue
            _guard_template_apply_key "$_guard_ta_key" "$_guard_ta_val" || return $?
        fi
    done
    if [ "${GUARD_DRY_RUN:-0}" = 1 ]; then
        cli_info "dry-run: no UCI written"
        return 0
    fi
    uci_commit_if_changed openclash_guard || return $?
    guard_cmd_reconcile
}

guard_cmd_template() {
    _guard_tc_sub=${1:-}
    if [ "$#" -gt 0 ]; then
        shift
    fi
    case $_guard_tc_sub in
        list)
            guard_cmd_template_list "$@"
            ;;
        suggest)
            guard_cmd_template_suggest "$@"
            ;;
        show)
            guard_cmd_template_show "$@"
            ;;
        apply)
            guard_cmd_template_apply "$@"
            ;;
        *)
            printf '%s\n' "usage: openclash-guard template list|suggest|show|apply" >&2
            return 2
            ;;
    esac
}
