import json
import tomllib
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps" / "profile-service"


class ProfileServiceDeployContractTest(unittest.TestCase):
    def test_github_deployment_is_manual_and_scoped_to_the_default_branch(self):
        workflow = yaml.safe_load((ROOT / ".github/workflows/deploy-profile-service.yml").read_text(encoding="utf-8"))
        events = workflow.get("on", workflow.get(True))
        self.assertEqual(set(events), {"workflow_dispatch"})
        self.assertEqual(workflow["permissions"], {"contents": "read"})
        self.assertIs(workflow["concurrency"]["cancel-in-progress"], False)
        job = workflow["jobs"]["deploy"]
        self.assertEqual(job["environment"], "profile-service-production")
        self.assertIn("github.ref == format('refs/heads/{0}', github.event.repository.default_branch)", job["if"])
        steps = job["steps"]
        checkout = next(step for step in steps if step.get("uses", "").startswith("actions/checkout@"))
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")
        self.assertIs(checkout["with"]["persist-credentials"], False)
        setup = next(step for step in steps if step.get("uses", "").startswith("jdx/mise-action@"))
        self.assertIs(setup["with"]["cache"], False)
        validate_index = next(index for index, step in enumerate(steps) if step.get("run") == "mise run ci")
        deploy_index = next(index for index, step in enumerate(steps) if "mise run deploy" in step.get("run", ""))
        self.assertLess(validate_index, deploy_index)
        self.assertNotIn("secrets.", str(steps[:deploy_index]))
        deploy = steps[deploy_index]
        for name in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"):
            self.assertEqual(deploy["env"][name], "${{ secrets." + name + " }}")
        self.assertIn('exit 1', deploy["run"])

    def test_profile_service_uses_the_canonical_pinned_pnpm_workspace(self):
        for path in (
            APP / "package.json",
            APP / "wrangler.jsonc",
            APP / "worker" / "index.mjs",
            APP / "public" / "index.html",
            APP / "migrations" / "0001_profiles.sql",
            ROOT / "pnpm-workspace.yaml",
            ROOT / "pnpm-lock.yaml",
            ROOT / "mise.toml",
        ):
            self.assertTrue(path.is_file(), path)

        package = json.loads((APP / "package.json").read_text(encoding="utf-8"))
        workspace = yaml.safe_load((ROOT / "pnpm-workspace.yaml").read_text(encoding="utf-8"))
        lock = yaml.safe_load((ROOT / "pnpm-lock.yaml").read_text(encoding="utf-8"))
        relative_app = APP.relative_to(ROOT).as_posix()
        self.assertIn(relative_app, workspace["packages"])
        self.assertIn(relative_app, lock["importers"])

        tools = tomllib.loads((ROOT / "mise.toml").read_text(encoding="utf-8"))["tools"]
        self.assertTrue(tools.get("node"))
        self.assertTrue(tools.get("pnpm"))
        self.assertEqual(package["engines"]["node"], ">=22")

    def test_deploy_scripts_share_the_workspace_deployment_entrypoint(self):
        package = json.loads((APP / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]
        self.assertEqual(scripts["deploy"], "node tools/deploy.mjs")
        self.assertEqual(scripts["deploy:check"], "node tools/deploy.mjs --dry-run")
        self.assertEqual(scripts["deploy:setup"], "node tools/deploy.mjs --setup-only")
        self.assertNotIn("&&", scripts["deploy"])
        self.assertNotIn("wrangler deploy", scripts["deploy"])

        root_tasks = tomllib.loads((ROOT / "mise.toml").read_text(encoding="utf-8"))["tasks"]
        for task_name in ("deploy:login", "deploy:check", "deploy:setup", "deploy"):
            with self.subTest(task=task_name):
                command = root_tasks[task_name]["run"]
                self.assertIn(f"pnpm --filter {package['name']}", command)
        self.assertEqual(
            root_tasks["deploy:check"]["run"],
            f"pnpm --filter {package['name']} deploy:check",
        )
        self.assertEqual(
            root_tasks["deploy:setup"]["run"],
            f"pnpm --filter {package['name']} deploy:setup",
        )

    def test_root_readme_does_not_offer_the_unsupported_subdirectory_deploy_button(self):
        text = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertNotIn("deploy.workers.cloudflare.com", text)

    def test_wrangler_config_has_one_source_defined_d1_and_protected_observability(self):
        config = json.loads((APP / "wrangler.jsonc").read_text(encoding="utf-8"))
        databases = [database for database in config["d1_databases"] if database.get("binding") == "DB"]
        self.assertEqual(len(databases), 1)
        self.assertTrue(databases[0].get("database_name"))
        self.assertTrue(databases[0].get("migrations_dir"))
        if "database_id" in databases[0]:
            self.assertIsInstance(databases[0]["database_id"], str)
            self.assertTrue(databases[0]["database_id"])
        self.assertIs(config.get("keep_vars"), True)
        self.assertIs(config["observability"]["logs"].get("invocation_logs"), False)
        self.assertIs(config["observability"]["traces"].get("enabled"), False)

        limiters = config.get("ratelimits", [])
        self.assertTrue(limiters)
        for limiter in limiters:
            simple = limiter.get("simple", {})
            self.assertIsInstance(simple.get("limit"), int)
            self.assertGreater(simple["limit"], 0)
            self.assertIsInstance(simple.get("period"), int)
            self.assertGreater(simple["period"], 0)


if __name__ == "__main__":
    unittest.main()
