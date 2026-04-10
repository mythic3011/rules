#!/bin/sh
# Apply generated adblock outputs to OpenWrt dnsmasq.

set -eu

RULES_BRANCH="${RULES_BRANCH:-main}"
RULES_REPO="${RULES_REPO:-mythic3011/rules}"
CDN_BASE="${CDN_BASE:-https://testingcf.jsdelivr.net/gh/${RULES_REPO}@refs/heads/${RULES_BRANCH}}"
ENABLE_ADBLOCK="${ENABLE_ADBLOCK:-1}"
ENABLE_TRACKING_BLOCK="${ENABLE_TRACKING_BLOCK:-0}"
ENABLE_TELEMETRY_BLOCK="${ENABLE_TELEMETRY_BLOCK:-0}"
ENABLE_MALWARE_BLOCK="${ENABLE_MALWARE_BLOCK:-0}"
ENABLE_HOSTS_MERGE="${ENABLE_HOSTS_MERGE:-0}"
HOSTS_TARGET_FILE="${HOSTS_TARGET_FILE:-/etc/hosts}"
HOSTS_TAG_BEGIN="# RULES-ADBLOCK-HOSTS START"
HOSTS_TAG_END="# RULES-ADBLOCK-HOSTS END"

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

append_hosts_section() {
    title="$1"
    url="$2"
    tmp_hosts="$(mktemp)"
    if ! curl -fsSL --retry 5 --retry-delay 2 "$url" -o "$tmp_hosts"; then
        rm -f "$tmp_hosts"
        log "failed to download hosts output: $url"
        return 1
    fi

    {
        echo "# ${title}"
        cat "$tmp_hosts"
    } >> /tmp/rules-adblock-hosts.merge
    rm -f "$tmp_hosts"
}

main() {
    TARGET_DIR="$(detect_dnsmasq_dir)" || {
        log "unable to detect dnsmasq rule directory"
        exit 1
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

    log "reloading dnsmasq"
    /etc/init.d/dnsmasq restart
    log "done"
}

main "$@"
