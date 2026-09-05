#!/bin/sh
# Guard-owned local and remote custom-rule staging.
# Prefix: guard_rules_
set -eu

# A fetched rule file is data.  It is parsed as matcher records below and is
# never sourced, eval'ed, or interpolated into a shell command.
_GUARD_RULES_MAX_REMOTE_BYTES=262144
_GUARD_RULES_SYNC_INTERVAL_DEFAULT=10800

guard_rules_dir() {
    if [ -n "${GUARD_RULES_DIR:-}" ]; then
        printf '%s\n' "$GUARD_RULES_DIR"
    else
        printf '%s/etc/openclash-guard/rules\n' "${GUARD_PREFIX:-}"
    fi
}

guard_rules_config() {
    if [ -n "${GUARD_RULES_CONFIG:-}" ]; then
        printf '%s\n' "$GUARD_RULES_CONFIG"
    else
        printf '%s/sources.tsv\n' "$(guard_rules_dir)"
    fi
}

guard_rules_local_file() {
    case ${1:-} in
        direct|proxy) printf '%s/local-%s.tsv\n' "$(guard_rules_dir)" "$1" ;;
        *) return 2 ;;
    esac
}

guard_rules_remote_file() {
    case ${1:-} in
        direct|proxy) printf '%s/remote-%s.tsv\n' "$(guard_rules_dir)" "$1" ;;
        *) return 2 ;;
    esac
}

guard_rules_sources_dir() {
    printf '%s/sources\n' "$(guard_rules_dir)"
}

guard_rules_providers_dir() {
    printf '%s/providers\n' "$(guard_rules_dir)"
}

guard_rules_error() {
    printf 'error: %s\n' "$*" >&2
}

guard_rules_staged_notice() {
    printf '%s\n' "rules staged, not yet active; activation is provided by the separate Guard overlay command and is not performed by this rules module"
}

guard_rules_make_stage() {
    _guard_rules_ms_base=$(guard_rules_dir)
    mkdir -p "$_guard_rules_ms_base"
    _guard_rules_ms_file=$(file_mktemp "$_guard_rules_ms_base") || return 1
    rm -f "$_guard_rules_ms_file"
    mkdir -p "$_guard_rules_ms_file/sources/direct" "$_guard_rules_ms_file/sources/proxy" "$_guard_rules_ms_file/providers"
    printf '%s\n' "$_guard_rules_ms_file"
}

guard_rules_remove_stage() {
    _guard_rules_rs_stage=${1:-}
    [ -n "$_guard_rules_rs_stage" ] || return 0
    case $_guard_rules_rs_stage in
        "$(guard_rules_dir)"/*) rm -rf "$_guard_rules_rs_stage" ;;
        *) guard_rules_error "refusing to remove a non-Guard staging path"; return 1 ;;
    esac
}

guard_rules_ensure_empty_file() {
    _guard_rules_eef_dest=$1
    [ -f "$_guard_rules_eef_dest" ] && return 0
    _guard_rules_eef_dir=$(dirname "$_guard_rules_eef_dest")
    mkdir -p "$_guard_rules_eef_dir"
    _guard_rules_eef_tmp=$(file_mktemp "$_guard_rules_eef_dir") || return 1
    : > "$_guard_rules_eef_tmp"
    if ! file_atomic_replace "$_guard_rules_eef_dest" "$_guard_rules_eef_tmp"; then
        rm -f "$_guard_rules_eef_tmp"
        return 1
    fi
    rm -f "$_guard_rules_eef_tmp"
}

guard_rules_ensure_layout() {
    _guard_rules_el_dir=$(guard_rules_dir)
    _guard_rules_el_config=$(guard_rules_config)
    mkdir -p "$_guard_rules_el_dir" "$(guard_rules_sources_dir)/direct" "$(guard_rules_sources_dir)/proxy" "$(guard_rules_providers_dir)" "$(dirname "$_guard_rules_el_config")"
    guard_rules_ensure_empty_file "$(guard_rules_local_file direct)"
    guard_rules_ensure_empty_file "$(guard_rules_local_file proxy)"
    guard_rules_ensure_empty_file "$(guard_rules_remote_file direct)"
    guard_rules_ensure_empty_file "$(guard_rules_remote_file proxy)"
    guard_rules_ensure_empty_file "$_guard_rules_el_config"
}

guard_rules_bad_chars() {
    # Match whitespace and all control bytes.  The URL and matcher validators
    # deliberately reject these instead of trying to repair user input.
    LC_ALL=C awk 'BEGIN { bad = 0 } { if (NR > 1 || $0 ~ /[[:space:][:cntrl:]]/) bad = 1 } END { exit bad }'
}

guard_rules_validate_url() {
    _guard_rules_vu_url=${1:-}
    [ -n "$_guard_rules_vu_url" ] || return 1
    if ! printf '%s' "$_guard_rules_vu_url" | guard_rules_bad_chars; then
        return 1
    fi
    LC_ALL=C awk -v value="$_guard_rules_vu_url" '
        BEGIN {
            if (value !~ /^https:\/\//) exit 1
            rest = value
            sub(/^https:\/\//, "", rest)
            slash = index(rest, "/")
            if (slash <= 1) exit 1
            host = substr(rest, 1, slash - 1)
            path = substr(rest, slash)
            if (host != "raw.githubusercontent.com" && host != "gist.githubusercontent.com") exit 1
            if (path == "/" || path == "") exit 1
            if (host ~ /:/ || host ~ /@/) exit 1
            if (index(path, "?") || index(path, "#") || index(path, "\\")) exit 1
            count = split(path, parts, "/")
            if (host == "raw.githubusercontent.com") {
                if (count < 5 || parts[2] == "" || parts[3] == "" || parts[4] == "" || parts[5] == "") exit 1
            } else {
                if (count < 5 || parts[2] == "" || parts[3] == "" || parts[4] != "raw" || parts[5] == "") exit 1
            }
            exit 0
        }
    '
}

guard_rules_validate_domain() {
    _guard_rules_vd_value=${1:-}
    LC_ALL=C awk -v value="$_guard_rules_vd_value" '
        BEGIN {
            if (length(value) < 1 || length(value) > 253) exit 1
            if (value ~ /[^A-Za-z0-9.-]/ || value ~ /^[-.]|[-.]$/ || value ~ /\.\./) exit 1
            count = split(value, labels, ".")
            if (count < 1) exit 1
            for (i = 1; i <= count; i++) {
                label = labels[i]
                if (length(label) < 1 || length(label) > 63) exit 1
                if (length(label) == 1) {
                    if (label !~ /^[A-Za-z0-9]$/) exit 1
                } else if (label !~ /^[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]$/) {
                    exit 1
                }
            }
            exit 0
        }
    '
}

guard_rules_validate_keyword() {
    _guard_rules_vk_value=${1:-}
    LC_ALL=C awk -v value="$_guard_rules_vk_value" '
        BEGIN {
            if (length(value) < 1 || length(value) > 253) exit 1
            if (length(value) == 1) {
                if (value !~ /^[A-Za-z0-9]$/) exit 1
            } else if (value !~ /^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$/) {
                exit 1
            }
            exit 0
        }
    '
}

guard_rules_validate_ipv4_cidr() {
    _guard_rules_vi_value=${1:-}
    LC_ALL=C awk -v value="$_guard_rules_vi_value" '
        BEGIN {
            if (split(value, pair, "/") != 2) exit 1
            address = pair[1]
            prefix = pair[2]
            if (split(address, octets, ".") != 4) exit 1
            for (i = 1; i <= 4; i++) {
                octet = octets[i]
                if (octet !~ /^[0-9]+$/ || length(octet) > 3) exit 1
                if (length(octet) > 1 && substr(octet, 1, 1) == "0") exit 1
                if ((octet + 0) > 255) exit 1
            }
            if (prefix !~ /^[0-9]+$/ || length(prefix) > 2) exit 1
            if (length(prefix) > 1 && substr(prefix, 1, 1) == "0") exit 1
            if ((prefix + 0) > 32) exit 1
            exit 0
        }
    '
}

guard_rules_normalize_entry() {
    _guard_rules_ne_entry=${1:-}
    _guard_rules_ne_allow_keyword=${2:-0}
    [ -n "$_guard_rules_ne_entry" ] || return 1
    if ! printf '%s' "$_guard_rules_ne_entry" | guard_rules_bad_chars; then
        return 1
    fi
    case $_guard_rules_ne_entry in
        *,*) ;;
        *) return 1 ;;
    esac
    _guard_rules_ne_kind=${_guard_rules_ne_entry%%,*}
    _guard_rules_ne_value=${_guard_rules_ne_entry#*,}
    case $_guard_rules_ne_value in
        *,*|'') return 1 ;;
    esac
    case $_guard_rules_ne_kind in
        DOMAIN|DOMAIN-SUFFIX)
            _guard_rules_ne_value=$(printf '%s' "$_guard_rules_ne_value" | LC_ALL=C tr '[:upper:]' '[:lower:]')
            guard_rules_validate_domain "$_guard_rules_ne_value" || return 1
            ;;
        DOMAIN-KEYWORD)
            [ "$_guard_rules_ne_allow_keyword" = 1 ] || return 1
            _guard_rules_ne_value=$(printf '%s' "$_guard_rules_ne_value" | LC_ALL=C tr '[:upper:]' '[:lower:]')
            guard_rules_validate_keyword "$_guard_rules_ne_value" || return 1
            ;;
        IP-CIDR)
            guard_rules_validate_ipv4_cidr "$_guard_rules_ne_value" || return 1
            ;;
        *) return 1 ;;
    esac
    printf '%s,%s\n' "$_guard_rules_ne_kind" "$_guard_rules_ne_value"
}

guard_rules_validate_rule_file() {
    _guard_rules_vrf_file=${1:-}
    _guard_rules_vrf_allow_keyword=${2:-0}
    [ -f "$_guard_rules_vrf_file" ] || return 1
    while IFS= read -r _guard_rules_vrf_line || [ -n "$_guard_rules_vrf_line" ]; do
        case $_guard_rules_vrf_line in
            ''|'#'*) continue ;;
        esac
        _guard_rules_vrf_normalized=$(guard_rules_normalize_entry "$_guard_rules_vrf_line" "$_guard_rules_vrf_allow_keyword") || return 1
        [ "$_guard_rules_vrf_normalized" = "$_guard_rules_vrf_line" ] || return 1
    done < "$_guard_rules_vrf_file"
}

guard_rules_normalize_remote_file() {
    _guard_rules_nrf_input=$1
    _guard_rules_nrf_output=$2
    : > "$_guard_rules_nrf_output"
    while IFS= read -r _guard_rules_nrf_line || [ -n "$_guard_rules_nrf_line" ]; do
        case $_guard_rules_nrf_line in
            ''|'#'*) continue ;;
        esac
        _guard_rules_nrf_normalized=$(guard_rules_normalize_entry "$_guard_rules_nrf_line" 1) || return 1
        printf '%s\n' "$_guard_rules_nrf_normalized" >> "$_guard_rules_nrf_output"
    done < "$_guard_rules_nrf_input"
    LC_ALL=C sort -u "$_guard_rules_nrf_output" -o "$_guard_rules_nrf_output"
}

guard_rules_source_id() {
    _guard_rules_sid_url=$1
    _guard_rules_sid_tmp=$(file_mktemp) || return 1
    printf '%s' "$_guard_rules_sid_url" > "$_guard_rules_sid_tmp"
    _guard_rules_sid_digest=$(file_sha256 "$_guard_rules_sid_tmp") || {
        rm -f "$_guard_rules_sid_tmp"
        return 1
    }
    rm -f "$_guard_rules_sid_tmp"
    printf '%s\n' "$_guard_rules_sid_digest"
}

guard_rules_source_file() {
    _guard_rules_sfp_root=$1
    _guard_rules_sfp_scope=$2
    _guard_rules_sfp_url=$3
    printf '%s/%s/%s.tsv\n' "$_guard_rules_sfp_root" "$_guard_rules_sfp_scope" "$(guard_rules_source_id "$_guard_rules_sfp_url")"
}

guard_rules_validate_sources_file() {
    _guard_rules_vsf_file=${1:-}
    [ -f "$_guard_rules_vsf_file" ] || return 1
    while IFS="$(printf '\t')" read -r _guard_rules_vsf_scope _guard_rules_vsf_url _guard_rules_vsf_extra || [ -n "${_guard_rules_vsf_scope:-}" ]; do
        case ${_guard_rules_vsf_scope:-} in
            ''|'#'*) continue ;;
            direct|proxy) ;;
            *) return 1 ;;
        esac
        [ -n "${_guard_rules_vsf_url:-}" ] || return 1
        [ -z "${_guard_rules_vsf_extra:-}" ] || return 1
        guard_rules_validate_url "$_guard_rules_vsf_url" || return 1
    done < "$_guard_rules_vsf_file"
}

guard_rules_collect_sources() {
    _guard_rules_cs_config=$1
    _guard_rules_cs_root=$2
    _guard_rules_cs_scope=$3
    _guard_rules_cs_output=$4
    : > "$_guard_rules_cs_output"
    while IFS="$(printf '\t')" read -r _guard_rules_cs_cfg_scope _guard_rules_cs_url _guard_rules_cs_extra || [ -n "${_guard_rules_cs_cfg_scope:-}" ]; do
        [ "${_guard_rules_cs_cfg_scope:-}" = "$_guard_rules_cs_scope" ] || continue
        [ -n "${_guard_rules_cs_url:-}" ] || continue
        _guard_rules_cs_source=$(guard_rules_source_file "$_guard_rules_cs_root" "$_guard_rules_cs_scope" "$_guard_rules_cs_url")
        [ -f "$_guard_rules_cs_source" ] || continue
        cat "$_guard_rules_cs_source" >> "$_guard_rules_cs_output"
    done < "$_guard_rules_cs_config"
    _guard_rules_cs_sorted=$(file_mktemp "$(dirname "$_guard_rules_cs_output")") || return 1
    if ! LC_ALL=C sort -u "$_guard_rules_cs_output" > "$_guard_rules_cs_sorted"; then
        rm -f "$_guard_rules_cs_sorted"
        return 1
    fi
    mv -f "$_guard_rules_cs_sorted" "$_guard_rules_cs_output"
}

guard_rules_render_provider() {
    _guard_rules_rp_kind=$1
    _guard_rules_rp_local=$2
    _guard_rules_rp_remote=$3
    _guard_rules_rp_dest=$4
    _guard_rules_rp_data=$(file_mktemp "$(dirname "$_guard_rules_rp_dest")") || return 1
    case $_guard_rules_rp_kind in
        domain)
            awk -F ',' '
                $1 == "DOMAIN" { print $2 }
                $1 == "DOMAIN-SUFFIX" { print "+." $2 }
                $1 == "DOMAIN-KEYWORD" { print "*" $2 "*" }
            ' "$_guard_rules_rp_local" "$_guard_rules_rp_remote" | LC_ALL=C sort -u > "$_guard_rules_rp_data"
            ;;
        ip)
            awk -F ',' '$1 == "IP-CIDR" { print "IP-CIDR," $2 ",no-resolve" }' "$_guard_rules_rp_local" "$_guard_rules_rp_remote" | LC_ALL=C sort -u > "$_guard_rules_rp_data"
            ;;
        *) rm -f "$_guard_rules_rp_data"; return 2 ;;
    esac
    {
        printf 'payload:\n'
        while IFS= read -r _guard_rules_rp_line || [ -n "$_guard_rules_rp_line" ]; do
            [ -n "$_guard_rules_rp_line" ] || continue
            printf "  - '%s'\n" "$_guard_rules_rp_line"
        done < "$_guard_rules_rp_data"
    } > "$_guard_rules_rp_dest"
    rm -f "$_guard_rules_rp_data"
}

guard_rules_render_all() {
    _guard_rules_ra_local_direct=$1
    _guard_rules_ra_local_proxy=$2
    _guard_rules_ra_remote_direct=$3
    _guard_rules_ra_remote_proxy=$4
    _guard_rules_ra_dest=$5
    mkdir -p "$_guard_rules_ra_dest"
    while IFS=' ' read -r _guard_rules_ra_name _guard_rules_ra_behavior _guard_rules_ra_file; do
        case $_guard_rules_ra_name in
            Custom_Direct_*)
                _guard_rules_ra_local=$_guard_rules_ra_local_direct
                _guard_rules_ra_remote=$_guard_rules_ra_remote_direct
                ;;
            Custom_Proxy_*)
                _guard_rules_ra_local=$_guard_rules_ra_local_proxy
                _guard_rules_ra_remote=$_guard_rules_ra_remote_proxy
                ;;
            *) return 2 ;;
        esac
        case $_guard_rules_ra_behavior in
            domain) _guard_rules_ra_kind=domain ;;
            classical) _guard_rules_ra_kind=ip ;;
            *) return 2 ;;
        esac
        guard_rules_render_provider "$_guard_rules_ra_kind" "$_guard_rules_ra_local" "$_guard_rules_ra_remote" "$_guard_rules_ra_dest/$_guard_rules_ra_file" || return $?
    done <<EOF
$(guard_overlay_provider_specs)
EOF
}

guard_rules_publish_providers() {
    _guard_rules_pp_stage=$1
    _guard_rules_pp_dest=$(guard_rules_providers_dir)
    mkdir -p "$_guard_rules_pp_dest"
    while IFS=' ' read -r _guard_rules_pp_key _guard_rules_pp_behavior _guard_rules_pp_name; do
        [ -n "$_guard_rules_pp_name" ] || continue
        if [ -f "$_guard_rules_pp_dest/$_guard_rules_pp_name" ] && \
           cmp -s "$_guard_rules_pp_dest/$_guard_rules_pp_name" "$_guard_rules_pp_stage/$_guard_rules_pp_name"; then
            continue
        fi
        if ! file_atomic_replace "$_guard_rules_pp_dest/$_guard_rules_pp_name" "$_guard_rules_pp_stage/$_guard_rules_pp_name"; then
            return 1
        fi
    done <<EOF
$(guard_overlay_provider_specs)
EOF
}

guard_rules_init() {
    guard_rules_ensure_layout
    _guard_rules_gi_stage=$(guard_rules_make_stage) || return 1
    _guard_rules_gi_local_direct=$(guard_rules_local_file direct)
    _guard_rules_gi_local_proxy=$(guard_rules_local_file proxy)
    _guard_rules_gi_direct=$(guard_rules_remote_file direct)
    _guard_rules_gi_proxy=$(guard_rules_remote_file proxy)
    if ! guard_rules_render_all "$_guard_rules_gi_local_direct" "$_guard_rules_gi_local_proxy" "$_guard_rules_gi_direct" "$_guard_rules_gi_proxy" "$_guard_rules_gi_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_gi_stage"
        return 1
    fi
    if ! guard_rules_publish_providers "$_guard_rules_gi_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_gi_stage"
        return 1
    fi
    guard_rules_remove_stage "$_guard_rules_gi_stage"
    guard_rules_staged_notice
}

guard_rules_local_mutate() {
    _guard_rules_lm_scope=$1
    _guard_rules_lm_action=$2
    _guard_rules_lm_entry=$3
    case $_guard_rules_lm_scope in
        direct|proxy) ;;
        *) return 2 ;;
    esac
    _guard_rules_lm_normalized=$(guard_rules_normalize_entry "$_guard_rules_lm_entry" 0) || {
        guard_rules_error "invalid local rule; expected DOMAIN, DOMAIN-SUFFIX, or IP-CIDR"
        return 1
    }
    guard_rules_ensure_layout
    _guard_rules_lm_local=$(guard_rules_local_file "$_guard_rules_lm_scope")
    if ! guard_rules_validate_rule_file "$_guard_rules_lm_local" 0; then
        guard_rules_error "Guard local rule state is invalid"
        return 1
    fi
    _guard_rules_lm_stage=$(guard_rules_make_stage) || return 1
    _guard_rules_lm_new="$_guard_rules_lm_stage/local-$_guard_rules_lm_scope.tsv"
    if [ "$_guard_rules_lm_action" = add ]; then
        awk -v want="$_guard_rules_lm_normalized" '$0 == want { found = 1 } { print } END { if (!found) print want }' "$_guard_rules_lm_local" > "$_guard_rules_lm_new"
    else
        awk -v want="$_guard_rules_lm_normalized" '$0 != want { print }' "$_guard_rules_lm_local" > "$_guard_rules_lm_new"
    fi
    _guard_rules_lm_sorted=$(file_mktemp "$_guard_rules_lm_stage") || {
        guard_rules_remove_stage "$_guard_rules_lm_stage"
        return 1
    }
    LC_ALL=C sort -u "$_guard_rules_lm_new" > "$_guard_rules_lm_sorted"
    mv -f "$_guard_rules_lm_sorted" "$_guard_rules_lm_new"
    _guard_rules_lm_direct=$(guard_rules_remote_file direct)
    _guard_rules_lm_proxy=$(guard_rules_remote_file proxy)
    _guard_rules_lm_local_direct=$(guard_rules_local_file direct)
    _guard_rules_lm_local_proxy=$(guard_rules_local_file proxy)
    if [ "$_guard_rules_lm_scope" = direct ]; then
        _guard_rules_lm_local_direct=$_guard_rules_lm_new
    else
        _guard_rules_lm_local_proxy=$_guard_rules_lm_new
    fi
    if ! guard_rules_render_all "$_guard_rules_lm_local_direct" "$_guard_rules_lm_local_proxy" "$_guard_rules_lm_direct" "$_guard_rules_lm_proxy" "$_guard_rules_lm_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_lm_stage"
        return 1
    fi
    if ! file_atomic_replace "$_guard_rules_lm_local" "$_guard_rules_lm_new" || ! guard_rules_publish_providers "$_guard_rules_lm_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_lm_stage"
        return 1
    fi
    guard_rules_remove_stage "$_guard_rules_lm_stage"
    guard_rules_staged_notice
}

guard_rules_list_local() {
    _guard_rules_ll_scope=${1:-}
    case $_guard_rules_ll_scope in
        direct|proxy)
            _guard_rules_ll_local=$(guard_rules_local_file "$_guard_rules_ll_scope")
            [ -f "$_guard_rules_ll_local" ] || return 0
            ;;
        '')
            guard_rules_list_local direct
            guard_rules_list_local proxy
            return 0
            ;;
        *) return 2 ;;
    esac
    cat "$_guard_rules_ll_local"
}

guard_rules_config_mutate() {
    _guard_rules_cm_scope=$1
    _guard_rules_cm_action=$2
    _guard_rules_cm_url=$3
    case $_guard_rules_cm_scope in
        direct|proxy) ;;
        *) return 2 ;;
    esac
    guard_rules_validate_url "$_guard_rules_cm_url" || {
        guard_rules_error "only HTTPS raw.githubusercontent.com or gist.githubusercontent.com URLs are accepted"
        return 1
    }
    guard_rules_ensure_layout
    _guard_rules_cm_config=$(guard_rules_config)
    guard_rules_validate_sources_file "$_guard_rules_cm_config" || {
        guard_rules_error "Guard source configuration is invalid"
        return 1
    }
    _guard_rules_cm_stage=$(guard_rules_make_stage) || return 1
    _guard_rules_cm_new="$_guard_rules_cm_stage/sources.tsv"
    _guard_rules_cm_found=0
    if [ "$_guard_rules_cm_action" = add ]; then
        awk -F '\t' -v scope="$_guard_rules_cm_scope" -v url="$_guard_rules_cm_url" '
            $1 == scope && $2 == url { found = 1 }
            { print }
            END { if (!found) print scope "\t" url }
        ' "$_guard_rules_cm_config" > "$_guard_rules_cm_new"
    else
        awk -F '\t' -v scope="$_guard_rules_cm_scope" -v url="$_guard_rules_cm_url" '$1 == scope && $2 == url { found = 1; next } { print }' "$_guard_rules_cm_config" > "$_guard_rules_cm_new"
    fi
    _guard_rules_cm_direct="$_guard_rules_cm_stage/remote-direct.tsv"
    _guard_rules_cm_proxy="$_guard_rules_cm_stage/remote-proxy.tsv"
    guard_rules_collect_sources "$_guard_rules_cm_new" "$(guard_rules_sources_dir)" direct "$_guard_rules_cm_direct"
    guard_rules_collect_sources "$_guard_rules_cm_new" "$(guard_rules_sources_dir)" proxy "$_guard_rules_cm_proxy"
    if ! guard_rules_render_all "$(guard_rules_local_file direct)" "$(guard_rules_local_file proxy)" "$_guard_rules_cm_direct" "$_guard_rules_cm_proxy" "$_guard_rules_cm_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_cm_stage"
        return 1
    fi
    if ! file_atomic_replace "$_guard_rules_cm_config" "$_guard_rules_cm_new" || \
       ! file_atomic_replace "$(guard_rules_remote_file direct)" "$_guard_rules_cm_direct" || \
       ! file_atomic_replace "$(guard_rules_remote_file proxy)" "$_guard_rules_cm_proxy" || \
       ! guard_rules_publish_providers "$_guard_rules_cm_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_cm_stage"
        return 1
    fi
    guard_rules_remove_stage "$_guard_rules_cm_stage"
    guard_rules_staged_notice
}

guard_rules_sync_run() {
    guard_rules_ensure_layout
    _guard_rules_sr_config=$(guard_rules_config)
    guard_rules_validate_sources_file "$_guard_rules_sr_config" || {
        guard_rules_error "Guard source configuration is invalid; keeping last-good staged rules"
        return 1
    }
    _guard_rules_sr_stage=$(guard_rules_make_stage) || return 1
    _guard_rules_sr_ok=1
    while IFS="$(printf '\t')" read -r _guard_rules_sr_scope _guard_rules_sr_url _guard_rules_sr_extra || [ -n "${_guard_rules_sr_scope:-}" ]; do
        case ${_guard_rules_sr_scope:-} in
            ''|'#'*) continue ;;
        esac
        _guard_rules_sr_raw=$(file_mktemp "$_guard_rules_sr_stage") || { _guard_rules_sr_ok=0; break; }
        if ! fetch_atomic "$_guard_rules_sr_url" "$_guard_rules_sr_raw" "" "" "$_GUARD_RULES_MAX_REMOTE_BYTES" 1; then
            _guard_rules_sr_ok=0
            break
        fi
        _guard_rules_sr_bytes=$(wc -c < "$_guard_rules_sr_raw" | tr -d '[:space:]')
        case $_guard_rules_sr_bytes in
            ''|*[!0-9]*) _guard_rules_sr_ok=0; break ;;
        esac
        if [ "$_guard_rules_sr_bytes" -gt "$_GUARD_RULES_MAX_REMOTE_BYTES" ]; then
            guard_rules_error "remote rule source exceeds ${_GUARD_RULES_MAX_REMOTE_BYTES} bytes: $_guard_rules_sr_url"
            _guard_rules_sr_ok=0
            break
        fi
        _guard_rules_sr_snapshot=$(guard_rules_source_file "$_guard_rules_sr_stage/sources" "$_guard_rules_sr_scope" "$_guard_rules_sr_url")
        mkdir -p "$(dirname "$_guard_rules_sr_snapshot")"
        if ! guard_rules_normalize_remote_file "$_guard_rules_sr_raw" "$_guard_rules_sr_snapshot"; then
            guard_rules_error "remote rule source has invalid matcher data: $_guard_rules_sr_url"
            _guard_rules_sr_ok=0
            break
        fi
    done < "$_guard_rules_sr_config"
    if [ "$_guard_rules_sr_ok" != 1 ]; then
        guard_rules_remove_stage "$_guard_rules_sr_stage"
        guard_rules_error "sync failed; keeping last-good remote snapshots and providers"
        return 1
    fi
    _guard_rules_sr_direct="$_guard_rules_sr_stage/remote-direct.tsv"
    _guard_rules_sr_proxy="$_guard_rules_sr_stage/remote-proxy.tsv"
    guard_rules_collect_sources "$_guard_rules_sr_config" "$_guard_rules_sr_stage/sources" direct "$_guard_rules_sr_direct"
    guard_rules_collect_sources "$_guard_rules_sr_config" "$_guard_rules_sr_stage/sources" proxy "$_guard_rules_sr_proxy"
    if ! guard_rules_render_all "$(guard_rules_local_file direct)" "$(guard_rules_local_file proxy)" "$_guard_rules_sr_direct" "$_guard_rules_sr_proxy" "$_guard_rules_sr_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_sr_stage"
        return 1
    fi

    # Every source has been fetched, size-checked, parsed, deduped, and used
    # to render all four providers before any production snapshot is changed.
    if ! file_atomic_replace "$(guard_rules_remote_file direct)" "$_guard_rules_sr_direct" || \
       ! file_atomic_replace "$(guard_rules_remote_file proxy)" "$_guard_rules_sr_proxy"; then
        guard_rules_remove_stage "$_guard_rules_sr_stage"
        return 1
    fi
    mkdir -p "$(guard_rules_sources_dir)/direct" "$(guard_rules_sources_dir)/proxy"
    while IFS="$(printf '\t')" read -r _guard_rules_sr_scope _guard_rules_sr_url _guard_rules_sr_extra || [ -n "${_guard_rules_sr_scope:-}" ]; do
        case ${_guard_rules_sr_scope:-} in
            ''|'#'*) continue ;;
        esac
        _guard_rules_sr_snapshot=$(guard_rules_source_file "$_guard_rules_sr_stage/sources" "$_guard_rules_sr_scope" "$_guard_rules_sr_url")
        _guard_rules_sr_dest=$(guard_rules_source_file "$(guard_rules_sources_dir)" "$_guard_rules_sr_scope" "$_guard_rules_sr_url")
        if ! file_atomic_replace "$_guard_rules_sr_dest" "$_guard_rules_sr_snapshot"; then
            guard_rules_remove_stage "$_guard_rules_sr_stage"
            return 1
        fi
    done < "$_guard_rules_sr_config"
    if ! guard_rules_publish_providers "$_guard_rules_sr_stage/providers"; then
        guard_rules_remove_stage "$_guard_rules_sr_stage"
        return 1
    fi
    guard_rules_remove_stage "$_guard_rules_sr_stage"
    guard_rules_staged_notice
}

guard_rules_sync_list() {
    _guard_rules_sl_scope=${1:-}
    _guard_rules_sl_config=$(guard_rules_config)
    [ -f "$_guard_rules_sl_config" ] || return 0
    case $_guard_rules_sl_scope in
        direct|proxy)
            awk -F '\t' -v scope="$_guard_rules_sl_scope" '$1 == scope { print }' "$_guard_rules_sl_config"
            ;;
        '') cat "$_guard_rules_sl_config" ;;
        *) return 2 ;;
    esac
}

guard_rules_sync_interval() {
    _guard_rules_si_value=${GUARD_RULES_SYNC_INTERVAL:-$_GUARD_RULES_SYNC_INTERVAL_DEFAULT}
    case $_guard_rules_si_value in
        ''|*[!0-9]*) return 1 ;;
    esac
    [ "$_guard_rules_si_value" -gt 0 ] || return 1
    printf '%s\n' "$_guard_rules_si_value"
}

guard_rules_sync_watch() {
    [ "${GUARD_RULES_ALLOW_WATCH:-0}" = 1 ] || {
        guard_rules_error "sync watch is internal-only; set GUARD_RULES_ALLOW_WATCH=1 explicitly"
        return 2
    }
    _guard_rules_sw_interval=$(guard_rules_sync_interval) || {
        guard_rules_error "GUARD_RULES_SYNC_INTERVAL must be a positive integer"
        return 2
    }
    trap '_guard_lock_release; exit 0' INT TERM
    trap _guard_lock_release EXIT
    while :; do
        _guard_rules_sw_rc=0
        if _guard_lock_acquire; then
            guard_rules_sync_run || _guard_rules_sw_rc=$?
            _guard_lock_release
        else
            _guard_rules_sw_rc=$?
            guard_rules_error "scheduled sync could not acquire the Guard lock"
        fi
        [ "$_guard_rules_sw_rc" -eq 0 ] || guard_rules_error "scheduled sync failed; last-good rules remain active"
        sleep "$_guard_rules_sw_interval" || true
    done
}

guard_rules_purge() {
    _guard_rules_pg_dir=$(guard_rules_dir)
    _guard_rules_pg_config=$(guard_rules_config)
    [ -d "$_guard_rules_pg_dir" ] || return 0
    rm -f "$_guard_rules_pg_dir/local-direct.tsv" "$_guard_rules_pg_dir/local-proxy.tsv" "$_guard_rules_pg_dir/remote-direct.tsv" "$_guard_rules_pg_dir/remote-proxy.tsv"
    while IFS=' ' read -r _guard_rules_pg_key _guard_rules_pg_behavior _guard_rules_pg_name; do
        [ -n "$_guard_rules_pg_name" ] || continue
        rm -f "$_guard_rules_pg_dir/providers/$_guard_rules_pg_name"
    done <<EOF
$(guard_overlay_provider_specs)
EOF
    for _guard_rules_pg_scope in direct proxy; do
        if [ -d "$_guard_rules_pg_dir/sources/$_guard_rules_pg_scope" ]; then
            find "$_guard_rules_pg_dir/sources/$_guard_rules_pg_scope" -type f -name '*.tsv' -exec rm -f {} + 2>/dev/null || true
        fi
        rmdir "$_guard_rules_pg_dir/sources/$_guard_rules_pg_scope" 2>/dev/null || true
    done
    find "$_guard_rules_pg_dir" -type d -name 'shlib.*' -prune -exec rm -rf {} + 2>/dev/null || true
    rmdir "$_guard_rules_pg_dir/providers" "$_guard_rules_pg_dir/sources" 2>/dev/null || true
    rm -f "$_guard_rules_pg_config"
    rmdir "$_guard_rules_pg_dir" 2>/dev/null || true
}

guard_cmd_rules() {
    _guard_rules_cmd=${1:-}
    [ -n "$_guard_rules_cmd" ] || {
        guard_rules_error "usage: rules add-direct|add-proxy|list|remove-direct|remove-proxy|sync ..."
        return 2
    }
    shift
    case $_guard_rules_cmd in
        add-direct)
            [ "$#" -eq 1 ] || return 2
            guard_rules_local_mutate direct add "$1"
            ;;
        add-proxy)
            [ "$#" -eq 1 ] || return 2
            guard_rules_local_mutate proxy add "$1"
            ;;
        remove-direct)
            [ "$#" -eq 1 ] || return 2
            guard_rules_local_mutate direct remove "$1"
            ;;
        remove-proxy)
            [ "$#" -eq 1 ] || return 2
            guard_rules_local_mutate proxy remove "$1"
            ;;
        list)
            [ "$#" -le 1 ] || return 2
            guard_rules_list_local "${1:-}"
            ;;
        activate)
            guard_overlay_activate "$@"
            ;;
        deactivate)
            guard_overlay_deactivate "$@"
            ;;
        apply-overlay)
            guard_overlay_apply_config "$@"
            ;;
        sync)
            _guard_rules_sync_cmd=${1:-}
            [ -n "$_guard_rules_sync_cmd" ] || return 2
            shift
            case $_guard_rules_sync_cmd in
                add-direct) [ "$#" -eq 1 ] || return 2; guard_rules_config_mutate direct add "$1" ;;
                add-proxy) [ "$#" -eq 1 ] || return 2; guard_rules_config_mutate proxy add "$1" ;;
                remove-direct) [ "$#" -eq 1 ] || return 2; guard_rules_config_mutate direct remove "$1" ;;
                remove-proxy) [ "$#" -eq 1 ] || return 2; guard_rules_config_mutate proxy remove "$1" ;;
                list) [ "$#" -le 1 ] || return 2; guard_rules_sync_list "${1:-}" ;;
                run) [ "$#" -eq 0 ] || return 2; guard_rules_sync_run ;;
                watch) [ "$#" -eq 0 ] || return 2; guard_rules_sync_watch ;;
                *) guard_rules_error "unknown rules sync command: $_guard_rules_sync_cmd"; return 2 ;;
            esac
            ;;
        init)
            [ "$#" -eq 0 ] || return 2
            guard_rules_init
            ;;
        *)
            guard_rules_error "unknown rules command: $_guard_rules_cmd"
            return 2
            ;;
    esac
}
