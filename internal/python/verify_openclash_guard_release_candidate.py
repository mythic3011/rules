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
import sys
import tempfile
from pathlib import Path
from pathlib import PurePosixPath
from typing import Callable

from ai_profiles.distribution import DistributionCatalog, load_distribution


ROOT = Path(__file__).resolve().parents[2]
DISTRIBUTION_PATH = ROOT / "internal/config/ai-routing/catalogs/distribution.json"
DISTRIBUTION_RELATIVE_PATH = "internal/config/ai-routing/catalogs/distribution.json"
ROLE_KEYS = {
    "guard-bundle": "guardBundle",
    "bootstrap-installer": "bootstrapInstaller",
    "runtime-policy": "runtimePolicy",
    "runtime-templates": "runtimeTemplates",
}
GENERATOR_IMPLEMENTATION_PATHS = (
    "internal/python",
    "tools",
    ".github/workflows/auto-generate-ai-profiles.yml",
    "Makefile",
    "mise.toml",
    "requirements-dev.txt",
    "rulesctl",
    "internal/schemas/openclash-guard-runtime.schema.json",
)
GENERATOR_CODE_ROOTS = ("internal/python", "tools")
CANDIDATE_INPUT_PATHS = (
    "shell",
    "internal/config/ai-routing",
    "internal/config/openclash-guard",
    "setup/openclash/install.sh",
)
CANDIDATE_SOURCE_ARTIFACT_PATHS = frozenset({"setup/openclash/install.sh"})
SHELL_ARTIFACT_ROLES = frozenset({"guard-bundle", "guard-manifest", "guard-checksum", "bootstrap-installer"})
RUNTIME_ARTIFACT_ROLES = frozenset({"runtime-policy", "runtime-templates"})
ARTIFACT_OUTPUT_ROOTS = {
    **{role: "shell" for role in SHELL_ARTIFACT_ROLES},
    **{role: "runtime" for role in RUNTIME_ARTIFACT_ROLES},
}
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class CandidateError(RuntimeError):
    """Release candidate is not safe to sign."""


def _git_blob(candidate_sha: str, path: str) -> bytes:
    if not SHA_RE.fullmatch(candidate_sha):
        raise CandidateError("candidate ref must be a full lowercase 40-hex commit SHA")
    if not _safe_relative_path(path):
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


def _safe_relative_path(path: str) -> bool:
    parsed = PurePosixPath(path)
    return (
        bool(path)
        and parsed.as_posix() == path
        and bool(parsed.parts)
        and not parsed.is_absolute()
        and all(part not in {".", ".."} for part in parsed.parts)
        and "\\" not in path
        and not any(ord(character) < 32 or ord(character) == 127 for character in path)
    )


def _scratch_path(root: Path, relative_path: str, *, create_parents: bool = False) -> Path:
    """Resolve a canonical path below a scratch root without traversing symlinks."""
    if not _safe_relative_path(relative_path) or root.is_symlink():
        raise CandidateError(f"scratch path is unsafe: {relative_path}")
    root_resolved = root.resolve()
    target = root
    parts = PurePosixPath(relative_path).parts
    for part in parts[:-1]:
        target = target / part
        if target.is_symlink():
            raise CandidateError(f"scratch path traverses a symlink: {relative_path}")
        if create_parents:
            if target.exists() and not target.is_dir():
                raise CandidateError(f"scratch path parent is not a directory: {relative_path}")
            target.mkdir(exist_ok=True)
        elif not target.is_dir():
            raise CandidateError(f"scratch path parent is missing: {relative_path}")
        if not target.is_dir() or not target.resolve().is_relative_to(root_resolved):
            raise CandidateError(f"scratch path escapes its root: {relative_path}")
    target = target / parts[-1]
    if target.is_symlink() or not target.resolve().is_relative_to(root_resolved):
        raise CandidateError(f"scratch path escapes its root: {relative_path}")
    return target


def _git_tree_entries(commit_sha: str, pathspecs: tuple[str, ...]) -> dict[str, tuple[str, str, str]]:
    if not SHA_RE.fullmatch(commit_sha):
        raise CandidateError("trusted and candidate refs must be full lowercase 40-hex commit SHAs")
    result = subprocess.run(
        ["git", "ls-tree", "-r", "-z", "--full-tree", commit_sha, "--", *pathspecs],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise CandidateError("could not enumerate trusted generator files")
    entries: dict[str, tuple[str, str, str]] = {}
    for record in result.stdout.split(b"\0"):
        if not record:
            continue
        try:
            metadata, raw_path = record.split(b"\t", 1)
            mode, kind, object_id = metadata.decode("ascii").split(" ")
            path = raw_path.decode("utf-8")
        except (ValueError, UnicodeDecodeError) as exc:
            raise CandidateError("generator file inventory is malformed") from exc
        if not _safe_relative_path(path):
            raise CandidateError("generator file inventory contains an unsafe path")
        if kind != "blob" or mode not in {"100644", "100755"}:
            raise CandidateError(f"tracked path is not a regular file: {path}")
        if path in entries:
            raise CandidateError("generator file inventory contains duplicate paths")
        entries[path] = (mode, kind, object_id)
    return entries


def _assert_trusted_checkout(trusted_sha: str) -> None:
    if not SHA_RE.fullmatch(trusted_sha):
        raise CandidateError("trusted ref must be a full lowercase 40-hex commit SHA")
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0 or result.stdout.decode("ascii", errors="replace").strip() != trusted_sha:
        raise CandidateError("trusted signer checkout does not match the requested main revision")


def verify_generator_provenance(
    candidate_sha: str,
    trusted_sha: str,
    *,
    tree_loader: Callable[[str, tuple[str, ...]], dict[str, tuple[str, str, str]]] | None = None,
    blob_loader: Callable[[str, str], bytes] | None = None,
) -> dict[str, object]:
    """Require generator code and its build controls to match the trusted signer revision."""
    if not SHA_RE.fullmatch(candidate_sha) or not SHA_RE.fullmatch(trusted_sha):
        raise CandidateError("trusted and candidate refs must be full lowercase 40-hex commit SHAs")
    load_tree = tree_loader or _git_tree_entries
    load_blob = blob_loader or _git_blob
    trusted_entries = load_tree(trusted_sha, GENERATOR_IMPLEMENTATION_PATHS)
    candidate_entries = load_tree(candidate_sha, GENERATOR_IMPLEMENTATION_PATHS)

    for entry_set in (trusted_entries, candidate_entries):
        if any(mode not in {"100644", "100755"} or kind != "blob" for mode, kind, _ in entry_set.values()):
            raise CandidateError("generator implementation contains a symlink or non-regular file")

    required_controls = {
        ".github/workflows/auto-generate-ai-profiles.yml",
        "Makefile",
        "mise.toml",
        "requirements-dev.txt",
        "rulesctl",
        "internal/schemas/openclash-guard-runtime.schema.json",
    }
    if not required_controls.issubset(trusted_entries):
        raise CandidateError("trusted generator contract is incomplete")
    if set(candidate_entries) != set(trusted_entries):
        raise CandidateError("candidate generator file set differs from trusted main")

    compared = 0
    for path in sorted(trusted_entries):
        trusted_mode = trusted_entries[path][0]
        candidate_mode = candidate_entries[path][0]
        if candidate_mode != trusted_mode or load_blob(candidate_sha, path) != load_blob(trusted_sha, path):
            raise CandidateError(f"candidate changes trusted generator implementation: {path}")
        compared += 1
    return {"trustedSha": trusted_sha, "implementationFileCount": compared}


def _artifact_map(catalog: DistributionCatalog) -> dict[str, str]:
    result = {artifact.role: artifact.path for artifact in catalog.artifacts}
    if len(result) != len(catalog.artifacts):
        raise CandidateError("trusted distribution catalog contains duplicate artifact roles")
    if len(set(result.values())) != len(result):
        raise CandidateError("trusted distribution catalog contains duplicate artifact paths")
    return result


def _published_artifact_paths(catalog: DistributionCatalog) -> tuple[str, ...]:
    artifacts = _artifact_map(catalog)
    expected_roles = SHELL_ARTIFACT_ROLES | RUNTIME_ARTIFACT_ROLES
    if set(artifacts) != expected_roles:
        raise CandidateError("trusted distribution roles do not match the guarded release generator")
    for role, path in artifacts.items():
        if not _safe_relative_path(path):
            raise CandidateError(f"trusted distribution path is unsafe: {path}")
        if role in SHELL_ARTIFACT_ROLES:
            allowed = path.startswith("dist/") if role != "bootstrap-installer" else path.startswith("setup/openclash/")
        else:
            allowed = path.startswith("cfg/runtime/")
        if not allowed:
            raise CandidateError(f"trusted artifact path is outside its generator output root: {role}")
    metadata_path = catalog.release_metadata_path
    if not _safe_relative_path(metadata_path) or not metadata_path.startswith("dist/"):
        raise CandidateError("trusted release metadata path is unsafe")
    if metadata_path in artifacts.values():
        raise CandidateError("trusted release metadata path duplicates a published artifact")
    return tuple([*(artifact.path for artifact in catalog.artifacts), metadata_path])


def validate_candidate_published_files(
    candidate_sha: str,
    catalog: DistributionCatalog,
    *,
    tree_loader: Callable[[str, tuple[str, ...]], dict[str, tuple[str, str, str]]] | None = None,
) -> None:
    """Require every signed input to be an exact regular blob in the candidate tree."""
    paths = _published_artifact_paths(catalog)
    entries = (tree_loader or _git_tree_entries)(candidate_sha, paths)
    if set(entries) != set(paths):
        raise CandidateError("candidate published file inventory differs from the trusted distribution")
    for path, (mode, kind, _) in entries.items():
        if mode not in {"100644", "100755"} or kind != "blob":
            raise CandidateError(f"candidate published artifact is not a regular file: {path}")


def validate_candidate_distribution(candidate_sha: str, catalog: DistributionCatalog) -> None:
    """Keep candidate data from redirecting trusted generators or changing signed roles."""
    value = _json_object(_git_blob(candidate_sha, DISTRIBUTION_RELATIVE_PATH), "candidate distribution catalog")
    raw_artifacts = value.get("artifacts")
    if not isinstance(raw_artifacts, list):
        raise CandidateError("candidate distribution artifact allowlist is invalid")
    try:
        candidate_artifacts = {
            record["role"]: record["path"]
            for record in raw_artifacts
            if isinstance(record, dict) and set(record) == {"role", "path"}
        }
    except (KeyError, TypeError) as exc:
        raise CandidateError("candidate distribution artifact allowlist is invalid") from exc
    if len(candidate_artifacts) != len(raw_artifacts) or candidate_artifacts != _artifact_map(catalog):
        raise CandidateError("candidate distribution artifact paths differ from the trusted signing catalog")
    if value.get("repository") != catalog.repository:
        raise CandidateError("candidate distribution repository differs from the trusted signing catalog")
    if value.get("releaseMetadataPath") != catalog.release_metadata_path:
        raise CandidateError("candidate release metadata path differs from the trusted signing catalog")
    sequence = value.get("releaseSequence")
    if type(sequence) is not int or sequence not in {catalog.release_sequence, catalog.release_sequence + 1}:
        raise CandidateError("candidate distribution sequence is outside the trusted release window")


def _copy_blob_to_root(
    commit_sha: str,
    path: str,
    entries: dict[str, tuple[str, str, str]],
    destination_root: Path,
    blob_loader: Callable[[str, str], bytes] | None = None,
) -> Path:
    entry = entries.get(path)
    if entry is None:
        raise CandidateError(f"required source file is missing: {path}")
    mode = entry[0]
    if mode not in {"100644", "100755"}:
        raise CandidateError(f"source file is not regular: {path}")
    target = _scratch_path(destination_root, path, create_parents=True)
    if target.exists() and not target.is_file():
        raise CandidateError(f"source file destination is not regular: {path}")
    target.write_bytes((blob_loader or _git_blob)(commit_sha, path))
    target.chmod(0o755 if mode == "100755" else 0o644)
    return target


def _input_suffix_allowed(path: str) -> bool:
    suffix = PurePosixPath(path).suffix.lower()
    if path in CANDIDATE_SOURCE_ARTIFACT_PATHS:
        return suffix == ".sh"
    if path.startswith("shell/"):
        return suffix in {".sh", ".json", ".md", ""}
    return suffix in {".json", ".yaml", ".yml", ".rules", ".md", ""}


def prepare_candidate_regeneration_inputs(
    candidate_sha: str,
    trusted_sha: str,
    trusted_root: Path,
    shell_root: Path,
    *,
    tree_loader: Callable[[str, tuple[str, ...]], dict[str, tuple[str, str, str]]] | None = None,
    blob_loader: Callable[[str, str], bytes] | None = None,
) -> None:
    """Build isolated generator roots from trusted code and candidate data blobs only."""
    load_tree = tree_loader or _git_tree_entries
    load_blob = blob_loader or _git_blob
    verify_generator_provenance(candidate_sha, trusted_sha, tree_loader=load_tree, blob_loader=load_blob)
    trusted_entries = load_tree(trusted_sha, GENERATOR_IMPLEMENTATION_PATHS)
    candidate_entries = load_tree(candidate_sha, CANDIDATE_INPUT_PATHS)
    trusted_root.mkdir(parents=True, exist_ok=False)
    shell_root.mkdir(parents=True, exist_ok=False)

    for path in sorted(trusted_entries):
        if any(path == root or path.startswith(f"{root}/") for root in GENERATOR_CODE_ROOTS) or path == "internal/schemas/openclash-guard-runtime.schema.json":
            entry = trusted_entries[path]
            mode = entry[0]
            destination = _scratch_path(trusted_root, path, create_parents=True)
            if destination.exists() and not destination.is_file():
                raise CandidateError(f"trusted generator destination is not regular: {path}")
            destination.write_bytes(load_blob(trusted_sha, path))
            destination.chmod(0o755 if mode == "100755" else 0o644)

    if not candidate_entries:
        raise CandidateError("candidate has no declared generation inputs")
    for path, (mode, kind, _) in sorted(candidate_entries.items()):
        if kind != "blob" or mode not in {"100644", "100755"} or not _input_suffix_allowed(path):
            raise CandidateError(f"candidate input is not supported data: {path}")
        destination_root = (
            shell_root
            if path.startswith("shell/") or path in CANDIDATE_SOURCE_ARTIFACT_PATHS
            else trusted_root
        )
        _copy_blob_to_root(candidate_sha, path, candidate_entries, destination_root, load_blob)


def _read_generated_file(root: Path, relative_path: str) -> bytes:
    if not _safe_relative_path(relative_path):
        raise CandidateError(f"regenerated path is unsafe: {relative_path}")
    path = _scratch_path(root, relative_path)
    if not path.is_file():
        raise CandidateError(f"trusted generator did not produce a regular artifact: {relative_path}")
    return path.read_bytes()


def verify_regenerated_artifacts(
    candidate_sha: str,
    trusted_root: Path,
    shell_root: Path,
    runtime_root: Path,
    catalog: DistributionCatalog,
    *,
    blob_loader: Callable[[str, str], bytes] | None = None,
) -> dict[str, object]:
    """Compare all catalog-published artifacts and release metadata to candidate blobs."""
    load_blob = blob_loader or _git_blob
    artifact_roots = {
        "shell": shell_root,
        "runtime": runtime_root,
    }
    paths = _published_artifact_paths(catalog)
    for artifact in catalog.artifacts:
        root_name = ARTIFACT_OUTPUT_ROOTS[artifact.role]
        generated = _read_generated_file(artifact_roots[root_name], artifact.path)
        candidate = load_blob(candidate_sha, artifact.path)
        if generated != candidate:
            raise CandidateError(f"trusted regeneration differs from candidate artifact: {artifact.path}")
    metadata = _read_generated_file(trusted_root, catalog.release_metadata_path)
    candidate_metadata = load_blob(candidate_sha, catalog.release_metadata_path)
    if metadata != candidate_metadata:
        raise CandidateError(f"trusted regeneration differs from candidate artifact: {catalog.release_metadata_path}")
    return {"comparedPaths": list(paths), "comparedArtifactCount": len(paths)}


def _run_generator(command: list[str], *, cwd: Path, environment: dict[str, str]) -> None:
    result = subprocess.run(
        command,
        cwd=cwd,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        executable_index = 2 if len(command) > 2 and command[1] == "-P" else 1
        executable = Path(command[executable_index]).name if len(command) > executable_index else "generator"
        raise CandidateError(f"trusted generator failed: {executable} (exit {result.returncode})")


def regenerate_candidate_artifacts(candidate_sha: str, trusted_sha: str) -> dict[str, object]:
    if not SHA_RE.fullmatch(candidate_sha) or not SHA_RE.fullmatch(trusted_sha):
        raise CandidateError("trusted and candidate refs must be full lowercase 40-hex commit SHAs")
    _assert_trusted_checkout(trusted_sha)
    catalog = load_distribution(DISTRIBUTION_PATH)
    _published_artifact_paths(catalog)
    validate_candidate_published_files(candidate_sha, catalog)
    validate_candidate_distribution(candidate_sha, catalog)

    with tempfile.TemporaryDirectory(prefix="openclash-guard-regeneration-") as directory:
        temporary_root = Path(directory)
        trusted_root = temporary_root / "trusted"
        shell_root = temporary_root / "candidate-shell-data"
        runtime_root = temporary_root / "runtime-output"
        prepare_candidate_regeneration_inputs(candidate_sha, trusted_sha, trusted_root, shell_root)
        runtime_root.mkdir()
        runtime_ai_routing = trusted_root / "internal/config/ai-routing/core"
        runtime_guard_config = trusted_root / "internal/config/openclash-guard"
        schema = trusted_root / "internal/schemas/openclash-guard-runtime.schema.json"
        runtime_output = runtime_root / "cfg/runtime/openclash-guard.json"
        templates_output = runtime_root / "cfg/runtime/openclash-guard-templates.json"
        runtime_output.parent.mkdir(parents=True, exist_ok=True)

        environment = {
            "PATH": "/usr/bin:/bin",
            "HOME": str(temporary_root),
            "TMPDIR": str(temporary_root),
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "PYTHONPATH": str(trusted_root / "internal/python"),
            "PYTHONNOUSERSITE": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        python = sys.executable
        runtime_command = [
            python,
            "-P",
            str(trusted_root / "internal/python/generate_openclash_guard_runtime.py"),
            "--ai-routing-dir",
            str(runtime_ai_routing),
            "--guard-config-dir",
            str(runtime_guard_config),
            "--schema",
            str(schema),
            "--output",
            str(runtime_output),
            "--templates-output",
            str(templates_output),
        ]
        _run_generator(runtime_command, cwd=trusted_root, environment=environment)

        trusted_policy_path = _scratch_path(
            trusted_root,
            "cfg/runtime/openclash-guard.json",
            create_parents=True,
        )
        trusted_policy_path.write_bytes(
            _read_generated_file(runtime_root, "cfg/runtime/openclash-guard.json")
        )
        resolver_data_command = [
            python,
            "-P",
            str(trusted_root / "internal/python/generate_openclash_guard_resolver_sync_data.py"),
        ]
        _run_generator(resolver_data_command, cwd=trusted_root, environment=environment)
        resolver_data = _read_generated_file(
            trusted_root,
            "internal/generated/ai-routing/openclash-guard-resolver-sync-data.sh",
        )
        shell_resolver_data_path = _scratch_path(
            shell_root,
            "internal/generated/ai-routing/openclash-guard-resolver-sync-data.sh",
            create_parents=True,
        )
        shell_resolver_data_path.write_bytes(resolver_data)

        shell_command = [
            python,
            "-P",
            str(trusted_root / "tools/shbundle.py"),
            "build",
            "--all",
            "--manifest",
            str(shell_root / "shell/manifest.json"),
        ]
        _run_generator(shell_command, cwd=trusted_root, environment=environment)

        for artifact in catalog.artifacts:
            destination = _scratch_path(trusted_root, artifact.path, create_parents=True)
            if destination.exists() and not destination.is_file():
                raise CandidateError(f"artifact destination is not regular: {artifact.path}")
            root_name = ARTIFACT_OUTPUT_ROOTS[artifact.role]
            payload = _read_generated_file({"shell": shell_root, "runtime": runtime_root}[root_name], artifact.path)
            destination.write_bytes(payload)

        release_generator = str(trusted_root / "internal/python/generate_openclash_guard_release.py")
        _run_generator([python, "-P", release_generator], cwd=trusted_root, environment=environment)
        return verify_regenerated_artifacts(candidate_sha, trusted_root, shell_root, runtime_root, catalog)


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
    validate_candidate_published_files(candidate_sha, catalog)
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
    parser.add_argument("--trusted-sha")
    parser.add_argument("--regenerate", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        if args.trusted_sha:
            _assert_trusted_checkout(args.trusted_sha)
        result = verify_candidate(args.candidate_sha)
        if args.trusted_sha:
            result["generatorProvenance"] = verify_generator_provenance(args.candidate_sha, args.trusted_sha)
            validate_candidate_distribution(args.candidate_sha, load_distribution(DISTRIBUTION_PATH))
        if args.regenerate:
            if not args.trusted_sha:
                raise CandidateError("--regenerate requires --trusted-sha")
            result["trustedRegeneration"] = regenerate_candidate_artifacts(args.candidate_sha, args.trusted_sha)
    except CandidateError as exc:
        raise SystemExit(f"release candidate rejected: {exc}") from exc
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8", newline="\n")
    print(rendered, end="")


if __name__ == "__main__":
    main()
