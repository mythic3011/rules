#!/bin/sh
# Apply generated dnsmasq outputs to OpenWrt dnsmasq.

set -eu

RULES_BRANCH="${RULES_BRANCH:-main}"
RULES_REPO="${RULES_REPO:-mythic3011/rules}"
CDN_BASE="${CDN_BASE:-https://testingcf.jsdelivr.net/gh/${RULES_REPO}@refs/heads/${RULES_BRANCH}}"
MANIFEST_URL="${MANIFEST_URL:-${CDN_BASE}/shell/manifests/adblock.json}"
AUTO_INSTALL_DEPS="${AUTO_INSTALL_DEPS:-1}"
ALLOW_LEGACY_FALLBACK="${ALLOW_LEGACY_FALLBACK:-1}"
ENABLE_ADBLOCK="${ENABLE_ADBLOCK:-1}"
ENABLE_TRACKING_BLOCK="${ENABLE_TRACKING_BLOCK:-0}"
ENABLE_TELEMETRY_BLOCK="${ENABLE_TELEMETRY_BLOCK:-0}"
ENABLE_MALWARE_BLOCK="${ENABLE_MALWARE_BLOCK:-0}"
ENABLE_HOSTS_MERGE="${ENABLE_HOSTS_MERGE:-0}"
ENABLE_ADOBE_REMOTE="${ENABLE_ADOBE_REMOTE:-0}"
ADOBE_REMOTE_URL="${ADOBE_REMOTE_URL:-https://raw.githubusercontent.com/ethanaicode/Adobe-Block-Hosts-List/refs/heads/main/hosts}"
HOSTS_TARGET_FILE="${HOSTS_TARGET_FILE:-/etc/hosts}"
HOSTS_TAG_BEGIN="# RULES-ADBLOCK-HOSTS START"
HOSTS_TAG_END="# RULES-ADBLOCK-HOSTS END"
ADOBE_TAG_BEGIN="# ADOBE-HOSTS START"
ADOBE_TAG_END="# ADOBE-HOSTS END"

log() {
    echo "[rules-adblock] $*"
}

detect_dnsmasq_dir() {
    UCI_OUTPUT="$(uci show dhcp.@dnsmasq[0] 2>/dev/null || true)"

    if echo "$UCI_OUTPUT" | grep -qE 'cfg[0-9a-f]{6}'; then
        HASH_ID="$(echo "$UCI_OUTPUT" | grep -oE 'cfg[0-9a-f]{6}' | head -1)"
        echo "/tmp/dnsmasq.${HASH_ID}.d"
        return 0
    fi

    if echo "$UCI_OUTPUT" | grep -qE '@dnsmasq\[[0-9]+\]'; then
        echo "/tmp/dnsmasq.d"
        return 0
    fi

    FALLBACK_DIR="$(find /tmp -maxdepth 1 -type d -name 'dnsmasq.*.d' | head -n 1)"
    if [ -n "$FALLBACK_DIR" ]; then
        echo "$FALLBACK_DIR"
        return 0
    fi

    return 1
}

sync_conf() {
    name="$1"
    url="$2"
    tmp_file="$(mktemp)"
    log "downloading $name from $url"
    curl -fsSL --retry 5 --retry-delay 2 "$url" -o "$tmp_file"
    mv "$tmp_file" "$TARGET_DIR/$name"
}

download_to_temp() {
    url="$1"
    tmp_file="$(mktemp)"
    curl -fsSL --retry 5 --retry-delay 2 "$url" -o "$tmp_file"
    echo "$tmp_file"
}

replace_tagged_section_from_file() {
    target_file="$1"
    tag_begin="$2"
    tag_end="$3"
    title="$4"
    source_file="$5"

    [ -f "$target_file" ] || : > "$target_file"
    sed -i "/$tag_begin/,/$tag_end/d" "$target_file"
    {
        echo "$tag_begin"
        echo "# ${title}"
        cat "$source_file"
        echo "$tag_end"
    } >> "$target_file"
}

replace_tagged_section_from_url() {
    target_file="$1"
    tag_begin="$2"
    tag_end="$3"
    title="$4"
    url="$5"
    tmp_file="$(download_to_temp "$url")"
    replace_tagged_section_from_file "$target_file" "$tag_begin" "$tag_end" "$title" "$tmp_file"
    rm -f "$tmp_file"
}

expand_template() {
    value="$1"
    printf '%s' "$value" | sed \
        -e "s|\${RULES_REPO}|$RULES_REPO|g" \
        -e "s|\${RULES_BRANCH}|$RULES_BRANCH|g" \
        -e "s|\${CDN_BASE}|$CDN_BASE|g"
}

append_hosts_section() {
    title="$1"
    url="$2"
    tmp_file="$(download_to_temp "$url")"
    {
        echo "# ${title}"
        cat "$tmp_file"
    } >> /tmp/rules-adblock-hosts.merge
    rm -f "$tmp_file"
}

env_bool() {
    var_name="$1"
    default_value="$2"
    eval "raw_value=\${$var_name-}"
    if [ -n "${raw_value:-}" ]; then
        case "$raw_value" in
            1|true|TRUE|yes|YES|on|ON) echo "1" ;;
            *) echo "0" ;;
        esac
        return 0
    fi

    case "$default_value" in
        true|1) echo "1" ;;
        *) echo "0" ;;
    esac
}

env_or_default() {
    var_name="$1"
    default_value="$2"
    eval "raw_value=\${$var_name-}"
    if [ -n "${raw_value:-}" ]; then
        echo "$raw_value"
    else
        echo "$default_value"
    fi
}

ensure_jq() {
    if command -v jq >/dev/null 2>&1; then
        return 0
    fi

    if [ "$AUTO_INSTALL_DEPS" != "1" ]; then
        log "jq is required for manifest mode and AUTO_INSTALL_DEPS=0"
        return 1
    fi

    if ! command -v opkg >/dev/null 2>&1; then
        log "jq is missing and opkg is unavailable"
        return 1
    fi

    log "jq missing, installing via opkg"
    opkg update
    opkg install jq
    command -v jq >/dev/null 2>&1
}

load_manifest() {
    ensure_jq || return 1
    MANIFEST_FILE="$(download_to_temp "$MANIFEST_URL")" || return 1
    jq -e . "$MANIFEST_FILE" >/dev/null 2>&1 || {
        log "manifest is not valid JSON: $MANIFEST_URL"
        return 1
    }
}

apply_manifest_dnsmasq_confs() {
    jq -c '.dnsmasq_confs[]?' "$MANIFEST_FILE" | while IFS= read -r item; do
        enabled_env="$(printf '%s' "$item" | jq -r '.enabled_env // empty')"
        enabled_default="$(printf '%s' "$item" | jq -r '.enabled_default // false')"
        enabled="$(env_bool "$enabled_env" "$enabled_default")"
        [ "$enabled" = "1" ] || continue

        name="$(printf '%s' "$item" | jq -r '.name')"
        url_template="$(printf '%s' "$item" | jq -r '.url')"
        sync_conf "rules-${name}.dnsmasq.conf" "$(expand_template "$url_template")"
    done
}

apply_manifest_hosts_sections() {
    jq -c '.hosts_sections[]?' "$MANIFEST_FILE" | while IFS= read -r section; do
        enabled_env="$(printf '%s' "$section" | jq -r '.enabled_env // empty')"
        enabled_default="$(printf '%s' "$section" | jq -r '.enabled_default // false')"
        enabled="$(env_bool "$enabled_env" "$enabled_default")"
        [ "$enabled" = "1" ] || continue

        target_env="$(printf '%s' "$section" | jq -r '.target_file_env // empty')"
        target_default="$(printf '%s' "$section" | jq -r '.target_file_default // "/etc/hosts"')"
        target_file="$(env_or_default "$target_env" "$target_default")"
        tag_begin="$(printf '%s' "$section" | jq -r '.tag_begin')"
        tag_end="$(printf '%s' "$section" | jq -r '.tag_end')"
        section_name="$(printf '%s' "$section" | jq -r '.name')"

        tmp_merge="$(mktemp)"
        printf '%s' "$section" | jq -c '.sources[]?' | while IFS= read -r source; do
            source_enabled_env="$(printf '%s' "$source" | jq -r '.enabled_env // empty')"
            source_enabled_default="$(printf '%s' "$source" | jq -r '.enabled_default // true')"
            source_enabled="$(env_bool "$source_enabled_env" "$source_enabled_default")"
            [ "$source_enabled" = "1" ] || continue

            title="$(printf '%s' "$source" | jq -r '.title')"
            url_env="$(printf '%s' "$source" | jq -r '.url_env // empty')"
            url_default="$(printf '%s' "$source" | jq -r '.url_default // .url // empty')"
            url="$(env_or_default "$url_env" "$url_default")"
            url="$(expand_template "$url")"

            downloaded="$(download_to_temp "$url")"
            {
                echo "# ${title}"
                cat "$downloaded"
                echo
            } >> "$tmp_merge"
            rm -f "$downloaded"
        done

        if [ ! -s "$tmp_merge" ]; then
            rm -f "$tmp_merge"
            log "no enabled sources for hosts section ${section_name}, skipping"
            continue
        fi

        log "merging hosts section ${section_name} into ${target_file}"
        replace_tagged_section_from_file "$target_file" "$tag_begin" "$tag_end" "$section_name" "$tmp_merge"
        rm -f "$tmp_merge"
    done
}

apply_manifest() {
    TARGET_DIR="$(detect_dnsmasq_dir)" || {
        log "unable to detect dnsmasq rule directory"
        return 1
    }

    mkdir -p "$TARGET_DIR"
    rm -f "$TARGET_DIR"/rules-*.dnsmasq.conf
    apply_manifest_dnsmasq_confs
    apply_manifest_hosts_sections
}

apply_legacy() {
    TARGET_DIR="$(detect_dnsmasq_dir)" || {
        log "unable to detect dnsmasq rule directory"
        return 1
    }

    mkdir -p "$TARGET_DIR"
    rm -f "$TARGET_DIR"/rules-*.dnsmasq.conf

    if [ "$ENABLE_ADBLOCK" = "1" ]; then
        sync_conf "rules-adblock.dnsmasq.conf" "${CDN_BASE}/dns/adblock.dnsmasq.conf"
    fi

    if [ "$ENABLE_TRACKING_BLOCK" = "1" ]; then
        sync_conf "rules-tracking.dnsmasq.conf" "${CDN_BASE}/dns/tracking.dnsmasq.conf"
    fi

    if [ "$ENABLE_TELEMETRY_BLOCK" = "1" ]; then
        sync_conf "rules-telemetry.dnsmasq.conf" "${CDN_BASE}/dns/telemetry.dnsmasq.conf"
    fi

    if [ "$ENABLE_MALWARE_BLOCK" = "1" ]; then
        sync_conf "rules-malware.dnsmasq.conf" "${CDN_BASE}/dns/malware.dnsmasq.conf"
    fi

    if [ "$ENABLE_HOSTS_MERGE" = "1" ]; then
        log "merging enabled hosts outputs into $HOSTS_TARGET_FILE"
        [ -f "$HOSTS_TARGET_FILE" ] || : > "$HOSTS_TARGET_FILE"
        sed -i "/$HOSTS_TAG_BEGIN/,/$HOSTS_TAG_END/d" "$HOSTS_TARGET_FILE"
        : > /tmp/rules-adblock-hosts.merge

        if [ "$ENABLE_ADBLOCK" = "1" ]; then
            append_hosts_section "adblock" "${CDN_BASE}/dns/adblock.hosts.txt"
        fi
        if [ "$ENABLE_TRACKING_BLOCK" = "1" ]; then
            append_hosts_section "tracking" "${CDN_BASE}/dns/tracking.hosts.txt"
        fi
        if [ "$ENABLE_TELEMETRY_BLOCK" = "1" ]; then
            append_hosts_section "telemetry" "${CDN_BASE}/dns/telemetry.hosts.txt"
        fi
        if [ "$ENABLE_MALWARE_BLOCK" = "1" ]; then
            append_hosts_section "malware" "${CDN_BASE}/dns/malware.hosts.txt"
        fi

        {
            echo "$HOSTS_TAG_BEGIN"
            cat /tmp/rules-adblock-hosts.merge
            echo "$HOSTS_TAG_END"
        } >> "$HOSTS_TARGET_FILE"
        rm -f /tmp/rules-adblock-hosts.merge
    fi

    if [ "$ENABLE_ADOBE_REMOTE" = "1" ]; then
        log "merging remote Adobe hosts into $HOSTS_TARGET_FILE"
        [ -f "$HOSTS_TARGET_FILE" ] || : > "$HOSTS_TARGET_FILE"
        replace_tagged_section_from_url "$HOSTS_TARGET_FILE" "$ADOBE_TAG_BEGIN" "$ADOBE_TAG_END" "adobe-remote" "$ADOBE_REMOTE_URL"
    fi
}

main() {
    manifest_ok="0"
    if load_manifest; then
        if apply_manifest; then
            manifest_ok="1"
        else
            log "manifest mode failed"
        fi
        rm -f "${MANIFEST_FILE:-}"
    else
        log "manifest mode unavailable"
    fi

    if [ "$manifest_ok" != "1" ]; then
        if [ "$ALLOW_LEGACY_FALLBACK" = "1" ]; then
            log "falling back to legacy env-driven mode"
            apply_legacy
        else
            log "manifest mode failed and legacy fallback is disabled"
            exit 1
        fi
    fi

    log "reloading dnsmasq"
    /etc/init.d/dnsmasq restart
    log "done"
}

main "$@"
