from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PublicCatalogTest(unittest.TestCase):
    def test_catalog_profile_ids_are_unique_and_paths_exist(self) -> None:
        catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
        profiles = catalog["profiles"]
        ids = [item["id"] for item in profiles]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn("ai-balanced", ids)
        for item in profiles:
            path = item["path"]
            self.assertTrue(path.startswith("cfg/"), path)
            self.assertTrue((ROOT / path).is_file(), path)

    def test_public_roots_are_explicit(self) -> None:
        catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(
            catalog["publicSurfaces"],
            {"profiles": "cfg/", "rules": "rule/", "dns": "dns/"},
        )

    def test_openclash_installer_uses_published_yaml_only(self) -> None:
        script = (ROOT / "setup/openclash/install.sh").read_text(encoding="utf-8")
        self.assertIn("cfg/yaml/Custom_Clash_AI.yaml", script)
        self.assertIn("cfg/yaml/Custom_Clash_AI_Strict.yaml", script)
        self.assertNotIn("uci set", script)
        self.assertNotIn("/etc/init.d/openclash restart", script)

    def test_openclash_installer_forwards_lifecycle_operations(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            tmp = Path(raw_tmp)
            guard = tmp / "openclash-guard"
            log = tmp / "forwarded-args"
            guard.write_text(
                "#!/bin/sh\nset -eu\nprintf '%s\\n' \"$@\" > \"$GUARD_FORWARD_LOG\"\n",
                encoding="utf-8",
            )
            guard.chmod(0o755)
            env = os.environ.copy()
            env.update(
                {
                    "OPENCLASH_GUARD_BIN": str(guard),
                    "GUARD_FORWARD_LOG": str(log),
                }
            )

            health = subprocess.run(
                ["/bin/sh", str(ROOT / "setup/openclash/install.sh"), "--health-check"],
                cwd=ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(health.returncode, 0, health.stderr)
            self.assertEqual(log.read_text(encoding="utf-8").splitlines(), ["health-check"])

            uninstall = subprocess.run(
                [
                    "/bin/sh",
                    str(ROOT / "setup/openclash/install.sh"),
                    "--uninstall",
                    "--yes",
                    "--purge-rules",
                ],
                cwd=ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(uninstall.returncode, 0, uninstall.stderr)
            self.assertEqual(
                log.read_text(encoding="utf-8").splitlines(),
                ["uninstall", "--yes", "--purge-rules"],
            )

    def test_openclash_installer_rejects_unscoped_rule_purge(self) -> None:
        result = subprocess.run(
            ["/bin/sh", str(ROOT / "setup/openclash/install.sh"), "--purge-rules"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("requires --uninstall", result.stderr)

    def test_refresh_removed_old_active_tree_names(self) -> None:
        # Root `shell/` is the POSIX bundle source tree (tools/shbundle.py), not the
        # pre-v2 runtime scripts that moved to setup/openclash/scripts/.
        for path in ("archive", "data", "generated", "py", "src", "schema", "templates", "site", "reports"):
            self.assertFalse((ROOT / path).exists(), path)
        for path in ("cfg", "rule", "dns", "setup", "internal", "tests", "web"):
            self.assertTrue((ROOT / path).exists(), path)

    def test_shell_source_tree_is_not_a_published_runtime(self) -> None:
        root = ROOT / "shell"
        self.assertTrue((root / "manifest.json").is_file())
        self.assertEqual(list(root.glob("*.sh")), [])


if __name__ == "__main__":
    unittest.main()
