#!/bin/sh
# Download a published profile without mutating OpenClash runtime state.
set -eu

PROFILE="ai-balanced"
TARGET=""
INSTALL=0
SOURCE="auto"
BASE_URL=""
# BEGIN GENERATED DISTRIBUTION SOURCES
SOURCE_CDN_BASE="https://cdn.jsdelivr.net/gh/mythic3011/rules@main"
SOURCE_GITHUB_RAW_BASE="https://raw.githubusercontent.com/mythic3011/rules/main"
# END GENERATED DISTRIBUTION SOURCES

usage() {
  cat <<'EOF'
Usage: install.sh [--profile ID] [--source auto|github-raw|jsdelivr] [--base-url URL] [--output PATH | --install]

Profiles:
  ai-balanced   recommended relaxed Mihomo/OpenClash profile
  ai-strict     fail-closed Mihomo/OpenClash profile

Default behavior prints the URL only.
--output PATH downloads to an explicit path.
--install downloads to /etc/openclash/config/mythic3011-<profile>.yaml.
--source selects the configured distribution source; auto tries CDN then Raw GitHub.
--base-url overrides the selected source URL base.
It does not change the active OpenClash profile or restart the service.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile) PROFILE=${2:?missing profile}; shift 2 ;;
    --source) SOURCE=${2:?missing source}; shift 2 ;;
    --base-url) BASE_URL=${2:?missing base URL}; shift 2 ;;
    --output) TARGET=${2:?missing output path}; shift 2 ;;
    --install) INSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PROFILE" in
  ai-balanced) PATH_PART="cfg/yaml/Custom_Clash_AI.yaml" ;;
  ai-strict) PATH_PART="cfg/yaml/Custom_Clash_AI_Strict.yaml" ;;
  *) echo "unsupported OpenClash profile: $PROFILE" >&2; exit 2 ;;
esac

source_base() {
  case "$1" in
    jsdelivr) printf '%s\n' "$SOURCE_CDN_BASE" ;;
    github-raw) printf '%s\n' "$SOURCE_GITHUB_RAW_BASE" ;;
    *) return 1 ;;
  esac
}

case "$SOURCE" in
  auto) SOURCES="jsdelivr github-raw" ;;
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

URL="$(source_url "${SOURCES%% *}")"

if [ "$INSTALL" -eq 1 ]; then
  TARGET="/etc/openclash/config/mythic3011-${PROFILE}.yaml"
fi

if [ -z "$TARGET" ]; then
  printf '%s\n' "$URL"
  exit 0
fi

mkdir -p "$(dirname "$TARGET")"
TMP="${TARGET}.tmp.$$"
trap 'rm -f "$TMP"' EXIT INT TERM

downloaded=0
for source in $SOURCES; do
  URL="$(source_url "$source")"
  if command -v curl >/dev/null 2>&1; then
    if curl -fL --retry 2 -o "$TMP" "$URL" && [ -s "$TMP" ]; then downloaded=1; break; fi
  elif command -v wget >/dev/null 2>&1; then
    if wget -O "$TMP" "$URL" && [ -s "$TMP" ]; then downloaded=1; break; fi
  else
    echo "curl or wget is required" >&2
    exit 1
  fi
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
if [ "$INSTALL" -eq 1 ]; then
  printf 'Next: select %s in OpenClash, validate it, then activate it.\n' "$TARGET"
fi
