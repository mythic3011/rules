#!/bin/sh
# Geo provider lookup with timeout, fallback, cache, and last-known-good.
# Prefix: guard_geo_
# Never mutates nft. Malformed responses are skipped.
set -eu

_GUARD_GEO_PROXY_URL=
_GUARD_GEO_PROXY_AUTH=
_GUARD_GEO_ROUTE=
_GUARD_GEO_ROUTE_REASON=

_guard_geo_json_string() {
    printf '%s' "$1" | awk '
        BEGIN { ORS = "" }
        {
            gsub(/\\/, "\\\\")
            gsub(/"/, "\\\"")
            gsub(/\t/, "\\t")
            print
        }
    '
}

_guard_geo_state_dir() {
    if [ -n "${GUARD_GEO_CACHE_DIR:-}" ]; then
        printf '%s\n' "$GUARD_GEO_CACHE_DIR"
        return 0
    fi
    printf '%s\n' "${GUARD_STATE_DIR:-/etc/openclash-guard}/geo"
}

_guard_geo_cache_path() {
    _guard_geo_kind=${1:-}
    _guard_geo_route=${2:-}
    _guard_geo_dir=$(_guard_geo_state_dir)
    case $_guard_geo_kind in
        direct)
            printf '%s/direct.json\n' "$_guard_geo_dir"
            ;;
        route)
            _guard_geo_safe=$(printf '%s' "$_guard_geo_route" | tr -c 'A-Za-z0-9_-' '_')
            if [ -z "$_guard_geo_safe" ] || [ "$_guard_geo_safe" = "_" ]; then
                printf '%s\n' "guard_geo: invalid route id" >&2
                return 2
            fi
            printf '%s/route-%s.json\n' "$_guard_geo_dir" "$_guard_geo_safe"
            ;;
        *)
            printf '%s\n' "guard_geo: unknown cache kind: ${_guard_geo_kind:-}" >&2
            return 2
            ;;
    esac
}

_guard_geo_policy_file() {
    if [ -n "${_GUARD_PREFLIGHT_POLICY_FILE:-}" ] && [ -f "$_GUARD_PREFLIGHT_POLICY_FILE" ]; then
        printf '%s\n' "$_GUARD_PREFLIGHT_POLICY_FILE"
        return 0
    fi
    if [ -n "${_GUARD_POLICY_FILE:-}" ] && [ -f "$_GUARD_POLICY_FILE" ]; then
        printf '%s\n' "$_GUARD_POLICY_FILE"
        return 0
    fi
    _guard_policy_default_path
}

_guard_geo_valid_port() {
    _guard_geo_vp=${1:-}
    _guard_geo_is_int "$_guard_geo_vp" || return 1
    [ "$_guard_geo_vp" -ge 1 ] && [ "$_guard_geo_vp" -le 65535 ]
}

guard_geo_discover_proxy_route() {
    _GUARD_GEO_PROXY_URL=
    _GUARD_GEO_PROXY_AUTH=
    _GUARD_GEO_ROUTE=
    _GUARD_GEO_ROUTE_REASON=
    if [ -n "${GUARD_OPENCLASH_PROXY_URL:-}" ]; then
        case $GUARD_OPENCLASH_PROXY_URL in
            http://*|https://*|socks5://*|socks5h://*)
                _GUARD_GEO_PROXY_URL=$GUARD_OPENCLASH_PROXY_URL
                _GUARD_GEO_ROUTE=${GUARD_GEO_ROUTE:-openclash-override}
                _GUARD_GEO_PROXY_AUTH=${GUARD_OPENCLASH_PROXY_AUTH:-}
                return 0
                ;;
            *)
                _GUARD_GEO_ROUTE_REASON="GUARD_OPENCLASH_PROXY_URL is not a supported proxy URL"
                return 1
                ;;
        esac
    fi
    if ! command -v uci >/dev/null 2>&1; then
        _GUARD_GEO_ROUTE_REASON="OpenClash proxy listener cannot be discovered because uci is unavailable"
        return 1
    fi
    _guard_geo_port=$(uci_get_default openclash.config.mixed_port "" 2>/dev/null) || _guard_geo_port=
    _guard_geo_kind=mixed
    if ! _guard_geo_valid_port "$_guard_geo_port"; then
        _guard_geo_port=$(uci_get_default openclash.config.http_port "" 2>/dev/null) || _guard_geo_port=
        _guard_geo_kind=http
    fi
    if ! _guard_geo_valid_port "$_guard_geo_port"; then
        _GUARD_GEO_ROUTE_REASON="OpenClash has no valid mixed_port or http_port in UCI"
        return 1
    fi
    _GUARD_GEO_PROXY_URL="http://127.0.0.1:${_guard_geo_port}"
    _GUARD_GEO_ROUTE="openclash-${_guard_geo_kind}-${_guard_geo_port}"
    _guard_geo_auth_enabled=$(uci_get_default 'openclash.@authentication[0].enabled' 0 2>/dev/null) || _guard_geo_auth_enabled=0
    if [ "$_guard_geo_auth_enabled" = 1 ]; then
        _guard_geo_auth_user=$(uci_get_default 'openclash.@authentication[0].username' "" 2>/dev/null) || _guard_geo_auth_user=
        _guard_geo_auth_pass=$(uci_get_default 'openclash.@authentication[0].password' "" 2>/dev/null) || _guard_geo_auth_pass=
        if [ -z "$_guard_geo_auth_user" ] || [ -z "$_guard_geo_auth_pass" ]; then
            _GUARD_GEO_ROUTE_REASON="OpenClash proxy authentication is enabled but credentials are incomplete"
            _GUARD_GEO_PROXY_URL=
            _GUARD_GEO_ROUTE=
            return 1
        fi
        _GUARD_GEO_PROXY_AUTH="${_guard_geo_auth_user}:${_guard_geo_auth_pass}"
    fi
}

_guard_geo_now() {
    date +%s
}

_guard_geo_is_int() {
    case ${1:-} in
        ''|*[!0-9]*)
            return 1
            ;;
        *)
            return 0
            ;;
    esac
}

_guard_geo_print() {
    _guard_geo_p_ip=$1
    _guard_geo_p_cc=$2
    _guard_geo_p_asn=$3
    _guard_geo_p_prov=$4
    printf '{"ip":"%s","country":"%s"' \
        "$(_guard_geo_json_string "$_guard_geo_p_ip")" \
        "$(_guard_geo_json_string "$_guard_geo_p_cc")"
    if _guard_geo_is_int "$_guard_geo_p_asn"; then
        printf ',"asn":%s' "$_guard_geo_p_asn"
    fi
    printf ',"provider":"%s"}\n' "$(_guard_geo_json_string "$_guard_geo_p_prov")"
}

_guard_geo_cache_write() {
    _guard_geo_cw_path=$1
    _guard_geo_cw_ip=$2
    _guard_geo_cw_cc=$3
    _guard_geo_cw_asn=$4
    _guard_geo_cw_prov=$5
    _guard_geo_cw_ttl=$6
    _guard_geo_cw_dir=$(dirname "$_guard_geo_cw_path")
    mkdir -p "$_guard_geo_cw_dir"
    _guard_geo_cw_tmp=$(file_mktemp "$_guard_geo_cw_dir") || return 1
    _guard_geo_cw_now=$(_guard_geo_now)
    {
        printf '{"ip":"%s","country":"%s"' \
            "$(_guard_geo_json_string "$_guard_geo_cw_ip")" \
            "$(_guard_geo_json_string "$_guard_geo_cw_cc")"
        if _guard_geo_is_int "$_guard_geo_cw_asn"; then
            printf ',"asn":%s' "$_guard_geo_cw_asn"
        fi
        printf ',"provider":"%s","fetchedAt":%s,"ttlSeconds":%s}\n' \
            "$(_guard_geo_json_string "$_guard_geo_cw_prov")" \
            "$_guard_geo_cw_now" \
            "$_guard_geo_cw_ttl"
    } > "$_guard_geo_cw_tmp"
    if ! file_atomic_replace "$_guard_geo_cw_path" "$_guard_geo_cw_tmp"; then
        rm -f "$_guard_geo_cw_tmp"
        return 1
    fi
    rm -f "$_guard_geo_cw_tmp"
}

_guard_geo_cache_fresh() {
    _guard_geo_cf_file=$1
    if [ ! -f "$_guard_geo_cf_file" ]; then
        return 1
    fi
    _guard_geo_cf_fetched=$(json_get "$_guard_geo_cf_file" fetchedAt 2>/dev/null) || return 1
    _guard_geo_cf_ttl=$(json_get "$_guard_geo_cf_file" ttlSeconds 2>/dev/null) || _guard_geo_cf_ttl=300
    if ! _guard_geo_is_int "$_guard_geo_cf_fetched" || ! _guard_geo_is_int "$_guard_geo_cf_ttl"; then
        return 1
    fi
    _guard_geo_cf_now=$(_guard_geo_now)
    _guard_geo_cf_age=$((_guard_geo_cf_now - _guard_geo_cf_fetched))
    [ "$_guard_geo_cf_age" -ge 0 ] && [ "$_guard_geo_cf_age" -le "$_guard_geo_cf_ttl" ]
}

_guard_geo_emit_file() {
    _guard_geo_ef=$1
    _guard_geo_ef_ip=$(json_get "$_guard_geo_ef" ip 2>/dev/null) || _guard_geo_ef_ip=
    _guard_geo_ef_cc=$(json_get "$_guard_geo_ef" country 2>/dev/null) || _guard_geo_ef_cc=
    _guard_geo_ef_asn=$(json_get "$_guard_geo_ef" asn 2>/dev/null) || _guard_geo_ef_asn=
    _guard_geo_ef_prov=$(json_get "$_guard_geo_ef" provider 2>/dev/null) || _guard_geo_ef_prov=
    if [ -z "$_guard_geo_ef_cc" ]; then
        return 1
    fi
    _guard_geo_print "$_guard_geo_ef_ip" "$_guard_geo_ef_cc" "$_guard_geo_ef_asn" "$_guard_geo_ef_prov"
}

guard_geo_cached_country() {
    _guard_geo_cc_path=$(_guard_geo_cache_path "${1:-direct}" "${2:-}") || return $?
    if [ ! -f "$_guard_geo_cc_path" ]; then
        return 1
    fi
    json_get "$_guard_geo_cc_path" country
}

_guard_geo_normalize_country() {
    printf '%s' "$1" | tr 'A-Z' 'a-z' | tr -cd 'a-z'
}

_guard_geo_normalize_asn() {
    _guard_geo_na=$1
    case $_guard_geo_na in
        [Aa][Ss][0-9]*)
            _guard_geo_na=${_guard_geo_na#*[Ss]}
            ;;
    esac
    if _guard_geo_is_int "$_guard_geo_na"; then
        printf '%s\n' "$_guard_geo_na"
        return 0
    fi
    printf '\n'
}

guard_geo_lookup() {
    _guard_geo_kind=${1:-direct}
    _guard_geo_route=${2:-}
    _guard_geo_cache=$(_guard_geo_cache_path "$_guard_geo_kind" "$_guard_geo_route") || return $?
    if _guard_geo_cache_fresh "$_guard_geo_cache"; then
        _guard_geo_emit_file "$_guard_geo_cache"
        return $?
    fi
    _guard_geo_pf=$(_guard_geo_policy_file)
    if [ ! -f "$_guard_geo_pf" ]; then
        if [ -f "$_guard_geo_cache" ]; then
            _guard_geo_emit_file "$_guard_geo_cache"
            return $?
        fi
        printf '%s\n' "guard_geo: policy file missing" >&2
        return 1
    fi
    _guard_geo_i=0
    _guard_geo_ok=0
    while json_has "$_guard_geo_pf" "geoProviders.${_guard_geo_i}"
    do
        _guard_geo_id=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.id") || _guard_geo_id=
        _guard_geo_url=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.url") || _guard_geo_url=
        _guard_geo_to=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.timeoutSeconds") || _guard_geo_to=3
        _guard_geo_ttl=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.cacheTtlSeconds") || _guard_geo_ttl=300
        _guard_geo_ipf=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.fields.ip") || _guard_geo_ipf=ip
        _guard_geo_ccf=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.fields.country") || _guard_geo_ccf=country
        _guard_geo_asnf=$(json_get "$_guard_geo_pf" "geoProviders.${_guard_geo_i}.fields.asn") || _guard_geo_asnf=
        _guard_geo_i=$((_guard_geo_i + 1))
        if [ -z "$_guard_geo_url" ]; then
            continue
        fi
        if ! _guard_geo_is_int "$_guard_geo_to"; then
            _guard_geo_to=3
        fi
        _guard_geo_tmp=$(file_mktemp) || return 1
        _guard_geo_fetch_rc=0
        case $_guard_geo_kind in
            direct)
                fetch_http_direct "$_guard_geo_url" "$_guard_geo_tmp" "$_guard_geo_to" || _guard_geo_fetch_rc=$?
                ;;
            route)
                if [ -z "${_GUARD_GEO_PROXY_URL:-}" ]; then
                    printf '%s\n' "guard_geo: proxy route is not available" >&2
                    rm -f "$_guard_geo_tmp"
                    return 1
                fi
                fetch_http_proxy "$_guard_geo_url" "$_guard_geo_tmp" "$_GUARD_GEO_PROXY_URL" "$_guard_geo_to" "${_GUARD_GEO_PROXY_AUTH:-}" || _guard_geo_fetch_rc=$?
                ;;
        esac
        if [ "$_guard_geo_fetch_rc" -ne 0 ]; then
            rm -f "$_guard_geo_tmp"
            continue
        fi
        if ! json_load "$_guard_geo_tmp"; then
            rm -f "$_guard_geo_tmp"
            continue
        fi
        _guard_geo_ip=$(json_get "$_guard_geo_tmp" "$_guard_geo_ipf" 2>/dev/null) || _guard_geo_ip=
        _guard_geo_cc_raw=$(json_get "$_guard_geo_tmp" "$_guard_geo_ccf" 2>/dev/null) || _guard_geo_cc_raw=
        _guard_geo_cc=$(_guard_geo_normalize_country "$_guard_geo_cc_raw")
        _guard_geo_asn=
        if [ -n "$_guard_geo_asnf" ]; then
            _guard_geo_asn_raw=$(json_get "$_guard_geo_tmp" "$_guard_geo_asnf" 2>/dev/null) || _guard_geo_asn_raw=
            _guard_geo_asn=$(_guard_geo_normalize_asn "$_guard_geo_asn_raw")
        fi
        rm -f "$_guard_geo_tmp"
        if [ -z "$_guard_geo_cc" ] || [ "${#_guard_geo_cc}" -ne 2 ]; then
            continue
        fi
        _guard_geo_cache_write "$_guard_geo_cache" "$_guard_geo_ip" "$_guard_geo_cc" "$_guard_geo_asn" "$_guard_geo_id" "$_guard_geo_ttl" || true
        _guard_geo_print "$_guard_geo_ip" "$_guard_geo_cc" "$_guard_geo_asn" "$_guard_geo_id"
        _guard_geo_ok=1
        break
    done
    if [ "$_guard_geo_ok" = 1 ]; then
        return 0
    fi
    if [ -f "$_guard_geo_cache" ]; then
        cli_warn "geo lookup failed; using last-known-good cache" 2>/dev/null || true
        _guard_geo_emit_file "$_guard_geo_cache"
        return $?
    fi
    printf '%s\n' "guard_geo: all providers failed" >&2
    return 1
}

guard_geo_detect_direct() {
    guard_geo_lookup direct
}

guard_geo_detect_route() {
    if [ -z "${1:-}" ]; then
        printf '%s\n' "guard_geo_detect_route: missing route" >&2
        return 2
    fi
    guard_geo_lookup route "$1"
}
