"""Structural security checks for the AI profile generation workflow."""

from __future__ import annotations

from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "auto-generate-ai-profiles.yml"


class AiProfileWorkflowTests(unittest.TestCase):
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
        self.assertTrue(any(step["name"] == "Validate AI routing manifests" for step in validation_steps))
        self.assertTrue(any(step["name"] == "Generate repository outputs" for step in validation_steps))
        self.assertTrue(any(step["name"] == "Reject generated output drift in pull requests" for step in validation_steps))

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

    def test_scheduled_refresh_exports_shadow_before_routing_validation(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        steps = workflow["jobs"]["validate-ai-profiles"]["steps"]

        refresh_name = "Refresh shared upstream source lock on schedule"
        validate_name = "Validate AI routing manifests"
        refresh_index = next((index for index, step in enumerate(steps) if step["name"] == refresh_name), -1)
        validate_index = next((index for index, step in enumerate(steps) if step["name"] == validate_name), -1)
        self.assertGreaterEqual(refresh_index, 0)
        self.assertGreaterEqual(validate_index, 0)
        self.assertLess(refresh_index, validate_index)

        refresh_step = steps[refresh_index]
        self.assertEqual(refresh_step["if"], "github.event_name == 'schedule'")
        refresh_run = refresh_step["run"]
        self.assertNotIn("npm run export:routing-artifacts", refresh_run)
        self.assertNotIn("npm run export:shadow-profile", refresh_run)
        generation_index = next(
            index for index, step in enumerate(steps) if step["name"] == "Generate repository outputs"
        )
        self.assertGreater(generation_index, refresh_index)
        self.assertEqual(steps[generation_index]["run"], "make generate")


if __name__ == "__main__":
    unittest.main()
