#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from ai_profiles.writer import atomic_write_text

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "internal/config/openclash-guard/router-observations.v1.json"
OUTPUT = ROOT / "apps/luci-app-openclash-guard/root/usr/share/openclash-guard/router-observations.v1.json"


def render_catalog(source: Path = SOURCE) -> str:
    document = json.loads(source.read_text(encoding="utf-8"))
    if set(document) != {"version", "kind", "authorization", "runtimePolicyPath", "limits", "ruleReasons"}:
        raise ValueError("invalid router observation contract fields")
    if document["version"] != 1 or document["kind"] != "rule-counter-snapshot":
        raise ValueError("unsupported router observation contract")
    if document["authorization"] != "READ_ONLY_NO_ROUTING_AUTHORITY":
        raise ValueError("router observations cannot carry routing authority")
    policy = Path(document["runtimePolicyPath"])
    if not policy.is_absolute() or ".." in policy.parts:
        raise ValueError("invalid runtime policy reference")
    if set(document["limits"]) != {"maxInputBytes", "maxRecords", "commandTimeoutSeconds", "killAfterSeconds", "ttlMs", "maxSafeCounter"}:
        raise ValueError("invalid router observation limit fields")
    for name, value in document["limits"].items():
        if type(value) is not int or value <= 0:
            raise ValueError(f"invalid observation limit: {name}")
    seen: set[str] = set()
    for rule in document["ruleReasons"]:
        if not re.fullmatch(r"[a-z][a-z0-9-]*", rule["id"]) or rule["id"] in seen:
            raise ValueError("invalid or duplicate observation rule reference")
        if rule["decision"] not in {"accept", "reject", "drop"}:
            raise ValueError("unsupported rule decision")
        if not re.fullmatch(r"[a-z][a-z0-9_]*", rule["chain"]) or not rule["label"]:
            raise ValueError("invalid rule explanation")
        seen.add(rule["id"])
    return json.dumps(document, indent=2, sort_keys=True) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the read-only router observation catalog.")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = render_catalog()
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != rendered:
            raise SystemExit("router observation catalog is out of date")
    else:
        atomic_write_text(OUTPUT, rendered)


if __name__ == "__main__":
    main()
