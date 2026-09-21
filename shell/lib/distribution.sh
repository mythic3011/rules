#!/bin/sh
# Generated distribution catalog plus authenticated release metadata helpers.
# Prefix: guard_distribution_
set -eu

# BEGIN GENERATED DISTRIBUTION CATALOG
_GUARD_DISTRIBUTION_RAW_BASE="https://raw.githubusercontent.com/mythic3011/rules/refs/heads/main"
_GUARD_DISTRIBUTION_CDN_BASE="https://cdn.jsdelivr.net/gh/mythic3011/rules@main"
_GUARD_DISTRIBUTION_ARTIFACT="dist/openclash-guard.sh"
_GUARD_DISTRIBUTION_MANIFEST="dist/manifest.json"
_GUARD_DISTRIBUTION_CHECKSUM="dist/openclash-guard.sha256"
_GUARD_DISTRIBUTION_BOOTSTRAP="setup/openclash/install.sh"
_GUARD_DISTRIBUTION_POLICY="cfg/runtime/openclash-guard.json"
_GUARD_DISTRIBUTION_TEMPLATES="cfg/runtime/openclash-guard-templates.json"
_GUARD_DISTRIBUTION_RELEASE="dist/openclash-guard.release.json"
_GUARD_DISTRIBUTION_RELEASE_SIG="dist/openclash-guard.release.json.sig"
_GUARD_DISTRIBUTION_TRUSTED_KEY="/etc/openclash-guard/trusted-release-key.pub"
_GUARD_DISTRIBUTION_RELEASE_STATE="/etc/openclash-guard/release-state"
# END GENERATED DISTRIBUTION CATALOG

_GUARD_RELEASE_SOURCE=
_GUARD_RELEASE_METADATA_URL=
_GUARD_RELEASE_SIGNATURE_URL=
_GUARD_RELEASE_SIGNATURE_STATE=unverified
_GUARD_RELEASE_KEY_FINGERPRINT=
_GUARD_RELEASE_SEQUENCE=
_GUARD_RELEASE_REVISION=
_GUARD_RELEASE_BUNDLE_SHA256=
_GUARD_RELEASE_BOOTSTRAP_SHA256=
_GUARD_RELEASE_POLICY_SHA256=
_GUARD_RELEASE_TEMPLATES_SHA256=

_guard_distribution_base() {
    _guard_ds_source=${1:-}
    _guard_ds_override=${2:-}
    if [ -n "$_guard_ds_override" ]; then
        case $_guard_ds_override in
            https://*) ;;
            *) return 2 ;;
        esac
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
    _guard_distribution_url "${1:-}" "$_GUARD_DISTRIBUTION_POLICY" "${2:-}"
}

_guard_distribution_templates_url() {
    _guard_distribution_url "${1:-}" "$_GUARD_DISTRIBUTION_TEMPLATES" "${2:-}"
}

_guard_distribution_release_url() {
    _guard_distribution_url "${1:-}" "$_GUARD_DISTRIBUTION_RELEASE" "${2:-}"
}

_guard_distribution_release_sig_url() {
    _guard_distribution_url "${1:-}" "$_GUARD_DISTRIBUTION_RELEASE_SIG" "${2:-}"
}

_guard_distribution_trusted_key() {
    if [ -n "${GUARD_TRUSTED_RELEASE_KEY:-}" ]; then
        printf '%s\n' "$GUARD_TRUSTED_RELEASE_KEY"
    else
        printf '%s%s\n' "${GUARD_PREFIX:-}" "$_GUARD_DISTRIBUTION_TRUSTED_KEY"
    fi
}

_guard_distribution_reset_release() {
    _GUARD_RELEASE_SOURCE=
    _GUARD_RELEASE_METADATA_URL=
    _GUARD_RELEASE_SIGNATURE_URL=
    _GUARD_RELEASE_SIGNATURE_STATE=unverified
    _GUARD_RELEASE_KEY_FINGERPRINT=
    _GUARD_RELEASE_SEQUENCE=
    _GUARD_RELEASE_REVISION=
    _GUARD_RELEASE_BUNDLE_SHA256=
    _GUARD_RELEASE_BOOTSTRAP_SHA256=
    _GUARD_RELEASE_POLICY_SHA256=
    _GUARD_RELEASE_TEMPLATES_SHA256=
}

_guard_distribution_valid_sha256() {
    _guard_dvs_value=$(printf '%s' "${1:-}" | tr 'A-F' 'a-f')
    [ "${#_guard_dvs_value}" -eq 64 ] || return 1
    case $_guard_dvs_value in
        *[!0-9a-f]*) return 1 ;;
    esac
    printf '%s\n' "$_guard_dvs_value"
}

_guard_distribution_valid_sequence() {
    case ${1:-} in
        ''|0|*[!0-9]*) return 1 ;;
    esac
    [ "$1" -le 2147483647 ] 2>/dev/null || return 1
    printf '%s\n' "$1"
}

_guard_distribution_valid_revision() {
    _guard_dvr_value=${1:-}
    [ -n "$_guard_dvr_value" ] || return 1
    [ "${#_guard_dvr_value}" -le 128 ] || return 1
    case $_guard_dvr_value in
        *[!A-Za-z0-9._:-]*) return 1 ;;
    esac
    printf '%s\n' "$_guard_dvr_value"
}


_GUARD_RELEASE_STATE=unrecorded
_GUARD_RELEASE_STATE_REASON=

_guard_distribution_release_state_path() {
    if [ -n "${GUARD_RELEASE_STATE_FILE:-}" ]; then
        printf '%s\n' "$GUARD_RELEASE_STATE_FILE"
        return 0
    fi
    if [ -n "${GUARD_PREFIX:-}" ]; then
        printf '%s%s\n' "$GUARD_PREFIX" "$_GUARD_DISTRIBUTION_RELEASE_STATE"
        return 0
    fi
    case ${GUARD_POLICY_FILE:-} in
        ''|/etc/openclash-guard/openclash-guard.json) ;;
        *)
            printf '%s/release-state\n' "$(dirname "$GUARD_POLICY_FILE")"
            return 0
            ;;
    esac
    printf '%s\n' "$_GUARD_DISTRIBUTION_RELEASE_STATE"
}

_guard_distribution_state_get() {
    _guard_dsg_file=$1
    _guard_dsg_key=$2
    [ -f "$_guard_dsg_file" ] || return 1
    sed -n "s/^${_guard_dsg_key}=//p" "$_guard_dsg_file" | head -n 1
}

guard_distribution_check_release_state() {
    _GUARD_RELEASE_STATE=first-use
    _GUARD_RELEASE_STATE_REASON=
    _guard_dcs_remote_sequence=$(_guard_distribution_valid_sequence "${_GUARD_RELEASE_SEQUENCE:-}" 2>/dev/null) || {
        _GUARD_RELEASE_STATE=invalid-release
        _GUARD_RELEASE_STATE_REASON=invalid-remote-sequence
        return 1
    }
    _guard_dcs_remote_revision=$(_guard_distribution_valid_revision "${_GUARD_RELEASE_REVISION:-}" 2>/dev/null) || {
        _GUARD_RELEASE_STATE=invalid-release
        _GUARD_RELEASE_STATE_REASON=invalid-remote-revision
        return 1
    }
    [ -n "${_GUARD_RELEASE_KEY_FINGERPRINT:-}" ] || {
        _GUARD_RELEASE_STATE=invalid-release
        _GUARD_RELEASE_STATE_REASON=missing-key-fingerprint
        return 1
    }
    _guard_dcs_file=$(_guard_distribution_release_state_path)
    [ -f "$_guard_dcs_file" ] || return 0
    _guard_dcs_schema=$(_guard_distribution_state_get "$_guard_dcs_file" schemaVersion 2>/dev/null) || _guard_dcs_schema=
    [ "$_guard_dcs_schema" = 1 ] || {
        _GUARD_RELEASE_STATE=invalid-state
        _GUARD_RELEASE_STATE_REASON=invalid-local-state-schema
        return 1
    }
    _guard_dcs_sequence=$(_guard_distribution_state_get "$_guard_dcs_file" highestSequence 2>/dev/null) || _guard_dcs_sequence=
    _guard_dcs_sequence=$(_guard_distribution_valid_sequence "$_guard_dcs_sequence" 2>/dev/null) || {
        _GUARD_RELEASE_STATE=invalid-state
        _GUARD_RELEASE_STATE_REASON=invalid-local-sequence
        return 1
    }
    if [ "$_guard_dcs_remote_sequence" -lt "$_guard_dcs_sequence" ]; then
        _GUARD_RELEASE_STATE=rollback-rejected
        _GUARD_RELEASE_STATE_REASON="release-sequence-${_guard_dcs_remote_sequence}-below-${_guard_dcs_sequence}"
        return 1
    fi
    if [ "$_guard_dcs_remote_sequence" -gt "$_guard_dcs_sequence" ]; then
        _GUARD_RELEASE_STATE=advance
        return 0
    fi

    _guard_dcs_revision=$(_guard_distribution_state_get "$_guard_dcs_file" highestRevision 2>/dev/null) || _guard_dcs_revision=
    _guard_dcs_fingerprint=$(_guard_distribution_state_get "$_guard_dcs_file" signerFingerprint 2>/dev/null) || _guard_dcs_fingerprint=
    _guard_dcs_bundle=$(_guard_distribution_state_get "$_guard_dcs_file" remoteBundleSha256 2>/dev/null) || _guard_dcs_bundle=
    _guard_dcs_bootstrap=$(_guard_distribution_state_get "$_guard_dcs_file" remoteBootstrapSha256 2>/dev/null) || _guard_dcs_bootstrap=
    _guard_dcs_policy=$(_guard_distribution_state_get "$_guard_dcs_file" remotePolicySha256 2>/dev/null) || _guard_dcs_policy=
    _guard_dcs_templates=$(_guard_distribution_state_get "$_guard_dcs_file" remoteTemplatesSha256 2>/dev/null) || _guard_dcs_templates=
    if [ "$_guard_dcs_revision" != "$_guard_dcs_remote_revision" ] || \
       [ "$_guard_dcs_fingerprint" != "$_GUARD_RELEASE_KEY_FINGERPRINT" ] || \
       [ "$_guard_dcs_bundle" != "$_GUARD_RELEASE_BUNDLE_SHA256" ] || \
       [ "$_guard_dcs_bootstrap" != "$_GUARD_RELEASE_BOOTSTRAP_SHA256" ] || \
       [ "$_guard_dcs_policy" != "$_GUARD_RELEASE_POLICY_SHA256" ] || \
       [ "$_guard_dcs_templates" != "$_GUARD_RELEASE_TEMPLATES_SHA256" ]; then
        _GUARD_RELEASE_STATE=equivocation-rejected
        _GUARD_RELEASE_STATE_REASON=same-sequence-different-signed-content
        return 1
    fi
    _GUARD_RELEASE_STATE=current
    return 0
}

guard_distribution_record_release_state() {
    _guard_drs_bundle=${1:-}
    _guard_drs_policy=${2:-}
    _guard_drs_templates=${3:-}
    [ "${_GUARD_RELEASE_SIGNATURE_STATE:-}" = verified ] || return 2
    guard_distribution_check_release_state || return $?
    [ -s "$_guard_drs_policy" ] && [ -s "$_guard_drs_templates" ] || return 1
    _guard_drs_bundle_sha=
    if [ -s "$_guard_drs_bundle" ]; then
        _guard_drs_bundle_sha=$(file_sha256 "$_guard_drs_bundle" 2>/dev/null) || return 1
        _guard_drs_bundle_sha=$(_guard_distribution_valid_sha256 "$_guard_drs_bundle_sha") || return 1
    fi
    _guard_drs_policy_sha=$(file_sha256 "$_guard_drs_policy" 2>/dev/null) || return 1
    _guard_drs_templates_sha=$(file_sha256 "$_guard_drs_templates" 2>/dev/null) || return 1
    _guard_drs_policy_sha=$(_guard_distribution_valid_sha256 "$_guard_drs_policy_sha") || return 1
    _guard_drs_templates_sha=$(_guard_distribution_valid_sha256 "$_guard_drs_templates_sha") || return 1
    _guard_drs_file=$(_guard_distribution_release_state_path)
    _guard_drs_dir=$(dirname "$_guard_drs_file")
    mkdir -p "$_guard_drs_dir" || return 1
    _guard_drs_tmp=$(file_mktemp "$_guard_drs_dir") || return 1
    {
        printf 'schemaVersion=1\n'
        printf 'highestSequence=%s\n' "$_GUARD_RELEASE_SEQUENCE"
        printf 'highestRevision=%s\n' "$_GUARD_RELEASE_REVISION"
        printf 'signerFingerprint=%s\n' "$_GUARD_RELEASE_KEY_FINGERPRINT"
        printf 'remoteBundleSha256=%s\n' "$_GUARD_RELEASE_BUNDLE_SHA256"
        printf 'remoteBootstrapSha256=%s\n' "$_GUARD_RELEASE_BOOTSTRAP_SHA256"
        printf 'remotePolicySha256=%s\n' "$_GUARD_RELEASE_POLICY_SHA256"
        printf 'remoteTemplatesSha256=%s\n' "$_GUARD_RELEASE_TEMPLATES_SHA256"
        printf 'installedBundleSha256=%s\n' "$_guard_drs_bundle_sha"
        printf 'installedPolicySha256=%s\n' "$_guard_drs_policy_sha"
        printf 'installedTemplatesSha256=%s\n' "$_guard_drs_templates_sha"
    } > "$_guard_drs_tmp"
    chmod 0600 "$_guard_drs_tmp" || { rm -f "$_guard_drs_tmp"; return 1; }
    file_atomic_replace "$_guard_drs_file" "$_guard_drs_tmp" || { rm -f "$_guard_drs_tmp"; return 1; }
    chmod 0600 "$_guard_drs_file" || return 1
    rm -f "$_guard_drs_tmp"
    _GUARD_RELEASE_STATE=recorded
    return 0
}

guard_distribution_trusted_key_fingerprint() {
    _guard_dkf_key=$(_guard_distribution_trusted_key)
    [ -s "$_guard_dkf_key" ] || return 1
    command -v usign >/dev/null 2>&1 || return 127
    usign -F -p "$_guard_dkf_key" 2>/dev/null | head -n 1
}

guard_distribution_verify_release() {
    _guard_dvr_metadata=${1:-}
    _guard_dvr_signature=${2:-}
    [ -s "$_guard_dvr_metadata" ] && [ -s "$_guard_dvr_signature" ] || return 2
    command -v usign >/dev/null 2>&1 || return 127
    _guard_dvr_key=$(_guard_distribution_trusted_key)
    [ -s "$_guard_dvr_key" ] || return 126
    usign -V -q -m "$_guard_dvr_metadata" -p "$_guard_dvr_key" -x "$_guard_dvr_signature" >/dev/null 2>&1
}

guard_distribution_load_release() {
    _guard_dlr_file=${1:-}
    [ -s "$_guard_dlr_file" ] || return 2
    json_load "$_guard_dlr_file" >/dev/null 2>&1 || return 1

    _guard_dlr_schema=$(json_get "$_guard_dlr_file" schemaVersion 2>/dev/null) || return 1
    [ "$_guard_dlr_schema" = 1 ] || return 1
    _guard_dlr_sequence=$(json_get "$_guard_dlr_file" sequence 2>/dev/null) || return 1
    _guard_dlr_sequence=$(_guard_distribution_valid_sequence "$_guard_dlr_sequence") || return 1
    _guard_dlr_revision=$(json_get "$_guard_dlr_file" revision 2>/dev/null) || return 1
    _guard_dlr_revision=$(_guard_distribution_valid_revision "$_guard_dlr_revision") || return 1

    _guard_dlr_bundle_path=$(json_get "$_guard_dlr_file" artifacts.guardBundle.path 2>/dev/null) || return 1
    _guard_dlr_bootstrap_path=$(json_get "$_guard_dlr_file" artifacts.bootstrapInstaller.path 2>/dev/null) || return 1
    _guard_dlr_policy_path=$(json_get "$_guard_dlr_file" artifacts.runtimePolicy.path 2>/dev/null) || return 1
    _guard_dlr_templates_path=$(json_get "$_guard_dlr_file" artifacts.runtimeTemplates.path 2>/dev/null) || return 1
    [ "$_guard_dlr_bundle_path" = "$_GUARD_DISTRIBUTION_ARTIFACT" ] || return 1
    [ "$_guard_dlr_bootstrap_path" = "$_GUARD_DISTRIBUTION_BOOTSTRAP" ] || return 1
    [ "$_guard_dlr_policy_path" = "$_GUARD_DISTRIBUTION_POLICY" ] || return 1
    [ "$_guard_dlr_templates_path" = "$_GUARD_DISTRIBUTION_TEMPLATES" ] || return 1

    _guard_dlr_bundle_sha=$(json_get "$_guard_dlr_file" artifacts.guardBundle.sha256 2>/dev/null) || return 1
    _guard_dlr_bootstrap_sha=$(json_get "$_guard_dlr_file" artifacts.bootstrapInstaller.sha256 2>/dev/null) || return 1
    _guard_dlr_policy_sha=$(json_get "$_guard_dlr_file" artifacts.runtimePolicy.sha256 2>/dev/null) || return 1
    _guard_dlr_templates_sha=$(json_get "$_guard_dlr_file" artifacts.runtimeTemplates.sha256 2>/dev/null) || return 1
    _guard_dlr_bundle_sha=$(_guard_distribution_valid_sha256 "$_guard_dlr_bundle_sha") || return 1
    _guard_dlr_bootstrap_sha=$(_guard_distribution_valid_sha256 "$_guard_dlr_bootstrap_sha") || return 1
    _guard_dlr_policy_sha=$(_guard_distribution_valid_sha256 "$_guard_dlr_policy_sha") || return 1
    _guard_dlr_templates_sha=$(_guard_distribution_valid_sha256 "$_guard_dlr_templates_sha") || return 1

    _GUARD_RELEASE_SEQUENCE=$_guard_dlr_sequence
    _GUARD_RELEASE_REVISION=$_guard_dlr_revision
    _GUARD_RELEASE_BUNDLE_SHA256=$_guard_dlr_bundle_sha
    _GUARD_RELEASE_BOOTSTRAP_SHA256=$_guard_dlr_bootstrap_sha
    _GUARD_RELEASE_POLICY_SHA256=$_guard_dlr_policy_sha
    _GUARD_RELEASE_TEMPLATES_SHA256=$_guard_dlr_templates_sha
}

guard_distribution_fetch_release() {
    _guard_dfr_source=${1:-auto}
    _guard_dfr_base=${2:-}
    case $_guard_dfr_source in
        auto) _guard_dfr_sources='github-raw jsdelivr' ;;
        github-raw|raw|jsdelivr|cdn) _guard_dfr_sources=$_guard_dfr_source ;;
        *) return 2 ;;
    esac
    _guard_distribution_reset_release
    _GUARD_RELEASE_STATE=unrecorded
    _GUARD_RELEASE_STATE_REASON=
    for _guard_dfr_item in $_guard_dfr_sources
    do
        _guard_dfr_metadata=$(file_mktemp) || return 1
        _guard_dfr_signature=$(file_mktemp) || { rm -f "$_guard_dfr_metadata"; return 1; }
        _guard_dfr_metadata_url=$(_guard_distribution_release_url "$_guard_dfr_item" "$_guard_dfr_base") || {
            rm -f "$_guard_dfr_metadata" "$_guard_dfr_signature"
            continue
        }
        _guard_dfr_signature_url=$(_guard_distribution_release_sig_url "$_guard_dfr_item" "$_guard_dfr_base") || {
            rm -f "$_guard_dfr_metadata" "$_guard_dfr_signature"
            continue
        }
        _guard_dfr_ok=1
        fetch_http "$_guard_dfr_metadata_url" "$_guard_dfr_metadata" "" 1 65536 || _guard_dfr_ok=0
        [ "$_guard_dfr_ok" = 1 ] && fetch_http "$_guard_dfr_signature_url" "$_guard_dfr_signature" "" 1 16384 || _guard_dfr_ok=0
        [ "$_guard_dfr_ok" = 1 ] && guard_distribution_verify_release "$_guard_dfr_metadata" "$_guard_dfr_signature" || _guard_dfr_ok=0
        if [ "$_guard_dfr_ok" = 1 ]; then
            _GUARD_RELEASE_SIGNATURE_STATE=verified
            _GUARD_RELEASE_KEY_FINGERPRINT=$(guard_distribution_trusted_key_fingerprint 2>/dev/null) || _GUARD_RELEASE_KEY_FINGERPRINT=
            if [ -n "$_GUARD_RELEASE_KEY_FINGERPRINT" ] &&                guard_distribution_load_release "$_guard_dfr_metadata" &&                guard_distribution_check_release_state; then
                _GUARD_RELEASE_SOURCE=$_guard_dfr_item
                _GUARD_RELEASE_METADATA_URL=$_guard_dfr_metadata_url
                _GUARD_RELEASE_SIGNATURE_URL=$_guard_dfr_signature_url
                rm -f "$_guard_dfr_metadata" "$_guard_dfr_signature"
                return 0
            fi
        fi
        rm -f "$_guard_dfr_metadata" "$_guard_dfr_signature"
        _guard_distribution_reset_release
    done
    return 1
}

guard_distribution_verify_hash() {
    _guard_dvh_file=${1:-}
    _guard_dvh_expected=${2:-}
    _guard_dvh_expected=$(_guard_distribution_valid_sha256 "$_guard_dvh_expected") || return 2
    [ -s "$_guard_dvh_file" ] || return 1
    _guard_dvh_actual=$(file_sha256 "$_guard_dvh_file" 2>/dev/null) || return 1
    _guard_dvh_actual=$(printf '%s' "$_guard_dvh_actual" | tr 'A-F' 'a-f')
    [ "$_guard_dvh_actual" = "$_guard_dvh_expected" ]
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
    _guard_df_base=${3:-}
    [ -n "$_guard_df_dest" ] || return 2
    case $_guard_df_source in
        auto) _guard_df_sources="github-raw jsdelivr" ;;
        github-raw|raw|jsdelivr|cdn) _guard_df_sources=$_guard_df_source ;;
        *) return 2 ;;
    esac
    mkdir -p "$(dirname "$_guard_df_dest")"
    for _guard_df_item in $_guard_df_sources
    do
        if ! guard_distribution_fetch_release "$_guard_df_item" "$_guard_df_base"; then
            continue
        fi
        _guard_df_artifact=$(file_mktemp) || return 1
        _guard_df_artifact_url=$(_guard_distribution_url "$_guard_df_item" "$_GUARD_DISTRIBUTION_ARTIFACT" "$_guard_df_base") || {
            rm -f "$_guard_df_artifact"
            continue
        }
        if fetch_http "$_guard_df_artifact_url" "$_guard_df_artifact" "" 1 8388608 && \
           guard_distribution_verify_hash "$_guard_df_artifact" "$_GUARD_RELEASE_BUNDLE_SHA256" && \
           guard_distribution_validate_bundle "$_guard_df_artifact" && \
           file_atomic_replace "$_guard_df_dest" "$_guard_df_artifact"; then
            chmod 0755 "$_guard_df_dest"
            rm -f "$_guard_df_artifact"
            return 0
        fi
        rm -f "$_guard_df_artifact"
    done
    return 1
}
