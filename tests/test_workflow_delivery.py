from __future__ import annotations

import re
import unittest
from collections import Counter

import yaml

from ai_profiles_test_support import ROOT


class WorkflowDeliveryTest(unittest.TestCase):
    def test_external_action_refs_are_immutable_and_version_annotated(self) -> None:
        workflow_dir = ROOT / ".github" / "workflows"
        references: Counter[str] = Counter()
        annotated_references: Counter[str] = Counter()

        for path in sorted((*workflow_dir.glob("*.yml"), *workflow_dir.glob("*.yaml"))):
            document = yaml.safe_load(path.read_text(encoding="utf-8"))
            jobs = document.get("jobs", {}) if isinstance(document, dict) else {}
            if isinstance(jobs, dict):
                for job in jobs.values():
                    if not isinstance(job, dict):
                        continue
                    if isinstance(job.get("uses"), str):
                        references[job["uses"]] += 1
                    for step in job.get("steps", []):
                        if isinstance(step, dict) and isinstance(step.get("uses"), str):
                            references[step["uses"]] += 1
            for line in path.read_text(encoding="utf-8").splitlines():
                match = re.fullmatch(
                    r"\s*(?:-\s*)?uses:\s*(\S+?)\s+#\s*v[0-9][A-Za-z0-9.-]*\s*",
                    line,
                )
                if match:
                    annotated_references[match.group(1)] += 1

        for reference, count in references.items():
            if reference.startswith("./"):
                continue
            action, separator, commit = reference.partition("@")
            self.assertTrue(separator, f"remote action has no ref: {reference}")
            self.assertRegex(commit, r"^[0-9a-f]{40}$", f"mutable action ref: {reference}")
            self.assertEqual(
                annotated_references[reference],
                count,
                f"each {action} reference needs a release-version comment",
            )

    def test_ai_workflow_watches_refactored_python_package(self) -> None:
        path = ROOT / ".github/workflows/auto-generate-ai-profiles.yml"
        workflow = yaml.safe_load(path.read_text(encoding="utf-8"))
        triggers = workflow.get("on", workflow.get(True, {}))
        self.assertIn("internal/python/ai_profiles/**", triggers["pull_request"]["paths"])
        self.assertEqual(triggers["push"]["branches"], ["**"])
        self.assertNotIn("paths", triggers["push"])

    def test_ai_workflow_asks_generator_for_managed_pathspecs(self) -> None:
        workflow = (ROOT / ".github/workflows/auto-generate-ai-profiles.yml").read_text(encoding="utf-8")
        self.assertGreaterEqual(workflow.count("managed-paths"), 2)
        self.assertIn('git add -A -- "${managed_paths[@]}"', workflow)
        self.assertNotIn("git add -A -- \\\n            cfg/Custom_Clash_AI.ini", workflow)

    def test_purge_workflow_follows_ai_generator_workflow_run(self) -> None:
        workflow = (ROOT / ".github/workflows/purge-jsdelivr.yml").read_text(encoding="utf-8")
        self.assertIn("- Auto generate AI profiles", workflow)
        self.assertIn("./rulesctl distribution-manifest-path", workflow)

    def test_purge_workflow_verifies_cdn_from_generated_manifest(self) -> None:
        workflow = (ROOT / ".github/workflows/purge-jsdelivr.yml").read_text(encoding="utf-8")
        self.assertIn("Verify jsDelivr published artifacts", workflow)
        self.assertIn('artifact["urls"]["cdn"]', workflow)
        self.assertIn("sha256sum", workflow)

    def test_bootstrap_alias_smoke_is_external_and_catalog_driven(self) -> None:
        workflow = (ROOT / ".github/workflows/check-bootstrap-alias.yml").read_text(
            encoding="utf-8"
        )
        checker = (ROOT / "internal/python/check_bootstrap_alias.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("make check-bootstrap-alias", workflow)
        self.assertNotIn("analytics.mythic3011.com", workflow)
        self.assertIn("catalog.bootstrap_alias", checker)
        steps = yaml.safe_load(workflow)["jobs"]["smoke"]["steps"]
        setup_index = next(index for index, step in enumerate(steps) if step.get("uses", "").startswith("jdx/mise-action@"))
        install_index = next(index for index, step in enumerate(steps) if step.get("run") == "mise install")
        check_index = next(index for index, step in enumerate(steps) if step.get("run") == "make check-bootstrap-alias")
        self.assertLess(setup_index, install_index)
        self.assertLess(install_index, check_index)


if __name__ == "__main__":
    unittest.main()
