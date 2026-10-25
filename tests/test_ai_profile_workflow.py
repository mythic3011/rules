"""Structural security checks for the AI profile generation workflow."""

from __future__ import annotations

from pathlib import Path
import unittest
from urllib.parse import urlsplit

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "auto-generate-ai-profiles.yml"


class AiProfileWorkflowTests(unittest.TestCase):
    def test_validation_watches_workspace_and_runner_inputs(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        events = workflow.get("on", workflow.get(True))
        for event in ("push", "pull_request"):
            with self.subTest(event=event):
                paths = events[event]["paths"]
                for dependency in (
                    "apps/profile-service/**", "pnpm-lock.yaml", "pnpm-workspace.yaml",
                    "mise.toml", "Makefile", "requirements*.txt",
                    "internal/config/rulesctl.json", "internal/python/rulesctl.py",
                    ".github/workflows/**",
                ):
                    self.assertIn(dependency, paths)

    def test_browser_validation_uses_local_wranger_and_stops_its_server(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        job = workflow["jobs"]["validate-ai-profiles"]
        steps = job["steps"]
        commands = [step.get("run", "") for step in steps]
        package_index = commands.index("mise run deploy:check")
        browser_index = next(index for index, command in enumerate(commands) if "playwright install" in command)
        test_index = next(index for index, command in enumerate(commands) if "mise run e2e" in command)
        self.assertLess(package_index, browser_index)
        self.assertLess(browser_index, test_index)
        self.assertIn("--with-deps chromium", commands[browser_index])

        browser_step = steps[test_index]
        target = urlsplit(browser_step["env"]["PROFILE_SERVICE_E2E_BASE_URL"])
        self.assertEqual(target.scheme, "http")
        self.assertIn(target.hostname, {"127.0.0.1", "localhost", "::1"})
        self.assertFalse(target.username or target.password or target.query or target.fragment)
        command = commands[test_index]
        self.assertIn("mise run dev", command)
        self.assertIn("--log-level error", command)
        self.assertIn("/api/v1/catalog", command)
        self.assertIn("kill -0", command)
        self.assertIn("trap '", command)
        self.assertIn('kill "$server_pid"', command)
        self.assertNotIn("--remote", command)
        self.assertNotIn("secrets.", str(job))

    def test_pr_validation_is_read_only_and_commit_is_trusted_event_only(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))

        self.assertEqual(workflow["permissions"], {"contents": "read"})
        jobs = workflow["jobs"]
        validation = jobs["validate-ai-profiles"]
        commit = jobs["commit-managed-python-outputs"]

        self.assertEqual(validation["permissions"], {"contents": "read"})
        self.assertEqual(commit["permissions"], {"contents": "write"})
        self.assertEqual(commit["needs"], "validate-ai-profiles")
        self.assertEqual(commit["if"], "github.event_name == 'push' || github.event_name == 'schedule'")

        validation_steps = validation["steps"]
        self.assertTrue(any(step["name"] == "Generate repository outputs" for step in validation_steps))
        self.assertTrue(any(step["name"] == "Validate generated outputs" for step in validation_steps))
        self.assertTrue(
            any(step["name"] == "Validate source tree and generated contracts" for step in validation_steps)
        )
        self.assertTrue(
            any(step["name"] == "Reject generated output drift in pull requests" for step in validation_steps)
        )

        drift_gate = next(
            step for step in validation_steps if step["name"] == "Reject generated output drift in pull requests"
        )
        self.assertEqual(drift_gate["if"], "github.event_name == 'pull_request'")

        commit_steps = commit["steps"]
        self.assertTrue(any(step["name"] == "Regenerate repository outputs" for step in commit_steps))
        scheduled_steps = [step for step in commit_steps if "on schedule" in step["name"].lower()]
        self.assertTrue(scheduled_steps)
        self.assertTrue(all(step.get("if") == "github.event_name == 'schedule'" for step in scheduled_steps))
        self.assertTrue(any(step["name"] == "Commit generated changes" for step in commit_steps))
        checkout = next(step for step in commit_steps if step["name"] == "Checkout pushed revision")
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")
        self.assertEqual(commit["env"]["TARGET_REF"], "${{ github.ref }}")
        commit_run = next(step["run"] for step in commit_steps if step["name"] == "Commit generated changes")
        self.assertIn("refs/heads/*", commit_run)
        self.assertIn('git push origin "HEAD:${TARGET_REF}"', commit_run)
        self.assertNotIn("--force", commit_run)

    def test_scheduled_refresh_generates_before_validating_and_pr_drift_gate(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        steps = workflow["jobs"]["validate-ai-profiles"]["steps"]

        names = [step["name"] for step in steps]
        refresh_name = "Refresh shared upstream source lock on schedule"
        generate_name = "Generate repository outputs"
        validate_generated_name = "Validate generated outputs"
        check_name = "Validate source tree and generated contracts"
        drift_gate_name = "Reject generated output drift in pull requests"

        for name in (refresh_name, generate_name, validate_generated_name, check_name, drift_gate_name):
            self.assertIn(name, names)

        refresh_index = names.index(refresh_name)
        generate_index = names.index(generate_name)
        validate_generated_index = names.index(validate_generated_name)
        check_index = names.index(check_name)
        drift_gate_index = names.index(drift_gate_name)

        self.assertLess(refresh_index, generate_index)
        self.assertLess(generate_index, validate_generated_index)
        self.assertLess(validate_generated_index, check_index)
        self.assertLess(check_index, drift_gate_index)

        refresh_step = steps[refresh_index]
        self.assertEqual(refresh_step["if"], "github.event_name == 'schedule'")
        refresh_run = refresh_step["run"]
        self.assertNotIn("npm run export:", refresh_run)

        self.assertEqual(steps[generate_index]["run"], "make generate")
        self.assertEqual(
            steps[validate_generated_index]["run"],
            "python3 internal/python/validate_generated_profiles.py",
        )
        self.assertEqual(steps[check_index]["run"], "make check-all")
        self.assertEqual(steps[drift_gate_index]["if"], "github.event_name == 'pull_request'")


if __name__ == "__main__":
    unittest.main()
