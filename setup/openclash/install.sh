#!/bin/sh
# Download a published profile without mutating OpenClash runtime state.
set -eu

BASE="https://testingcf.jsdelivr.net/gh/mythic3011/rules@main"
PROFILE="ai-balanced"
TARGET=""
INSTALL=0

usage() {
  cat <<'EOF'
Usage: install.sh [--profile ID] [--output PATH | --install]

Profiles:
  ai-balanced   recommended relaxed Mihomo/OpenClash profile
  ai-strict     fail-closed Mihomo/OpenClash profile

Default behavior prints the URL only.
--output PATH downloads to an explicit path.
--install downloads to /etc/openclash/config/mythic3011-<profile>.yaml.
It does not change the active OpenClash profile or restart the service.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile) PROFILE=${2:?missing profile}; shift 2 ;;
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

URL="$BASE/$PATH_PART"

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

if command -v curl >/dev/null 2>&1; then
  curl -fL --retry 2 -o "$TMP" "$URL"
elif command -v wget >/dev/null 2>&1; then
  wget -O "$TMP" "$URL"
else
  echo "curl or wget is required" >&2
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
