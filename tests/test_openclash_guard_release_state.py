from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from ai_profiles.distribution import load_distribution
from ai_profiles.settings import AI_DISTRIBUTION_PATH

ROOT = Path(__file__).resolve().parents[1]
DISTRIBUTION = ROOT / "shell" / "lib" / "distribution.sh"
INSTALL = ROOT / "shell" / "apps" / "openclash-guard" / "install.sh"


class OpenClashGuardReleaseStateTests(unittest.TestCase):
    def run_shell(self, body: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", "-c", body],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def test_release_metadata_matches_current_generated_bytes(self) -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        release = json.loads((ROOT / catalog.release_metadata_path).read_text(encoding="utf-8"))
        self.assertEqual(release["schemaVersion"], 1)
        self.assertEqual(release["repository"], catalog.repository)
        self.assertEqual(release["sequence"], catalog.release_sequence)
        self.assertRegex(release["revision"], r"^sha256:[0-9a-f]{64}$")
        mapping = {
            "guardBundle": "guard-bundle",
            "bootstrapInstaller": "bootstrap-installer",
            "runtimePolicy": "runtime-policy",
            "runtimeTemplates": "runtime-templates",
        }
        for key, role in mapping.items():
            relative = catalog.artifact(role).path
            payload = (ROOT / relative).read_bytes()
            self.assertEqual(release["artifacts"][key]["path"], relative)
            self.assertEqual(
                release["artifacts"][key]["sha256"],
                hashlib.sha256(payload).hexdigest(),
            )
            self.assertEqual(release["artifacts"][key]["size"], len(payload))

    def _state(self, path: Path, sequence: int = 8, revision: str = "sha256:old") -> None:
        path.write_text(
            "schemaVersion=1\n"
            f"highestSequence={sequence}\n"
            f"highestRevision={revision}\n"
            "signerFingerprint=key\n"
            f"remoteBundleSha256={'a' * 64}\n"
            f"remoteBootstrapSha256={'b' * 64}\n"
            f"remotePolicySha256={'c' * 64}\n"
            f"remoteTemplatesSha256={'d' * 64}\n",
            encoding="utf-8",
        )

    def _check_state(self, state: Path, sequence: int, revision: str) -> subprocess.CompletedProcess[str]:
        script = f'''\
set -eu
. "{DISTRIBUTION}"
GUARD_RELEASE_STATE_FILE="{state}"
_GUARD_RELEASE_SEQUENCE={sequence}
_GUARD_RELEASE_REVISION={revision}
_GUARD_RELEASE_KEY_FINGERPRINT=key
_GUARD_RELEASE_BUNDLE_SHA256={'a' * 64}
_GUARD_RELEASE_BOOTSTRAP_SHA256={'b' * 64}
_GUARD_RELEASE_POLICY_SHA256={'c' * 64}
_GUARD_RELEASE_TEMPLATES_SHA256={'d' * 64}
rc=0
guard_distribution_check_release_state || rc=$?
printf 'rc=%s state=%s reason=%s\n' "$rc" "$_GUARD_RELEASE_STATE" "$_GUARD_RELEASE_STATE_REASON"
'''
        return self.run_shell(script)

    def test_lower_signed_sequence_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "release-state"
            self._state(state)
            result = self._check_state(state, 7, "sha256:new")
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("rc=1", result.stdout)
            self.assertIn("state=rollback-rejected", result.stdout)

    def test_same_sequence_different_revision_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "release-state"
            self._state(state)
            result = self._check_state(state, 8, "sha256:new")
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("rc=1", result.stdout)
            self.assertIn("state=equivocation-rejected", result.stdout)

    def test_integrity_check_is_network_free_and_detects_local_change(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            etc = root / "etc/openclash-guard"
            binary = root / "usr/bin/openclash-guard"
            policy = etc / "openclash-guard.json"
            templates = etc / "openclash-guard-templates.json"
            for file, payload in (
                (binary, b"bundle\n"),
                (policy, b"policy\n"),
                (templates, b"templates\n"),
            ):
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(payload)
            digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
            state = etc / "release-state"
            state.write_text(
                "schemaVersion=1\n"
                "highestSequence=9\n"
                "highestRevision=sha256:receipt\n"
                f"installedBundleSha256={digest(binary)}\n"
                f"installedPolicySha256={digest(policy)}\n"
                f"installedTemplatesSha256={digest(templates)}\n",
                encoding="utf-8",
            )
            script = f'''\
set -eu
file_sha256() {{ sha256sum "$1" | awk '{{print $1}}'; }}
cli_section() {{ :; }}
cli_kv() {{ printf '%s=%s\n' "$1" "$2"; }}
cli_warn() {{ :; }}
. "{DISTRIBUTION}"
. "{INSTALL}"
GUARD_PREFIX="{root}"
_GUARD_JSON=0
_guard_policy_default_path() {{ printf '%s\n' "{policy}"; }}
_guard_template_catalog_path() {{ printf '%s\n' "{templates}"; }}
fetch_http() {{ echo NETWORK-CALLED >&2; return 99; }}
guard_distribution_fetch_release() {{ echo NETWORK-CALLED >&2; return 99; }}
_guard_install_integrity_check
'''
            first = self.run_shell(script)
            self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
            self.assertIn("status=verified", first.stdout)
            self.assertNotIn("NETWORK-CALLED", first.stderr)
            binary.write_text("tampered\n", encoding="utf-8")
            second = self.run_shell(script)
            self.assertEqual(second.returncode, 1, second.stderr + second.stdout)
            self.assertIn("status=modified", second.stdout)
            self.assertIn("bundle=modified", second.stdout)
            self.assertNotIn("NETWORK-CALLED", second.stderr)


if __name__ == "__main__":
    unittest.main()
