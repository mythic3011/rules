import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps" / "profile-service"
DEPLOY_TARGET = "https://github.com/mythic3011/rules/tree/main/apps/profile-service"


class ProfileServiceDeployContractTest(unittest.TestCase):
    def test_root_readme_has_cloudflare_deploy_button_for_isolated_app(self):
        text = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("https://deploy.workers.cloudflare.com/button", text)
        self.assertIn(f"https://deploy.workers.cloudflare.com/?url={DEPLOY_TARGET}", text)

    def test_profile_service_is_self_contained_for_subdirectory_deploy(self):
        for path in (
            APP / "package.json",
            APP / "package-lock.json",
            APP / "wrangler.jsonc",
            APP / "worker" / "index.mjs",
            APP / "public" / "index.html",
            APP / "migrations" / "0001_profiles.sql",
        ):
            self.assertTrue(path.is_file(), path)

    def test_deploy_script_applies_d1_migrations(self):
        package = json.loads((APP / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]
        self.assertIn("d1 migrations apply DB --remote", scripts["db:migrate"])
        self.assertTrue(scripts["deploy"].startswith("npm run db:migrate"))

    def test_wrangler_uses_auto_provisionable_d1_and_write_limiter(self):
        config = json.loads((APP / "wrangler.jsonc").read_text(encoding="utf-8"))
        databases = config["d1_databases"]
        self.assertEqual(databases[0]["binding"], "DB")
        self.assertNotIn("database_id", databases[0])
        limiters = {item["name"]: item for item in config["ratelimits"]}
        self.assertEqual(limiters["PROFILE_WRITE_LIMITER"]["simple"], {"limit": 10, "period": 60})


if __name__ == "__main__":
    unittest.main()
