from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps/profile-service"


class ProfileServiceLayoutTest(unittest.TestCase):
    def test_worker_assets_and_d1_migration_are_present(self) -> None:
        for path in (
            APP / "worker/index.mjs",
            APP / "worker/solver.mjs",
            APP / "worker/render.mjs",
            APP / "worker/generated/runtime-data.mjs",
            APP / "public/index.html",
            APP / "public/app.js",
            APP / "migrations/0001_profiles.sql",
            APP / "wrangler.jsonc",
        ):
            self.assertTrue(path.is_file(), path)

    def test_wrangler_routes_only_api_and_subscription_through_worker_first(self) -> None:
        config = json.loads((APP / "wrangler.jsonc").read_text(encoding="utf-8"))
        assets = config["assets"]
        self.assertEqual(assets["not_found_handling"], "single-page-application")
        self.assertEqual(set(assets["run_worker_first"]), {"/api/*", "/p/*"})
        self.assertEqual(assets["binding"], "ASSETS")

    def test_subscription_contract_is_opaque_ini(self) -> None:
        worker = (APP / "worker/index.mjs").read_text(encoding="utf-8")
        self.assertIn("/p/", worker)
        self.assertIn("\\.ini$", worker)
        self.assertNotIn("searchParams.get(\"disable\")", worker)
        self.assertNotIn("searchParams.get('disable')", worker)

    def test_static_ui_has_no_third_party_script_dependency(self) -> None:
        html = (APP / "public/index.html").read_text(encoding="utf-8")
        scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
        self.assertEqual(scripts, ["/app.js"])
        headers = (APP / "public/_headers").read_text(encoding="utf-8")
        self.assertIn("Content-Security-Policy:", headers)
        self.assertIn("default-src 'self'", headers)

    def test_repository_layout_exposes_profile_service_as_app_not_public_artifact_root(self) -> None:
        catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
        self.assertNotIn("apps", catalog["publicSurfaces"].values())
        self.assertTrue((ROOT / "apps/profile-service").is_dir())


if __name__ == "__main__":
    unittest.main()
