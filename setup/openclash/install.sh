#!/bin/sh
# Download a published profile without mutating OpenClash runtime state.
set -eu

PROFILE="ai-balanced"
TARGET=""
INSTALL=0
SOURCE="auto"
BASE_URL=""
PROFILE_MODE=0
# BEGIN GENERATED DISTRIBUTION SOURCES
SOURCE_CDN_BASE="https://cdn.jsdelivr.net/gh/mythic3011/rules@main"
SOURCE_GITHUB_RAW_BASE="https://raw.githubusercontent.com/mythic3011/rules/main"
SOURCE_GUARD_PATH="dist/openclash-guard.sh"
SOURCE_GUARD_MANIFEST="dist/manifest.json"
SOURCE_GUARD_CHECKSUM="dist/openclash-guard.sha256"
# END GENERATED DISTRIBUTION SOURCES

usage() {
  cat <<'EOF'
Usage: install.sh [--source auto|github-raw|jsdelivr] [--base-url URL] [--output PATH | --install]
       install.sh --profile ID [--source auto|github-raw|jsdelivr] [--base-url URL] [--output PATH | --install]

Profiles:
  ai-balanced   recommended relaxed Mihomo/OpenClash profile
  ai-strict     fail-closed Mihomo/OpenClash profile

Default behavior prints the generated OpenClash Guard URL only.
The default --install flow installs the verified standalone Guard bundle.
--output PATH downloads to an explicit path.
--install downloads to /etc/openclash/config/mythic3011-<profile>.yaml.
For profile downloads, --profile selects the legacy published YAML flow.
--source selects the configured distribution source; auto tries Raw GitHub then CDN.
--base-url overrides the selected source URL base.
It does not change the active OpenClash profile or restart the service.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile) PROFILE=${2:?missing profile}; PROFILE_MODE=1; shift 2 ;;
    --source) SOURCE=${2:?missing source}; shift 2 ;;
    --base-url) BASE_URL=${2:?missing base URL}; shift 2 ;;
    --output) TARGET=${2:?missing output path}; shift 2 ;;
    --install) INSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ "$PROFILE_MODE" -eq 1 ]; then
case "$PROFILE" in
  ai-balanced) PATH_PART="cfg/yaml/Custom_Clash_AI.yaml" ;;
  ai-strict) PATH_PART="cfg/yaml/Custom_Clash_AI_Strict.yaml" ;;
  *) echo "unsupported OpenClash profile: $PROFILE" >&2; exit 2 ;;
esac
PATH_PART="${PATH_PART}"
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
  SOURCES="override"
fi

source_url() {
  if [ "$1" = override ]; then
    printf '%s/%s\n' "${BASE_URL%/}" "$PATH_PART"
  else
    printf '%s/%s\n' "$(source_base "$1")" "$PATH_PART"
  fi
}

fetch_url() {
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 2 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$2" "$1"
  else
    echo "curl or wget is required" >&2
    return 1
  fi
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
trap 'rm -f "$TMP" "$TMP.manifest" "$TMP.sha256"' EXIT INT TERM

downloaded=0
selected_source=""
for source in $SOURCES; do
  URL="$(source_url "$source")"
  if ! fetch_url "$URL" "$TMP" || [ ! -s "$TMP" ]; then
    continue
  fi
  if [ "$PROFILE_MODE" -eq 0 ]; then
    if [ -n "$BASE_URL" ]; then
      base="${BASE_URL%/}"
    else
      base="$(source_base "$source")"
    fi
    if ! fetch_url "$base/$SOURCE_GUARD_CHECKSUM" "$TMP.sha256" || [ ! -s "$TMP.sha256" ]; then
      continue
    fi
    if ! fetch_url "$base/$SOURCE_GUARD_MANIFEST" "$TMP.manifest" || [ ! -s "$TMP.manifest" ]; then
      continue
    fi
    expected_sha="$(awk 'NF {print $1; exit}' "$TMP.sha256")"
    actual_sha="$(sha256_file "$TMP")" || continue
    [ "$actual_sha" = "$expected_sha" ] || continue
    manifest_sha="$(sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]*\)".*/\1/p' "$TMP.manifest" | head -n 1)"
    [ "$manifest_sha" = "$actual_sha" ] || continue
    [ "$(awk 'NR==1 {print substr($0,1,2)}' "$TMP")" = '#!' ] || continue
    [ "$(awk '/^#!\/bin\/sh$/ {count++} END {print count+0}' "$TMP")" -eq 1 ] || continue
    [ "$(awk '/^main \"\$@\"$/ {count++} END {print count+0}' "$TMP")" -eq 1 ] || continue
    /bin/sh -n "$TMP" || continue
  fi
  downloaded=1
  selected_source="$source"
  break
done
if [ "$downloaded" -ne 1 ]; then
  echo "all configured distribution sources failed; preserving existing target" >&2
  exit 1
fi

if [ -s "$TARGET" ]; then
  cp -p "$TARGET" "${TARGET}.bak"
fi
mv "$TMP" "$TARGET"
trap - EXIT INT TERM
printf 'Downloaded %s -> %s\n' "$PROFILE" "$TARGET"
if [ "$INSTALL" -eq 1 ] && [ "$PROFILE_MODE" -eq 0 ]; then
  "$TARGET" install --yes --no-refresh
elif [ "$INSTALL" -eq 1 ]; then
  printf 'Next: select %s in OpenClash, validate it, then activate it.\n' "$TARGET"
fi
