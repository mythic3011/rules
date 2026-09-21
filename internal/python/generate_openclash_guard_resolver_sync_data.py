#!/usr/bin/env python3
"""Compile curated resolver-sync selectors into a shell data module.

The generated module is bundled into the signed OpenClash Guard artifact.  The
source rules stay human-reviewable while the deployed helper needs no extra
runtime policy file or unsigned sidecar.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "internal/config/openclash-guard/resolver-sync.rules"
OUTPUT = ROOT / "shell/generated/openclash-guard-resolver-sync-data.sh"
HEADER = "# openclash-guard-resolver-sync-rules/v1"
ID = re.compile(r"^[a-z][a-z0-9-]*$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")
DOMAIN = re.compile(r"^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")
REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def parse_source(path: Path = SOURCE) -> tuple[tuple[str, str, str], list[tuple[str, str, str]], list[tuple[str, str]]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != HEADER:
        raise RuntimeError("resolver-sync rules header is missing")

    source: tuple[str, str, str] | None = None
    selectors: list[tuple[str, str, str]] = []
    exclusions: list[tuple[str, str]] = []
    seen_selectors: set[tuple[str, str, str]] = set()
    seen_exclusions: set[tuple[str, str]] = set()

    for lineno, raw in enumerate(lines[1:], 2):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        fields = line.split()
        kind = fields[0]
        if kind == "source":
            if len(fields) != 4:
                raise RuntimeError(f"invalid source rule at line {lineno}")
            candidate = (fields[1], fields[2], fields[3])
            if source is not None:
                raise RuntimeError("resolver-sync rules must declare exactly one source")
            if not ID.fullmatch(candidate[0]) or not REPO.fullmatch(candidate[1]) or not HEX40.fullmatch(candidate[2]):
                raise RuntimeError(f"invalid source rule at line {lineno}")
            source = candidate
            continue
        if kind == "selector":
            if len(fields) != 4:
                raise RuntimeError(f"invalid selector at line {lineno}")
            service, mode, domain = fields[1], fields[2], fields[3]
            if not ID.fullmatch(service) or mode not in {"exact", "suffix"}:
                raise RuntimeError(f"invalid selector at line {lineno}")
            if not DOMAIN.fullmatch(domain) or domain.lower() != domain:
                raise RuntimeError(f"invalid selector domain at line {lineno}")
            item = (service, mode, domain)
            if item in seen_selectors:
                raise RuntimeError(f"duplicate selector at line {lineno}")
            seen_selectors.add(item)
            selectors.append(item)
            continue
        if kind == "exclude":
            if len(fields) != 3 or not ID.fullmatch(fields[1]) or not ID.fullmatch(fields[2]):
                raise RuntimeError(f"invalid exclusion at line {lineno}")
            item = (fields[1], fields[2])
            if item in seen_exclusions:
                raise RuntimeError(f"duplicate exclusion at line {lineno}")
            seen_exclusions.add(item)
            exclusions.append(item)
            continue
        raise RuntimeError(f"unknown resolver-sync rule at line {lineno}: {kind}")

    if source is None or not selectors:
        raise RuntimeError("resolver-sync rules require one source and at least one selector")
    covered = {service for service, _, _ in selectors}
    excluded = {service for service, _ in exclusions}
    overlap = sorted(covered & excluded)
    if overlap:
        raise RuntimeError(f"service cannot be both selected and excluded: {', '.join(overlap)}")
    return source, selectors, exclusions


def shell_single(value: str) -> str:
    if "'" in value or "\n" in value or "\r" in value:
        raise RuntimeError("generated shell data contains unsafe quoting characters")
    return f"'{value}'"


def render() -> str:
    source, selectors, exclusions = parse_source()
    source_id, source_repo, source_revision = source
    selector_text = "\n".join(" ".join(item) for item in selectors)
    exclusion_text = "\n".join(" ".join(item) for item in exclusions)
    return "\n".join(
        [
            "#!/bin/sh",
            "# GENERATED FILE. Edit internal/config/openclash-guard/resolver-sync.rules instead.",
            "# Prefix: _GUARD_RESOLVER_SYNC_DATA_",
            "set -eu",
            "",
            f"_GUARD_RESOLVER_SYNC_DATA_SOURCE_ID={shell_single(source_id)}",
            f"_GUARD_RESOLVER_SYNC_DATA_SOURCE_REPO={shell_single(source_repo)}",
            f"_GUARD_RESOLVER_SYNC_DATA_SOURCE_REVISION={shell_single(source_revision)}",
            f"_GUARD_RESOLVER_SYNC_DATA_SELECTORS={shell_single(selector_text)}",
            f"_GUARD_RESOLVER_SYNC_DATA_EXCLUSIONS={shell_single(exclusion_text)}",
            "",
        ]
    )


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(render(), encoding="utf-8", newline="\n")
    print(OUTPUT.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    main()
