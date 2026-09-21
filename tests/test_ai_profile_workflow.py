"""Structural security checks for the AI profile generation workflow."""

from __future__ import annotations

from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "auto-generate-ai-profiles.yml"


def load_workflow() -> dict:
    return yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))


def workflow_triggers(workflow: dict) -> dict:
    # PyYAML 1.1 treats the unquoted YAML key `on` as boolean true.
    return workflow.get("on", workflow.get(True, {}))


class AiProfileWorkflowTests(unittest.TestCase):
    def test_pr_validation_is_read_only_and_commit_is_trusted_event_only(self) -> None:
        workflow = load_workflow()

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
        drift_gate = next(
            step for step in validation_steps if step["name"] == "Reject generated output drift in pull requests"
        )
        self.assertEqual(drift_gate["if"], "github.event_name == 'pull_request'")

        commit_steps = commit["steps"]
        checkout = next(step for step in commit_steps if step["name"] == "Checkout validated revision")
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")
        self.assertEqual(commit["env"]["TARGET_REF"], "${{ github.ref }}")

        names = [step["name"] for step in commit_steps]
        self.assertIn("Regenerate repository outputs", names)
        self.assertIn("Validate generated outputs before write", names)
        self.assertIn("Revalidate source tree before write", names)
        self.assertIn("Audit generated upstream ownership", names)
        self.assertIn("Commit generated changes", names)

        writer_run = next(step["run"] for step in commit_steps if step["name"] == "Commit generated changes")
        self.assertIn("refs/heads/*", writer_run)
        self.assertIn('git push origin "HEAD:${TARGET_REF}"', writer_run)
        self.assertIn('git fetch --no-tags origin "$TARGET_REF"', writer_run)
        self.assertIn("remote_tip=$(git rev-parse FETCH_HEAD)", writer_run)
        self.assertIn('"${{ github.event_name }}" = push', writer_run)
        self.assertIn('"$remote_tip" != "${{ github.sha }}"', writer_run)
        self.assertNotIn("git reset", writer_run)
        self.assertNotIn("git checkout", writer_run)
        self.assertNotIn("--force", writer_run)
        self.assertNotIn("--force-with-lease", writer_run)

    def test_every_push_gets_its_own_exact_sha_repair_run(self) -> None:
        workflow = load_workflow()
        triggers = workflow_triggers(workflow)
        self.assertEqual(triggers["push"], {})

        concurrency = workflow["concurrency"]
        self.assertEqual(
            concurrency["group"],
            "auto-generate-ai-profiles-${{ github.event_name }}-${{ github.ref }}",
        )
        self.assertIs(concurrency["cancel-in-progress"], True)

        commit_steps = workflow["jobs"]["commit-managed-python-outputs"]["steps"]
        checkout = next(step for step in commit_steps if step["name"] == "Checkout validated revision")
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")

        writer = next(step for step in commit_steps if step["name"] == "Commit generated changes")
        run = writer["run"]
        self.assertIn("its own push workflow will repair managed outputs", run)
        self.assertNotIn("reset --hard FETCH_HEAD", run)

    def test_writer_revalidates_before_committing_generated_outputs(self) -> None:
        workflow = load_workflow()
        steps = workflow["jobs"]["commit-managed-python-outputs"]["steps"]
        names = [step["name"] for step in steps]

        generate_index = names.index("Regenerate repository outputs")
        validate_index = names.index("Validate generated outputs before write")
        check_index = names.index("Revalidate source tree before write")
        audit_index = names.index("Audit generated upstream ownership")
        commit_index = names.index("Commit generated changes")

        self.assertLess(generate_index, validate_index)
        self.assertLess(validate_index, check_index)
        self.assertLess(check_index, audit_index)
        self.assertLess(audit_index, commit_index)
        self.assertEqual(steps[generate_index]["run"], "make generate")
        self.assertEqual(
            steps[validate_index]["run"],
            "python3 internal/python/validate_generated_profiles.py",
        )
        self.assertEqual(steps[check_index]["run"], "make check-all")

    def test_scheduled_refresh_generates_before_validating_and_pr_drift_gate(self) -> None:
        workflow = load_workflow()
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
        self.assertNotIn("npm run export:", refresh_step["run"])
        self.assertEqual(steps[generate_index]["run"], "make generate")
        self.assertEqual(
            steps[validate_generated_index]["run"],
            "python3 internal/python/validate_generated_profiles.py",
        )
        self.assertEqual(steps[check_index]["run"], "make check-all")
        self.assertEqual(steps[drift_gate_index]["if"], "github.event_name == 'pull_request'")


if __name__ == "__main__":
    unittest.main()
