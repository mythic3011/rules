"""Deterministic provenance context + canonical digests for generated files.

Provenance metadata lives in `internal/config/generation/provenance.json`; the
per-file digest is a canonical hash of the inputs that produced the file, so
regenerated tracked outputs are byte-for-byte reproducible (no wall-clock
timestamp, no commit-hash dependency).
"""
from __future__ import annotations

import hashlib
import json

from ..settings import REPO_URL
from .templates import load_json

_PROVENANCE_CONFIG = "internal/config/generation/provenance.json"


def canonical_digest(data: object) -> str:
    encoded = json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def load_provenance() -> dict[str, str]:
    config = load_json(_PROVENANCE_CONFIG)
    source_path = config["sourcePath"]
    return {
        "generator": config["generator"],
        "repository": REPO_URL,
        "source": f"{REPO_URL}/blob/main/{source_path}",
    }
