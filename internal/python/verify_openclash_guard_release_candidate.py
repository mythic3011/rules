#!/usr/bin/env python3
"""Verify an OpenClash Guard release candidate without executing candidate code.

The signer runs this verifier from trusted ``main``. Candidate bytes are read with
``git show <sha>:<path>`` only; no scripts from the candidate revision are run.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Callable

from ai_profiles.distribution import DistributionCatalog, load_distribution


ROOT = Path(__file__).resolve().parents[2]
DISTRIBUTION_PATH = ROOT / "internal/config/ai-routing/catalogs/distribution.json"
ROLE_KEYS = {
    "guard-bundle": "guardBundle",
    "bootstrap-installer": "bootstrapInstaller",
    "runtime-policy": "runtimePolicy",
    "runtime-templates": "runtimeTemplates",
}
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class CandidateError(RuntimeError):
    """Release candidate is not safe to sign."""


def _git_blob(candidate_sha: str, path: str) -> bytes:
    if not SHA_RE.fullmatch(candidate_sha):
        raise CandidateError("candidate ref must be a full lowercase 40-hex commit SHA")
    if path.startswith("/") or ".." in path.split("/"):
        raise CandidateError(f"refusing unsafe candidate path: {path}")
    result = subprocess.run(
        ["git", "show", f"{candidate_sha}:{path}"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise CandidateError(f"candidate blob unavailable: {path}: {detail}")
    return result.stdout


def _json_object(payload: bytes, label: str) -> dict[str, object]:
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CandidateError(f"{label} is not valid UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise CandidateError(f"{label} must be a JSON object")
    return value


def _artifact_paths(catalog: DistributionCatalog) -> dict[str, str]:
    paths: dict[str, str] = {}
    for role, key in ROLE_KEYS.items():
        try:
            paths[key] = catalog.artifact(role).path
        except KeyError as exc:
            raise CandidateError(f"trusted distribution catalog is missing role: {role}") from exc
    return paths


def verify_candidate_bytes(
    *,
    metadata_bytes: bytes,
    blob_loader: Callable[[str], bytes],
    catalog: DistributionCatalog,
    baseline_metadata_bytes: bytes,
) -> dict[str, object]:
    document = _json_object(metadata_bytes, "candidate release metadata")
    required = {"schemaVersion", "repository", "sequence", "revision", "artifacts"}
    if set(document) != required:
        raise CandidateError("candidate release metadata has unknown or incomplete top-level fields")
    if document.get("schemaVersion") != 1:
        raise CandidateError("unsupported candidate release metadata schema")
    if document.get("repository") != catalog.repository:
        raise CandidateError("candidate repository does not match the trusted catalog")

    sequence = document.get("sequence")
    if type(sequence) is not int:
        raise CandidateError("candidate sequence must be an integer")
    if sequence not in {catalog.release_sequence, catalog.release_sequence + 1}:
        raise CandidateError(
            "candidate sequence must equal the trusted sequence or advance it by exactly one"
        )
    if sequence == catalog.release_sequence and metadata_bytes != baseline_metadata_bytes:
        raise CandidateError("same-sequence metadata differs from trusted baseline (equivocation)")

    expected_paths = _artifact_paths(catalog)
    artifacts = document.get("artifacts")
    if not isinstance(artifacts, dict) or set(artifacts) != set(expected_paths):
        raise CandidateError("candidate artifact roles do not match the trusted signing allowlist")

    normalized_artifacts: dict[str, dict[str, object]] = {}
    for key, expected_path in expected_paths.items():
        record = artifacts.get(key)
        if not isinstance(record, dict) or set(record) != {"path", "sha256", "size"}:
            raise CandidateError(f"candidate artifact record has invalid shape: {key}")
        if record.get("path") != expected_path:
            raise CandidateError(f"candidate artifact path changed for {key}")
        digest = record.get("sha256")
        size = record.get("size")
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
            raise CandidateError(f"candidate artifact sha256 is invalid: {key}")
        if type(size) is not int or size < 0:
            raise CandidateError(f"candidate artifact size is invalid: {key}")

        payload = blob_loader(expected_path)
        actual_digest = hashlib.sha256(payload).hexdigest()
        if digest != actual_digest:
            raise CandidateError(f"candidate artifact digest mismatch: {key}")
        if size != len(payload):
            raise CandidateError(f"candidate artifact size mismatch: {key}")
        normalized_artifacts[key] = {
            "path": expected_path,
            "sha256": actual_digest,
            "size": len(payload),
        }

    revision_payload = json.dumps(
        {"sequence": sequence, "artifacts": normalized_artifacts},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    expected_revision = "sha256:" + hashlib.sha256(revision_payload).hexdigest()
    if document.get("revision") != expected_revision:
        raise CandidateError("candidate release revision does not match deterministic artifact metadata")

    canonical = {
        "schemaVersion": 1,
        "repository": catalog.repository,
        "sequence": sequence,
        "revision": expected_revision,
        "artifacts": normalized_artifacts,
    }
    canonical_bytes = (json.dumps(canonical, indent=2, sort_keys=True) + "\n").encode("utf-8")
    if metadata_bytes != canonical_bytes:
        raise CandidateError("candidate release metadata is not canonical generator output")

    return {
        "repository": catalog.repository,
        "sequence": sequence,
        "revision": expected_revision,
        "metadataSha256": hashlib.sha256(metadata_bytes).hexdigest(),
        "artifacts": normalized_artifacts,
    }


def verify_candidate(candidate_sha: str) -> dict[str, object]:
    if not SHA_RE.fullmatch(candidate_sha):
        raise CandidateError("candidate ref must be a full lowercase 40-hex commit SHA")
    catalog = load_distribution(DISTRIBUTION_PATH)
    baseline_metadata_path = ROOT / catalog.release_metadata_path
    try:
        baseline_metadata = baseline_metadata_path.read_bytes()
    except OSError as exc:
        raise CandidateError("trusted baseline release metadata is unavailable") from exc
    metadata = _git_blob(candidate_sha, catalog.release_metadata_path)
    return verify_candidate_bytes(
        metadata_bytes=metadata,
        blob_loader=lambda path: _git_blob(candidate_sha, path),
        catalog=catalog,
        baseline_metadata_bytes=baseline_metadata,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result = verify_candidate(args.candidate_sha)
    except CandidateError as exc:
        raise SystemExit(f"release candidate rejected: {exc}") from exc
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8", newline="\n")
    print(rendered, end="")


if __name__ == "__main__":
    main()
