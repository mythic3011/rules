#!/bin/sh
# HTTP fetch with bounded temp downloads and atomic publication.
# Failed or oversized fetches leave the last-known-good destination untouched.
# Prefix: fetch_
set -eu

_FETCH_TIMEOUT_DEFAULT=30
_FETCH_TIMEOUT_MAX=3600
_FETCH_MAX_BYTES_DEFAULT=16777216
_FETCH_MAX_BYTES_MAX=67108864

_fetch_timeout_secs() {
    _fetch_to=${1:-${FETCH_TIMEOUT:-$_FETCH_TIMEOUT_DEFAULT}}
    case $_fetch_to in
        ''|*[!0-9]*)
            printf '%s\n' "fetch: invalid timeout" >&2
            return 2
            ;;
    esac
    while [ "${_fetch_to#0}" != "$_fetch_to" ]; do
        _fetch_to=${_fetch_to#0}
    done
    [ -n "$_fetch_to" ] || _fetch_to=0
    if [ "${#_fetch_to}" -gt 4 ] || [ "$_fetch_to" -gt "$_FETCH_TIMEOUT_MAX" ] 2>/dev/null; then
        _fetch_to=$_FETCH_TIMEOUT_MAX
        printf 'fetch: timeout capped at %s seconds\n' "$_FETCH_TIMEOUT_MAX" >&2
    fi
    if [ "$_fetch_to" -eq 0 ] 2>/dev/null; then
        printf '%s\n' "fetch: timeout must be greater than zero" >&2
        return 2
    fi
    printf '%s\n' "$_fetch_to"
}

_fetch_max_bytes() {
    _fetch_mb=${1:-$_FETCH_MAX_BYTES_DEFAULT}
    case $_fetch_mb in
        ''|*[!0-9]*)
            printf '%s\n' "fetch: response-size limit must be a positive integer" >&2
            return 2
            ;;
    esac
    while [ "${_fetch_mb#0}" != "$_fetch_mb" ]; do
        _fetch_mb=${_fetch_mb#0}
    done
    [ -n "$_fetch_mb" ] || _fetch_mb=0
    if [ "$_fetch_mb" -eq 0 ] 2>/dev/null || \
       [ "${#_fetch_mb}" -gt 8 ] || \
       [ "$_fetch_mb" -gt "$_FETCH_MAX_BYTES_MAX" ] 2>/dev/null; then
        printf 'fetch: response-size limit must be between 1 and %s bytes\n' "$_FETCH_MAX_BYTES_MAX" >&2
        return 2
    fi
    printf '%s\n' "$_fetch_mb"
}

_fetch_validate_http_options() {
    _fetch_vo_https=${1:-}
    _fetch_vo_max=$(_fetch_max_bytes "${2:-}") || return $?
    _fetch_vo_allow=${3:-}
    case $_fetch_vo_allow in
        '') ;;
        allow_insecure=1) ;;
        *)
            printf '%s\n' "fetch: insecure opt-out must be exactly allow_insecure=1" >&2
            return 2
            ;;
    esac
    case $_fetch_vo_https in
        ''|1)
            if [ "$_fetch_vo_allow" = allow_insecure=1 ]; then
                if [ "$_fetch_vo_https" = 1 ]; then
                    printf '%s\n' "fetch: HTTPS-only mode conflicts with allow_insecure=1" >&2
                    return 2
                fi
                _FETCH_HTTP_HTTPS_ONLY=0
            else
                _FETCH_HTTP_HTTPS_ONLY=1
            fi
            ;;
        0)
            if [ "$_fetch_vo_allow" != allow_insecure=1 ]; then
                printf '%s\n' "fetch: pass allow_insecure=1 to opt out of HTTPS-only mode" >&2
                return 2
            fi
            _FETCH_HTTP_HTTPS_ONLY=0
            ;;
        *)
            printf '%s\n' "fetch: HTTPS-only mode must be 0 or 1" >&2
            return 2
            ;;
    esac
    _FETCH_HTTP_MAX_BYTES=$_fetch_vo_max
}

_fetch_validate_url() {
    _fetch_vu_url=${1:-}
    _fetch_vu_https=${2:-1}
    case $_fetch_vu_https:$_fetch_vu_url in
        1:https://*) return 0 ;;
        0:https://*|0:http://*) return 0 ;;
        1:*)
            printf '%s\n' "fetch: secure fetch requires an HTTPS URL" >&2
            return 2
            ;;
        *)
            printf '%s\n' "fetch: URL must use HTTP or HTTPS" >&2
            return 2
            ;;
    esac
}

_fetch_run_capped() {
    _fetch_rc_bytes=$1
    shift
    _fetch_rc_blocks=$(((_fetch_rc_bytes + 511) / 512))
    (
        if ! ulimit -f "$_fetch_rc_blocks" 2>/dev/null; then
            printf '%s\n' "fetch: unable to enforce response-size limit" >&2
            exit 125
        fi
        "$@"
    )
}

_fetch_file_size() {
    _fetch_fs_path=$1
    _fetch_fs_size=$(LC_ALL=C wc -c < "$_fetch_fs_path" | tr -d '[:space:]') || return 1
    case $_fetch_fs_size in
        ''|*[!0-9]*) return 1 ;;
    esac
    while [ "${_fetch_fs_size#0}" != "$_fetch_fs_size" ]; do
        _fetch_fs_size=${_fetch_fs_size#0}
    done
    [ -n "$_fetch_fs_size" ] || _fetch_fs_size=0
    printf '%s\n' "$_fetch_fs_size"
}

_fetch_check_file_size() {
    _fetch_cf_path=$1
    _fetch_cf_max=$2
    _fetch_cf_size=$(_fetch_file_size "$_fetch_cf_path") || {
        printf '%s\n' "fetch: unable to verify downloaded response size" >&2
        return 1
    }
    if [ "${#_fetch_cf_size}" -gt "${#_fetch_cf_max}" ] || \
       { [ "${#_fetch_cf_size}" -eq "${#_fetch_cf_max}" ] && [ "$_fetch_cf_size" -gt "$_fetch_cf_max" ]; }; then
        printf '%s\n' "fetch: response exceeded its byte limit" >&2
        return 1
    fi
}

_fetch_curl_config_escape() {
    _fetch_ce_value=${1:-}
    _fetch_ce_clean=$(printf '%s' "$_fetch_ce_value" | LC_ALL=C tr -d '\001-\037\177') || return 1
    if [ "$_fetch_ce_clean" != "$_fetch_ce_value" ]; then
        printf '%s\n' "fetch: curl config values cannot contain control characters" >&2
        return 2
    fi
    printf '%s' "$_fetch_ce_value" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

_fetch_curl_config_write() {
    _fetch_cw_path=$1
    _fetch_cw_url=$2
    _fetch_cw_proxy=${3:-}
    _fetch_cw_auth=${4:-}
    _fetch_cw_url_q=$(_fetch_curl_config_escape "$_fetch_cw_url") || return $?
    _fetch_cw_proxy_q=
    _fetch_cw_auth_q=
    if [ -n "$_fetch_cw_proxy" ]; then
        _fetch_cw_proxy_q=$(_fetch_curl_config_escape "$_fetch_cw_proxy") || return $?
    fi
    if [ -n "$_fetch_cw_auth" ]; then
        _fetch_cw_auth_q=$(_fetch_curl_config_escape "$_fetch_cw_auth") || return $?
    fi
    if ! printf 'url = "%s"\n' "$_fetch_cw_url_q" > "$_fetch_cw_path"; then
        return 1
    fi
    if [ -n "$_fetch_cw_proxy" ] && ! printf 'proxy = "%s"\n' "$_fetch_cw_proxy_q" >> "$_fetch_cw_path"; then
        return 1
    fi
    if [ -n "$_fetch_cw_auth" ] && ! printf 'proxy-user = "%s"\n' "$_fetch_cw_auth_q" >> "$_fetch_cw_path"; then
        return 1
    fi
}

_fetch_http_curl() (
    _fetch_c_url=$1
    _fetch_c_out=$2
    _fetch_c_timeout=$3
    _fetch_c_https_only=$4
    _fetch_c_max_bytes=$5
    _fetch_c_mode=$6
    _fetch_c_proxy=${7:-}
    _fetch_c_auth=${8:-}
    _fetch_c_config=
    trap '[ -z "$_fetch_c_config" ] || rm -f "$_fetch_c_config"' 0
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM

    _fetch_validate_url "$_fetch_c_url" "$_fetch_c_https_only" || return $?
    if [ -n "$_fetch_c_proxy" ] && [ -n "$_fetch_c_auth" ]; then
        _fetch_c_authority=${_fetch_c_proxy#*://}
        _fetch_c_authority=${_fetch_c_authority%%[/?#]*}
        case $_fetch_c_authority in
            *@*)
                printf '%s\n' "fetch: provide proxy credentials either in the proxy URL or AUTH, not both" >&2
                return 2
                ;;
        esac
    fi
    _fetch_c_config=$(umask 077; file_mktemp "${TMPDIR:-/tmp}") || {
        printf '%s\n' "fetch: unable to create private curl config" >&2
        return 1
    }
    if [ ! -f "$_fetch_c_config" ] || [ -L "$_fetch_c_config" ] || ! chmod 600 "$_fetch_c_config"; then
        printf '%s\n' "fetch: unable to secure private curl config" >&2
        return 1
    fi
    _fetch_curl_config_write "$_fetch_c_config" "$_fetch_c_url" "$_fetch_c_proxy" "$_fetch_c_auth" || return $?

    case $_fetch_c_mode in
        generic) ;;
        direct)
            _fetch_c_direct=1
            ;;
        proxy)
            _fetch_c_direct=0
            ;;
        *)
            printf '%s\n' "fetch: unknown HTTP mode" >&2
            return 2
            ;;
    esac
    if [ "${_fetch_c_direct:-0}" = 1 ]; then
        if [ "$_fetch_c_https_only" = 1 ]; then
            _fetch_run_capped "$_fetch_c_max_bytes" curl -q -fLSs --config "$_fetch_c_config" \
                --noproxy '*' --proxy '' --max-redirs 0 --proto '=https' --proto-redir '=https' \
                --max-filesize "$_fetch_c_max_bytes" --connect-timeout "$_fetch_c_timeout" \
                --max-time "$_fetch_c_timeout" -o "$_fetch_c_out" 2>/dev/null
        else
            _fetch_run_capped "$_fetch_c_max_bytes" curl -q -fLSs --config "$_fetch_c_config" \
                --noproxy '*' --proxy '' --max-redirs 5 --max-filesize "$_fetch_c_max_bytes" \
                --connect-timeout "$_fetch_c_timeout" --max-time "$_fetch_c_timeout" \
                -o "$_fetch_c_out" 2>/dev/null
        fi
    elif [ "$_fetch_c_https_only" = 1 ]; then
        _fetch_run_capped "$_fetch_c_max_bytes" curl -q -fLSs --config "$_fetch_c_config" \
            --max-redirs 0 --proto '=https' --proto-redir '=https' --max-filesize "$_fetch_c_max_bytes" \
            --connect-timeout "$_fetch_c_timeout" --max-time "$_fetch_c_timeout" \
            -o "$_fetch_c_out" 2>/dev/null
    else
        _fetch_run_capped "$_fetch_c_max_bytes" curl -q -fLSs --config "$_fetch_c_config" \
            --max-redirs 5 --max-filesize "$_fetch_c_max_bytes" \
            --connect-timeout "$_fetch_c_timeout" --max-time "$_fetch_c_timeout" \
            -o "$_fetch_c_out" 2>/dev/null
    fi
)

_fetch_http_wget() {
    _fetch_w_url=$1
    _fetch_w_out=$2
    _fetch_w_timeout=$3
    _fetch_w_https_only=$4
    _fetch_w_max_bytes=$5
    _fetch_w_mode=$6
    if [ "$_fetch_w_https_only" = 1 ]; then
        printf '%s\n' "fetch: HTTPS-only fetch requires curl to constrain redirect protocols" >&2
        return 127
    fi
    _fetch_w_authority=${_fetch_w_url#*://}
    _fetch_w_authority=${_fetch_w_authority%%[/?#]*}
    case $_fetch_w_authority in
        *@*)
            printf '%s\n' "fetch: credential-bearing URLs require curl" >&2
            return 127
            ;;
    esac
    case $_fetch_w_url in
        *\?*)
            printf '%s\n' "fetch: credential-bearing URLs require curl" >&2
            return 127
            ;;
    esac
    case $_fetch_w_mode in
        direct)
            _fetch_run_capped "$_fetch_w_max_bytes" env http_proxy= https_proxy= HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= all_proxy= \
                wget -q -O "$_fetch_w_out" -T "$_fetch_w_timeout" "$_fetch_w_url" 2>/dev/null
            ;;
        generic)
            _fetch_run_capped "$_fetch_w_max_bytes" wget -q -O "$_fetch_w_out" -T "$_fetch_w_timeout" "$_fetch_w_url" 2>/dev/null
            ;;
        *)
            printf '%s\n' "fetch: authenticated proxy requests require curl" >&2
            return 127
            ;;
    esac
}

_fetch_http_with_mode() {
    _fetch_hm_mode=$1
    _fetch_hm_url=$2
    _fetch_hm_out=$3
    _fetch_hm_timeout=$4
    _fetch_hm_https=${5:-1}
    _fetch_hm_max=${6:-$_FETCH_MAX_BYTES_DEFAULT}
    _fetch_hm_proxy=${7:-}
    _fetch_hm_auth=${8:-}
    _fetch_validate_url "$_fetch_hm_url" "$_fetch_hm_https" || return $?
    case $_fetch_hm_mode in
        generic|direct|proxy) ;;
        *) printf '%s\n' "fetch: unknown HTTP mode" >&2; return 2 ;;
    esac
    if command -v curl >/dev/null 2>&1; then
        _fetch_http_curl "$_fetch_hm_url" "$_fetch_hm_out" "$_fetch_hm_timeout" \
            "$_fetch_hm_https" "$_fetch_hm_max" "$_fetch_hm_mode" "$_fetch_hm_proxy" "$_fetch_hm_auth"
    elif [ "$_fetch_hm_mode" = proxy ]; then
        printf '%s\n' "fetch: proxy fetch requires curl" >&2
        return 127
    elif command -v wget >/dev/null 2>&1; then
        _fetch_http_wget "$_fetch_hm_url" "$_fetch_hm_out" "$_fetch_hm_timeout" \
            "$_fetch_hm_https" "$_fetch_hm_max" "$_fetch_hm_mode"
    else
        printf '%s\n' "fetch: curl or wget is required" >&2
        return 127
    fi
}

_fetch_http_download() {
    _fetch_hd_mode=$1
    _fetch_hd_url=$2
    _fetch_hd_out=$3
    _fetch_hd_timeout=$4
    _fetch_hd_https=$5
    _fetch_hd_max=$6
    _fetch_hd_proxy=${7:-}
    _fetch_hd_auth=${8:-}
    _fetch_hd_dir=$(dirname "$_fetch_hd_out")
    _fetch_hd_tmp=$(file_mktemp "$_fetch_hd_dir") || return 1
    _fetch_hd_rc=0
    _fetch_http_with_mode "$_fetch_hd_mode" "$_fetch_hd_url" "$_fetch_hd_tmp" \
        "$_fetch_hd_timeout" "$_fetch_hd_https" "$_fetch_hd_max" \
        "$_fetch_hd_proxy" "$_fetch_hd_auth" || _fetch_hd_rc=$?
    if [ "$_fetch_hd_rc" -ne 0 ]; then
        rm -f "$_fetch_hd_tmp"
        printf '%s\n' "fetch: download failed" >&2
        return "$_fetch_hd_rc"
    fi
    if [ ! -s "$_fetch_hd_tmp" ] || ! _fetch_check_file_size "$_fetch_hd_tmp" "$_fetch_hd_max"; then
        rm -f "$_fetch_hd_tmp"
        printf '%s\n' "fetch: empty or oversized response rejected" >&2
        return 1
    fi
    if ! mv -f "$_fetch_hd_tmp" "$_fetch_hd_out"; then
        rm -f "$_fetch_hd_tmp"
        printf '%s\n' "fetch: unable to publish response" >&2
        return 1
    fi
}

fetch_http_direct() {
    _fetch_direct_url=${1:-}
    _fetch_direct_out=${2:-}
    [ -n "$_fetch_direct_url" ] && [ -n "$_fetch_direct_out" ] || {
        printf '%s\n' "fetch_http_direct: usage: fetch_http_direct URL OUTPUT [TIMEOUT [MAX_BYTES [ALLOW_INSECURE]]]" >&2
        return 2
    }
    _fetch_direct_timeout=$(_fetch_timeout_secs "${3:-}") || return $?
    _fetch_direct_max=$(_fetch_max_bytes "${4:-}") || return $?
    _fetch_direct_allow=${5:-}
    _fetch_validate_http_options '' "$_fetch_direct_max" "$_fetch_direct_allow" || return $?
    _fetch_validate_url "$_fetch_direct_url" "$_FETCH_HTTP_HTTPS_ONLY" || return $?
    _fetch_http_download direct "$_fetch_direct_url" "$_fetch_direct_out" "$_fetch_direct_timeout" \
        "$_FETCH_HTTP_HTTPS_ONLY" "$_FETCH_HTTP_MAX_BYTES"
}

fetch_http_proxy() {
    _fetch_proxy_url=${1:-}
    _fetch_proxy_out=${2:-}
    _fetch_proxy_endpoint=${3:-}
    [ -n "$_fetch_proxy_url" ] && [ -n "$_fetch_proxy_out" ] && [ -n "$_fetch_proxy_endpoint" ] || {
        printf '%s\n' "fetch_http_proxy: usage: fetch_http_proxy URL OUTPUT PROXY [TIMEOUT [AUTH [MAX_BYTES [ALLOW_INSECURE]]]]" >&2
        return 2
    }
    _fetch_proxy_timeout=$(_fetch_timeout_secs "${4:-}") || return $?
    _fetch_proxy_auth=${5:-}
    _fetch_proxy_max=$(_fetch_max_bytes "${6:-}") || return $?
    _fetch_proxy_allow=${7:-}
    _fetch_validate_http_options '' "$_fetch_proxy_max" "$_fetch_proxy_allow" || return $?
    _fetch_validate_url "$_fetch_proxy_url" "$_FETCH_HTTP_HTTPS_ONLY" || return $?
    _fetch_http_download proxy "$_fetch_proxy_url" "$_fetch_proxy_out" "$_fetch_proxy_timeout" \
        "$_FETCH_HTTP_HTTPS_ONLY" "$_FETCH_HTTP_MAX_BYTES" "$_fetch_proxy_endpoint" "$_fetch_proxy_auth"
}

fetch_http() {
    _fetch_http_url=${1:-}
    _fetch_http_out=${2:-}
    if [ -z "$_fetch_http_url" ] || [ -z "$_fetch_http_out" ]; then
        printf '%s\n' "fetch_http: usage: fetch_http URL OUTPUT [TIMEOUT [HTTPS_ONLY [MAX_BYTES [ALLOW_INSECURE]]]]" >&2
        return 2
    fi
    _fetch_http_timeout=$(_fetch_timeout_secs "${3:-}") || return $?
    if [ "$#" -ge 4 ]; then
        _fetch_http_https=${4:-}
    else
        _fetch_http_https=
    fi
    _fetch_http_max=$(_fetch_max_bytes "${5:-}") || return $?
    _fetch_http_allow=${6:-}
    _fetch_validate_http_options "$_fetch_http_https" "$_fetch_http_max" "$_fetch_http_allow" || return $?
    _fetch_validate_url "$_fetch_http_url" "$_FETCH_HTTP_HTTPS_ONLY" || return $?
    _fetch_http_download generic "$_fetch_http_url" "$_fetch_http_out" "$_fetch_http_timeout" \
        "$_FETCH_HTTP_HTTPS_ONLY" "$_FETCH_HTTP_MAX_BYTES"
}

fetch_to_temp() {
    _fetch_tt_url=${1:-}
    if [ -z "$_fetch_tt_url" ]; then
        printf '%s\n' "fetch_to_temp: missing URL" >&2
        return 2
    fi
    _fetch_tt_timeout=$(_fetch_timeout_secs "${2:-}") || return $?
    _fetch_tt_max=$(_fetch_max_bytes "${3:-}") || return $?
    _fetch_tt_allow=${4:-}
    _fetch_validate_http_options '' "$_fetch_tt_max" "$_fetch_tt_allow" || return $?
    _fetch_tt_tmp=$(file_mktemp) || return 1
    if _fetch_http_download generic "$_fetch_tt_url" "$_fetch_tt_tmp" "$_fetch_tt_timeout" \
        "$_FETCH_HTTP_HTTPS_ONLY" "$_FETCH_HTTP_MAX_BYTES"; then
        printf '%s\n' "$_fetch_tt_tmp"
        return 0
    fi
    rm -f "$_fetch_tt_tmp"
    return 1
}

fetch_atomic() {
    _fetch_at_url=${1:-}
    _fetch_at_dest=${2:-}
    _fetch_at_validator=${3:-}
    if [ -z "$_fetch_at_url" ] || [ -z "$_fetch_at_dest" ]; then
        printf '%s\n' "fetch_atomic: usage: fetch_atomic URL DEST [VALIDATOR [TIMEOUT [MAX_BYTES [HTTPS_ONLY [ALLOW_INSECURE]]]]]" >&2
        return 2
    fi
    _fetch_at_dir=$(dirname "$_fetch_at_dest")
    if [ ! -d "$_fetch_at_dir" ]; then
        printf '%s\n' "fetch_atomic: destination directory missing" >&2
        return 1
    fi
    _fetch_at_timeout=${4:-}
    _fetch_at_timeout=$(_fetch_timeout_secs "$_fetch_at_timeout") || return $?
    _fetch_at_max=$(_fetch_max_bytes "${5:-}") || return $?
    _fetch_at_https=${6:-}
    _fetch_at_allow=${7:-}
    _fetch_validate_http_options "$_fetch_at_https" "$_fetch_at_max" "$_fetch_at_allow" || return $?
    _fetch_at_tmp=$(file_mktemp "$_fetch_at_dir") || return 1
    if ! _fetch_http_download generic "$_fetch_at_url" "$_fetch_at_tmp" \
        "$_fetch_at_timeout" "$_FETCH_HTTP_HTTPS_ONLY" "$_FETCH_HTTP_MAX_BYTES"; then
        rm -f "$_fetch_at_tmp"
        return 1
    fi
    if [ -n "$_fetch_at_validator" ]; then
        if ! "$_fetch_at_validator" "$_fetch_at_tmp"; then
            rm -f "$_fetch_at_tmp"
            printf '%s\n' "fetch_atomic: validation failed" >&2
            return 1
        fi
    fi
    if ! file_atomic_replace "$_fetch_at_dest" "$_fetch_at_tmp"; then
        rm -f "$_fetch_at_tmp"
        return 1
    fi
    rm -f "$_fetch_at_tmp"
}
