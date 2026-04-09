#!/bin/sh
# Install or update a cron job that refreshes generated adblock outputs on OpenWrt.

set -eu

RULES_BRANCH="${RULES_BRANCH:-main}"
RULES_REPO="${RULES_REPO:-mythic3011/rules}"
SCRIPT_URL="${SCRIPT_URL:-https://testingcf.jsdelivr.net/gh/${RULES_REPO}@refs/heads/${RULES_BRANCH}/shell/apply_adblock_dnsmasq.sh}"
CRON_SCHEDULE="${CRON_SCHEDULE:-17 */12 * * *}"
INSTALL_PATH="${INSTALL_PATH:-/usr/bin/rules-apply-adblock}"
ENABLE_HOSTS_MERGE="${ENABLE_HOSTS_MERGE:-0}"
ENABLE_ADBLOCK="${ENABLE_ADBLOCK:-1}"
ENABLE_TRACKING_BLOCK="${ENABLE_TRACKING_BLOCK:-0}"
ENABLE_MALWARE_BLOCK="${ENABLE_MALWARE_BLOCK:-0}"

log() {
    echo "[rules-adblock-cron] $*"
}

install_script() {
    TMP_FILE="$(mktemp)"
    curl -fsSL --retry 5 --retry-delay 2 "$SCRIPT_URL" -o "$TMP_FILE"
    chmod +x "$TMP_FILE"
    mv "$TMP_FILE" "$INSTALL_PATH"
}

install_cron() {
    TMP_CRON="$(mktemp)"
    crontab -l 2>/dev/null | grep -v "$INSTALL_PATH" > "$TMP_CRON" || true
    echo "${CRON_SCHEDULE} ENABLE_ADBLOCK=${ENABLE_ADBLOCK} ENABLE_TRACKING_BLOCK=${ENABLE_TRACKING_BLOCK} ENABLE_MALWARE_BLOCK=${ENABLE_MALWARE_BLOCK} ENABLE_HOSTS_MERGE=${ENABLE_HOSTS_MERGE} RULES_BRANCH=${RULES_BRANCH} RULES_REPO=${RULES_REPO} ${INSTALL_PATH} >/tmp/rules-adblock-cron.log 2>&1" >> "$TMP_CRON"
    crontab "$TMP_CRON"
    rm -f "$TMP_CRON"
}

main() {
    log "installing refresh script to $INSTALL_PATH"
    install_script

    log "running script once"
    ENABLE_ADBLOCK="$ENABLE_ADBLOCK" ENABLE_TRACKING_BLOCK="$ENABLE_TRACKING_BLOCK" ENABLE_MALWARE_BLOCK="$ENABLE_MALWARE_BLOCK" ENABLE_HOSTS_MERGE="$ENABLE_HOSTS_MERGE" RULES_BRANCH="$RULES_BRANCH" RULES_REPO="$RULES_REPO" "$INSTALL_PATH"

    log "installing cron schedule: $CRON_SCHEDULE"
    install_cron

    /etc/init.d/cron restart
    log "cron setup complete"
}

main "$@"
