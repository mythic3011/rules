from __future__ import annotations

from datetime import datetime, timezone
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
from ai_profiles.upstream_hosts import refresh_upstream_host_snapshot, resolve_domain_lists


class UpstreamHostSnapshotTest(unittest.TestCase):
    def test_recursive_dlc_resolution_preserves_full_vs_suffix_and_dedupes(self) -> None:
        documents = {
            "https://example.test/data/category-ai": "include:openai\nfull:api.example.ai\nroot.ai\n",
            "https://example.test/data/openai": "openai.com\nfull:api.example.ai\nregexp:^chatgpt-.*\\.example\\.com$\n",
        }
        entries = resolve_domain_lists(
            base_url="https://example.test/data",
            root_lists=("category-ai",),
            fetch_text=documents.__getitem__,
        )
        self.assertEqual(
            [(entry.kind, entry.domain) for entry in entries],
            [
                ("suffix", "openai.com"),
                ("exact", "api.example.ai"),
                ("regex", r"^chatgpt-.*\.example\.com$"),
                ("suffix", "root.ai"),
            ],
        )

    def test_snapshot_refresh_is_explicit_and_then_materialized_into_host_filter(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            profile_path = catalog_dir / "profile.json"
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            profile["adguardHome"]["upstreamBaseUrl"] = "https://example.test/data"
            profile["adguardHome"]["upstreamLists"] = ["category-ai"]
            profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

            documents = {
                "https://example.test/data/category-ai": "include:provider\nfull:api.ai.test\n",
                "https://example.test/data/provider": "provider.ai\n",
            }
            path = refresh_upstream_host_snapshot(
                catalog_dir=catalog_dir,
                fetch_text=documents.__getitem__,
                now=datetime(2026, 8, 24, tzinfo=timezone.utc),
            )
            self.assertTrue(path.exists())

            plan = compile_adguard_home_plan(load_catalog(catalog_dir))
            rendered = render_adguard_home(plan)
            self.assertIn("||provider.ai^", rendered)
            self.assertIn("api.ai.test", rendered.splitlines())
            self.assertIn("UPSTREAM-REFRESHED-AT: 2026-08-24T00:00:00Z", rendered)

    def test_attributed_include_is_rejected_instead_of_broadening_snapshot(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "Attributed upstream include"):
            resolve_domain_lists(
                base_url="https://example.test/data",
                root_lists=("root",),
                fetch_text=lambda _: "include:provider@cn\n",
            )

    def test_refresh_is_noop_when_materialized_coverage_is_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            profile_path = catalog_dir / "profile.json"
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            profile["adguardHome"]["upstreamBaseUrl"] = "https://example.test/data"
            profile["adguardHome"]["upstreamLists"] = ["category-ai"]
            profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            fetch = lambda _: "example.ai\n"
            path = refresh_upstream_host_snapshot(
                catalog_dir=catalog_dir, fetch_text=fetch,
                now=datetime(2026, 8, 24, tzinfo=timezone.utc),
            )
            first = path.read_text(encoding="utf-8")
            refresh_upstream_host_snapshot(
                catalog_dir=catalog_dir, fetch_text=fetch,
                now=datetime(2026, 8, 25, tzinfo=timezone.utc),
            )
            self.assertEqual(path.read_text(encoding="utf-8"), first)


if __name__ == "__main__":
    unittest.main()
