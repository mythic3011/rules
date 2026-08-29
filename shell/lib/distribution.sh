#!/bin/sh
# Generated distribution catalog for cold-start runtime policy refresh.
# Prefix: guard_distribution_
set -eu

# BEGIN GENERATED DISTRIBUTION CATALOG
_GUARD_DISTRIBUTION_RAW_BASE="https://raw.githubusercontent.com/mythic3011/rules/refs/heads/main"
_GUARD_DISTRIBUTION_CDN_BASE="https://cdn.jsdelivr.net/gh/mythic3011/rules@main"
_GUARD_DISTRIBUTION_ARTIFACT="dist/openclash-guard.sh"
_GUARD_DISTRIBUTION_MANIFEST="dist/manifest.json"
_GUARD_DISTRIBUTION_CHECKSUM="dist/openclash-guard.sha256"
# END GENERATED DISTRIBUTION CATALOG

_guard_distribution_base() {
    _guard_ds_source=${1:-}
    _guard_ds_override=${2:-}
    if [ -n "$_guard_ds_override" ]; then
        printf '%s\n' "${_guard_ds_override%/}"
        return 0
    fi
    case $_guard_ds_source in
        github-raw|raw) printf '%s\n' "$_GUARD_DISTRIBUTION_RAW_BASE" ;;
        jsdelivr|cdn) printf '%s\n' "$_GUARD_DISTRIBUTION_CDN_BASE" ;;
        *) return 1 ;;
    esac
}

_guard_distribution_url() {
    _guard_du_base=$(_guard_distribution_base "${1:-}" "${3:-}") || return $?
    printf '%s/%s\n' "$_guard_du_base" "${2#/}"
}

_guard_distribution_policy_url() {
    _guard_distribution_url "${1:-}" "cfg/runtime/openclash-guard.json" "${2:-}"
}

guard_distribution_validate_bundle() {
    _guard_dv_file=${1:-}
    [ -s "$_guard_dv_file" ] || return 1
    _guard_dv_shebang=$(printf '%s%s' '#!' '/bin/sh')
    [ "$(sed -n '1p' "$_guard_dv_file")" = "$_guard_dv_shebang" ] || return 1
    [ "$(awk -v expected="$_guard_dv_shebang" '$0 == expected { count++ } END { print count + 0 }' "$_guard_dv_file")" -eq 1 ] || return 1
    [ "$(grep -c '^main "\$@"$' "$_guard_dv_file")" -eq 1 ] || return 1
    grep -q '^# GENERATED FILE' "$_guard_dv_file" || return 1
    /bin/sh -n "$_guard_dv_file"
}

guard_distribution_fetch_bundle() {
    _guard_df_dest=${1:-}
    _guard_df_source=${2:-auto}
    [ -n "$_guard_df_dest" ] || return 2
    case $_guard_df_source in
        auto) _guard_df_sources="github-raw jsdelivr" ;;
        github-raw|raw|jsdelivr|cdn) _guard_df_sources=$_guard_df_source ;;
        *) return 2 ;;
    esac
    mkdir -p "$(dirname "$_guard_df_dest")"
    for _guard_df_item in $_guard_df_sources; do
        _guard_df_artifact=$(file_mktemp) || return 1
        _guard_df_checksum=$(file_mktemp) || { rm -f "$_guard_df_artifact"; return 1; }
        _guard_df_manifest=$(file_mktemp) || { rm -f "$_guard_df_artifact" "$_guard_df_checksum"; return 1; }
        _guard_df_artifact_url=$(_guard_distribution_url "$_guard_df_item" "$_GUARD_DISTRIBUTION_ARTIFACT") || continue
        _guard_df_checksum_url=$(_guard_distribution_url "$_guard_df_item" "$_GUARD_DISTRIBUTION_CHECKSUM") || continue
        _guard_df_manifest_url=$(_guard_distribution_url "$_guard_df_item" "$_GUARD_DISTRIBUTION_MANIFEST") || continue
        if fetch_http "$_guard_df_artifact_url" "$_guard_df_artifact" && \
            fetch_http "$_guard_df_checksum_url" "$_guard_df_checksum" && \
            fetch_http "$_guard_df_manifest_url" "$_guard_df_manifest"; then
            _guard_df_expected=$(awk 'NF {print $1; exit}' "$_guard_df_checksum")
            _guard_df_actual=$(file_sha256 "$_guard_df_artifact") || _guard_df_actual=
            _guard_df_paired=$(sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]*\)".*/\1/p' "$_guard_df_manifest" | head -n 1)
            if [ -n "$_guard_df_actual" ] && \
                [ "$_guard_df_actual" = "$_guard_df_expected" ] && \
                [ "$_guard_df_actual" = "$_guard_df_paired" ] && \
                guard_distribution_validate_bundle "$_guard_df_artifact" && \
                file_atomic_replace "$_guard_df_dest" "$_guard_df_artifact"; then
                chmod 0755 "$_guard_df_dest"
                rm -f "$_guard_df_artifact" "$_guard_df_checksum" "$_guard_df_manifest"
                return 0
            fi
        fi
        rm -f "$_guard_df_artifact" "$_guard_df_checksum" "$_guard_df_manifest"
    done
    return 1
}
