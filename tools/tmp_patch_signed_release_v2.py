#!/usr/bin/env python3
from __future__ import annotations

import json
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:160]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8", newline="\n")


# Canonical distribution catalog: monotonic signed-release sequence + local receipt.
path = ROOT / "internal/config/ai-routing/catalogs/distribution.json"
document = json.loads(path.read_text(encoding="utf-8"))
rebuilt: dict[str, object] = {}
for key, value in document.items():
    if key in {"releaseSequence", "releaseStatePath"}:
        continue
    rebuilt[key] = value
    if key == "trustedKeyPath":
        rebuilt["releaseSequence"] = int(document.get("releaseSequence", 1))
        rebuilt["releaseStatePath"] = document.get(
            "releaseStatePath", "/etc/openclash-guard/release-state"
        )
path.write_text(json.dumps(rebuilt, indent=2) + "\n", encoding="utf-8")


# Typed catalog support + release metadata as a deterministic managed output.
path = ROOT / "internal/python/ai_profiles/distribution.py"
text = path.read_text(encoding="utf-8")
if "release_sequence: int" not in text:
    text = text.replace(
        "    trusted_key_path: str\n    artifacts: tuple[DistributionArtifact, ...]\n",
        "    trusted_key_path: str\n    release_sequence: int\n    release_state_path: str\n    artifacts: tuple[DistributionArtifact, ...]\n",
        1,
    )
old_shape = '    if set(value) != {"schemaVersion", "repository", "defaultRef", "bootstrapAlias", "manifestPath", "releaseMetadataPath", "releaseSignaturePath", "trustedKeyPath", "artifacts", "channels"}:\n        raise RuntimeError(f"Distribution catalog has unknown or incomplete shape: {path}")\n'
new_shape = '    if set(value) != {"schemaVersion", "repository", "defaultRef", "bootstrapAlias", "manifestPath", "releaseMetadataPath", "releaseSignaturePath", "trustedKeyPath", "releaseSequence", "releaseStatePath", "artifacts", "channels"}:\n        raise RuntimeError(f"Distribution catalog has unknown or incomplete shape: {path}")\n    release_sequence = value.get("releaseSequence")\n    if type(release_sequence) is not int or not (1 <= release_sequence <= 2147483647):\n        raise RuntimeError("Distribution releaseSequence must be an integer in 1..2147483647")\n    release_state_path = _string(value.get("releaseStatePath"), "releaseStatePath")\n    if not release_state_path.startswith("/"):\n        raise RuntimeError("Distribution releaseStatePath must be absolute")\n'
if "release_sequence = value.get" not in text:
    if old_shape not in text:
        raise SystemExit("distribution catalog shape anchor not found")
    text = text.replace(old_shape, new_shape, 1)
if "release_sequence=release_sequence" not in text:
    text = text.replace(
        '        trusted_key_path=_string(value.get("trustedKeyPath"), "trustedKeyPath"),\n        artifacts=tuple(artifacts),\n',
        '        trusted_key_path=_string(value.get("trustedKeyPath"), "trustedKeyPath"),\n        release_sequence=release_sequence,\n        release_state_path=release_state_path,\n        artifacts=tuple(artifacts),\n',
        1,
    )
if "paths.append(distribution.release_metadata_path)" not in text:
    text = text.replace(
        "    paths.append(distribution.manifest_path)\n",
        "    paths.append(distribution.manifest_path)\n    paths.append(distribution.release_metadata_path)\n",
        1,
    )
if "specs.append(distribution.release_metadata_path)" not in text:
    text = text.replace(
        "    specs.append(distribution.manifest_path)\n",
        "    specs.append(distribution.manifest_path)\n    specs.append(distribution.release_metadata_path)\n",
        1,
    )
path.write_text(text, encoding="utf-8")


# Generated projections include release state path and explicit integrity semantics.
path = ROOT / "internal/python/generate_distribution_bootstrap.py"
text = path.read_text(encoding="utf-8")
if 'release_state = document["releaseStatePath"]' not in text:
    text = text.replace(
        '    trusted_key = document["trustedKeyPath"]\n',
        '    trusted_key = document["trustedKeyPath"]\n    release_state = document["releaseStatePath"]\n',
        1,
    )
if "SOURCE_GUARD_RELEASE_STATE" not in text:
    text = text.replace(
        "        f'SOURCE_GUARD_TRUSTED_KEY=\"{trusted_key}\"',\n",
        "        f'SOURCE_GUARD_TRUSTED_KEY=\"{trusted_key}\"',\n        f'SOURCE_GUARD_RELEASE_STATE=\"{release_state}\"',\n",
        1,
    )
if "_GUARD_DISTRIBUTION_RELEASE_STATE" not in text:
    text = text.replace(
        "            f'_GUARD_DISTRIBUTION_TRUSTED_KEY=\"{trusted_key}\"',\n",
        "            f'_GUARD_DISTRIBUTION_TRUSTED_KEY=\"{trusted_key}\"',\n            f'_GUARD_DISTRIBUTION_RELEASE_STATE=\"{release_state}\"',\n",
        1,
    )
old_doc_line = '        "This reads the local bundle hash, fetches only small signed release metadata plus its detached signature, verifies the local trust anchor, and compares hashes. It never installs, reconciles, refreshes, or executes fetched bytes.",\n'
new_doc_lines = '''        "This reads the local bundle hash, fetches only small signed release metadata plus its detached signature, verifies the local trust anchor, enforces the locally recorded highest release sequence, and compares hashes. It never installs, reconciles, refreshes, or executes fetched bytes.",
        "",
        "After the first authenticated install/refresh, a lower signed release sequence is rejected as rollback and reuse of the same sequence with different signed content is rejected as equivocation. First use cannot prove freshness without an independent trusted time/state source; the trust anchor still prevents a network attacker from forging metadata.",
        "",
        "### Local integrity receipt",
        "",
        "```sh",
        "openclash-guard integrity-check",
        "openclash-guard --json integrity-check",
        "```",
        "",
        "This is network-free and compares the installed bundle, runtime policy, and template catalog against the hashes recorded after the last successful authenticated install/refresh. It detects local byte changes since that explicit operation but does not claim protection against a compromised local root account.",
'''
if "### Local integrity receipt" not in text:
    if old_doc_line not in text:
        raise SystemExit("documentation projection anchor not found")
    text = text.replace(old_doc_line, new_doc_lines, 1)
path.write_text(text, encoding="utf-8")


# Deterministic release metadata generator. Signatures remain release-time/offline.
write_text(
    ROOT / "internal/python/generate_openclash_guard_release.py",
    r'''
    #!/usr/bin/env python3
    """Generate deterministic OpenClash Guard release metadata for external signing."""
    from __future__ import annotations

    import hashlib
    import json
    from pathlib import Path

    from ai_profiles.distribution import load_distribution
    from ai_profiles.settings import AI_DISTRIBUTION_PATH, ROOT

    ROLE_KEYS = {
        "guard-bundle": "guardBundle",
        "bootstrap-installer": "bootstrapInstaller",
        "runtime-policy": "runtimePolicy",
        "runtime-templates": "runtimeTemplates",
    }


    def artifact_record(path: Path, relative: str) -> dict[str, object]:
        if not path.is_file():
            raise RuntimeError(f"release artifact is missing: {relative}")
        payload = path.read_bytes()
        return {
            "path": relative,
            "sha256": hashlib.sha256(payload).hexdigest(),
            "size": len(payload),
        }


    def main() -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        artifacts: dict[str, dict[str, object]] = {}
        for role, key in ROLE_KEYS.items():
            relative = catalog.artifact(role).path
            artifacts[key] = artifact_record(ROOT / relative, relative)

        revision_payload = json.dumps(
            {"sequence": catalog.release_sequence, "artifacts": artifacts},
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        revision = "sha256:" + hashlib.sha256(revision_payload).hexdigest()
        document = {
            "schemaVersion": 1,
            "repository": catalog.repository,
            "sequence": catalog.release_sequence,
            "revision": revision,
            "artifacts": artifacts,
        }
        output = ROOT / catalog.release_metadata_path
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(document, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(output.relative_to(ROOT).as_posix())


    if __name__ == "__main__":
        main()
    ''',
)


# Run release metadata generation after all covered bytes exist.
path = ROOT / "internal/config/rulesctl.json"
config = json.loads(path.read_text(encoding="utf-8"))
release_step = {"argv": ["{python}", "internal/python/generate_openclash_guard_release.py"]}
for pipeline_name in ("generate", "refresh"):
    pipeline = config["pipelines"][pipeline_name]
    if release_step in pipeline:
        continue
    build_index = next(
        i
        for i, step in enumerate(pipeline)
        if step.get("argv") == ["{python}", "tools/shbundle.py", "build", "--all"]
    )
    pipeline.insert(build_index + 1, release_step)
path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


# Authenticated metadata helpers: HTTPS overrides, anti-rollback, and local receipts.
path = ROOT / "shell/lib/distribution.sh"
text = path.read_text(encoding="utf-8")
if "case $_guard_ds_override in" not in text:
    old = '''    if [ -n "$_guard_ds_override" ]; then
        printf '%s\\n' "${_guard_ds_override%/}"
        return 0
    fi
'''
    new = '''    if [ -n "$_guard_ds_override" ]; then
        case $_guard_ds_override in
            https://*) ;;
            *) return 2 ;;
        esac
        printf '%s\\n' "${_guard_ds_override%/}"
        return 0
    fi
'''
    if old not in text:
        raise SystemExit("distribution override anchor not found")
    text = text.replace(old, new, 1)
old_seq = '''_guard_distribution_valid_sequence() {
    case ${1:-} in
        ''|0|*[!0-9]*) return 1 ;;
        *) printf '%s\\n' "$1" ;;
    esac
}
'''
new_seq = '''_guard_distribution_valid_sequence() {
    case ${1:-} in
        ''|0|*[!0-9]*) return 1 ;;
    esac
    [ "$1" -le 2147483647 ] 2>/dev/null || return 1
    printf '%s\\n' "$1"
}
'''
if "2147483647" not in text:
    if old_seq not in text:
        raise SystemExit("release sequence validator anchor not found")
    text = text.replace(old_seq, new_seq, 1)
state_block = r'''
_GUARD_RELEASE_STATE=unrecorded
_GUARD_RELEASE_STATE_REASON=

_guard_distribution_release_state_path() {
    if [ -n "${GUARD_RELEASE_STATE_FILE:-}" ]; then
        printf '%s\n' "$GUARD_RELEASE_STATE_FILE"
    else
        printf '%s%s\n' "${GUARD_PREFIX:-}" "$_GUARD_DISTRIBUTION_RELEASE_STATE"
    fi
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
    [ -s "$_guard_drs_bundle" ] && [ -s "$_guard_drs_policy" ] && [ -s "$_guard_drs_templates" ] || return 1
    _guard_drs_bundle_sha=$(file_sha256 "$_guard_drs_bundle" 2>/dev/null) || return 1
    _guard_drs_policy_sha=$(file_sha256 "$_guard_drs_policy" 2>/dev/null) || return 1
    _guard_drs_templates_sha=$(file_sha256 "$_guard_drs_templates" 2>/dev/null) || return 1
    _guard_drs_bundle_sha=$(_guard_distribution_valid_sha256 "$_guard_drs_bundle_sha") || return 1
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

'''
if "_guard_distribution_release_state_path()" not in text:
    marker = "guard_distribution_trusted_key_fingerprint() {\n"
    if marker not in text:
        raise SystemExit("trusted key function anchor not found")
    text = text.replace(marker, state_block + marker, 1)
if "_GUARD_RELEASE_STATE=unrecorded\n    _GUARD_RELEASE_STATE_REASON=" not in text:
    text = text.replace(
        "    _guard_distribution_reset_release\n    for _guard_dfr_item in $_guard_dfr_sources\n",
        "    _guard_distribution_reset_release\n    _GUARD_RELEASE_STATE=unrecorded\n    _GUARD_RELEASE_STATE_REASON=\n    for _guard_dfr_item in $_guard_dfr_sources\n",
        1,
    )
old_success = '''            _GUARD_RELEASE_SIGNATURE_STATE=verified
            _GUARD_RELEASE_KEY_FINGERPRINT=$(guard_distribution_trusted_key_fingerprint 2>/dev/null) || _GUARD_RELEASE_KEY_FINGERPRINT=
            if guard_distribution_load_release "$_guard_dfr_metadata"; then
                _GUARD_RELEASE_SOURCE=$_guard_dfr_item
                _GUARD_RELEASE_METADATA_URL=$_guard_dfr_metadata_url
                _GUARD_RELEASE_SIGNATURE_URL=$_guard_dfr_signature_url
                rm -f "$_guard_dfr_metadata" "$_guard_dfr_signature"
                return 0
            fi
'''
new_success = '''            _GUARD_RELEASE_SIGNATURE_STATE=verified
            _GUARD_RELEASE_KEY_FINGERPRINT=$(guard_distribution_trusted_key_fingerprint 2>/dev/null) || _GUARD_RELEASE_KEY_FINGERPRINT=
            if [ -n "$_GUARD_RELEASE_KEY_FINGERPRINT" ] && \
               guard_distribution_load_release "$_guard_dfr_metadata" && \
               guard_distribution_check_release_state; then
                _GUARD_RELEASE_SOURCE=$_guard_dfr_item
                _GUARD_RELEASE_METADATA_URL=$_guard_dfr_metadata_url
                _GUARD_RELEASE_SIGNATURE_URL=$_guard_dfr_signature_url
                rm -f "$_guard_dfr_metadata" "$_guard_dfr_signature"
                return 0
            fi
'''
if "guard_distribution_check_release_state; then" not in text:
    if old_success not in text:
        raise SystemExit("fetch release success anchor not found")
    text = text.replace(old_success, new_success, 1)
path.write_text(text, encoding="utf-8")


# Version check reports anti-rollback state; add network-free local integrity check.
path = ROOT / "shell/apps/openclash-guard/install.sh"
text = path.read_text(encoding="utf-8")
if "_guard_icv_trust_state=" not in text:
    text = text.replace(
        "    _guard_icv_fingerprint=\n    _guard_icv_key=$(_guard_distribution_trusted_key)\n",
        "    _guard_icv_fingerprint=\n    _guard_icv_trust_state=unrecorded\n    _guard_icv_trust_reason=\n    _guard_icv_key=$(_guard_distribution_trusted_key)\n",
        1,
    )
    text = text.replace(
        "    fi\n\n    if [ \"${_GUARD_JSON:-0}\" = 1 ]; then\n",
        "    fi\n    _guard_icv_trust_state=${_GUARD_RELEASE_STATE:-unrecorded}\n    _guard_icv_trust_reason=${_GUARD_RELEASE_STATE_REASON:-}\n\n    if [ \"${_GUARD_JSON:-0}\" = 1 ]; then\n",
        1,
    )
    text = text.replace(
        '\"trustedKey\":\"%s\"},\"autoUpgrade\":false',
        '\"trustedKey\":\"%s\",\"rollbackState\":\"%s\",\"rollbackReason\":\"%s\"},\"autoUpgrade\":false',
        1,
    )
    text = text.replace(
        '            "$(_guard_env_json_string "$_guard_icv_key")"\n',
        '            "$(_guard_env_json_string "$_guard_icv_key")" \\\n            "$(_guard_env_json_string "$_guard_icv_trust_state")" \\\n            "$(_guard_env_json_string "$_guard_icv_trust_reason")"\n',
        1,
    )
    text = text.replace(
        '        cli_kv release.trustedKey "$_guard_icv_key"\n        cli_kv status "$_guard_icv_status"\n',
        '        cli_kv release.trustedKey "$_guard_icv_key"\n        cli_kv release.rollbackState "$_guard_icv_trust_state"\n        [ -z "$_guard_icv_trust_reason" ] || cli_kv release.rollbackReason "$_guard_icv_trust_reason"\n        cli_kv status "$_guard_icv_status"\n',
        1,
    )
integrity_block = r'''
_guard_install_integrity_check() {
    _guard_iic_state=$(_guard_distribution_release_state_path)
    _guard_iic_status=unrecorded
    _guard_iic_bundle=unrecorded
    _guard_iic_policy=unrecorded
    _guard_iic_templates=unrecorded
    _guard_iic_sequence=
    _guard_iic_revision=
    _guard_iic_bundle_actual=
    _guard_iic_policy_actual=
    _guard_iic_templates_actual=
    if [ -f "$_guard_iic_state" ]; then
        _guard_iic_sequence=$(_guard_distribution_state_get "$_guard_iic_state" highestSequence 2>/dev/null) || _guard_iic_sequence=
        _guard_iic_revision=$(_guard_distribution_state_get "$_guard_iic_state" highestRevision 2>/dev/null) || _guard_iic_revision=
        _guard_iic_bundle_expected=$(_guard_distribution_state_get "$_guard_iic_state" installedBundleSha256 2>/dev/null) || _guard_iic_bundle_expected=
        _guard_iic_policy_expected=$(_guard_distribution_state_get "$_guard_iic_state" installedPolicySha256 2>/dev/null) || _guard_iic_policy_expected=
        _guard_iic_templates_expected=$(_guard_distribution_state_get "$_guard_iic_state" installedTemplatesSha256 2>/dev/null) || _guard_iic_templates_expected=
        _guard_iic_bundle_expected=$(_guard_distribution_valid_sha256 "$_guard_iic_bundle_expected" 2>/dev/null) || _guard_iic_bundle_expected=
        _guard_iic_policy_expected=$(_guard_distribution_valid_sha256 "$_guard_iic_policy_expected" 2>/dev/null) || _guard_iic_policy_expected=
        _guard_iic_templates_expected=$(_guard_distribution_valid_sha256 "$_guard_iic_templates_expected" 2>/dev/null) || _guard_iic_templates_expected=
        if [ -n "$_guard_iic_bundle_expected" ] && [ -n "$_guard_iic_policy_expected" ] && [ -n "$_guard_iic_templates_expected" ]; then
            _guard_iic_bundle_path=$(_guard_install_bin)
            _guard_iic_policy_path=$(_guard_policy_default_path)
            _guard_iic_templates_path=$(_guard_template_catalog_path)
            if [ -s "$_guard_iic_bundle_path" ]; then
                _guard_iic_bundle_actual=$(file_sha256 "$_guard_iic_bundle_path" 2>/dev/null) || _guard_iic_bundle_actual=
                [ "$_guard_iic_bundle_actual" = "$_guard_iic_bundle_expected" ] && _guard_iic_bundle=verified || _guard_iic_bundle=modified
            else
                _guard_iic_bundle=missing
            fi
            if [ -s "$_guard_iic_policy_path" ]; then
                _guard_iic_policy_actual=$(file_sha256 "$_guard_iic_policy_path" 2>/dev/null) || _guard_iic_policy_actual=
                [ "$_guard_iic_policy_actual" = "$_guard_iic_policy_expected" ] && _guard_iic_policy=verified || _guard_iic_policy=modified
            else
                _guard_iic_policy=missing
            fi
            if [ -s "$_guard_iic_templates_path" ]; then
                _guard_iic_templates_actual=$(file_sha256 "$_guard_iic_templates_path" 2>/dev/null) || _guard_iic_templates_actual=
                [ "$_guard_iic_templates_actual" = "$_guard_iic_templates_expected" ] && _guard_iic_templates=verified || _guard_iic_templates=modified
            else
                _guard_iic_templates=missing
            fi
            if [ "$_guard_iic_bundle" = verified ] && [ "$_guard_iic_policy" = verified ] && [ "$_guard_iic_templates" = verified ]; then
                _guard_iic_status=verified
            else
                _guard_iic_status=modified
            fi
        fi
    fi
    if [ "${_GUARD_JSON:-0}" = 1 ]; then
        printf '{"status":"%s","networkAccess":false,"receipt":{"path":"%s","sequence":"%s","revision":"%s"},"artifacts":{"bundle":{"state":"%s","sha256":"%s"},"policy":{"state":"%s","sha256":"%s"},"templates":{"state":"%s","sha256":"%s"}}}\n' \
            "$(_guard_env_json_string "$_guard_iic_status")" \
            "$(_guard_env_json_string "$_guard_iic_state")" \
            "$(_guard_env_json_string "$_guard_iic_sequence")" \
            "$(_guard_env_json_string "$_guard_iic_revision")" \
            "$(_guard_env_json_string "$_guard_iic_bundle")" \
            "$(_guard_env_json_string "$_guard_iic_bundle_actual")" \
            "$(_guard_env_json_string "$_guard_iic_policy")" \
            "$(_guard_env_json_string "$_guard_iic_policy_actual")" \
            "$(_guard_env_json_string "$_guard_iic_templates")" \
            "$(_guard_env_json_string "$_guard_iic_templates_actual")"
    else
        cli_section "OpenClash Guard local integrity check"
        cli_kv status "$_guard_iic_status"
        cli_kv networkAccess false
        cli_kv receipt.path "$_guard_iic_state"
        [ -z "$_guard_iic_sequence" ] || cli_kv receipt.sequence "$_guard_iic_sequence"
        [ -z "$_guard_iic_revision" ] || cli_kv receipt.revision "$_guard_iic_revision"
        cli_kv bundle "$_guard_iic_bundle"
        cli_kv policy "$_guard_iic_policy"
        cli_kv templates "$_guard_iic_templates"
    fi
    [ "$_guard_iic_status" = verified ]
}

'''
if "_guard_install_integrity_check()" not in text:
    marker = "_guard_install_write() {\n"
    if marker not in text:
        raise SystemExit("install write anchor not found")
    text = text.replace(marker, integrity_block + marker, 1)
validation_anchor = '''    if ! guard_install_validate; then
        cli_error "Setup validation failed: $_GUARD_SETUP_INVALID_REASON"
        return 1
    fi
    _guard_in_overlay=$(_guard_overlay_hook_path)
'''
validation_new = '''    if ! guard_install_validate; then
        cli_error "Setup validation failed: $_GUARD_SETUP_INVALID_REASON"
        return 1
    fi
    if [ "${_GUARD_RELEASE_SIGNATURE_STATE:-}" = verified ]; then
        if ! guard_distribution_record_release_state \
            "$(_guard_install_bin)" "$(_guard_policy_default_path)" "$(_guard_template_catalog_path)"; then
            cli_error "setup is valid, but authenticated release receipt could not be recorded"
            return 1
        fi
    else
        cli_warn "authenticated release receipt not updated; setup used local/offline inputs"
    fi
    _guard_in_overlay=$(_guard_overlay_hook_path)
'''
if "authenticated release receipt could not be recorded" not in text:
    if validation_anchor not in text:
        raise SystemExit("install validation anchor not found")
    text = text.replace(validation_anchor, validation_new, 1)
path.write_text(text, encoding="utf-8")


# Main CLI: make version/integrity checks read-only and enforce signed refresh metadata.
path = ROOT / "shell/apps/openclash-guard/main.sh"
text = path.read_text(encoding="utf-8")
if "integrity-check" not in text:
    text = text.replace("health-check|version-check|refresh", "health-check|version-check|integrity-check|refresh", 1)
    text = text.replace(
        "        status|doctor|health-check|eval|geo)\n",
        "        status|doctor|health-check|version-check|integrity-check|eval|geo)\n",
        1,
    )
    text = text.replace(
        "        version-check) _guard_install_check_version || _guard_dispatch_rc=$? ;;\n",
        "        version-check) _guard_install_check_version || _guard_dispatch_rc=$? ;;\n        integrity-check) _guard_install_integrity_check || _guard_dispatch_rc=$? ;;\n",
        1,
    )
    text = text.replace(
        "apply|reconcile|status|doctor|health-check|version-check|refresh|remove|eval|template|install|uninstall|geo|rules)",
        "apply|reconcile|status|doctor|health-check|version-check|integrity-check|refresh|remove|eval|template|install|uninstall|geo|rules)",
        1,
    )
refresh_start = '    if [ -n "$_guard_refresh_url" ] || [ -n "$_guard_refresh_templates_url" ]; then\n'
if refresh_start in text:
    start = text.index(refresh_start)
    end = text.index("    _guard_dest=$(_guard_policy_default_path)\n", start)
    text = text[:start] + '''    if [ -n "$_guard_refresh_url" ] || [ -n "$_guard_refresh_templates_url" ]; then
        cli_error "unauthenticated --policy-url/--templates-url overrides are disabled; use signed --base-url metadata instead"
        return 2
    fi
    if ! guard_preflight_stage_distribution "$_guard_refresh_source" "$_guard_refresh_base"; then
        cli_error "refresh failed; keeping the installed runtime pair: $_GUARD_PREFLIGHT_SOURCE_REASON"
        return 1
    fi
''' + text[end:]
refresh_anchor = '''    if ! guard_policy_validate_file "$_guard_dest" || ! guard_template_validate_file "$_guard_templates_dest"; then
        cli_error "published runtime pair failed post-write validation"
        return 1
    fi
    _guard_distribution_record "$_GUARD_PREFLIGHT_SOURCE" "$_GUARD_PREFLIGHT_POLICY_URL" "$_GUARD_PREFLIGHT_TEMPLATES_URL" || return $?
'''
refresh_new = '''    if ! guard_policy_validate_file "$_guard_dest" || ! guard_template_validate_file "$_guard_templates_dest"; then
        cli_error "published runtime pair failed post-write validation"
        return 1
    fi
    if [ "${_GUARD_RELEASE_SIGNATURE_STATE:-}" = verified ]; then
        if ! guard_distribution_record_release_state \
            "$(_guard_install_bin)" "$_guard_dest" "$_guard_templates_dest"; then
            cli_error "runtime pair was published, but authenticated release receipt could not be recorded"
            return 1
        fi
    fi
    _guard_distribution_record "$_GUARD_PREFLIGHT_SOURCE" "$_GUARD_PREFLIGHT_POLICY_URL" "$_GUARD_PREFLIGHT_TEMPLATES_URL" || return $?
'''
if "runtime pair was published, but authenticated release receipt" not in text:
    if refresh_anchor not in text:
        raise SystemExit("refresh validation anchor not found")
    text = text.replace(refresh_anchor, refresh_new, 1)
path.write_text(text, encoding="utf-8")


# Public bootstrap helper rejects rollback/equivocation before replacement.
path = ROOT / "setup/openclash/install.sh"
text = path.read_text(encoding="utf-8")
rollback_helper = r'''
check_release_state() {
  metadata=$1
  state=${OPENCLASH_GUARD_RELEASE_STATE:-$SOURCE_GUARD_RELEASE_STATE}
  [ -f "$state" ] || return 0
  remote_sequence=$(jsonfilter -i "$metadata" -e '@.sequence' 2>/dev/null || true)
  remote_revision=$(jsonfilter -i "$metadata" -e '@.revision' 2>/dev/null || true)
  stored_sequence=$(sed -n 's/^highestSequence=//p' "$state" | head -n 1)
  stored_revision=$(sed -n 's/^highestRevision=//p' "$state" | head -n 1)
  case "$remote_sequence:$stored_sequence" in
    *[!0-9:]*|:*|*:) echo "invalid local or remote release sequence" >&2; return 1 ;;
  esac
  if [ "$remote_sequence" -lt "$stored_sequence" ]; then
    echo "refusing signed release rollback: $remote_sequence < $stored_sequence" >&2
    return 1
  fi
  if [ "$remote_sequence" -eq "$stored_sequence" ] && [ "$remote_revision" != "$stored_revision" ]; then
    echo "refusing signed release equivocation at sequence $remote_sequence" >&2
    return 1
  fi
}

'''
if "check_release_state()" not in text:
    marker = 'URL="$(source_url "${SOURCES%% *}")"\n'
    if marker not in text:
        raise SystemExit("bootstrap URL anchor not found")
    text = text.replace(marker, rollback_helper + marker, 1)
if '! check_release_state "$TMP.release"' not in text:
    old = '''    if ! fetch_url "$base/$SOURCE_GUARD_RELEASE" "$TMP.release" || \
       ! fetch_url "$base/$SOURCE_GUARD_RELEASE_SIG" "$TMP.release.sig" || \
       ! verify_release "$TMP.release" "$TMP.release.sig"; then
'''
    new = '''    if ! fetch_url "$base/$SOURCE_GUARD_RELEASE" "$TMP.release" || \
       ! fetch_url "$base/$SOURCE_GUARD_RELEASE_SIG" "$TMP.release.sig" || \
       ! verify_release "$TMP.release" "$TMP.release.sig" || \
       ! check_release_state "$TMP.release"; then
'''
    if old not in text:
        raise SystemExit("bootstrap release verification anchor not found")
    text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")


# Regression coverage for anti-rollback, deterministic metadata, and local integrity.
write_text(
    ROOT / "tests/test_openclash_guard_release_state.py",
    r'''
    from __future__ import annotations

    import hashlib
    import json
    import subprocess
    import tempfile
    import unittest
    from pathlib import Path

    from ai_profiles.distribution import load_distribution
    from ai_profiles.settings import AI_DISTRIBUTION_PATH

    ROOT = Path(__file__).resolve().parents[1]
    DISTRIBUTION = ROOT / "shell" / "lib" / "distribution.sh"
    INSTALL = ROOT / "shell" / "apps" / "openclash-guard" / "install.sh"


    class OpenClashGuardReleaseStateTests(unittest.TestCase):
        def run_shell(self, body: str) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                ["/bin/sh", "-c", body],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )

        def test_release_metadata_matches_current_generated_bytes(self) -> None:
            catalog = load_distribution(AI_DISTRIBUTION_PATH)
            release = json.loads((ROOT / catalog.release_metadata_path).read_text(encoding="utf-8"))
            self.assertEqual(release["schemaVersion"], 1)
            self.assertEqual(release["repository"], catalog.repository)
            self.assertEqual(release["sequence"], catalog.release_sequence)
            self.assertRegex(release["revision"], r"^sha256:[0-9a-f]{64}$")
            mapping = {
                "guardBundle": "guard-bundle",
                "bootstrapInstaller": "bootstrap-installer",
                "runtimePolicy": "runtime-policy",
                "runtimeTemplates": "runtime-templates",
            }
            for key, role in mapping.items():
                relative = catalog.artifact(role).path
                payload = (ROOT / relative).read_bytes()
                self.assertEqual(release["artifacts"][key]["path"], relative)
                self.assertEqual(
                    release["artifacts"][key]["sha256"],
                    hashlib.sha256(payload).hexdigest(),
                )
                self.assertEqual(release["artifacts"][key]["size"], len(payload))

        def _state(self, path: Path, sequence: int = 8, revision: str = "sha256:old") -> None:
            path.write_text(
                "schemaVersion=1\n"
                f"highestSequence={sequence}\n"
                f"highestRevision={revision}\n"
                "signerFingerprint=key\n"
                f"remoteBundleSha256={'a' * 64}\n"
                f"remoteBootstrapSha256={'b' * 64}\n"
                f"remotePolicySha256={'c' * 64}\n"
                f"remoteTemplatesSha256={'d' * 64}\n",
                encoding="utf-8",
            )

        def _check_state(self, state: Path, sequence: int, revision: str) -> subprocess.CompletedProcess[str]:
            script = f'''\
set -eu
. "{DISTRIBUTION}"
GUARD_RELEASE_STATE_FILE="{state}"
_GUARD_RELEASE_SEQUENCE={sequence}
_GUARD_RELEASE_REVISION={revision}
_GUARD_RELEASE_KEY_FINGERPRINT=key
_GUARD_RELEASE_BUNDLE_SHA256={'a' * 64}
_GUARD_RELEASE_BOOTSTRAP_SHA256={'b' * 64}
_GUARD_RELEASE_POLICY_SHA256={'c' * 64}
_GUARD_RELEASE_TEMPLATES_SHA256={'d' * 64}
rc=0
guard_distribution_check_release_state || rc=$?
printf 'rc=%s state=%s reason=%s\n' "$rc" "$_GUARD_RELEASE_STATE" "$_GUARD_RELEASE_STATE_REASON"
'''
            return self.run_shell(script)

        def test_lower_signed_sequence_is_rejected(self) -> None:
            with tempfile.TemporaryDirectory() as tmp:
                state = Path(tmp) / "release-state"
                self._state(state)
                result = self._check_state(state, 7, "sha256:new")
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                self.assertIn("rc=1", result.stdout)
                self.assertIn("state=rollback-rejected", result.stdout)

        def test_same_sequence_different_revision_is_rejected(self) -> None:
            with tempfile.TemporaryDirectory() as tmp:
                state = Path(tmp) / "release-state"
                self._state(state)
                result = self._check_state(state, 8, "sha256:new")
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                self.assertIn("rc=1", result.stdout)
                self.assertIn("state=equivocation-rejected", result.stdout)

        def test_integrity_check_is_network_free_and_detects_local_change(self) -> None:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                etc = root / "etc/openclash-guard"
                binary = root / "usr/bin/openclash-guard"
                policy = etc / "openclash-guard.json"
                templates = etc / "openclash-guard-templates.json"
                for file, payload in (
                    (binary, b"bundle\n"),
                    (policy, b"policy\n"),
                    (templates, b"templates\n"),
                ):
                    file.parent.mkdir(parents=True, exist_ok=True)
                    file.write_bytes(payload)
                digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
                state = etc / "release-state"
                state.write_text(
                    "schemaVersion=1\n"
                    "highestSequence=9\n"
                    "highestRevision=sha256:receipt\n"
                    f"installedBundleSha256={digest(binary)}\n"
                    f"installedPolicySha256={digest(policy)}\n"
                    f"installedTemplatesSha256={digest(templates)}\n",
                    encoding="utf-8",
                )
                script = f'''\
set -eu
file_sha256() {{ sha256sum "$1" | awk '{{print $1}}'; }}
cli_section() {{ :; }}
cli_kv() {{ printf '%s=%s\n' "$1" "$2"; }}
cli_warn() {{ :; }}
. "{DISTRIBUTION}"
. "{INSTALL}"
GUARD_PREFIX="{root}"
_GUARD_JSON=0
_guard_policy_default_path() {{ printf '%s\n' "{policy}"; }}
_guard_template_catalog_path() {{ printf '%s\n' "{templates}"; }}
fetch_http() {{ echo NETWORK-CALLED >&2; return 99; }}
guard_distribution_fetch_release() {{ echo NETWORK-CALLED >&2; return 99; }}
_guard_install_integrity_check
'''
                first = self.run_shell(script)
                self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
                self.assertIn("status=verified", first.stdout)
                self.assertNotIn("NETWORK-CALLED", first.stderr)
                binary.write_text("tampered\n", encoding="utf-8")
                second = self.run_shell(script)
                self.assertEqual(second.returncode, 1, second.stderr + second.stdout)
                self.assertIn("status=modified", second.stdout)
                self.assertIn("bundle=modified", second.stdout)
                self.assertNotIn("NETWORK-CALLED", second.stderr)


    if __name__ == "__main__":
        unittest.main()
    ''',
)


# Extend catalog regressions for release metadata management.
path = ROOT / "tests/test_distribution_manifest.py"
text = path.read_text(encoding="utf-8")
if "self.assertIn(catalog.release_metadata_path, paths)" not in text:
    text = text.replace(
        "        self.assertIn(load_distribution(AI_DISTRIBUTION_PATH).manifest_path, paths)\n",
        "        catalog = load_distribution(AI_DISTRIBUTION_PATH)\n        self.assertIn(catalog.manifest_path, paths)\n        self.assertIn(catalog.release_metadata_path, paths)\n        self.assertGreaterEqual(catalog.release_sequence, 1)\n",
        1,
    )
if "self.assertIn(catalog.release_metadata_path, specs)" not in text:
    text = text.replace(
        "        self.assertIn(load_distribution(AI_DISTRIBUTION_PATH).manifest_path, specs)\n",
        "        catalog = load_distribution(AI_DISTRIBUTION_PATH)\n        self.assertIn(catalog.manifest_path, specs)\n        self.assertIn(catalog.release_metadata_path, specs)\n",
        1,
    )
path.write_text(text, encoding="utf-8")

print("patched signed release v2 sources")
