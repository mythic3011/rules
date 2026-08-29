#!/usr/bin/env python3
"""Embed canonical distribution sources into the public bootstrap installer."""
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
        )
    )
    shell_lines.append(SHELL_END)
    replace_block(SHELL_CATALOG, SHELL_BEGIN, SHELL_END, shell_lines)

    alias = document["bootstrapAlias"]
    raw_url = sources["raw"]["baseUrl"].format(
        repository=document["repository"], version=document["defaultRef"]
    )
    cdn_url = sources["cdn"]["baseUrl"].format(
        repository=document["repository"], version=document["defaultRef"]
    )
    replace_block(
        README,
        README_BEGIN,
        README_END,
        [
            README_BEGIN,
            "```sh",
            f"curl -fsSL {alias} | sh",
            "```",
            "",
            "Opens the interactive OpenClash Guard menu, auto-detects the router environment, and guides first-time setup. See the [OpenClash Guard guide](docs/openclash-guard.md) for direct-source fallback and headless use.",
            README_END,
        ],
    )
    replace_block(
        GUARD_DOC,
        DOC_BEGIN,
        DOC_END,
        [
            DOC_BEGIN,
            "Use the stable human-facing bootstrap alias:",
            "",
            "```sh",
            f"curl -fsSL {alias} | sh",
            "```",
            "",
            "With no arguments and a controlling terminal, the generated guard opens its interactive menu and reads input from `/dev/tty`. The alias is only an onboarding redirect; runtime refresh does not depend on it.",
            "",
            "### Direct Sources / Fallback",
            "",
            "Raw GitHub and CDN commands are generated from the canonical distribution catalog:",
            "",
            "```sh",
            f"curl -fsSL {raw_url}/{artifact} | sh",
            f"curl -fsSL {cdn_url}/{artifact} | sh",
            "```",
            "",
            "For a one-shot headless command:",
            "",
            "```sh",
            f"curl -fsSL {alias} | sh -s -- status",
            "```",
            DOC_END,
        ],
    )


if __name__ == "__main__":
    main()
