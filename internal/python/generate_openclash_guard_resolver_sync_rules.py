#!/usr/bin/env python3
"""Bind curated resolver-sync selectors to the generated Guard policy revision."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "internal/config/openclash-guard/resolver-sync.rules"
POLICY = ROOT / "cfg/runtime/openclash-guard.json"
OUTPUT = ROOT / "cfg/runtime/openclash-guard-resolver-sync.rules"
HEADER = "# openclash-guard-resolver-sync-rules/v1"
HEX40 = re.compile(r"^[0-9a-f]{40}$")
ID = re.compile(r"^[a-z][a-z0-9-]*$")
DOMAIN = re.compile(r"^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")


def load_policy_revision() -> str:
    doc = json.loads(POLICY.read_text(encoding="utf-8"))
    revision = doc.get("revision")
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{64}", revision):
        raise RuntimeError("runtime policy has no valid revision")
    return revision


def validate_source(lines: list[str]) -> None:
    if not lines or lines[0] != HEADER:
        raise RuntimeError("resolver-sync rules header is missing")
    sources = selectors = 0
    covered: set[str] = set()
    excluded: set[str] = set()
    for lineno, raw in enumerate(lines[1:], 2):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        fields = line.split()
        kind = fields[0]
        if kind == "policy-revision":
            raise RuntimeError("policy-revision is generated and must not appear in source rules")
        if kind == "source":
            if len(fields) != 4 or not ID.fullmatch(fields[1]) or not HEX40.fullmatch(fields[3]):
                raise RuntimeError(f"invalid source rule at line {lineno}")
            sources += 1
            continue
        if kind == "selector":
            if len(fields) != 4 or not ID.fullmatch(fields[1]) or fields[2] not in {"exact", "suffix"}:
                raise RuntimeError(f"invalid selector at line {lineno}")
            if not DOMAIN.fullmatch(fields[3]) or fields[3].lower() != fields[3]:
                raise RuntimeError(f"invalid selector domain at line {lineno}")
            covered.add(fields[1])
            selectors += 1
            continue
        if kind == "exclude":
            if len(fields) != 3 or not ID.fullmatch(fields[1]) or not ID.fullmatch(fields[2]):
                raise RuntimeError(f"invalid exclusion at line {lineno}")
            excluded.add(fields[1])
            continue
        raise RuntimeError(f"unknown resolver-sync rule at line {lineno}: {kind}")
    if sources != 1 or selectors == 0:
        raise RuntimeError("resolver-sync rules require one pinned source and at least one selector")
    required = {"chatgpt", "claude", "poe", "windsurf", "huggingface", "flow-music"}
    missing = sorted(required - covered - excluded)
    if missing:
        raise RuntimeError(f"resolver-sync coverage is incomplete: {', '.join(missing)}")
    overlap = sorted(covered & excluded)
    if overlap:
        raise RuntimeError(f"service cannot be both covered and excluded: {overlap}")


def main() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    validate_source(lines)
    revision = load_policy_revision()
    rendered = [lines[0], f"policy-revision {revision}", *lines[1:]]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(rendered) + "\n", encoding="utf-8", newline="\n")
    print(OUTPUT.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    main()
