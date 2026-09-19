#!/bin/sh
# Download profiles or install, inspect, and uninstall OpenClash Guard.
# Guard bundle installation requires authenticated release metadata and never
# treats a checksum fetched beside the payload as a trust anchor.
set -eu

PROFILE="ai-balanced"
TARGET=""
INSTALL=0
HEALTH_CHECK=0
UNINSTALL=0
ASSUME_YES=0
PURGE_RULES=0
SOURCE="auto"
BASE_URL=""
PROFILE_MODE=0
# BEGIN GENERATED DISTRIBUTION SOURCES
SOURCE_CDN_BASE="https://cdn.jsdelivr.net/gh/mythic3011/rules@main"
SOURCE_GITHUB_RAW_BASE="https://raw.githubusercontent.com/mythic3011/rules/refs/heads/main"
SOURCE_GUARD_PATH="dist/openclash-guard.sh"
SOURCE_GUARD_MANIFEST="dist/manifest.json"
SOURCE_GUARD_CHECKSUM="dist/openclash-guard.sha256"
SOURCE_GUARD_RELEASE="dist/openclash-guard.release.json"
SOURCE_GUARD_RELEASE_SIG="dist/openclash-guard.release.json.sig"
SOURCE_GUARD_TRUSTED_KEY="/etc/openclash-guard/trusted-release-key.pub"
# END GENERATED DISTRIBUTION SOURCES

usage() {
  cat <<'EOF'
Usage: install.sh [--source auto|github-raw|jsdelivr] [--base-url URL] [--output PATH | --install]
       install.sh --profile ID [--source auto|github-raw|jsdelivr] [--base-url URL] [--output PATH | --install]
       install.sh --health-check
       install.sh --uninstall [--yes] [--purge-rules]

Guard bundle downloads require a pre-provisioned trusted usign public key.
The default key path is /etc/openclash-guard/trusted-release-key.pub and may be
overridden with OPENCLASH_GUARD_TRUSTED_KEY. The key must come from a channel
independent of the mirror/CDN; downloading and trusting it from the same
unauthenticated source does not provide MITM protection.

No automatic upgrade is performed. --install is an explicit operator action and
only executes a local bundle after signed metadata, SHA-256, and shell validation.
Remote pipe-to-shell installation is intentionally unsupported.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile) PROFILE=${2:?missing profile}; PROFILE_MODE=1; shift 2 ;;
    --source) SOURCE=${2:?missing source}; shift 2 ;;
    --base-url) BASE_URL=${2:?missing base URL}; shift 2 ;;
    --output) TARGET=${2:?missing output path}; shift 2 ;;
    --install) INSTALL=1; shift ;;
    --health-check) HEALTH_CHECK=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --purge-rules) PURGE_RULES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

action_count=$((INSTALL + HEALTH_CHECK + UNINSTALL))
if [ "$action_count" -gt 1 ]; then
  echo "--install, --health-check, and --uninstall are mutually exclusive" >&2
  exit 2
fi
if [ "$PURGE_RULES" -eq 1 ] && [ "$UNINSTALL" -ne 1 ]; then
  echo "--purge-rules requires --uninstall" >&2
  exit 2
fi
if { [ "$HEALTH_CHECK" -eq 1 ] || [ "$UNINSTALL" -eq 1 ]; } && [ "$PROFILE_MODE" -eq 1 ]; then
  echo "--profile cannot be combined with Guard lifecycle operations" >&2
  exit 2
fi

if [ "$HEALTH_CHECK" -eq 1 ] || [ "$UNINSTALL" -eq 1 ]; then
  GUARD_BIN=${OPENCLASH_GUARD_BIN:-/usr/bin/openclash-guard}
  if [ ! -x "$GUARD_BIN" ]; then
    echo "installed OpenClash Guard not found: $GUARD_BIN" >&2
    exit 1
  fi
  if [ "$HEALTH_CHECK" -eq 1 ]; then
    exec "$GUARD_BIN" health-check
  fi
  if [ "$ASSUME_YES" -eq 1 ] && [ "$PURGE_RULES" -eq 1 ]; then
    exec "$GUARD_BIN" uninstall --yes --purge-rules
  elif [ "$ASSUME_YES" -eq 1 ]; then
    exec "$GUARD_BIN" uninstall --yes
  elif [ "$PURGE_RULES" -eq 1 ]; then
    exec "$GUARD_BIN" uninstall --purge-rules
  else
    exec "$GUARD_BIN" uninstall
  fi
fi

if [ "$PROFILE_MODE" -eq 1 ]; then
  case "$PROFILE" in
    ai-balanced) PATH_PART="cfg/yaml/Custom_Clash_AI.yaml" ;;
    ai-strict) PATH_PART="cfg/yaml/Custom_Clash_AI_Strict.yaml" ;;
    *) echo "unsupported OpenClash profile: $PROFILE" >&2; exit 2 ;;
  esac
else
  PATH_PART="$SOURCE_GUARD_PATH"
fi

source_base() {
  case "$1" in
    jsdelivr) printf '%s\n' "$SOURCE_CDN_BASE" ;;
    github-raw) printf '%s\n' "$SOURCE_GITHUB_RAW_BASE" ;;
    *) return 1 ;;
  esac
}

case "$SOURCE" in
  auto) SOURCES="github-raw jsdelivr" ;;
  jsdelivr|github-raw) SOURCES="$SOURCE" ;;
  *) echo "unsupported distribution source: $SOURCE" >&2; exit 2 ;;
esac
if [ -n "$BASE_URL" ]; then
  case "$BASE_URL" in
    https://*) ;;
    *) echo "--base-url must use HTTPS" >&2; exit 2 ;;
  esac
  SOURCES="override"
fi

base_for() {
  if [ "$1" = override ]; then
    printf '%s\n' "${BASE_URL%/}"
  else
    source_base "$1"
  fi
}

source_url() {
  printf '%s/%s\n' "$(base_for "$1")" "$PATH_PART"
}

fetch_url() {
  url=$1
  out=$2
  case "$url" in
    https://*) ;;
    *) echo "refusing non-HTTPS URL: $url" >&2; return 2 ;;
  esac
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required for HTTPS-only no-redirect distribution fetches" >&2
    return 127
  fi
  curl -fSs --retry 2 --max-redirs 0 --proto '=https' --proto-redir '=https' -o "$out" "$url"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  else
    echo "sha256sum, shasum, or openssl is required" >&2
    return 1
  fi
}

valid_sha256() {
  value=$(printf '%s' "${1:-}" | tr 'A-F' 'a-f')
  [ "${#value}" -eq 64 ] || return 1
  case "$value" in *[!0-9a-f]*) return 1 ;; esac
  printf '%s\n' "$value"
}

verify_release() {
  metadata=$1
  signature=$2
  key=${OPENCLASH_GUARD_TRUSTED_KEY:-$SOURCE_GUARD_TRUSTED_KEY}
  command -v usign >/dev/null 2>&1 || { echo "usign is required" >&2; return 127; }
  command -v jsonfilter >/dev/null 2>&1 || { echo "jsonfilter is required" >&2; return 127; }
  [ -s "$key" ] || { echo "trusted release key missing: $key" >&2; return 126; }
  usign -V -q -m "$metadata" -p "$key" -x "$signature" >/dev/null 2>&1 || {
    echo "release metadata signature verification failed" >&2
    return 1
  }
}

URL="$(source_url "${SOURCES%% *}")"
if [ "$INSTALL" -eq 1 ] && [ "$PROFILE_MODE" -eq 1 ]; then
  TARGET="/etc/openclash/config/mythic3011-${PROFILE}.yaml"
elif [ "$INSTALL" -eq 1 ]; then
  TARGET="/usr/bin/openclash-guard"
fi
if [ -z "$TARGET" ]; then
  printf '%s\n' "$URL"
  exit 0
fi

mkdir -p "$(dirname "$TARGET")"
TMP="${TARGET}.tmp.$$"
trap 'rm -f "$TMP" "$TMP.release" "$TMP.release.sig"' EXIT INT TERM

downloaded=0
for source in $SOURCES; do
  URL="$(source_url "$source")"
  if [ "$PROFILE_MODE" -eq 0 ]; then
    base="$(base_for "$source")"
    if ! fetch_url "$base/$SOURCE_GUARD_RELEASE" "$TMP.release" || \
       ! fetch_url "$base/$SOURCE_GUARD_RELEASE_SIG" "$TMP.release.sig" || \
       ! verify_release "$TMP.release" "$TMP.release.sig"; then
      continue
    fi
    release_path=$(jsonfilter -i "$TMP.release" -e '@.artifacts.guardBundle.path' 2>/dev/null || true)
    [ "$release_path" = "$SOURCE_GUARD_PATH" ] || continue
    expected_sha=$(jsonfilter -i "$TMP.release" -e '@.artifacts.guardBundle.sha256' 2>/dev/null || true)
    expected_sha=$(valid_sha256 "$expected_sha" 2>/dev/null) || continue
  fi

  if ! fetch_url "$URL" "$TMP" || [ ! -s "$TMP" ]; then
    continue
  fi
  if [ "$PROFILE_MODE" -eq 0 ]; then
    actual_sha=$(sha256_file "$TMP" | tr 'A-F' 'a-f') || continue
    [ "$actual_sha" = "$expected_sha" ] || continue
    [ "$(awk 'NR==1 {print substr($0,1,2)}' "$TMP")" = '#!' ] || continue
    [ "$(awk '/^#!\/bin\/sh$/ {count++} END {print count+0}' "$TMP")" -eq 1 ] || continue
    [ "$(awk '/^main \"\$@\"$/ {count++} END {print count+0}' "$TMP")" -eq 1 ] || continue
    /bin/sh -n "$TMP" || continue
  fi
  downloaded=1
  break
done
if [ "$downloaded" -ne 1 ]; then
  echo "all configured distribution sources failed authenticated validation; preserving existing target" >&2
  exit 1
fi

if [ -s "$TARGET" ]; then
  cp -p "$TARGET" "${TARGET}.bak"
fi
mv "$TMP" "$TARGET"
trap - EXIT INT TERM
printf 'Downloaded %s -> %s\n' "$PROFILE" "$TARGET"
if [ "$INSTALL" -eq 1 ] && [ "$PROFILE_MODE" -eq 0 ]; then
  if [ "$ASSUME_YES" -eq 1 ]; then
    "$TARGET" install --yes
  else
    "$TARGET" install
  fi
elif [ "$INSTALL" -eq 1 ]; then
  printf 'Next: select %s in OpenClash, validate it, then activate it.\n' "$TARGET"
fi
