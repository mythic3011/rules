from __future__ import annotations

import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

from internal.python.ai_profiles.distribution import DistributionArtifact, DistributionCatalog


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "internal" / "python" / "verify_openclash_guard_release_candidate.py"
SPEC = importlib.util.spec_from_file_location("release_candidate_verifier", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
CandidateError = MODULE.CandidateError
verify_candidate_bytes = MODULE.verify_candidate_bytes


ARTIFACT_BYTES = {
    "dist/openclash-guard.sh": b"guard\n",
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


if __name__ == "__main__":
    unittest.main()
