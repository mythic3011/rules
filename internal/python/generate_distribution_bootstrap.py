#!/usr/bin/env python3
"""Embed canonical distribution sources into the public bootstrap installer."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "internal" / "config" / "ai-routing" / "catalogs" / "distribution.json"
INSTALLER = ROOT / "setup" / "openclash" / "install.sh"
BEGIN = "# BEGIN GENERATED DISTRIBUTION SOURCES"
END = "# END GENERATED DISTRIBUTION SOURCES"


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


if __name__ == "__main__":
    main()
