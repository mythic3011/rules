from __future__ import annotations

import json
from pathlib import Path


def main() -> None:
    # Extend typed catalog with release trust metadata.
    path = Path("internal/python/ai_profiles/distribution.py")
    text = path.read_text()
    old = "    manifest_path: str\n    artifacts: tuple[DistributionArtifact, ...]"
    new = "    manifest_path: str\n    release_metadata_path: str\n    release_signature_path: str\n    trusted_key_path: str\n    artifacts: tuple[DistributionArtifact, ...]"
    if old in text:
        text = text.replace(old, new, 1)
    old = '    if set(value) != {"schemaVersion", "repository", "defaultRef", "bootstrapAlias", "manifestPath", "artifacts", "channels"}:'
    new = '    if set(value) != {"schemaVersion", "repository", "defaultRef", "bootstrapAlias", "manifestPath", "releaseMetadataPath", "releaseSignaturePath", "trustedKeyPath", "artifacts", "channels"}:'
    if old in text:
        text = text.replace(old, new, 1)
    old = '        manifest_path=_string(value.get("manifestPath"), "manifestPath"),\n        artifacts=tuple(artifacts),'
    new = '        manifest_path=_string(value.get("manifestPath"), "manifestPath"),\n        release_metadata_path=_string(value.get("releaseMetadataPath"), "releaseMetadataPath"),\n        release_signature_path=_string(value.get("releaseSignaturePath"), "releaseSignaturePath"),\n        trusted_key_path=_string(value.get("trustedKeyPath"), "trustedKeyPath"),\n        artifacts=tuple(artifacts),'
    if old in text:
        text = text.replace(old, new, 1)
    path.write_text(text)

    # Make dependencies explicit.
    path = Path("shell/manifest.json")
    manifest = json.loads(path.read_text())
    manifest["modules"]["distribution"]["depends"] = ["file", "fetch", "json"]
    path.write_text(json.dumps(manifest, indent=2) + "\n")

    # Replace unsigned version checker with authenticated metadata-only checker.
    path = Path("shell/apps/openclash-guard/install.sh")
    text = path.read_text()
    start = text.index("_guard_install_published_sha() {") if "_guard_install_published_sha() {" in text else text.index("_guard_install_check_version() {")
    end = text.index("_guard_install_write() {", start)
    checker = r'''_guard_install_check_version() {
    _guard_icv_installed=$(_guard_install_bin)
    _guard_icv_installed_sha=
    _guard_icv_published_sha=
    _guard_icv_status=untrusted
    _guard_icv_signature=untrusted
    _guard_icv_sequence=
    _guard_icv_revision=
    _guard_icv_source=
    _guard_icv_fingerprint=
    _guard_icv_key=$(_guard_distribution_trusted_key)

    if [ -f "$_guard_icv_installed" ]; then
        _guard_icv_installed_sha=$(file_sha256 "$_guard_icv_installed" 2>/dev/null) || _guard_icv_installed_sha=
    fi
    if guard_distribution_fetch_release auto >/dev/null 2>&1; then
        _guard_icv_signature=$_GUARD_RELEASE_SIGNATURE_STATE
        _guard_icv_published_sha=$_GUARD_RELEASE_BUNDLE_SHA256
        _guard_icv_sequence=$_GUARD_RELEASE_SEQUENCE
        _guard_icv_revision=$_GUARD_RELEASE_REVISION
        _guard_icv_source=$_GUARD_RELEASE_SOURCE
        _guard_icv_fingerprint=$_GUARD_RELEASE_KEY_FINGERPRINT
        if [ -z "$_guard_icv_installed_sha" ]; then
            _guard_icv_status=not-installed
        elif [ "$_guard_icv_installed_sha" = "$_guard_icv_published_sha" ]; then
            _guard_icv_status=current
        else
            _guard_icv_status=different
        fi
    fi

    if [ "${_GUARD_JSON:-0}" = 1 ]; then
        printf '{"status":"%s","installedSha256":"%s","publishedSha256":"%s","release":{"signature":"%s","sequence":"%s","revision":"%s","source":"%s","keyFingerprint":"%s","trustedKey":"%s"},"autoUpgrade":false,"autoInstall":false}\n' \
            "$(_guard_env_json_string "$_guard_icv_status")" \
            "$(_guard_env_json_string "$_guard_icv_installed_sha")" \
            "$(_guard_env_json_string "$_guard_icv_published_sha")" \
            "$(_guard_env_json_string "$_guard_icv_signature")" \
            "$(_guard_env_json_string "$_guard_icv_sequence")" \
            "$(_guard_env_json_string "$_guard_icv_revision")" \
            "$(_guard_env_json_string "$_guard_icv_source")" \
            "$(_guard_env_json_string "$_guard_icv_fingerprint")" \
            "$(_guard_env_json_string "$_guard_icv_key")"
    else
        cli_section "OpenClash Guard version check"
        cli_kv installed.sha256 "${_guard_icv_installed_sha:-not-installed}"
        cli_kv published.sha256 "${_guard_icv_published_sha:-untrusted}"
        cli_kv release.signature "$_guard_icv_signature"
        [ -z "$_guard_icv_sequence" ] || cli_kv release.sequence "$_guard_icv_sequence"
        [ -z "$_guard_icv_revision" ] || cli_kv release.revision "$_guard_icv_revision"
        [ -z "$_guard_icv_source" ] || cli_kv release.source "$_guard_icv_source"
        [ -z "$_guard_icv_fingerprint" ] || cli_kv release.keyFingerprint "$_guard_icv_fingerprint"
        cli_kv release.trustedKey "$_guard_icv_key"
        cli_kv status "$_guard_icv_status"
        cli_warn "$_GUARD_INSTALL_VERSION_WARNING"
    fi
    [ "$_guard_icv_status" != untrusted ]
}

'''
    path.write_text(text[:start] + checker + text[end:])

    # Authenticate release metadata before accepting policy/template bytes.
    path = Path("shell/apps/openclash-guard/preflight.sh")
    text = path.read_text()
    start = text.index("guard_preflight_stage_distribution() {")
    end = text.index("_guard_preflight_installed_policy() {", start)
    staged = r'''guard_preflight_stage_distribution() {
    _guard_ps_source=${1:-auto}
    _guard_ps_base=${2:-}
    _guard_ps_sources=$(_guard_preflight_source_list "$_guard_ps_source") || {
        _GUARD_PREFLIGHT_SOURCE_REASON="unsupported distribution source: $_guard_ps_source"
        return 2
    }
    if [ "${_GUARD_PREFLIGHT_POLICY_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_POLICY_FILE:-}"
    fi
    if [ "${_GUARD_PREFLIGHT_TEMPLATES_TEMP:-0}" = 1 ]; then
        _guard_preflight_remove_file "${_GUARD_PREFLIGHT_TEMPLATES_FILE:-}"
    fi
    _GUARD_PREFLIGHT_POLICY_FILE=
    _GUARD_PREFLIGHT_TEMPLATES_FILE=
    _GUARD_PREFLIGHT_SOURCE=
    _GUARD_PREFLIGHT_POLICY_URL=
    _GUARD_PREFLIGHT_TEMPLATES_URL=
    _GUARD_PREFLIGHT_SOURCE_REASON=
    _GUARD_PREFLIGHT_POLICY_TEMP=0
    _GUARD_PREFLIGHT_TEMPLATES_TEMP=0
    for _guard_ps_item in $_guard_ps_sources
    do
        _guard_ps_policy=$(file_mktemp) || return 1
        _guard_ps_templates=$(file_mktemp) || {
            rm -f "$_guard_ps_policy"
            return 1
        }
        if ! guard_distribution_fetch_release "$_guard_ps_item" "$_guard_ps_base"; then
            rm -f "$_guard_ps_policy" "$_guard_ps_templates"
            continue
        fi
        _guard_ps_policy_url=$(_guard_distribution_policy_url "$_guard_ps_item" "$_guard_ps_base") || {
            rm -f "$_guard_ps_policy" "$_guard_ps_templates"
            continue
        }
        _guard_ps_templates_url=$(_guard_distribution_templates_url "$_guard_ps_item" "$_guard_ps_base") || {
            rm -f "$_guard_ps_policy" "$_guard_ps_templates"
            continue
        }
        _guard_ps_ok=1
        fetch_http "$_guard_ps_policy_url" "$_guard_ps_policy" "" 1 2097152 || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && guard_distribution_verify_hash "$_guard_ps_policy" "$_GUARD_RELEASE_POLICY_SHA256" || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && guard_policy_validate_file "$_guard_ps_policy" || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && fetch_http "$_guard_ps_templates_url" "$_guard_ps_templates" "" 1 4194304 || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && guard_distribution_verify_hash "$_guard_ps_templates" "$_GUARD_RELEASE_TEMPLATES_SHA256" || _guard_ps_ok=0
        [ "$_guard_ps_ok" = 1 ] && guard_template_validate_file "$_guard_ps_templates" || _guard_ps_ok=0
        if [ "$_guard_ps_ok" = 1 ]; then
            _GUARD_PREFLIGHT_POLICY_FILE=$_guard_ps_policy
            _GUARD_PREFLIGHT_TEMPLATES_FILE=$_guard_ps_templates
            _GUARD_PREFLIGHT_SOURCE=$_guard_ps_item
            _GUARD_PREFLIGHT_POLICY_URL=$_guard_ps_policy_url
            _GUARD_PREFLIGHT_TEMPLATES_URL=$_guard_ps_templates_url
            _GUARD_PREFLIGHT_POLICY_TEMP=1
            _GUARD_PREFLIGHT_TEMPLATES_TEMP=1
            return 0
        fi
        rm -f "$_guard_ps_policy" "$_guard_ps_templates"
    done
    _GUARD_PREFLIGHT_SOURCE_REASON="no distribution source supplied authenticated policy and template bytes"
    return 1
}

'''
    path.write_text(text[:start] + staged + text[end:])

    # Top-level version-check and no unsigned raw URL refresh override.
    path = Path("shell/apps/openclash-guard/main.sh")
    text = path.read_text()
    text = text.replace(
        "usage: openclash-guard apply|reconcile|status|doctor [SERVICE]|health-check|refresh|remove|eval|template|install|uninstall|geo|rules",
        "usage: openclash-guard apply|reconcile|status|doctor [SERVICE]|health-check|version-check|refresh|remove|eval|template|install|uninstall|geo|rules",
        1,
    )
    text = text.replace("status|doctor|health-check|eval|geo)", "status|doctor|health-check|version-check|eval|geo)", 1)
    text = text.replace(
        '        health-check) guard_health_check_run "$@" || _guard_dispatch_rc=$? ;;\n        refresh)',
        '        health-check) guard_health_check_run "$@" || _guard_dispatch_rc=$? ;;\n        version-check) _guard_install_check_version || _guard_dispatch_rc=$? ;;\n        refresh)',
        1,
    )
    text = text.replace(
        "apply|reconcile|status|doctor|health-check|refresh|remove|eval|template|install|uninstall|geo|rules)",
        "apply|reconcile|status|doctor|health-check|version-check|refresh|remove|eval|template|install|uninstall|geo|rules)",
        1,
    )
    old_start = text.index('    if [ -n "$_guard_refresh_url" ] || [ -n "$_guard_refresh_templates_url" ]; then')
    old_end = text.index('    elif ! guard_preflight_stage_distribution "$_guard_refresh_source" "$_guard_refresh_base"; then', old_start)
    replacement = '''    if [ -n "$_guard_refresh_url" ] || [ -n "$_guard_refresh_templates_url" ]; then
        cli_error "raw --policy-url/--templates-url overrides are blocked because they bypass signed release metadata; use --base-url with a mirror that serves the signed release metadata and signature"
        return 2
'''
    text = text[:old_start] + replacement + text[old_end:]
    path.write_text(text)

    # Update generated-distribution tests for signed metadata/no pipe-to-shell.
    path = Path("tests/test_distribution_manifest.py")
    text = path.read_text()
    old = '        self.assertIn(f"curl -fsSL {catalog.bootstrap_alias} | sh", readme)\n        for source in catalog.channels:\n'
    new = '        self.assertNotIn("| sh", readme)\n        self.assertNotIn("| sh", guide)\n        self.assertIn(catalog.release_metadata_path, readme)\n        self.assertIn(catalog.release_signature_path, readme)\n        self.assertIn(catalog.trusted_key_path, readme)\n        for source in catalog.channels:\n'
    if old not in text:
        raise RuntimeError("distribution readme assertion anchor not found")
    text = text.replace(old, new, 1)
    text = text.replace(
        'for role in ("guard-bundle", "guard-manifest", "guard-checksum", "runtime-policy"):',
        'for role in ("guard-bundle", "guard-manifest", "guard-checksum", "bootstrap-installer", "runtime-policy", "runtime-templates"):',
        1,
    )
    path.write_text(text)


if __name__ == "__main__":
    main()
