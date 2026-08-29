from __future__ import annotations

import json
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

    def test_refresh_removed_old_active_tree_names(self) -> None:
        # Root `shell/` is the POSIX bundle source tree (tools/shbundle.py), not the
        # pre-v2 runtime scripts that moved to setup/openclash/scripts/.
        for path in ("archive", "data", "generated", "py", "src", "schema", "templates", "site", "reports"):
            self.assertFalse((ROOT / path).exists(), path)
        for path in ("cfg", "rule", "dns", "setup", "internal", "tests", "web"):
            self.assertTrue((ROOT / path).exists(), path)


if __name__ == "__main__":
    unittest.main()
