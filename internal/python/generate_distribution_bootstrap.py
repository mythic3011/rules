#!/usr/bin/env python3
"""Embed canonical distribution sources and authenticated install guidance."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "internal" / "config" / "ai-routing" / "catalogs" / "distribution.json"
INSTALLER = ROOT / "setup" / "openclash" / "install.sh"
SHELL_CATALOG = ROOT / "shell" / "lib" / "distribution.sh"
SHELL_MANIFEST = ROOT / "shell" / "manifest.json"
BEGIN = "# BEGIN GENERATED DISTRIBUTION SOURCES"
END = "# END GENERATED DISTRIBUTION SOURCES"
SHELL_BEGIN = "# BEGIN GENERATED DISTRIBUTION CATALOG"
SHELL_END = "# END GENERATED DISTRIBUTION CATALOG"
README = ROOT / "README.md"
README_BEGIN = "<!-- BEGIN GENERATED OPENCLASH GUARD QUICK START -->"
README_END = "<!-- END GENERATED OPENCLASH GUARD QUICK START -->"
GUARD_DOC = ROOT / "docs" / "openclash-guard.md"
DOC_BEGIN = "<!-- BEGIN GENERATED OPENCLASH GUARD INSTALL -->"
DOC_END = "<!-- END GENERATED OPENCLASH GUARD INSTALL -->"


def replace_block(path: Path, begin: str, end: str, lines: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    start = text.index(begin)
    finish = text.index(end, start) + len(end)
    path.write_text(text[:start] + "\n".join(lines) + text[finish:], encoding="utf-8")


def main() -> None:
    document = json.loads(CATALOG.read_text(encoding="utf-8"))
    sources = {item["id"]: item for item in document["channels"]}
    shell_manifest = json.loads(SHELL_MANIFEST.read_text(encoding="utf-8"))
    guard_app = shell_manifest["apps"]["openclash-guard"]
    artifact = guard_app["output"]
    artifact_manifest = guard_app["manifest"]
    artifact_checksum = guard_app["checksum"]
    artifacts = {item["role"]: item["path"] for item in document["artifacts"]}
    bootstrap_installer = artifacts["bootstrap-installer"]
    runtime_policy = artifacts["runtime-policy"]
    runtime_templates = artifacts["runtime-templates"]
    release_metadata = document["releaseMetadataPath"]
    release_signature = document["releaseSignaturePath"]
    trusted_key = document["trustedKeyPath"]
    release_state = document["releaseStatePath"]

    lines = [BEGIN]
    for source_id, variable in (("cdn", "SOURCE_CDN_BASE"), ("raw", "SOURCE_GITHUB_RAW_BASE")):
        source = sources[source_id]
        base = source["baseUrl"].format(
            repository=document["repository"], version=document["defaultRef"]
        )
        lines.append(f'{variable}="{base}"')
    lines.extend([
        f'SOURCE_GUARD_PATH="{artifact}"',
        f'SOURCE_GUARD_MANIFEST="{artifact_manifest}"',
        f'SOURCE_GUARD_CHECKSUM="{artifact_checksum}"',
        f'SOURCE_GUARD_RELEASE="{release_metadata}"',
        f'SOURCE_GUARD_RELEASE_SIG="{release_signature}"',
        f'SOURCE_GUARD_TRUSTED_KEY="{trusted_key}"',
        f'SOURCE_GUARD_RELEASE_STATE="{release_state}"',
    ])
    lines.append(END)
    replace_block(INSTALLER, BEGIN, END, lines)

    shell_lines = [SHELL_BEGIN]
    for source_id, variable in (("raw", "_GUARD_DISTRIBUTION_RAW_BASE"), ("cdn", "_GUARD_DISTRIBUTION_CDN_BASE")):
        source = sources[source_id]
        base = source["baseUrl"].format(repository=document["repository"], version=document["defaultRef"])
        shell_lines.append(f'{variable}="{base}"')
    shell_lines.extend(
        (
            f'_GUARD_DISTRIBUTION_ARTIFACT="{artifact}"',
            f'_GUARD_DISTRIBUTION_MANIFEST="{artifact_manifest}"',
            f'_GUARD_DISTRIBUTION_CHECKSUM="{artifact_checksum}"',
            f'_GUARD_DISTRIBUTION_BOOTSTRAP="{bootstrap_installer}"',
            f'_GUARD_DISTRIBUTION_POLICY="{runtime_policy}"',
            f'_GUARD_DISTRIBUTION_TEMPLATES="{runtime_templates}"',
            f'_GUARD_DISTRIBUTION_RELEASE="{release_metadata}"',
            f'_GUARD_DISTRIBUTION_RELEASE_SIG="{release_signature}"',
            f'_GUARD_DISTRIBUTION_TRUSTED_KEY="{trusted_key}"',
            f'_GUARD_DISTRIBUTION_RELEASE_STATE="{release_state}"',
        )
    )
    shell_lines.append(SHELL_END)
    replace_block(SHELL_CATALOG, SHELL_BEGIN, SHELL_END, shell_lines)

    raw_url = sources["raw"]["baseUrl"].format(
        repository=document["repository"], version=document["defaultRef"]
    )
    cdn_url = sources["cdn"]["baseUrl"].format(
        repository=document["repository"], version=document["defaultRef"]
    )

    quick = [
        README_BEGIN,
        "OpenClash Guard deliberately does **not** support remote pipe-to-shell installation or automatic upgrades. Provision the trusted release public key out-of-band first, then authenticate signed release metadata before executing any downloaded bytes.",
        "",
        "```sh",
        "work=/tmp/openclash-guard-install",
        "rm -rf \"$work\" && mkdir -p \"$work\" && cd \"$work\"",
        f"curl -fSLo release.json {raw_url}/{release_metadata}",
        f"curl -fSLo release.json.sig {raw_url}/{release_signature}",
        f"usign -V -q -m release.json -p {trusted_key} -x release.json.sig",
        "bundle_sha=$(jsonfilter -i release.json -e '@.artifacts.guardBundle.sha256')",
        f"curl -fSLo openclash-guard.sh {raw_url}/{artifact}",
        "printf '%s  %s\\n' \"$bundle_sha\" openclash-guard.sh | sha256sum -c -",
        "/bin/sh -n openclash-guard.sh",
        "/bin/sh ./openclash-guard.sh",
        "```",
        "",
        "A checksum fetched beside an artifact is not a trust anchor. The `usign` signature authenticates the metadata that contains the SHA-256 values; the SHA-256 then authenticates the downloaded artifact, following the same trust-chain shape used by OpenWrt package metadata and APT repository metadata.",
        README_END,
    ]
    replace_block(README, README_BEGIN, README_END, quick)

    doc = [
        DOC_BEGIN,
        "OpenClash Guard never auto-upgrades and the version checker never downloads or executes a new bundle. Network distribution is trusted only through signed release metadata.",
        "",
        "### Trust anchor",
        "",
        f"Provision the trusted `usign` public key at `{trusted_key}` through a channel independent of the mirror/CDN being checked. Fetching the key from the same unauthenticated channel and immediately trusting it does not protect against MITM.",
        "",
        "### Authenticated first install",
        "",
        "Download metadata and signature first, authenticate them, then verify the bundle hash before local execution:",
        "",
        "```sh",
        "work=/tmp/openclash-guard-install",
        "rm -rf \"$work\" && mkdir -p \"$work\" && cd \"$work\"",
        f"curl -fSLo release.json {raw_url}/{release_metadata}",
        f"curl -fSLo release.json.sig {raw_url}/{release_signature}",
        f"usign -V -q -m release.json -p {trusted_key} -x release.json.sig",
        "bundle_sha=$(jsonfilter -i release.json -e '@.artifacts.guardBundle.sha256')",
        f"curl -fSLo openclash-guard.sh {raw_url}/{artifact}",
        "printf '%s  %s\\n' \"$bundle_sha\" openclash-guard.sh | sha256sum -c -",
        "/bin/sh -n openclash-guard.sh",
        "/bin/sh ./openclash-guard.sh",
        "```",
        "",
        "The CDN may be substituted for the raw source without changing the trust decision because the authenticated metadata, not the transport endpoint, supplies the trusted hash:",
        "",
        "```text",
        f"{cdn_url}/{release_metadata}",
        f"{cdn_url}/{release_signature}",
        f"{cdn_url}/{artifact}",
        "```",
        "",
        "### Read-only version check",
        "",
        "```sh",
        "openclash-guard version-check",
        "openclash-guard --json version-check",
        "```",
        "",
        "This reads the local bundle hash, fetches only small signed release metadata plus its detached signature, verifies the local trust anchor, enforces the locally recorded highest release sequence, and compares hashes. It never installs, reconciles, refreshes, or executes fetched bytes.",
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
        DOC_END,
    ]
    replace_block(GUARD_DOC, DOC_BEGIN, DOC_END, doc)


if __name__ == "__main__":
    main()
