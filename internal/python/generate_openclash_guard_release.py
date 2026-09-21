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
