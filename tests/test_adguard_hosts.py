from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "internal" / "python"))

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_adguard_home_plan
from ai_profiles.render.adguard import render_adguard_home
from ai_profiles.settings import BASE_URL


class AdGuardHostsTest(unittest.TestCase):
    def test_projection_preserves_exact_and_suffix_semantics(self) -> None:
        plan = compile_adguard_home_plan()
        rendered = render_adguard_home(plan)

        self.assertEqual(plan.output_file, "host.txt")
        lines = rendered.splitlines()
        self.assertIn("jules.google.com", lines)
        self.assertIn("jules.googleapis.com", lines)
        self.assertNotIn("||jules.google.com^", rendered)
        self.assertIn("||copilot.com^", rendered)
        self.assertIn("||notebooklm.google^", rendered)
        self.assertIn("generativelanguage.googleapis.com", lines)

    def test_projection_is_blocking_and_warns_when_snapshot_is_missing(self) -> None:
        rendered = render_adguard_home()
        self.assertIn("This file BLOCKS DNS names; it does not proxy or route traffic.", rendered)
        self.assertIn("checked-in upstream DLC snapshot", rendered)
        self.assertIn("WARNING: upstream snapshot is missing", rendered)
        # Missing snapshot must degrade to deterministic local deltas, not guess.
        self.assertNotIn("openai.com", rendered)
        self.assertNotIn("anthropic.com", rendered)
        self.assertNotIn("perplexity.ai", rendered)

    def test_filter_url_is_repo_hosted(self) -> None:
        rendered = render_adguard_home()
        self.assertIn(f"FILTER-URL: {BASE_URL}/rule/host.txt", rendered)

    def test_adguard_output_file_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            profile_path = catalog_dir / "profile.json"
            document = json.loads(profile_path.read_text(encoding="utf-8"))
            document["adguardHome"]["outputFile"] = "../hosts.txt"
            profile_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "must be a basename"):
                load_catalog(catalog_dir)

    def test_schema_v1_catalog_can_omit_adguard_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            profile_path = catalog_dir / "profile.json"
            document = json.loads(profile_path.read_text(encoding="utf-8"))
            document.pop("adguardHome")
            profile_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            catalog = load_catalog(catalog_dir)
            self.assertIsNone(catalog.adguard_home)
            with self.assertRaisesRegex(RuntimeError, "not configured"):
                compile_adguard_home_plan(catalog)

    def test_duplicate_local_rules_are_deduplicated_without_reordering(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            services_path = catalog_dir / "services.json"
            document = json.loads(services_path.read_text(encoding="utf-8"))
            jules = next(service for service in document["services"] if service["id"] == "jules")
            jules["payload"].append("DOMAIN,jules.google.com")
            services_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

            plan = compile_adguard_home_plan(load_catalog(catalog_dir))
            jules_rules = [rule for rule in plan.rules if rule.domain == "jules.google.com"]
            self.assertEqual(len(jules_rules), 1)


if __name__ == "__main__":
    unittest.main()
