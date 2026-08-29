#!/usr/bin/env python3
"""Embed canonical distribution sources into the public bootstrap installer."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "internal" / "config" / "ai-routing" / "catalogs" / "distribution.json"
INSTALLER = ROOT / "setup" / "openclash" / "install.sh"
SHELL_CATALOG = ROOT / "shell" / "lib" / "distribution.sh"
BEGIN = "# BEGIN GENERATED DISTRIBUTION SOURCES"
END = "# END GENERATED DISTRIBUTION SOURCES"
SHELL_BEGIN = "# BEGIN GENERATED DISTRIBUTION CATALOG"
SHELL_END = "# END GENERATED DISTRIBUTION CATALOG"


def main() -> None:
    document = json.loads(CATALOG.read_text(encoding="utf-8"))
    sources = {item["id"]: item for item in document["channels"]}
    lines = [BEGIN]
    for source_id, variable in (("cdn", "SOURCE_CDN_BASE"), ("raw", "SOURCE_GITHUB_RAW_BASE")):
        source = sources[source_id]
        base = source["baseUrl"].format(
            repository=document["repository"], version=document["defaultRef"]
        )
        lines.append(f'{variable}="{base}"')
    lines.extend([
        'SOURCE_GUARD_PATH="dist/openclash-guard.sh"',
        'SOURCE_GUARD_MANIFEST="dist/manifest.json"',
        'SOURCE_GUARD_CHECKSUM="dist/openclash-guard.sha256"',
    ])
    lines.append(END)
    text = INSTALLER.read_text(encoding="utf-8")
    start = text.index(BEGIN)
    finish = text.index(END, start) + len(END)
    INSTALLER.write_text(text[:start] + "\n".join(lines) + text[finish:], encoding="utf-8")
    shell_text = SHELL_CATALOG.read_text(encoding="utf-8")
    shell_lines = [SHELL_BEGIN]
    for source_id, variable in (("raw", "_GUARD_DISTRIBUTION_RAW_BASE"), ("cdn", "_GUARD_DISTRIBUTION_CDN_BASE")):
        source = sources[source_id]
        base = source["baseUrl"].format(repository=document["repository"], version=document["defaultRef"])
        shell_lines.append(f'{variable}="{base}"')
    shell_lines.append(SHELL_END)
    shell_start = shell_text.index(SHELL_BEGIN)
    shell_finish = shell_text.index(SHELL_END, shell_start) + len(SHELL_END)
    SHELL_CATALOG.write_text(shell_text[:shell_start] + "\n".join(shell_lines) + shell_text[shell_finish:], encoding="utf-8")


if __name__ == "__main__":
    main()
