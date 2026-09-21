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
        checkout = next(step for step in commit_steps if step["name"] == "Checkout pushed revision")
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")
        self.assertEqual(commit["env"]["TARGET_REF"], "${{ github.ref }}")

        writer = next(
            step
            for step in commit_steps
            if step["name"] == "Synchronize, regenerate, validate, and commit managed outputs"
        )
        writer_run = writer["run"]
        self.assertIn("refs/heads/*", writer_run)
        self.assertIn('git fetch --no-tags origin "$TARGET_REF"', writer_run)
        self.assertIn("git reset --hard FETCH_HEAD", writer_run)
        self.assertIn("make generate", writer_run)
        self.assertIn("python3 internal/python/validate_generated_profiles.py", writer_run)
        self.assertIn("make check-all", writer_run)
        self.assertIn("--audit-rule-coverage", writer_run)
        self.assertIn('git push origin "HEAD:${TARGET_REF}"', writer_run)
        self.assertIn("max_attempts=3", writer_run)
        self.assertNotIn("--force", writer_run)
        self.assertNotIn("--force-with-lease", writer_run)

    def test_trusted_writer_revalidates_latest_target_before_each_push_attempt(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        commit_steps = workflow["jobs"]["commit-managed-python-outputs"]["steps"]
        writer = next(
            step
            for step in commit_steps
            if step["name"] == "Synchronize, regenerate, validate, and commit managed outputs"
        )
        run = writer["run"]

        fetch_index = run.index('git fetch --no-tags origin "$TARGET_REF"')
        reset_index = run.index("git reset --hard FETCH_HEAD")
        generate_index = run.index("make generate")
        validate_index = run.index("python3 internal/python/validate_generated_profiles.py")
        check_index = run.index("make check-all")
        commit_index = run.index('git commit -m "chore(generated): refresh managed outputs"')
        push_index = run.index('git push origin "HEAD:${TARGET_REF}"')

        self.assertLess(fetch_index, reset_index)
        self.assertLess(reset_index, generate_index)
        self.assertLess(generate_index, validate_index)
        self.assertLess(validate_index, check_index)
        self.assertLess(check_index, commit_index)
        self.assertLess(commit_index, push_index)
        self.assertIn("while [ \"$attempt\" -le \"$max_attempts\" ]; do", run)
        self.assertIn("attempt=$((attempt + 1))", run)

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
