#!/bin/sh
# Bounded Mihomo DNS API probes for diagnostic receipts only.
# Prefix: guard_resolver_probe_
set -eu

_GUARD_RESOLVER_PROBE_MAX_BYTES=65536
_GUARD_RESOLVER_PROBE_MAX_ADDRESSES=128
_GUARD_RESOLVER_PROBE_CONNECT_TIMEOUT=1
_GUARD_RESOLVER_PROBE_MAX_TIME=3
_GUARD_RESOLVER_PROBE_MAX_BUDGET=8

_guard_resolver_probe_snapshot_path() {
    if [ -n "${GUARD_RESOLVER_PROBE_FILE:-}" ]; then
        printf '%s\n' "$GUARD_RESOLVER_PROBE_FILE"
    else
        printf '%s/var/run/openclash-guard/resolver-probe.json\n' "${GUARD_PREFIX:-}"
    fi
}

_guard_resolver_probe_api_base() {
    _guard_rp_ab=${1:-${GUARD_MIHOMO_API_BASE:-}}
    case $_guard_rp_ab in
        http://127.0.0.1:*|http://\[::1\]:*) ;;
        *) return 1 ;;
    esac
    _guard_rp_ab_rest=${_guard_rp_ab#http://}
    case $_guard_rp_ab_rest in *'/'*|*\?*|*\#*|*@*) return 1 ;; esac
    case $_guard_rp_ab_rest in
        127.0.0.1:*) _guard_rp_ab_port=${_guard_rp_ab_rest#127.0.0.1:} ;;
        '[::1]:'*) _guard_rp_ab_port=${_guard_rp_ab_rest#'[::1]:'} ;;
        *) return 1 ;;
    esac
    case $_guard_rp_ab_port in ''|*[!0-9]*) return 1 ;; esac
    _guard_resolver_sync_uint "$_guard_rp_ab_port" || return 1
    [ "$_guard_rp_ab_port" -ge 1 ] 2>/dev/null || return 1
    [ "$_guard_rp_ab_port" -le 65535 ] 2>/dev/null || return 1
    printf '%s\n' "$_guard_rp_ab"
}

_guard_resolver_probe_valid_domain() {
    _guard_rp_vd_name=${1:-}
    [ -n "$_guard_rp_vd_name" ] && [ "${#_guard_rp_vd_name}" -le 253 ] || return 1
    case $_guard_rp_vd_name in *[!a-z0-9.-]*|.*|*.|*..*) return 1 ;; esac
    _guard_rp_vd_rest=$_guard_rp_vd_name
    while [ -n "$_guard_rp_vd_rest" ]; do
        case $_guard_rp_vd_rest in
            *.*)
                _guard_rp_vd_label=${_guard_rp_vd_rest%%.*}
                _guard_rp_vd_rest=${_guard_rp_vd_rest#*.}
                ;;
            *)
                _guard_rp_vd_label=$_guard_rp_vd_rest
                _guard_rp_vd_rest=
                ;;
        esac
        [ -n "$_guard_rp_vd_label" ] && [ "${#_guard_rp_vd_label}" -le 63 ] || return 1
        case $_guard_rp_vd_label in -*|*-|*[!a-z0-9-]*) return 1 ;; esac
    done
}

_guard_resolver_probe_prepare_auth() {
    _guard_rp_pa_work=$1
    _GUARD_RESOLVER_PROBE_AUTH_CONFIG=
    _guard_rp_pa_file=${GUARD_MIHOMO_API_TOKEN_FILE:-}
    [ -n "$_guard_rp_pa_file" ] || return 0
    [ -f "$_guard_rp_pa_file" ] && [ ! -L "$_guard_rp_pa_file" ] || return 1
    command -v stat >/dev/null 2>&1 || return 1
    _guard_rp_pa_mode=$(stat -c '%a' "$_guard_rp_pa_file" 2>/dev/null) || return 1
    case $_guard_rp_pa_mode in [4-7]00) ;; *) return 1 ;; esac
    _guard_rp_pa_token=$(cat "$_guard_rp_pa_file" 2>/dev/null) || return 1
    [ -n "$_guard_rp_pa_token" ] || return 1
    [ "${#_guard_rp_pa_token}" -le 256 ] || return 1
    case $_guard_rp_pa_token in *'"'*|*'\'*) return 1 ;; esac
    _guard_rp_pa_control=$(printf '%s' "$_guard_rp_pa_token" | LC_ALL=C tr -d '[:print:]')
    [ -z "$_guard_rp_pa_control" ] || return 1
    _GUARD_RESOLVER_PROBE_AUTH_CONFIG=$(file_mktemp "$_guard_rp_pa_work") || return 1
    (umask 077; printf 'header = "Authorization: Bearer %s"\n' "$_guard_rp_pa_token" > "$_GUARD_RESOLVER_PROBE_AUTH_CONFIG") || return 1
    chmod 0600 "$_GUARD_RESOLVER_PROBE_AUTH_CONFIG" || return 1
    _guard_rp_pa_token=
}

_guard_resolver_probe_fetch() {
    _guard_rp_f_name=$1
    _guard_rp_f_type=$2
    _guard_rp_f_output=$3
    _guard_rp_f_auth=${4:-}
    _guard_rp_f_base=${5:-}
    command -v curl >/dev/null 2>&1 || return 127
    _guard_rp_f_base=$(_guard_resolver_probe_api_base "$_guard_rp_f_base") || return 2
    case $_guard_rp_f_name in ''|*[!a-z0-9.-]*) return 2 ;; esac
    case $_guard_rp_f_type in A|AAAA) ;; *) return 2 ;; esac
    set -- -fsS --max-redirs 0 --noproxy '*' --proxy '' \
        --connect-timeout "$_GUARD_RESOLVER_PROBE_CONNECT_TIMEOUT" \
        --max-time "$_GUARD_RESOLVER_PROBE_MAX_TIME" \
        --max-filesize "$_GUARD_RESOLVER_PROBE_MAX_BYTES" \
        -o "$_guard_rp_f_output"
    [ -z "$_guard_rp_f_auth" ] || set -- "$@" --config "$_guard_rp_f_auth"
    curl --disable "$@" "$_guard_rp_f_base/dns/query?name=$_guard_rp_f_name&type=$_guard_rp_f_type" 2>/dev/null || return 1
    _guard_rp_f_size=$(wc -c < "$_guard_rp_f_output" | tr -d '[:space:]') || return 1
    _guard_resolver_sync_uint "$_guard_rp_f_size" || return 1
    [ "$_guard_rp_f_size" -gt 0 ] 2>/dev/null || return 1
    [ "$_guard_rp_f_size" -le "$_GUARD_RESOLVER_PROBE_MAX_BYTES" ] 2>/dev/null
}

_guard_resolver_probe_target_in_scope() {
    _guard_rp_ts_service=$1
    _guard_rp_ts_name=$2
    case $_guard_rp_ts_service in ''|*[!a-z0-9-]*) return 1 ;; esac
    _guard_resolver_probe_valid_domain "$_guard_rp_ts_name" || return 1
    while IFS=' ' read -r _guard_rp_ts_rule_service _guard_rp_ts_mode _guard_rp_ts_domain _guard_rp_ts_extra; do
        [ "${_guard_rp_ts_rule_service:-}" = "$_guard_rp_ts_service" ] || continue
        [ -z "${_guard_rp_ts_extra:-}" ] || return 1
        case $_guard_rp_ts_mode in exact|suffix) ;; *) return 1 ;; esac
        [ "$_guard_rp_ts_name" = "$_guard_rp_ts_domain" ] && return 0
    done <<EOF
${_GUARD_RESOLVER_SYNC_DATA_SELECTORS:-}
EOF
    return 1
}

_guard_resolver_probe_normalize_target() {
    _guard_rp_nt_raw=${1:-}
    case $_guard_rp_nt_raw in */*/*) ;; *) return 1 ;; esac
    _guard_rp_nt_service=${_guard_rp_nt_raw%%/*}
    _guard_rp_nt_rest=${_guard_rp_nt_raw#*/}
    _guard_rp_nt_name=${_guard_rp_nt_rest%%/*}
    _guard_rp_nt_type=${_guard_rp_nt_rest#*/}
    case $_guard_rp_nt_service in ''|*[!a-z0-9-]*) return 1 ;; esac
    case $_guard_rp_nt_type in A|AAAA) ;; *) return 1 ;; esac
    _guard_resolver_probe_valid_domain "$_guard_rp_nt_name" || return 1
    printf '%s %s %s\n' "$_guard_rp_nt_service" "$_guard_rp_nt_name" "$_guard_rp_nt_type"
}

_guard_resolver_probe_is_fake_ip() {
    case ${1:-} in
        198.18.*|198.19.*) return 0 ;;
    esac
    return 1
}

_guard_resolver_probe_parse_answer() {
    _guard_rp_pa_file=$1
    _guard_rp_pa_name=$2
    _guard_rp_pa_qtype=$3
    _guard_rp_pa_service=$4
    _guard_rp_pa_start=$5
    _guard_rp_pa_records=$6
    _guard_rp_pa_answer_file=$7
    _guard_rp_pa_question_file=$8

    _guard_rp_pa_status=$(jsonfilter -i "$_guard_rp_pa_file" -e '@.Status' 2>/dev/null) || return 1
    [ "$_guard_rp_pa_status" = 0 ] || return 1
    _guard_rp_pa_tc=$(jsonfilter -i "$_guard_rp_pa_file" -e '@.TC' 2>/dev/null) || return 1
    [ "$_guard_rp_pa_tc" = false ] || return 1

    _guard_rp_pa_question_type=$(jsonfilter -i "$_guard_rp_pa_file" -t '@.Question' 2>/dev/null) || return 1
    [ "$_guard_rp_pa_question_type" = array ] || return 1
    jsonfilter -i "$_guard_rp_pa_file" -e '@.Question[*]' > "$_guard_rp_pa_question_file" 2>/dev/null || return 1
    _guard_rp_pa_question=
    while IFS= read -r _guard_rp_pa_question_line; do
        [ -n "$_guard_rp_pa_question_line" ] || continue
        [ -z "$_guard_rp_pa_question" ] || return 1
        _guard_rp_pa_question=$_guard_rp_pa_question_line
    done < "$_guard_rp_pa_question_file"
    [ -n "$_guard_rp_pa_question" ] || return 1
    _guard_rp_pa_question_name=$(jsonfilter -s "$_guard_rp_pa_question" -e '@.Name' 2>/dev/null) || return 1
    _guard_rp_pa_question_name=$(printf '%s' "$_guard_rp_pa_question_name" | tr 'A-Z' 'a-z')
    _guard_rp_pa_question_name=${_guard_rp_pa_question_name%.}
    [ "$_guard_rp_pa_question_name" = "$_guard_rp_pa_name" ] || return 1
    _guard_rp_pa_question_type=$(jsonfilter -s "$_guard_rp_pa_question" -e '@.Qtype' 2>/dev/null) || return 1
    case $_guard_rp_pa_qtype:$_guard_rp_pa_question_type in A:1|AAAA:28) ;; *) return 1 ;; esac

    _guard_rp_pa_answer_type=$(jsonfilter -i "$_guard_rp_pa_file" -t '@.Answer' 2>/dev/null) || _guard_rp_pa_answer_type=missing
    if [ "$_guard_rp_pa_answer_type" = missing ]; then
        : > "$_guard_rp_pa_answer_file"
        _GUARD_RESOLVER_PROBE_ANSWER_COUNT=0
        _GUARD_RESOLVER_PROBE_ADDRESS_COUNT=0
        return 0
    fi
    [ "$_guard_rp_pa_answer_type" = array ] || return 1
    : > "$_guard_rp_pa_answer_file"
    jsonfilter -i "$_guard_rp_pa_file" -e '@.Answer[*]' > "$_guard_rp_pa_answer_file" 2>/dev/null || {
        [ ! -s "$_guard_rp_pa_answer_file" ] || return 1
    }

    _guard_rp_pa_chain="|$_guard_rp_pa_name|"
    : > "$_guard_rp_pa_records.answers"
    while IFS= read -r _guard_rp_pa_answer; do
        [ -n "$_guard_rp_pa_answer" ] || continue
        _guard_rp_pa_type=$(jsonfilter -s "$_guard_rp_pa_answer" -e '@.type' 2>/dev/null) || return 1
        case $_guard_rp_pa_type in 1|5|28) ;; *) continue ;; esac
        _guard_rp_pa_ttl=$(jsonfilter -s "$_guard_rp_pa_answer" -e '@.TTL' 2>/dev/null) || return 1
        _guard_resolver_sync_uint "$_guard_rp_pa_ttl" || return 1
        _guard_rp_pa_owner=$(jsonfilter -s "$_guard_rp_pa_answer" -e '@.name' 2>/dev/null) || return 1
        _guard_rp_pa_owner=$(printf '%s' "$_guard_rp_pa_owner" | tr 'A-Z' 'a-z')
        _guard_rp_pa_owner=${_guard_rp_pa_owner%.}
        _guard_resolver_probe_valid_domain "$_guard_rp_pa_owner" || return 1
        _guard_rp_pa_value=$(jsonfilter -s "$_guard_rp_pa_answer" -e '@.data' 2>/dev/null) || return 1
        case $_guard_rp_pa_type in
            1)
                [ "$_guard_rp_pa_qtype" = A ] || return 1
                _guard_resolver_sync_valid_ipv4 "$_guard_rp_pa_value" || return 1
                _guard_resolver_probe_is_fake_ip "$_guard_rp_pa_value" && return 2
                ;;
            28)
                [ "$_guard_rp_pa_qtype" = AAAA ] || return 1
                _guard_resolver_sync_valid_ipv6 "$_guard_rp_pa_value" || return 1
                ;;
            5)
                _guard_rp_pa_value=$(printf '%s' "$_guard_rp_pa_value" | tr 'A-Z' 'a-z')
                _guard_rp_pa_value=${_guard_rp_pa_value%.}
                _guard_resolver_probe_valid_domain "$_guard_rp_pa_value" || return 1
                ;;
        esac
        printf '%s %s %s %s\n' "$_guard_rp_pa_type" "$_guard_rp_pa_owner" \
            "$_guard_rp_pa_value" "$_guard_rp_pa_ttl" >> "$_guard_rp_pa_records.answers"
    done < "$_guard_rp_pa_answer_file"

    _guard_rp_pa_changed=1
    while [ "$_guard_rp_pa_changed" = 1 ]; do
        _guard_rp_pa_changed=0
        while IFS=' ' read -r _guard_rp_pa_type _guard_rp_pa_owner _guard_rp_pa_value _guard_rp_pa_ttl; do
            [ "$_guard_rp_pa_type" = 5 ] || continue
            case $_guard_rp_pa_chain in *"|$_guard_rp_pa_owner|"*) ;; *) continue ;; esac
            case $_guard_rp_pa_chain in *"|$_guard_rp_pa_value|"*) ;; *)
                _guard_rp_pa_chain=$_guard_rp_pa_chain$_guard_rp_pa_value'|'
                _guard_rp_pa_changed=1
                ;;
            esac
        done < "$_guard_rp_pa_records.answers"
    done

    _guard_rp_pa_min_ttl=
    _guard_rp_pa_answer_count=0
    : > "$_guard_rp_pa_records.addresses"
    while IFS=' ' read -r _guard_rp_pa_type _guard_rp_pa_owner _guard_rp_pa_value _guard_rp_pa_ttl; do
        [ -n "$_guard_rp_pa_type" ] || continue
        case $_guard_rp_pa_chain in *"|$_guard_rp_pa_owner|"*) ;; *) return 1 ;; esac
        case $_guard_rp_pa_type in
            5)
                ;;
            1)
                printf '4 %s %s\n' "$_guard_rp_pa_value" "$_guard_rp_pa_ttl" >> "$_guard_rp_pa_records.addresses"
                _guard_rp_pa_answer_count=$((_guard_rp_pa_answer_count + 1))
                ;;
            28)
                printf '6 %s %s\n' "$_guard_rp_pa_value" "$_guard_rp_pa_ttl" >> "$_guard_rp_pa_records.addresses"
                _guard_rp_pa_answer_count=$((_guard_rp_pa_answer_count + 1))
                ;;
        esac
        if [ -z "$_guard_rp_pa_min_ttl" ] || [ "$_guard_rp_pa_ttl" -lt "$_guard_rp_pa_min_ttl" ] 2>/dev/null; then
            _guard_rp_pa_min_ttl=$_guard_rp_pa_ttl
        fi
    done < "$_guard_rp_pa_records.answers"

    _GUARD_RESOLVER_PROBE_ANSWER_COUNT=$_guard_rp_pa_answer_count
    _GUARD_RESOLVER_PROBE_ADDRESS_COUNT=0
    if [ -n "$_guard_rp_pa_min_ttl" ] && [ "$_guard_rp_pa_answer_count" -gt 0 ]; then
        _guard_rp_pa_max_ttl=$(_guard_resolver_sync_max_ttl) || return 1
        [ "$_guard_rp_pa_min_ttl" -le "$_guard_rp_pa_max_ttl" ] 2>/dev/null || _guard_rp_pa_min_ttl=$_guard_rp_pa_max_ttl
        if [ "$_guard_rp_pa_min_ttl" -gt 0 ] 2>/dev/null; then
            _guard_rp_pa_expiry=$((_guard_rp_pa_start + _guard_rp_pa_min_ttl))
            while IFS=' ' read -r _guard_rp_pa_family _guard_rp_pa_address _guard_rp_pa_address_ttl; do
                [ -n "$_guard_rp_pa_family" ] || continue
                printf '%s %s %s %s %s %s %s\n' \
                    "$_guard_rp_pa_service" "$_guard_rp_pa_name" "$_guard_rp_pa_qtype" \
                    "$_guard_rp_pa_family" "$_guard_rp_pa_address" "$_guard_rp_pa_min_ttl" \
                    "$_guard_rp_pa_expiry" >> "$_guard_rp_pa_records"
                _GUARD_RESOLVER_PROBE_ADDRESS_COUNT=$((_GUARD_RESOLVER_PROBE_ADDRESS_COUNT + 1))
            done < "$_guard_rp_pa_records.addresses"
        fi
    fi
}

_guard_resolver_probe_select_targets() {
    _guard_rp_st_override=$1
    _guard_rp_st_output=$2
    : > "$_guard_rp_st_output"
    [ -n "$_guard_rp_st_override" ] || return 2
    cat "$_guard_rp_st_override" > "$_guard_rp_st_output" || return 1
    [ -s "$_guard_rp_st_output" ]
}

_guard_resolver_probe_line_count() {
    _guard_rp_lc_file=$1
    _GUARD_RESOLVER_PROBE_LINE_COUNT=0
    while IFS= read -r _guard_rp_lc_line; do
        [ -n "$_guard_rp_lc_line" ] || continue
        _GUARD_RESOLVER_PROBE_LINE_COUNT=$((_GUARD_RESOLVER_PROBE_LINE_COUNT + 1))
    done < "$_guard_rp_lc_file"
}

_guard_resolver_probe_selector_count() {
    _GUARD_RESOLVER_PROBE_SELECTOR_COUNT=0
    while IFS=' ' read -r _guard_rp_sc_service _guard_rp_sc_mode _guard_rp_sc_domain _guard_rp_sc_extra; do
        [ -n "${_guard_rp_sc_service:-}" ] || continue
        _GUARD_RESOLVER_PROBE_SELECTOR_COUNT=$((_GUARD_RESOLVER_PROBE_SELECTOR_COUNT + 1))
    done <<EOF
${_GUARD_RESOLVER_SYNC_DATA_SELECTORS:-}
EOF
}

_guard_resolver_probe_write_snapshot() {
    _guard_rp_ws_statuses=$1
    _guard_rp_ws_records=$2
    _guard_rp_ws_dest=$3
    _guard_rp_ws_selected=$4
    _guard_rp_ws_attempted=$5
    _guard_rp_ws_completed=$6
    _guard_rp_ws_answers=$7
    _guard_rp_ws_addresses=$8
    _guard_rp_ws_expired=$9
    _guard_rp_ws_now=${10}
    _guard_rp_ws_dir=$(dirname "$_guard_rp_ws_dest")
    [ "$_guard_rp_ws_dir" = "$_guard_rp_work_parent" ] || return 1
    if [ -L "$_guard_rp_ws_dest" ]; then
        return 1
    fi
    if [ -e "$_guard_rp_ws_dest" ]; then
        [ -f "$_guard_rp_ws_dest" ] || return 1
    fi
    _guard_rp_ws_tmp=$(file_mktemp "$_guard_rp_work") || return 1
    if ! {
        printf '{"schemaVersion":1,"adapter":"mihomo-dns-query","status":"partial","enforcementReady":false,'
        printf '"sourceRevision":"%s","updatedAtEpoch":%s,' "$_GUARD_RESOLVER_SYNC_DATA_SOURCE_REVISION" "$_guard_rp_ws_now"
        _guard_resolver_probe_selector_count
        printf '"coverage":{"selectorRules":%s,"selectedProbes":%s,"attemptedProbes":%s,"completedProbes":%s,"fullSelectorCoverage":false},' \
            "$_GUARD_RESOLVER_PROBE_SELECTOR_COUNT" \
            "$_guard_rp_ws_selected" "$_guard_rp_ws_attempted" "$_guard_rp_ws_completed"
        printf '"answerRecords":%s,"addresses":%s,"expiredAddresses":%s,"targets":[' \
            "$_guard_rp_ws_answers" "$_guard_rp_ws_addresses" "$_guard_rp_ws_expired"
        _guard_rp_ws_first=1
        while IFS=' ' read -r _guard_rp_ws_service _guard_rp_ws_name _guard_rp_ws_type _guard_rp_ws_target_status; do
            [ -n "$_guard_rp_ws_service" ] || continue
            [ "$_guard_rp_ws_first" = 1 ] || printf ','
            _guard_rp_ws_first=0
            printf '{"service":"%s","name":"%s","type":"%s","status":"%s","addresses":[' \
                "$_guard_rp_ws_service" "$_guard_rp_ws_name" "$_guard_rp_ws_type" "$_guard_rp_ws_target_status"
            _guard_rp_ws_address_first=1
            while IFS=' ' read -r _guard_rp_ws_rec_service _guard_rp_ws_rec_name _guard_rp_ws_rec_type _guard_rp_ws_family _guard_rp_ws_address _guard_rp_ws_ttl _guard_rp_ws_expiry; do
                [ -n "$_guard_rp_ws_rec_service" ] || continue
                [ "$_guard_rp_ws_rec_service/$_guard_rp_ws_rec_name/$_guard_rp_ws_rec_type" = "$_guard_rp_ws_service/$_guard_rp_ws_name/$_guard_rp_ws_type" ] || continue
                [ "$_guard_rp_ws_expiry" -gt "$_guard_rp_ws_now" ] 2>/dev/null || continue
                [ "$_guard_rp_ws_address_first" = 1 ] || printf ','
                _guard_rp_ws_address_first=0
                _guard_rp_ws_remaining=$((_guard_rp_ws_expiry - _guard_rp_ws_now))
                printf '{"family":%s,"address":"%s","ttl":%s,"expiresAtEpoch":%s}' \
                    "$_guard_rp_ws_family" "$_guard_rp_ws_address" "$_guard_rp_ws_remaining" "$_guard_rp_ws_expiry"
            done < "$_guard_rp_ws_records"
            printf ']}'
        done < "$_guard_rp_ws_statuses"
        printf ']}\n'
    } > "$_guard_rp_ws_tmp"; then
        rm -f "$_guard_rp_ws_tmp"
        return 1
    fi
    chmod 0600 "$_guard_rp_ws_tmp" || { rm -f "$_guard_rp_ws_tmp"; return 1; }
    if ! mv -T -f "$_guard_rp_ws_tmp" "$_guard_rp_ws_dest"; then
        rm -f "$_guard_rp_ws_tmp"
        return 1
    fi
    chmod 0600 "$_guard_rp_ws_dest" || return 1
    rm -f "$_guard_rp_ws_tmp"
}

_guard_resolver_probe_receipt() {
    _guard_rp_pr_status=$1
    _guard_rp_pr_reason=$2
    _guard_rp_pr_configured=$3
    _guard_rp_pr_selected=$4
    _guard_rp_pr_attempted=$5
    _guard_rp_pr_completed=$6
    _guard_rp_pr_answers=$7
    _guard_rp_pr_addresses=$8
    _guard_rp_pr_expired=$9
    printf '{"status":"%s","reason":"%s","enforcementReady":false,"selectorRules":%s,"selectedProbes":%s,"attemptedProbes":%s,"completedProbes":%s,"answerRecords":%s,"addresses":%s,"expiredAddresses":%s}\n' \
        "$_guard_rp_pr_status" "$_guard_rp_pr_reason" "$_guard_rp_pr_configured" \
        "$_guard_rp_pr_selected" "$_guard_rp_pr_attempted" "$_guard_rp_pr_completed" \
        "$_guard_rp_pr_answers" "$_guard_rp_pr_addresses" "$_guard_rp_pr_expired"
}

_guard_resolver_probe_cleanup() {
    [ -n "${_guard_rp_work:-}" ] || return 0
    [ -n "${_guard_rp_work_parent:-}" ] || return 1
    case $_guard_rp_work in "$_guard_rp_work_parent"/openclash-guard-probe.*) ;; *) return 1 ;; esac
    [ -d "$_guard_rp_work" ] && [ ! -L "$_guard_rp_work" ] || { _guard_rp_work=; return 0; }
    rm -f "$_guard_rp_work"/shlib.*
    rmdir "$_guard_rp_work" 2>/dev/null || true
    _guard_rp_work=
}

guard_resolver_probe_run() (
    _GUARD_RESOLVER_PROBE_AUTH_CONFIG=
    _guard_rp_work=
    _guard_rp_work_parent=
    _guard_rp_targets_data=
    _guard_rp_targets_seen='|'
    trap '_guard_resolver_probe_cleanup' 0
    trap '_guard_resolver_probe_cleanup; exit 129' 1
    trap '_guard_resolver_probe_cleanup; exit 130' 2
    trap '_guard_resolver_probe_cleanup; exit 143' 15
    _guard_rp_budget=${GUARD_RESOLVER_PROBE_MAX_PROBES:-4}
    _guard_rp_api_base=${GUARD_MIHOMO_API_BASE:-}
    while [ "$#" -gt 0 ]; do
        case $1 in
            --api-base)
                [ "$#" -ge 2 ] || return 2
                _guard_rp_api_base=$2
                shift 2
                ;;
            --token-file)
                [ "$#" -ge 2 ] || return 2
                GUARD_MIHOMO_API_TOKEN_FILE=$2
                shift 2
                ;;
            --max-probes)
                [ "$#" -ge 2 ] || return 2
                _guard_rp_budget=$2
                shift 2
                ;;
            --target)
                [ "$#" -ge 2 ] || return 2
                _guard_rp_normalized=$(_guard_resolver_probe_normalize_target "$2") || {
                    return 2
                }
                case $_guard_rp_targets_seen in *"|$_guard_rp_normalized|"*) return 2 ;; esac
                _guard_rp_targets_seen=$_guard_rp_targets_seen$_guard_rp_normalized'|'
                if [ -n "$_guard_rp_targets_data" ]; then
                    _guard_rp_targets_data=$(printf '%s\n%s' "$_guard_rp_targets_data" "$_guard_rp_normalized")
                else
                    _guard_rp_targets_data=$_guard_rp_normalized
                fi
                shift 2
                ;;
            *)
                return 2
                ;;
        esac
    done
    _guard_resolver_sync_uint "$_guard_rp_budget" || return 2
    [ "$_guard_rp_budget" -ge 1 ] 2>/dev/null && [ "$_guard_rp_budget" -le "$_GUARD_RESOLVER_PROBE_MAX_BUDGET" ] 2>/dev/null || {
        return 2
    }
    [ -n "$_guard_rp_targets_data" ] || {
        _guard_resolver_probe_receipt degraded target-selection-required 0 0 0 0 0 0 0
        return 2
    }
    _guard_rp_api_base=$(_guard_resolver_probe_api_base "$_guard_rp_api_base") || {
        _guard_resolver_probe_receipt degraded controller-not-loopback 0 0 0 0 0 0 0
        return 1
    }

    _guard_rp_snapshot=$(_guard_resolver_probe_snapshot_path)
    _guard_rp_work_parent=$(dirname "$_guard_rp_snapshot")
    mkdir -p "$_guard_rp_work_parent" || return 1
    _guard_rp_work=$(umask 077; mktemp -d "$_guard_rp_work_parent/openclash-guard-probe.XXXXXX") || return 1
    chmod 0700 "$_guard_rp_work" || return 1
    _guard_rp_responses=$(file_mktemp "$_guard_rp_work") || return 1
    _guard_rp_answers=$(file_mktemp "$_guard_rp_work") || return 1
    _guard_rp_questions=$(file_mktemp "$_guard_rp_work") || return 1
    _guard_rp_targets=$(file_mktemp "$_guard_rp_work") || return 1
    _guard_rp_statuses=$(file_mktemp "$_guard_rp_work") || return 1
    _guard_rp_records=$(file_mktemp "$_guard_rp_work") || return 1
    : > "$_guard_rp_records"
    _guard_rp_targets_tmp=$(file_mktemp "$_guard_rp_work") || return 1
    printf '%s\n' "$_guard_rp_targets_data" > "$_guard_rp_targets_tmp" || return 1
    if ! _guard_resolver_probe_prepare_auth "$_guard_rp_work"; then
        _guard_resolver_probe_receipt degraded credential-unavailable 0 0 0 0 0 0 0
        return 1
    fi
    if [ -n "$_guard_rp_targets_tmp" ]; then
        if ! _guard_resolver_probe_select_targets "$_guard_rp_targets_tmp" "$_guard_rp_targets"; then
            _guard_resolver_probe_receipt degraded target-selection-required 0 0 0 0 0 0 0
            return 2
        fi
    else
        _guard_resolver_probe_receipt degraded target-selection-required 0 0 0 0 0 0 0
        return 2
    fi

    _guard_resolver_probe_selector_count
    _guard_rp_configured=$_GUARD_RESOLVER_PROBE_SELECTOR_COUNT
    _guard_resolver_probe_line_count "$_guard_rp_targets"
    _guard_rp_selected_total=$_GUARD_RESOLVER_PROBE_LINE_COUNT
    if [ "$_guard_rp_selected_total" -gt "$_GUARD_RESOLVER_PROBE_MAX_BUDGET" ] 2>/dev/null; then
        _guard_resolver_probe_receipt degraded target-budget-exceeded "$_guard_rp_configured" "$_guard_rp_selected_total" 0 0 0 0 0
        return 2
    fi
    _guard_rp_valid_targets=$(file_mktemp "$_guard_rp_work") || return 1
    while IFS=' ' read -r _guard_rp_target_service _guard_rp_target_name _guard_rp_target_type _guard_rp_target_extra; do
        [ -n "$_guard_rp_target_service" ] || continue
        [ -z "${_guard_rp_target_extra:-}" ] && \
            { [ "$_guard_rp_target_type" = A ] || [ "$_guard_rp_target_type" = AAAA ]; } && \
            _guard_resolver_probe_target_in_scope "$_guard_rp_target_service" "$_guard_rp_target_name" || {
                _guard_resolver_probe_receipt degraded target-not-in-selector-inventory "$_guard_rp_configured" "$_guard_rp_selected_total" 0 0 0 0 0
                return 2
            }
        printf '%s %s %s\n' "$_guard_rp_target_service" "$_guard_rp_target_name" "$_guard_rp_target_type" >> "$_guard_rp_valid_targets"
    done < "$_guard_rp_targets"
    mv -f "$_guard_rp_valid_targets" "$_guard_rp_targets"
    _guard_rp_selected=0
    _guard_rp_attempted=0
    _guard_rp_completed=0
    _guard_rp_answer_total=0
    _guard_rp_address_total=0
    _guard_rp_expired=0
    _guard_rp_reason=
    _guard_rp_now=${GUARD_RESOLVER_PROBE_NOW_EPOCH:-$(date +%s)}
    _guard_resolver_sync_uint "$_guard_rp_now" || _guard_rp_now=
    if [ -z "$_guard_rp_now" ]; then
        _guard_rp_reason=clock-invalid
    else
        while IFS=' ' read -r _guard_rp_target_service _guard_rp_target_name _guard_rp_target_type _guard_rp_extra; do
            [ -n "$_guard_rp_target_service" ] || continue
            [ -z "${_guard_rp_extra:-}" ] || { _guard_rp_reason=target-invalid; break; }
            [ "$_guard_rp_selected" -lt "$_guard_rp_budget" ] || break
            _guard_rp_target_key=$_guard_rp_target_service/$_guard_rp_target_name/$_guard_rp_target_type
            _guard_rp_selected=$((_guard_rp_selected + 1))
            _guard_rp_attempted=$((_guard_rp_attempted + 1))
            _guard_rp_request_start=${GUARD_RESOLVER_PROBE_NOW_EPOCH:-$(date +%s)}
            _guard_resolver_sync_uint "$_guard_rp_request_start" || { _guard_rp_reason=clock-invalid; break; }
            if ! _guard_resolver_probe_fetch "$_guard_rp_target_name" "$_guard_rp_target_type" "$_guard_rp_responses" "$_GUARD_RESOLVER_PROBE_AUTH_CONFIG" "$_guard_rp_api_base"; then
                _guard_rp_reason=api-unavailable
                break
            fi
            _guard_rp_parse_rc=0
            _guard_resolver_probe_parse_answer "$_guard_rp_responses" "$_guard_rp_target_name" "$_guard_rp_target_type" "$_guard_rp_target_service" "$_guard_rp_request_start" "$_guard_rp_records" "$_guard_rp_answers" "$_guard_rp_questions" || _guard_rp_parse_rc=$?
            if [ "$_guard_rp_parse_rc" -ne 0 ]; then
                _guard_rp_reason=malformed-response
                [ "$_guard_rp_parse_rc" -eq 2 ] && _guard_rp_reason=fake-ip-response
                break
            fi
            _guard_rp_completed=$((_guard_rp_completed + 1))
            _guard_rp_answer_total=$((_guard_rp_answer_total + _GUARD_RESOLVER_PROBE_ANSWER_COUNT))
            _guard_rp_address_total=$((_guard_rp_address_total + _GUARD_RESOLVER_PROBE_ADDRESS_COUNT))
            if [ "$_GUARD_RESOLVER_PROBE_ANSWER_COUNT" -gt 0 ]; then
                _guard_rp_target_status=answered
            else
                _guard_rp_target_status=no-data
            fi
            printf '%s %s %s %s\n' "$_guard_rp_target_service" "$_guard_rp_target_name" \
                "$_guard_rp_target_type" "$_guard_rp_target_status" >> "$_guard_rp_statuses"
        done < "$_guard_rp_targets"
    fi
    _guard_rp_now=${GUARD_RESOLVER_PROBE_NOW_EPOCH:-$(date +%s)}
    _guard_resolver_sync_uint "$_guard_rp_now" || _guard_rp_reason=clock-invalid
    if [ -z "$_guard_rp_reason" ]; then
        _guard_rp_active_records=$(file_mktemp "$_guard_rp_work") || _guard_rp_reason=temp-unavailable
        if [ -z "$_guard_rp_reason" ]; then
            : > "$_guard_rp_active_records"
            _guard_rp_expired=0
            _guard_rp_active_count=0
            while IFS=' ' read -r _guard_rp_record_service _guard_rp_record_name _guard_rp_record_type _guard_rp_record_family _guard_rp_record_address _guard_rp_record_ttl _guard_rp_record_expiry _guard_rp_record_extra; do
                [ -n "${_guard_rp_record_service:-}" ] || continue
                if [ -n "${_guard_rp_record_extra:-}" ] || \
                   ! _guard_resolver_sync_uint "${_guard_rp_record_ttl:-}" || \
                   ! _guard_resolver_sync_uint "${_guard_rp_record_expiry:-}"; then
                    _guard_rp_reason=record-validation-failed
                    break
                fi
                case $_guard_rp_record_family in
                    4) _guard_resolver_sync_valid_ipv4 "$_guard_rp_record_address" || { _guard_rp_reason=record-validation-failed; break; } ;;
                    6) _guard_resolver_sync_valid_ipv6 "$_guard_rp_record_address" || { _guard_rp_reason=record-validation-failed; break; } ;;
                    *) _guard_rp_reason=record-validation-failed; break ;;
                esac
                if [ "$_guard_rp_record_expiry" -gt "$_guard_rp_now" ] 2>/dev/null; then
                    printf '%s %s %s %s %s %s %s\n' \
                        "$_guard_rp_record_service" "$_guard_rp_record_name" "$_guard_rp_record_type" \
                        "$_guard_rp_record_family" "$_guard_rp_record_address" "$_guard_rp_record_ttl" \
                        "$_guard_rp_record_expiry" >> "$_guard_rp_active_records"
                    _guard_rp_active_count=$((_guard_rp_active_count + 1))
                else
                    _guard_rp_expired=$((_guard_rp_expired + 1))
                fi
            done < "$_guard_rp_records"
            if [ -z "$_guard_rp_reason" ]; then
                if [ "$_guard_rp_active_count" -gt "$_GUARD_RESOLVER_PROBE_MAX_ADDRESSES" ] 2>/dev/null; then
                    _guard_rp_reason=address-budget-exceeded
                else
                    _guard_rp_address_total=$_guard_rp_active_count
                    _guard_resolver_probe_write_snapshot "$_guard_rp_statuses" "$_guard_rp_active_records" "$(_guard_resolver_probe_snapshot_path)" \
                        "$_guard_rp_selected_total" "$_guard_rp_attempted" "$_guard_rp_completed" \
                        "$_guard_rp_answer_total" "$_guard_rp_address_total" "$_guard_rp_expired" "$_guard_rp_now" || _guard_rp_reason=snapshot-write-failed
                fi
            fi
            rm -f "$_guard_rp_active_records"
        fi
    fi

    if [ -n "$_guard_rp_reason" ]; then
        _guard_resolver_probe_receipt degraded "$_guard_rp_reason" "$_guard_rp_configured" "$_guard_rp_selected_total" \
            "$_guard_rp_attempted" "$_guard_rp_completed" "$_guard_rp_answer_total" "$_guard_rp_address_total" "$_guard_rp_expired"
        return 1
    fi
    _guard_resolver_probe_receipt partial configured-suffix-probes "$_guard_rp_configured" "$_guard_rp_selected_total" \
        "$_guard_rp_attempted" "$_guard_rp_completed" "$_guard_rp_answer_total" "$_guard_rp_address_total" "$_guard_rp_expired"
)
