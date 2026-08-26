from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORM = ROOT / ".github/ISSUE_TEMPLATE/service_intake.yml"


class ServiceIntakeFormTests(unittest.TestCase):
    def test_generated_form_contains_registry_regions_and_structured_unlisted_slots(self):
        subprocess.run(["python3", "internal/python/generate_service_intake_form.py"], cwd=ROOT, check=True)
        text = FORM.read_text(encoding="utf-8")
        self.assertIn("hk — Hong Kong", text)
        self.assertIn("us — United States", text)
        self.assertIn("Other / new region", text)
        self.assertIn("Additional region 1 code", text)
        self.assertIn("Additional region 2 code", text)
        self.assertIn("Additional region 3 code", text)
        self.assertIn("canonical region ID, flag, group name and regex are generated automatically", text)
        self.assertIn("Matcher type", text)
        self.assertTrue(text.startswith("# GENERATED"))

    def test_known_region_dropdown_does_not_use_ambiguous_other_identity(self):
        subprocess.run(["python3", "internal/python/generate_service_intake_form.py"], cwd=ROOT, check=True)
        text = FORM.read_text(encoding="utf-8")
        # Other is a separate structured section, not a fake region option that
        # could be selected as both working and blocked.
        self.assertNotIn('- "Other / new region"', text)

    def test_intake_workflow_uses_event_file_not_shell_interpolation(self):
        text = (ROOT / ".github/workflows/service-intake.yml").read_text(encoding="utf-8")
        self.assertIn("$GITHUB_EVENT_PATH", text)
        self.assertNotIn("github.event.issue.body }}", text)
        self.assertIn("gh pr create", text)
        self.assertNotIn("git push origin HEAD:main", text)

    def test_intake_workflow_reprocesses_edits_without_duplicate_prs(self):
        text = (ROOT / ".github/workflows/service-intake.yml").read_text(encoding="utf-8")
        self.assertIn("types: [opened, edited, reopened]", text)
        self.assertIn("gh pr list", text)
        self.assertIn("--force-with-lease", text)


if __name__ == "__main__":
    unittest.main()
