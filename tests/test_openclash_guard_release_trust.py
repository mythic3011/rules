from __future__ import annotations

import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISTRIBUTION = ROOT / "shell" / "lib" / "distribution.sh"
INSTALL = ROOT / "shell" / "apps" / "openclash-guard" / "install.sh"
BOOTSTRAP = ROOT / "setup" / "openclash" / "install.sh"


class OpenClashGuardReleaseTrustTests(unittest.TestCase):
    def run_shell(self, body: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", "-c", body],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def test_release_signature_requires_local_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            metadata = root / "release.json"
            sig = root / "release.json.sig"
            metadata.write_text("{}\n")
            sig.write_text("sig\n")
            script = f'''\
set -eu
. "{DISTRIBUTION}"
GUARD_TRUSTED_RELEASE_KEY="{root / 'missing.pub'}"
usign() {{ return 0; }}
rc=0
guard_distribution_verify_release "{metadata}" "{sig}" || rc=$?
printf 'rc=%s\n' "$rc"
'''
            result = self.run_shell(script)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("rc=126", result.stdout)

    def test_release_signature_uses_pinned_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            metadata = root / "release.json"
            sig = root / "release.json.sig"
            key = root / "trusted.pub"
            metadata.write_text("{}\n")
            sig.write_text("sig\n")
            key.write_text("pub\n")
            script = f'''\
set -eu
. "{DISTRIBUTION}"
GUARD_TRUSTED_RELEASE_KEY="{key}"
usign() {{
    [ "$1" = -V ] || return 90
    seen=0
    while [ "$#" -gt 0 ]; do
        if [ "$1" = -p ]; then
            shift
            [ "$1" = "{key}" ] || return 91
            seen=1
        fi
        shift || true
    done
    [ "$seen" = 1 ]
}}
guard_distribution_verify_release "{metadata}" "{sig}"
'''
            result = self.run_shell(script)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def test_version_check_never_fetches_or_executes_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            installed = root / "usr/bin/openclash-guard"
            installed.parent.mkdir(parents=True)
            installed.write_text("local-runtime\n")
            digest = hashlib.sha256(installed.read_bytes()).hexdigest()
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
guard_distribution_fetch_bundle() {{ echo bundle-fetch-called >&2; return 99; }}
guard_distribution_fetch_release() {{
    _GUARD_RELEASE_SIGNATURE_STATE=verified
    _GUARD_RELEASE_BUNDLE_SHA256="{digest}"
    _GUARD_RELEASE_SEQUENCE=7
    _GUARD_RELEASE_REVISION=deadbeef
    _GUARD_RELEASE_SOURCE=github-raw
    _GUARD_RELEASE_KEY_FINGERPRINT=0123456789abcdef
    return 0
}}
_guard_distribution_trusted_key() {{ printf '%s\n' /trusted/release.pub; }}
_guard_install_check_version
'''
            result = self.run_shell(script)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("status=current", result.stdout)
            self.assertNotIn("bundle-fetch-called", result.stderr)

    def test_bootstrap_chains_release_state_check_with_shell_continuation(self) -> None:
        lines = BOOTSTRAP.read_text().splitlines()
        verify_idx = next(
            i for i, line in enumerate(lines)
            if 'verify_release "$TMP.release" "$TMP.release.sig"' in line
        )
        self.assertTrue(lines[verify_idx].rstrip().endswith('|| \\'))
        self.assertEqual(
            lines[verify_idx + 1].strip(),
            '! check_release_state "$TMP.release"; then',
        )
        result = subprocess.run(
            ["/bin/sh", "-n", str(BOOTSTRAP)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_hash_verification_rejects_tamper(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "artifact"
            path.write_text("expected\n")
            expected = hashlib.sha256(path.read_bytes()).hexdigest()
            path.write_text("tampered\n")
            script = f'''\
set -eu
file_sha256() {{ sha256sum "$1" | awk '{{print $1}}'; }}
. "{DISTRIBUTION}"
rc=0
guard_distribution_verify_hash "{path}" "{expected}" || rc=$?
printf 'rc=%s\n' "$rc"
'''
            result = self.run_shell(script)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("rc=1", result.stdout)


if __name__ == "__main__":
    unittest.main()
