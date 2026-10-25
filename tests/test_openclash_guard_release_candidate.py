from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from internal.python.ai_profiles.distribution import DistributionArtifact, DistributionCatalog


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "internal" / "python" / "verify_openclash_guard_release_candidate.py"
SPEC = importlib.util.spec_from_file_location("release_candidate_verifier", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
CandidateError = MODULE.CandidateError
verify_candidate_bytes = MODULE.verify_candidate_bytes
verify_generator_provenance = MODULE.verify_generator_provenance
verify_regenerated_artifacts = MODULE.verify_regenerated_artifacts
prepare_candidate_regeneration_inputs = MODULE.prepare_candidate_regeneration_inputs


ARTIFACT_BYTES = {
    "dist/openclash-guard.sh": b"guard\n",
    "dist/manifest.json": b"manifest\n",
    "dist/openclash-guard.sha256": b"checksum\n",
    "setup/openclash/install.sh": b"installer\n",
    "cfg/runtime/openclash-guard.json": b"{}\n",
    "cfg/runtime/openclash-guard-templates.json": b"{}\n",
}
KEYS = {
    "guardBundle": "dist/openclash-guard.sh",
    "bootstrapInstaller": "setup/openclash/install.sh",
    "runtimePolicy": "cfg/runtime/openclash-guard.json",
    "runtimeTemplates": "cfg/runtime/openclash-guard-templates.json",
}


def catalog(sequence: int = 4) -> DistributionCatalog:
    return DistributionCatalog(
        repository="mythic3011/rules",
        default_ref="main",
        bootstrap_alias="https://example.invalid/bootstrap",
        manifest_path="internal/generated/manifest.json",
        release_metadata_path="dist/openclash-guard.release.json",
        release_signature_path="dist/openclash-guard.release.json.sig",
        trusted_key_path="/etc/openclash-guard/trusted-release-key.pub",
        release_sequence=sequence,
        release_state_path="/etc/openclash-guard/release-state",
        artifacts=tuple(
            DistributionArtifact(role, path)
            for role, path in (
                ("guard-bundle", KEYS["guardBundle"]),
                ("guard-manifest", "dist/manifest.json"),
                ("guard-checksum", "dist/openclash-guard.sha256"),
                ("bootstrap-installer", KEYS["bootstrapInstaller"]),
                ("runtime-policy", KEYS["runtimePolicy"]),
                ("runtime-templates", KEYS["runtimeTemplates"]),
            )
        ),
        channels=(),
    )


def metadata_bytes(sequence: int, *, path_override: str | None = None) -> bytes:
    artifacts: dict[str, dict[str, object]] = {}
    for key, path in KEYS.items():
        payload = ARTIFACT_BYTES[path]
        artifacts[key] = {
            "path": path_override if key == "guardBundle" and path_override else path,
            "sha256": hashlib.sha256(payload).hexdigest(),
            "size": len(payload),
        }
    revision_payload = json.dumps(
        {"sequence": sequence, "artifacts": artifacts},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    document = {
        "schemaVersion": 1,
        "repository": "mythic3011/rules",
        "sequence": sequence,
        "revision": "sha256:" + hashlib.sha256(revision_payload).hexdigest(),
        "artifacts": artifacts,
    }
    return (json.dumps(document, indent=2, sort_keys=True) + "\n").encode("utf-8")


class ReleaseCandidateVerifierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.catalog = catalog()
        self.baseline = metadata_bytes(4)

    def verify(self, payload: bytes) -> dict[str, object]:
        return verify_candidate_bytes(
            metadata_bytes=payload,
            blob_loader=lambda path: ARTIFACT_BYTES[path],
            catalog=self.catalog,
            baseline_metadata_bytes=self.baseline,
        )

    def test_accepts_exactly_one_sequence_advance_with_matching_artifacts(self) -> None:
        result = self.verify(metadata_bytes(5))
        self.assertEqual(result["sequence"], 5)
        self.assertTrue(str(result["revision"]).startswith("sha256:"))

    def test_rejects_same_sequence_equivocation(self) -> None:
        altered = json.loads(self.baseline)
        altered["repository"] = "other/repo"
        payload = (json.dumps(altered, indent=2, sort_keys=True) + "\n").encode()
        with self.assertRaises(CandidateError):
            self.verify(payload)

    def test_rejects_sequence_jump(self) -> None:
        with self.assertRaises(CandidateError):
            self.verify(metadata_bytes(6))

    def test_rejects_artifact_path_change(self) -> None:
        with self.assertRaises(CandidateError):
            self.verify(metadata_bytes(5, path_override="dist/evil.sh"))

    def test_rejects_artifact_digest_mismatch(self) -> None:
        payload = json.loads(metadata_bytes(5))
        payload["artifacts"]["guardBundle"]["sha256"] = "0" * 64
        revision_payload = json.dumps(
            {"sequence": 5, "artifacts": payload["artifacts"]},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        payload["revision"] = "sha256:" + hashlib.sha256(revision_payload).hexdigest()
        rendered = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode()
        with self.assertRaisesRegex(CandidateError, "digest mismatch"):
            self.verify(rendered)

    def test_rejects_noncanonical_metadata_bytes(self) -> None:
        document = json.loads(metadata_bytes(5))
        compact = (json.dumps(document, sort_keys=True) + "\n").encode()
        with self.assertRaisesRegex(CandidateError, "not canonical"):
            self.verify(compact)

    def test_regeneration_compare_set_covers_every_catalog_role_and_release_metadata(self) -> None:
        candidate_sha = "b" * 40
        expected_blobs = {**ARTIFACT_BYTES, "dist/openclash-guard.release.json": b"release metadata\n"}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            trusted_root = root / "trusted"
            shell_root = root / "shell"
            runtime_root = root / "runtime"
            for artifact in self.catalog.artifacts:
                output_root = shell_root if artifact.role in MODULE.SHELL_ARTIFACT_ROLES else runtime_root
                output = output_root / artifact.path
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(expected_blobs[artifact.path])
            metadata_path = trusted_root / self.catalog.release_metadata_path
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            metadata_path.write_bytes(expected_blobs[self.catalog.release_metadata_path])

            result = verify_regenerated_artifacts(
                candidate_sha,
                trusted_root,
                shell_root,
                runtime_root,
                self.catalog,
                blob_loader=lambda _sha, path: expected_blobs[path],
            )

        self.assertEqual(result["comparedArtifactCount"], 7)
        self.assertIn("dist/manifest.json", result["comparedPaths"])
        self.assertIn("dist/openclash-guard.sha256", result["comparedPaths"])
        self.assertIn(self.catalog.release_metadata_path, result["comparedPaths"])

    def test_regeneration_rejects_guard_manifest_or_checksum_drift(self) -> None:
        candidate_sha = "b" * 40
        expected_blobs = {**ARTIFACT_BYTES, "dist/openclash-guard.release.json": b"release metadata\n"}
        for path in ("dist/manifest.json", "dist/openclash-guard.sha256"):
            with self.subTest(path=path), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                trusted_root = root / "trusted"
                shell_root = root / "shell"
                runtime_root = root / "runtime"
                for artifact in self.catalog.artifacts:
                    output_root = shell_root if artifact.role in MODULE.SHELL_ARTIFACT_ROLES else runtime_root
                    output = output_root / artifact.path
                    output.parent.mkdir(parents=True, exist_ok=True)
                    output.write_bytes(expected_blobs[artifact.path] + (b"changed" if artifact.path == path else b""))
                metadata_path = trusted_root / self.catalog.release_metadata_path
                metadata_path.parent.mkdir(parents=True, exist_ok=True)
                metadata_path.write_bytes(expected_blobs[self.catalog.release_metadata_path])
                with self.assertRaisesRegex(CandidateError, path):
                    verify_regenerated_artifacts(
                        candidate_sha,
                        trusted_root,
                        shell_root,
                        runtime_root,
                        self.catalog,
                        blob_loader=lambda _sha, candidate_path: expected_blobs[candidate_path],
                    )

    def test_candidate_distribution_cannot_redirect_signed_outputs(self) -> None:
        value = {
            "repository": self.catalog.repository,
            "releaseMetadataPath": self.catalog.release_metadata_path,
            "releaseSequence": self.catalog.release_sequence + 1,
            "artifacts": [
                {"role": artifact.role, "path": artifact.path}
                for artifact in self.catalog.artifacts
            ],
        }
        with patch.object(MODULE, "_git_blob", return_value=json.dumps(value).encode()):
            MODULE.validate_candidate_distribution("b" * 40, self.catalog)

        value["releaseMetadataPath"] = "../../outside.json"
        with patch.object(MODULE, "_git_blob", return_value=json.dumps(value).encode()):
            with self.assertRaisesRegex(CandidateError, "release metadata path"):
                MODULE.validate_candidate_distribution("b" * 40, self.catalog)

    def test_candidate_published_roles_and_metadata_must_be_regular_blobs(self) -> None:
        paths = MODULE._published_artifact_paths(self.catalog)
        entries = {path: ("100644", "blob", "a" * 40) for path in paths}
        MODULE.validate_candidate_published_files(
            "b" * 40,
            self.catalog,
            tree_loader=lambda _sha, _paths: entries,
        )

        symlink_path = "dist/openclash-guard.sh"
        entries[symlink_path] = ("120000", "blob", "b" * 40)
        with self.assertRaisesRegex(CandidateError, "not a regular file"):
            MODULE.validate_candidate_published_files(
                "b" * 40,
                self.catalog,
                tree_loader=lambda _sha, _paths: entries,
            )

        entries.pop(symlink_path)
        with self.assertRaisesRegex(CandidateError, "inventory differs"):
            MODULE.validate_candidate_published_files(
                "b" * 40,
                self.catalog,
                tree_loader=lambda _sha, _paths: entries,
            )


IMPLEMENTATION_FILES = (
    ".github/workflows/auto-generate-ai-profiles.yml",
    "Makefile",
    "mise.toml",
    "requirements-dev.txt",
    "rulesctl",
    "internal/schemas/openclash-guard-runtime.schema.json",
    "internal/python/generate_openclash_guard_runtime.py",
    "internal/python/generate_openclash_guard_release.py",
    "internal/python/ai_profiles/__init__.py",
    "tools/shbundle.py",
)
INPUT_FILES = (
    "shell/manifest.json",
    "shell/apps/openclash-guard/main.sh",
    "internal/config/ai-routing/catalogs/distribution.json",
    "internal/config/openclash-guard/templates.yaml",
    "setup/openclash/install.sh",
)


class GeneratorProvenanceTests(unittest.TestCase):
    trusted_sha = "a" * 40
    candidate_sha = "b" * 40

    def fixture(self, *, changed_path: str | None = None, added_path: str | None = None):
        trusted_entries = {path: ("100644", "blob", "0" * 40) for path in IMPLEMENTATION_FILES}
        candidate_entries = dict(trusted_entries)
        blobs = {
            (self.trusted_sha, path): f"trusted:{path}".encode()
            for path in IMPLEMENTATION_FILES
        }
        blobs.update({(self.candidate_sha, path): f"trusted:{path}".encode() for path in IMPLEMENTATION_FILES})
        if changed_path:
            blobs[(self.candidate_sha, changed_path)] = b"open('candidate-code-ran').write('bad')\n"
        if added_path:
            candidate_entries[added_path] = ("100644", "blob", "1" * 40)
            blobs[(self.candidate_sha, added_path)] = b"open('candidate-code-ran').write('bad')\n"
        trees = {self.trusted_sha: trusted_entries, self.candidate_sha: candidate_entries}
        return trees, blobs

    def test_accepts_only_identical_full_generator_file_set_and_bytes(self) -> None:
        trees, blobs = self.fixture()
        result = verify_generator_provenance(
            self.candidate_sha,
            self.trusted_sha,
            tree_loader=lambda ref, _paths: trees[ref],
            blob_loader=lambda ref, path: blobs[(ref, path)],
        )
        self.assertEqual(result["trustedSha"], self.trusted_sha)
        self.assertEqual(result["implementationFileCount"], len(IMPLEMENTATION_FILES))

    def test_rejects_modified_makefile_rulesctl_and_generator_without_running_them(self) -> None:
        for path in ("Makefile", "rulesctl", "tools/shbundle.py", "internal/python/generate_openclash_guard_runtime.py"):
            with self.subTest(path=path):
                trees, blobs = self.fixture(changed_path=path)
                with self.assertRaisesRegex(CandidateError, "changes trusted generator implementation"):
                    verify_generator_provenance(
                        self.candidate_sha,
                        self.trusted_sha,
                        tree_loader=lambda ref, _paths: trees[ref],
                        blob_loader=lambda ref, candidate_path: blobs[(ref, candidate_path)],
                    )
                self.assertFalse((Path.cwd() / "candidate-code-ran").exists())

    def test_rejects_added_import_hook_and_mode_change(self) -> None:
        trees, blobs = self.fixture(added_path="internal/python/ai_profiles/sitecustomize.py")
        with self.assertRaisesRegex(CandidateError, "file set differs"):
            verify_generator_provenance(
                self.candidate_sha,
                self.trusted_sha,
                tree_loader=lambda ref, _paths: trees[ref],
                blob_loader=lambda ref, path: blobs[(ref, path)],
            )

    def test_rejects_generator_symlinks(self) -> None:
        trees, blobs = self.fixture()
        entries = dict(trees[self.candidate_sha])
        entries["rulesctl"] = ("120000", "blob", "3" * 40)
        trees[self.candidate_sha] = entries
        with self.assertRaisesRegex(CandidateError, "symlink or non-regular"):
            verify_generator_provenance(
                self.candidate_sha,
                self.trusted_sha,
                tree_loader=lambda ref, _paths: trees[ref],
                blob_loader=lambda ref, path: blobs[(ref, path)],
            )

        trees, blobs = self.fixture()
        entries = dict(trees[self.candidate_sha])
        entries["tools/shbundle.py"] = ("100755", "blob", "0" * 40)
        trees[self.candidate_sha] = entries
        with self.assertRaisesRegex(CandidateError, "changes trusted generator implementation"):
            verify_generator_provenance(
                self.candidate_sha,
                self.trusted_sha,
                tree_loader=lambda ref, _paths: trees[ref],
                blob_loader=lambda ref, path: blobs[(ref, path)],
            )

    def test_preparation_copies_only_trusted_code_and_candidate_regular_data(self) -> None:
        trees, blobs = self.fixture()
        trusted_tree = dict(trees[self.trusted_sha])
        candidate_tree = dict(trees[self.candidate_sha])
        data_payloads = {
            path: b"#!/bin/sh\ntouch candidate-code-ran\n" if path.endswith(".sh") else b"{}\n"
            for path in INPUT_FILES
        }
        candidate_tree.update({path: ("100644", "blob", "2" * 40) for path in INPUT_FILES})
        trees[self.trusted_sha] = trusted_tree
        trees[self.candidate_sha] = candidate_tree
        blobs.update({(self.candidate_sha, path): payload for path, payload in data_payloads.items()})

        def tree_loader(ref, pathspecs):
            entries = trees[ref]
            if pathspecs == MODULE.CANDIDATE_INPUT_PATHS:
                return {
                    path: entry
                    for path, entry in entries.items()
                    if path.startswith(("shell/", "internal/config/ai-routing/", "internal/config/openclash-guard/"))
                    or path in MODULE.CANDIDATE_SOURCE_ARTIFACT_PATHS
                }
            return {path: entry for path, entry in entries.items() if path in IMPLEMENTATION_FILES}

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            trusted_root = root / "trusted"
            shell_root = root / "shell-data"
            prepare_candidate_regeneration_inputs(
                self.candidate_sha,
                self.trusted_sha,
                trusted_root,
                shell_root,
                tree_loader=tree_loader,
                blob_loader=lambda ref, path: blobs[(ref, path)],
            )
            self.assertEqual(
                (trusted_root / "internal/python/generate_openclash_guard_runtime.py").read_bytes(),
                b"trusted:internal/python/generate_openclash_guard_runtime.py",
            )
            self.assertEqual((shell_root / "shell/apps/openclash-guard/main.sh").read_bytes(), data_payloads["shell/apps/openclash-guard/main.sh"])
            self.assertEqual((shell_root / "setup/openclash/install.sh").read_bytes(), data_payloads["setup/openclash/install.sh"])
            self.assertEqual((trusted_root / "internal/config/ai-routing/catalogs/distribution.json").read_bytes(), data_payloads["internal/config/ai-routing/catalogs/distribution.json"])
            self.assertFalse((trusted_root / "rulesctl").exists())
            self.assertFalse((trusted_root / "Makefile").exists())
            self.assertFalse((root / "candidate-code-ran").exists())


class ScratchPathTests(unittest.TestCase):
    def test_relative_paths_must_be_canonical_and_control_free(self) -> None:
        for path in (".", "./file", "a/./b", "a//b", "../file", "a/../b", "a\\b", "a\nb"):
            with self.subTest(path=path):
                self.assertFalse(MODULE._safe_relative_path(path))
        self.assertTrue(MODULE._safe_relative_path("internal/config/catalog.json"))

    def test_scratch_path_rejects_symlinked_parent_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "root"
            outside = Path(temporary) / "outside"
            root.mkdir()
            outside.mkdir()
            (root / "linked").symlink_to(outside, target_is_directory=True)

            with self.assertRaisesRegex(CandidateError, "symlink"):
                MODULE._scratch_path(root, "linked/output.bin", create_parents=True)

            self.assertFalse((outside / "output.bin").exists())


if __name__ == "__main__":
    unittest.main()
