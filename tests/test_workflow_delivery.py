from __future__ import annotations

import unittest

from ai_profiles_test_support import ROOT


class WorkflowDeliveryTest(unittest.TestCase):
    def test_ai_workflow_watches_refactored_python_package(self) -> None:
        workflow = (ROOT / ".github/workflows/auto-generate-ai-profiles.yml").read_text(encoding="utf-8")
        self.assertGreaterEqual(workflow.count('"internal/python/ai_profiles/**"'), 2)

    def test_ai_workflow_asks_generator_for_managed_pathspecs(self) -> None:
        workflow = (ROOT / ".github/workflows/auto-generate-ai-profiles.yml").read_text(encoding="utf-8")
        self.assertGreaterEqual(workflow.count("managed-paths"), 2)
        self.assertIn('git add -A -- "${managed_paths[@]}"', workflow)
        self.assertNotIn("git add -A -- \\\n            cfg/Custom_Clash_AI.ini", workflow)

    def test_purge_workflow_follows_ai_generator_workflow_run(self) -> None:
        workflow = (ROOT / ".github/workflows/purge-jsdelivr.yml").read_text(encoding="utf-8")
        self.assertIn("- Auto generate AI profiles", workflow)
        self.assertIn("internal/generated/ai-routing/distribution-manifest.json", workflow)

    def test_purge_workflow_verifies_cdn_from_generated_manifest(self) -> None:
        workflow = (ROOT / ".github/workflows/purge-jsdelivr.yml").read_text(encoding="utf-8")
        self.assertIn("Verify jsDelivr published artifacts", workflow)
        self.assertIn('artifact["urls"]["cdn"]', workflow)
        self.assertIn("sha256sum", workflow)


if __name__ == "__main__":
    unittest.main()
