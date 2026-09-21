#!/bin/sh
# AdGuard Home resolver-sync producer plus read-only capability verification.
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
_GUARD_RESOLVER_SYNC_INTERVAL_DEFAULT=30
_GUARD_RESOLVER_SYNC_MAX_TTL_DEFAULT=300
_GUARD_RESOLVER_SYNC_MAX_QUERYLOG_BYTES_DEFAULT=4194304
_GUARD_RESOLVER_SYNC_QUERYLOG_LIMIT_DEFAULT=1000

_guard_resolver_sync_state_path() {
    if [ -n "${GUARD_RESOLVER_SYNC_STATE_FILE:-}" ]; then
        printf '%s\n' "$GUARD_RESOLVER_SYNC_STATE_FILE"
    else
        printf '%s/var/run/openclash-guard/resolver-sync.json\n' "${GUARD_PREFIX:-}"
    fi
}

_guard_resolver_sync_cache_path() {
    if [ -n "${GUARD_RESOLVER_SYNC_CACHE_FILE:-}" ]; then
        printf '%s\n' "$GUARD_RESOLVER_SYNC_CACHE_FILE"
    else
        printf '%s/var/lib/openclash-guard/resolver-sync.cache\n' "${GUARD_PREFIX:-}"
    fi
}

_guard_resolver_sync_cursor_path() {
    if [ -n "${GUARD_RESOLVER_SYNC_CURSOR_FILE:-}" ]; then
        printf '%s\n' "$GUARD_RESOLVER_SYNC_CURSOR_FILE"
    else
        printf '%s/var/lib/openclash-guard/resolver-sync.cursor\n' "${GUARD_PREFIX:-}"
    fi
}

_guard_resolver_sync_uint() {
    case ${1:-} in
        ''|*[!0-9]*) return 1 ;;
        *) return 0 ;;
    esac
}

_guard_resolver_sync_valid_iface() {
    case ${1:-} in
        ''|*[!A-Za-z0-9_.:@-]*) return 1 ;;
        *) return 0 ;;
    esac
}

_guard_resolver_sync_valid_ipv4() {
    printf '%s\n' "${1:-}" | awk -F. '
        NF != 4 { exit 1 }
        {
            for (i = 1; i <= 4; i++) {
                if ($i !~ /^[0-9]+$/) exit 1
                if (length($i) > 1 && substr($i, 1, 1) == "0") exit 1
                if (($i + 0) > 255) exit 1
            }
        }
    '
}

_guard_resolver_sync_valid_ipv6() {
    printf '%s\n' "${1:-}" | awk '
        function hextet(x) { return length(x) >= 1 && length(x) <= 4 && x ~ /^[0-9A-Fa-f]+$/ }
        {
            value = $0
            if (value == "" || value ~ /[^0-9A-Fa-f:]/) exit 1
            doubles = gsub(/::/, "::", value)
            if (doubles > 1) exit 1
            compressed = index(value, "::") > 0
            fields = split(value, part, ":")
            used = 0
            for (i = 1; i <= fields; i++) {
                if (part[i] == "") continue
                if (!hextet(part[i])) exit 1
                used++
            }
            if (compressed) {
                if (used >= 8) exit 1
            } else if (used != 8) {
                exit 1
            }
        }
    '
}

_guard_resolver_sync_direct_iface() {
    _guard_rs_di_iface=${GUARD_DIRECT_WAN_IFACE:-}
    if [ -z "$_guard_rs_di_iface" ] && command -v ubus >/dev/null 2>&1 && command -v jsonfilter >/dev/null 2>&1; then
        _guard_rs_di_status=$(ubus call network.interface.wan status 2>/dev/null) || _guard_rs_di_status=
        if [ -n "$_guard_rs_di_status" ]; then
            _guard_rs_di_iface=$(jsonfilter -s "$_guard_rs_di_status" -e '@.l3_device' 2>/dev/null) || _guard_rs_di_iface=
        fi
    fi
    if [ -z "$_guard_rs_di_iface" ] && command -v uci >/dev/null 2>&1; then
        _guard_rs_di_iface=$(uci -q get network.wan.device 2>/dev/null) || _guard_rs_di_iface=
        if [ -z "$_guard_rs_di_iface" ]; then
            _guard_rs_di_iface=$(uci -q get network.wan.ifname 2>/dev/null) || _guard_rs_di_iface=
            set -- $_guard_rs_di_iface
            _guard_rs_di_iface=${1:-}
        fi
    fi
    if [ -z "$_guard_rs_di_iface" ] && command -v ip >/dev/null 2>&1; then
        _guard_rs_di_iface=$(ip -4 route show default 2>/dev/null | awk '
            $1 == "default" {
                for (i = 1; i <= NF; i++) {
                    if ($i == "dev" && (i + 1) <= NF) { print $(i + 1); exit }
                }
            }
        ') || _guard_rs_di_iface=
    fi
    _guard_resolver_sync_valid_iface "$_guard_rs_di_iface" || return 1
    printf '%s\n' "$_guard_rs_di_iface"
}

_guard_resolver_sync_interval() {
    _guard_rs_i=${GUARD_RESOLVER_SYNC_INTERVAL:-$_GUARD_RESOLVER_SYNC_INTERVAL_DEFAULT}
    _guard_resolver_sync_uint "$_guard_rs_i" || return 1
    [ "$_guard_rs_i" -ge 5 ] 2>/dev/null || return 1
    [ "$_guard_rs_i" -le 300 ] 2>/dev/null || return 1
    printf '%s\n' "$_guard_rs_i"
}

_guard_resolver_sync_max_ttl() {
    _guard_rs_mt=${GUARD_RESOLVER_SYNC_MAX_TTL:-$_GUARD_RESOLVER_SYNC_MAX_TTL_DEFAULT}
    _guard_resolver_sync_uint "$_guard_rs_mt" || return 1
    [ "$_guard_rs_mt" -ge 1 ] 2>/dev/null || return 1
    [ "$_guard_rs_mt" -le 3600 ] 2>/dev/null || return 1
    printf '%s\n' "$_guard_rs_mt"
}

_guard_resolver_sync_domain_match() {
    _guard_rs_dm_query=$(printf '%s' "${1:-}" | tr 'A-Z' 'a-z')
    _guard_rs_dm_query=${_guard_rs_dm_query%.}
    [ -n "$_guard_rs_dm_query" ] || return 1
    while IFS=' ' read -r _guard_rs_dm_service _guard_rs_dm_mode _guard_rs_dm_value _guard_rs_dm_extra; do
        [ -n "${_guard_rs_dm_service:-}" ] || continue
        [ -z "${_guard_rs_dm_extra:-}" ] || return 1
        case $_guard_rs_dm_mode in
            exact)
                [ "$_guard_rs_dm_query" = "$_guard_rs_dm_value" ] && return 0
                ;;
            suffix)
                case $_guard_rs_dm_query in
                    "$_guard_rs_dm_value"|*."$_guard_rs_dm_value") return 0 ;;
                esac
                ;;
            *) return 1 ;;
        esac
    done <<EOF
${_GUARD_RESOLVER_SYNC_DATA_SELECTORS:-}
EOF
    return 1
}

_guard_resolver_sync_api_base() {
    _guard_rs_ab=${GUARD_AGH_API_BASE:-http://127.0.0.1:3000}
    case $_guard_rs_ab in
        http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*|https://127.0.0.1:*|https://localhost:*|https://\[::1\]:*) ;;
        *) return 1 ;;
    esac
    printf '%s\n' "${_guard_rs_ab%/}"
}

_guard_resolver_sync_fetch_api() {
    _guard_rs_fa_path=$1
    _guard_rs_fa_out=$2
    _guard_rs_fa_max=$3
    command -v curl >/dev/null 2>&1 || return 127
    _guard_rs_fa_base=$(_guard_resolver_sync_api_base) || return 2
    _guard_rs_fa_url="$_guard_rs_fa_base$_guard_rs_fa_path"
    set -- -fSs --max-redirs 0 --noproxy '*' --proxy '' --connect-timeout 3 --max-time 10
    if [ -n "${GUARD_AGH_NETRC_FILE:-}" ]; then
        [ -f "$GUARD_AGH_NETRC_FILE" ] && [ ! -L "$GUARD_AGH_NETRC_FILE" ] || return 1
        set -- "$@" --netrc-file "$GUARD_AGH_NETRC_FILE"
    fi
    curl "$@" -o "$_guard_rs_fa_out" "$_guard_rs_fa_url" || return 1
    _guard_rs_fa_size=$(wc -c < "$_guard_rs_fa_out" | tr -d '[:space:]')
    _guard_resolver_sync_uint "$_guard_rs_fa_size" || return 1
    [ "$_guard_rs_fa_size" -gt 0 ] 2>/dev/null || return 1
    [ "$_guard_rs_fa_size" -le "$_guard_rs_fa_max" ] 2>/dev/null
}

_guard_resolver_sync_querylog_enabled() {
    _guard_rs_qe_out=$1
    _guard_resolver_sync_fetch_api /control/querylog/config "$_guard_rs_qe_out" 65536 || return $?
    _guard_rs_qe_enabled=$(json_get "$_guard_rs_qe_out" enabled 2>/dev/null) || return 1
    [ "$_guard_rs_qe_enabled" = true ]
}

_guard_resolver_sync_fetch_querylog() {
    _guard_rs_fq_out=$1
    _guard_rs_fq_limit=${GUARD_RESOLVER_SYNC_QUERYLOG_LIMIT:-$_GUARD_RESOLVER_SYNC_QUERYLOG_LIMIT_DEFAULT}
    _guard_resolver_sync_uint "$_guard_rs_fq_limit" || return 1
    [ "$_guard_rs_fq_limit" -ge 1 ] 2>/dev/null || return 1
    [ "$_guard_rs_fq_limit" -le 5000 ] 2>/dev/null || return 1
    _guard_rs_fq_max=${GUARD_RESOLVER_SYNC_MAX_QUERYLOG_BYTES:-$_GUARD_RESOLVER_SYNC_MAX_QUERYLOG_BYTES_DEFAULT}
    _guard_resolver_sync_uint "$_guard_rs_fq_max" || return 1
    [ "$_guard_rs_fq_max" -ge 1024 ] 2>/dev/null || return 1
    [ "$_guard_rs_fq_max" -le 16777216 ] 2>/dev/null || return 1
    _guard_resolver_sync_fetch_api "/control/querylog?limit=$_guard_rs_fq_limit" "$_guard_rs_fq_out" "$_guard_rs_fq_max"
}

_guard_resolver_sync_extract_entries() {
    _guard_rs_ee_input=$1
    _guard_rs_ee_output=$2
    command -v jsonfilter >/dev/null 2>&1 || return 127
    _guard_rs_ee_type=$(jsonfilter -i "$_guard_rs_ee_input" -t '@.data' 2>/dev/null) || return 1
    [ "$_guard_rs_ee_type" = array ] || return 1
    : > "$_guard_rs_ee_output"
    jsonfilter -i "$_guard_rs_ee_input" -e '@.data[*]' > "$_guard_rs_ee_output" 2>/dev/null || true
}

_guard_resolver_sync_hash_line() {
    _guard_rs_hl_tmp=$(file_mktemp) || return 1
    printf '%s' "$1" > "$_guard_rs_hl_tmp" || { rm -f "$_guard_rs_hl_tmp"; return 1; }
    _guard_rs_hl_hash=$(file_sha256 "$_guard_rs_hl_tmp" 2>/dev/null) || { rm -f "$_guard_rs_hl_tmp"; return 1; }
    rm -f "$_guard_rs_hl_tmp"
    printf '%s\n' "$_guard_rs_hl_hash"
}

_GUARD_RESOLVER_SYNC_CURSOR_HASH=
_GUARD_RESOLVER_SYNC_CURSOR_EPOCH=

_guard_resolver_sync_cursor_read() {
    _GUARD_RESOLVER_SYNC_CURSOR_HASH=
    _GUARD_RESOLVER_SYNC_CURSOR_EPOCH=
    _guard_rs_cr_file=$(_guard_resolver_sync_cursor_path)
    [ -f "$_guard_rs_cr_file" ] && [ ! -L "$_guard_rs_cr_file" ] || return 1
    IFS=' ' read -r _guard_rs_cr_hash _guard_rs_cr_epoch _guard_rs_cr_extra < "$_guard_rs_cr_file" || return 1
    [ -z "${_guard_rs_cr_extra:-}" ] || return 1
    if [ "$_guard_rs_cr_hash" != EMPTY ]; then
        [ "${#_guard_rs_cr_hash}" -eq 64 ] || return 1
        case $_guard_rs_cr_hash in *[!0-9a-f]*) return 1 ;; esac
    fi
    _guard_resolver_sync_uint "$_guard_rs_cr_epoch" || return 1
    _GUARD_RESOLVER_SYNC_CURSOR_HASH=$_guard_rs_cr_hash
    _GUARD_RESOLVER_SYNC_CURSOR_EPOCH=$_guard_rs_cr_epoch
}

_guard_resolver_sync_select_new() {
    _guard_rs_sn_entries=$1
    _guard_rs_sn_output=$2
    _guard_rs_sn_next=$3
    _guard_rs_sn_now=$4
    : > "$_guard_rs_sn_output"
    _guard_rs_sn_old_hash=${_GUARD_RESOLVER_SYNC_CURSOR_HASH:-}
    _guard_rs_sn_first=
    _guard_rs_sn_found=0
    _guard_rs_sn_count=0
    while IFS= read -r _guard_rs_sn_entry; do
        [ -n "$_guard_rs_sn_entry" ] || continue
        _guard_rs_sn_hash=$(_guard_resolver_sync_hash_line "$_guard_rs_sn_entry") || return 1
        _guard_rs_sn_count=$((_guard_rs_sn_count + 1))
        [ -n "$_guard_rs_sn_first" ] || _guard_rs_sn_first=$_guard_rs_sn_hash
        if [ -n "$_guard_rs_sn_old_hash" ] && [ "$_guard_rs_sn_old_hash" != EMPTY ] && [ "$_guard_rs_sn_hash" = "$_guard_rs_sn_old_hash" ]; then
            _guard_rs_sn_found=1
            break
        fi
        printf '%s\n' "$_guard_rs_sn_entry" >> "$_guard_rs_sn_output"
    done < "$_guard_rs_sn_entries"

    if [ "$_guard_rs_sn_count" -eq 0 ]; then
        _guard_rs_sn_next_hash=EMPTY
    else
        _guard_rs_sn_next_hash=$_guard_rs_sn_first
    fi
    printf '%s %s\n' "$_guard_rs_sn_next_hash" "$_guard_rs_sn_now" > "$_guard_rs_sn_next"

    if [ -z "$_guard_rs_sn_old_hash" ]; then
        : > "$_guard_rs_sn_output"
        return 10
    fi
    if [ "$_guard_rs_sn_old_hash" = EMPTY ]; then
        return 0
    fi
    if [ "$_guard_rs_sn_count" -eq 0 ] || [ "$_guard_rs_sn_found" -ne 1 ]; then
        : > "$_guard_rs_sn_output"
        return 10
    fi
    return 0
}

_guard_resolver_sync_answers() {
    _guard_rs_a_entry=$1
    _guard_rs_a_now=$2
    _guard_rs_a_elapsed=$3
    _guard_rs_a_output=$4
    _guard_rs_a_tmp=$5
    _guard_rs_a_query=$(jsonfilter -s "$_guard_rs_a_entry" -e '@.question.name' 2>/dev/null) || _guard_rs_a_query=
    [ -n "$_guard_rs_a_query" ] || _guard_rs_a_query=$(jsonfilter -s "$_guard_rs_a_entry" -e '@.question.host' 2>/dev/null) || _guard_rs_a_query=
    [ -n "$_guard_rs_a_query" ] && _guard_resolver_sync_domain_match "$_guard_rs_a_query" || return 0

    _guard_rs_a_max=$(_guard_resolver_sync_max_ttl) || return 1
    : > "$_guard_rs_a_tmp"
    jsonfilter -s "$_guard_rs_a_entry" -e '@.answer[*]' > "$_guard_rs_a_tmp" 2>/dev/null || true
    while IFS= read -r _guard_rs_a_answer; do
        [ -n "$_guard_rs_a_answer" ] || continue
        _guard_rs_a_type=$(jsonfilter -s "$_guard_rs_a_answer" -e '@.type' 2>/dev/null) || continue
        _guard_rs_a_value=$(jsonfilter -s "$_guard_rs_a_answer" -e '@.value' 2>/dev/null) || continue
        _guard_rs_a_ttl=$(jsonfilter -s "$_guard_rs_a_answer" -e '@.ttl' 2>/dev/null) || continue
        _guard_resolver_sync_uint "$_guard_rs_a_ttl" || continue
        [ "$_guard_rs_a_ttl" -le "$_guard_rs_a_max" ] 2>/dev/null || _guard_rs_a_ttl=$_guard_rs_a_max
        if [ "$_guard_rs_a_ttl" -le "$_guard_rs_a_elapsed" ] 2>/dev/null; then
            continue
        fi
        _guard_rs_a_effective=$((_guard_rs_a_ttl - _guard_rs_a_elapsed))
        _guard_rs_a_expiry=$((_guard_rs_a_now + _guard_rs_a_effective))
        case $_guard_rs_a_type in
            A)
                _guard_resolver_sync_valid_ipv4 "$_guard_rs_a_value" || continue
                printf '4 %s %s\n' "$_guard_rs_a_value" "$_guard_rs_a_expiry" >> "$_guard_rs_a_output"
                ;;
            AAAA)
                _guard_resolver_sync_valid_ipv6 "$_guard_rs_a_value" || continue
                printf '6 %s %s\n' "$_guard_rs_a_value" "$_guard_rs_a_expiry" >> "$_guard_rs_a_output"
                ;;
        esac
    done < "$_guard_rs_a_tmp"
}

_guard_resolver_sync_merge_cache() {
    _guard_rs_mc_add=$1
    _guard_rs_mc_now=$2
    _guard_rs_mc_output=$3
    _guard_rs_mc_old=$(_guard_resolver_sync_cache_path)
    _guard_rs_mc_input=$(file_mktemp) || return 1
    _guard_rs_mc_unsorted=$(file_mktemp) || { rm -f "$_guard_rs_mc_input"; return 1; }
    : > "$_guard_rs_mc_input"
    if [ -f "$_guard_rs_mc_old" ]; then
        [ ! -L "$_guard_rs_mc_old" ] || { rm -f "$_guard_rs_mc_input" "$_guard_rs_mc_unsorted"; return 1; }
        cat "$_guard_rs_mc_old" >> "$_guard_rs_mc_input" || { rm -f "$_guard_rs_mc_input" "$_guard_rs_mc_unsorted"; return 1; }
    fi
    [ ! -f "$_guard_rs_mc_add" ] || cat "$_guard_rs_mc_add" >> "$_guard_rs_mc_input" || { rm -f "$_guard_rs_mc_input" "$_guard_rs_mc_unsorted"; return 1; }
    awk -v now="$_guard_rs_mc_now" '
        NF == 0 { next }
        NF != 3 || ($1 != 4 && $1 != 6) || $3 !~ /^[0-9]+$/ { bad = 1; next }
        $3 > now {
            key = $1 " " $2
            if (!(key in expiry) || $3 > expiry[key]) expiry[key] = $3
        }
        END {
            if (bad) exit 2
            for (key in expiry) print key " " expiry[key]
        }
    ' "$_guard_rs_mc_input" > "$_guard_rs_mc_unsorted" || {
        rm -f "$_guard_rs_mc_input" "$_guard_rs_mc_unsorted"
        return 1
    }
    LC_ALL=C sort "$_guard_rs_mc_unsorted" > "$_guard_rs_mc_output" || {
        rm -f "$_guard_rs_mc_input" "$_guard_rs_mc_unsorted"
        return 1
    }
    rm -f "$_guard_rs_mc_input" "$_guard_rs_mc_unsorted"
}

_guard_resolver_sync_apply_cache() {
    _guard_rs_ac_cache=$1
    _guard_rs_ac_now=$2
    _guard_rs_ac_batch=$3
    : > "$_guard_rs_ac_batch"
    printf 'flush set %s %s %s\n' "$_GUARD_RESOLVER_SYNC_FAMILY" "$_GUARD_RESOLVER_SYNC_TABLE" "$_GUARD_RESOLVER_SYNC_V4_SET" >> "$_guard_rs_ac_batch"
    printf 'flush set %s %s %s\n' "$_GUARD_RESOLVER_SYNC_FAMILY" "$_GUARD_RESOLVER_SYNC_TABLE" "$_GUARD_RESOLVER_SYNC_V6_SET" >> "$_guard_rs_ac_batch"
    while IFS=' ' read -r _guard_rs_ac_family _guard_rs_ac_ip _guard_rs_ac_expiry _guard_rs_ac_extra; do
        [ -z "${_guard_rs_ac_extra:-}" ] || return 1
        [ -n "${_guard_rs_ac_family:-}" ] || continue
        _guard_resolver_sync_uint "$_guard_rs_ac_expiry" || return 1
        [ "$_guard_rs_ac_expiry" -gt "$_guard_rs_ac_now" ] 2>/dev/null || continue
        _guard_rs_ac_timeout=$((_guard_rs_ac_expiry - _guard_rs_ac_now))
        case $_guard_rs_ac_family in
            4)
                _guard_resolver_sync_valid_ipv4 "$_guard_rs_ac_ip" || return 1
                _guard_rs_ac_set=$_GUARD_RESOLVER_SYNC_V4_SET
                ;;
            6)
                _guard_resolver_sync_valid_ipv6 "$_guard_rs_ac_ip" || return 1
                _guard_rs_ac_set=$_GUARD_RESOLVER_SYNC_V6_SET
                ;;
            *) return 1 ;;
        esac
        printf 'add element %s %s %s { %s timeout %ss }\n' \
            "$_GUARD_RESOLVER_SYNC_FAMILY" "$_GUARD_RESOLVER_SYNC_TABLE" "$_guard_rs_ac_set" \
            "$_guard_rs_ac_ip" "$_guard_rs_ac_timeout" >> "$_guard_rs_ac_batch"
    done < "$_guard_rs_ac_cache"
    nft_apply_batch "$_guard_rs_ac_batch"
}

_guard_resolver_sync_publish_file() {
    _guard_rs_pf_src=$1
    _guard_rs_pf_dest=$2
    _guard_rs_pf_dir=$(dirname "$_guard_rs_pf_dest")
    mkdir -p "$_guard_rs_pf_dir" || return 1
    _guard_rs_pf_tmp=$(file_mktemp "$_guard_rs_pf_dir") || return 1
    cat "$_guard_rs_pf_src" > "$_guard_rs_pf_tmp" || { rm -f "$_guard_rs_pf_tmp"; return 1; }
    chmod 0600 "$_guard_rs_pf_tmp" || { rm -f "$_guard_rs_pf_tmp"; return 1; }
    file_atomic_replace "$_guard_rs_pf_dest" "$_guard_rs_pf_tmp" || { rm -f "$_guard_rs_pf_tmp"; return 1; }
    chmod 0600 "$_guard_rs_pf_dest" || return 1
    rm -f "$_guard_rs_pf_tmp"
}

_guard_resolver_sync_state_write() {
    _guard_rs_sw_status=$1
    _guard_rs_sw_reason=$2
    _guard_rs_sw_iface=${3:-}
    _guard_rs_sw_now=${4:-$(date +%s)}
    _guard_resolver_sync_uint "$_guard_rs_sw_now" || return 1
    if [ -n "$_guard_rs_sw_iface" ]; then
        _guard_resolver_sync_valid_iface "$_guard_rs_sw_iface" || return 1
    fi
    case $_guard_rs_sw_status in ready|warming|degraded) ;; *) return 1 ;; esac
    case $_guard_rs_sw_reason in *[!A-Za-z0-9._:-]*) return 1 ;; esac
    _guard_rs_sw_dest=$(_guard_resolver_sync_state_path)
    _guard_rs_sw_dir=$(dirname "$_guard_rs_sw_dest")
    mkdir -p "$_guard_rs_sw_dir" || return 1
    _guard_rs_sw_tmp=$(file_mktemp "$_guard_rs_sw_dir") || return 1
    printf '{"schemaVersion":1,"helper":"%s","backend":"%s","status":"%s","pid":%s,"updatedAtEpoch":%s,"reason":"%s","sourceRevision":"%s","nft":{"family":"%s","table":"%s","chain":"%s","ipv4Set":"%s","ipv6Set":"%s","directInterface":"%s"}}\n' \
        "$_GUARD_RESOLVER_SYNC_HELPER" "$_GUARD_RESOLVER_SYNC_BACKEND" "$_guard_rs_sw_status" "$$" \
        "$_guard_rs_sw_now" "$_guard_rs_sw_reason" "${_GUARD_RESOLVER_SYNC_DATA_SOURCE_REVISION:-unknown}" \
        "$_GUARD_RESOLVER_SYNC_FAMILY" "$_GUARD_RESOLVER_SYNC_TABLE" "$_GUARD_RESOLVER_SYNC_CHAIN" \
        "$_GUARD_RESOLVER_SYNC_V4_SET" "$_GUARD_RESOLVER_SYNC_V6_SET" "$_guard_rs_sw_iface" > "$_guard_rs_sw_tmp"
    chmod 0600 "$_guard_rs_sw_tmp" || { rm -f "$_guard_rs_sw_tmp"; return 1; }
    file_atomic_replace "$_guard_rs_sw_dest" "$_guard_rs_sw_tmp" || { rm -f "$_guard_rs_sw_tmp"; return 1; }
    chmod 0600 "$_guard_rs_sw_dest" || return 1
    rm -f "$_guard_rs_sw_tmp"
}

_guard_resolver_sync_fail() {
    _guard_rs_f_reason=$1
    _guard_rs_f_iface=${2:-}
    _guard_resolver_sync_state_write degraded "$_guard_rs_f_reason" "$_guard_rs_f_iface" "$(date +%s)" || rm -f "$(_guard_resolver_sync_state_path)"
    return 1
}

guard_resolver_sync_stop() {
    rm -f "$(_guard_resolver_sync_state_path)"
}

guard_resolver_sync_cycle() {
    if command -v guard_dns_backend >/dev/null 2>&1; then
        _guard_rs_c_backend=$(guard_dns_backend 2>/dev/null) || _guard_rs_c_backend=none
        if [ "$_guard_rs_c_backend" != adguardhome ]; then
            guard_resolver_sync_stop
            return 0
        fi
    fi
    [ -n "${_GUARD_RESOLVER_SYNC_DATA_SELECTORS:-}" ] || { _guard_resolver_sync_fail selectors-unavailable; return 1; }
    command -v jsonfilter >/dev/null 2>&1 || { _guard_resolver_sync_fail jsonfilter-unavailable; return 1; }
    command -v nft >/dev/null 2>&1 || { _guard_resolver_sync_fail nft-unavailable; return 1; }
    _guard_rs_c_iface=$(_guard_resolver_sync_direct_iface 2>/dev/null) || { _guard_resolver_sync_fail direct-interface-unavailable; return 1; }
    _guard_rs_c_now=${GUARD_RESOLVER_SYNC_NOW_EPOCH:-$(date +%s)}
    _guard_resolver_sync_uint "$_guard_rs_c_now" || { _guard_resolver_sync_fail clock-invalid "$_guard_rs_c_iface"; return 1; }

    _guard_rs_c_work=$(file_mktemp) || { _guard_resolver_sync_fail temp-unavailable "$_guard_rs_c_iface"; return 1; }
    rm -f "$_guard_rs_c_work"
    mkdir -p "$_guard_rs_c_work" || { _guard_resolver_sync_fail temp-unavailable "$_guard_rs_c_iface"; return 1; }
    _guard_rs_c_cfg="$_guard_rs_c_work/config.json"
    _guard_rs_c_querylog="$_guard_rs_c_work/querylog.json"
    _guard_rs_c_entries="$_guard_rs_c_work/entries"
    _guard_rs_c_new="$_guard_rs_c_work/new"
    _guard_rs_c_next="$_guard_rs_c_work/next"
    _guard_rs_c_records="$_guard_rs_c_work/records"
    _guard_rs_c_answers="$_guard_rs_c_work/answers"
    _guard_rs_c_cache="$_guard_rs_c_work/cache"
    _guard_rs_c_batch="$_guard_rs_c_work/update.nft"
    : > "$_guard_rs_c_records"

    if ! _guard_resolver_sync_querylog_enabled "$_guard_rs_c_cfg"; then
        rm -rf "$_guard_rs_c_work"
        _guard_resolver_sync_fail querylog-disabled-or-unavailable "$_guard_rs_c_iface"
        return 1
    fi
    if ! _guard_resolver_sync_fetch_querylog "$_guard_rs_c_querylog" || \
       ! _guard_resolver_sync_extract_entries "$_guard_rs_c_querylog" "$_guard_rs_c_entries"; then
        rm -rf "$_guard_rs_c_work"
        _guard_resolver_sync_fail querylog-unavailable "$_guard_rs_c_iface"
        return 1
    fi

    _guard_rs_c_have_cursor=0
    if _guard_resolver_sync_cursor_read; then
        _guard_rs_c_have_cursor=1
    fi
    _guard_rs_c_elapsed=0
    if [ "$_guard_rs_c_have_cursor" = 1 ]; then
        [ "$_GUARD_RESOLVER_SYNC_CURSOR_EPOCH" -le "$_guard_rs_c_now" ] 2>/dev/null || {
            rm -rf "$_guard_rs_c_work"
            _guard_resolver_sync_fail cursor-future "$_guard_rs_c_iface"
            return 1
        }
        _guard_rs_c_elapsed=$((_guard_rs_c_now - _GUARD_RESOLVER_SYNC_CURSOR_EPOCH))
    fi

    _guard_rs_c_select_rc=0
    _guard_resolver_sync_select_new "$_guard_rs_c_entries" "$_guard_rs_c_new" "$_guard_rs_c_next" "$_guard_rs_c_now" || _guard_rs_c_select_rc=$?
    if [ "$_guard_rs_c_select_rc" -ne 0 ] && [ "$_guard_rs_c_select_rc" -ne 10 ]; then
        rm -rf "$_guard_rs_c_work"
        _guard_resolver_sync_fail cursor-invalid "$_guard_rs_c_iface"
        return 1
    fi

    if [ "$_guard_rs_c_select_rc" -eq 0 ]; then
        while IFS= read -r _guard_rs_c_entry; do
            [ -n "$_guard_rs_c_entry" ] || continue
            if ! _guard_resolver_sync_answers "$_guard_rs_c_entry" "$_guard_rs_c_now" "$_guard_rs_c_elapsed" "$_guard_rs_c_records" "$_guard_rs_c_answers"; then
                rm -rf "$_guard_rs_c_work"
                _guard_resolver_sync_fail querylog-parse-failed "$_guard_rs_c_iface"
                return 1
            fi
        done < "$_guard_rs_c_new"
    fi

    if ! _guard_resolver_sync_merge_cache "$_guard_rs_c_records" "$_guard_rs_c_now" "$_guard_rs_c_cache"; then
        rm -rf "$_guard_rs_c_work"
        _guard_resolver_sync_fail cache-invalid "$_guard_rs_c_iface"
        return 1
    fi

    if ! _guard_resolver_sync_set_ready "$_GUARD_RESOLVER_SYNC_V4_SET" ipv4_addr "$_GUARD_RESOLVER_SYNC_V4_SET_COMMENT" || \
       ! _guard_resolver_sync_set_ready "$_GUARD_RESOLVER_SYNC_V6_SET" ipv6_addr "$_GUARD_RESOLVER_SYNC_V6_SET_COMMENT" || \
       ! _guard_resolver_sync_consumer_ready "$_guard_rs_c_iface"; then
        rm -rf "$_guard_rs_c_work"
        _guard_resolver_sync_fail nft-consumer-unavailable "$_guard_rs_c_iface"
        return 1
    fi
    if ! _guard_resolver_sync_apply_cache "$_guard_rs_c_cache" "$_guard_rs_c_now" "$_guard_rs_c_batch"; then
        rm -rf "$_guard_rs_c_work"
        _guard_resolver_sync_fail nft-update-failed "$_guard_rs_c_iface"
        return 1
    fi
    if ! _guard_resolver_sync_publish_file "$_guard_rs_c_cache" "$(_guard_resolver_sync_cache_path)" || \
       ! _guard_resolver_sync_publish_file "$_guard_rs_c_next" "$(_guard_resolver_sync_cursor_path)"; then
        rm -rf "$_guard_rs_c_work"
        _guard_resolver_sync_fail state-publish-failed "$_guard_rs_c_iface"
        return 1
    fi
    rm -rf "$_guard_rs_c_work"

    if [ "$_guard_rs_c_select_rc" -eq 10 ]; then
        _guard_resolver_sync_state_write warming cursor-baseline "$_guard_rs_c_iface" "$_guard_rs_c_now"
        return 0
    fi
    _guard_resolver_sync_state_write ready ok "$_guard_rs_c_iface" "$_guard_rs_c_now"
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
    _guard_rs_cv_direct=$2
    [ -f "$_guard_rs_cv_file" ] || return 1
    [ ! -L "$_guard_rs_cv_file" ] || return 1

    _guard_resolver_sync_expect "$_guard_rs_cv_file" schemaVersion 1 || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" helper "$_GUARD_RESOLVER_SYNC_HELPER" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" backend "$_GUARD_RESOLVER_SYNC_BACKEND" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" status ready || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.family "$_GUARD_RESOLVER_SYNC_FAMILY" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.table "$_GUARD_RESOLVER_SYNC_TABLE" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.chain "$_GUARD_RESOLVER_SYNC_CHAIN" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.ipv4Set "$_GUARD_RESOLVER_SYNC_V4_SET" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.ipv6Set "$_GUARD_RESOLVER_SYNC_V6_SET" || return 1
    _guard_resolver_sync_expect "$_guard_rs_cv_file" nft.directInterface "$_guard_rs_cv_direct" || return 1
    if [ -n "${_GUARD_RESOLVER_SYNC_DATA_SOURCE_REVISION:-}" ]; then
        _guard_resolver_sync_expect "$_guard_rs_cv_file" sourceRevision "$_GUARD_RESOLVER_SYNC_DATA_SOURCE_REVISION" || return 1
    fi
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
    _guard_rs_cr_direct=$1
    _guard_rs_cr_listing=$(nft -a list chain \
        "$_GUARD_RESOLVER_SYNC_FAMILY" \
        "$_GUARD_RESOLVER_SYNC_TABLE" \
        "$_GUARD_RESOLVER_SYNC_CHAIN" 2>/dev/null) || return 1

    printf '%s\n' "$_guard_rs_cr_listing" | awk \
        -v direct_iface="$_guard_rs_cr_direct" \
        -v set_name="$_GUARD_RESOLVER_SYNC_V4_SET" \
        -v comment="$_GUARD_RESOLVER_SYNC_V4_RULE_COMMENT" '
        index($0, "oifname \"" direct_iface "\"") &&
        index($0, "ip daddr @" set_name) && index($0, "reject") &&
        index($0, "comment \"" comment "\"") { found = 1 }
        END { exit !found }
    ' || return 1

    printf '%s\n' "$_guard_rs_cr_listing" | awk \
        -v direct_iface="$_guard_rs_cr_direct" \
        -v set_name="$_GUARD_RESOLVER_SYNC_V6_SET" \
        -v comment="$_GUARD_RESOLVER_SYNC_V6_RULE_COMMENT" '
        index($0, "oifname \"" direct_iface "\"") &&
        index($0, "ip6 daddr @" set_name) && index($0, "reject") &&
        index($0, "comment \"" comment "\"") { found = 1 }
        END { exit !found }
    '
}

guard_resolver_sync_ready() {
    _guard_rs_r_file=$(_guard_resolver_sync_state_path)
    command -v nft >/dev/null 2>&1 || return 1
    _guard_rs_r_direct=$(_guard_resolver_sync_direct_iface 2>/dev/null) || return 1
    _guard_resolver_sync_contract_valid "$_guard_rs_r_file" "$_guard_rs_r_direct" || return 1
    _guard_resolver_sync_process_alive "$_guard_rs_r_file" || return 1
    _guard_resolver_sync_fresh "$_guard_rs_r_file" || return 1
    _guard_resolver_sync_set_ready \
        "$_GUARD_RESOLVER_SYNC_V4_SET" ipv4_addr "$_GUARD_RESOLVER_SYNC_V4_SET_COMMENT" || return 1
    _guard_resolver_sync_set_ready \
        "$_GUARD_RESOLVER_SYNC_V6_SET" ipv6_addr "$_GUARD_RESOLVER_SYNC_V6_SET_COMMENT" || return 1
    _guard_resolver_sync_consumer_ready "$_guard_rs_r_direct" || return 1
    return 0
}

guard_resolver_sync_backend() {
    if guard_resolver_sync_ready; then
        printf '%s\n' "$_GUARD_RESOLVER_SYNC_BACKEND"
    else
        printf '%s\n' unavailable
    fi
}
