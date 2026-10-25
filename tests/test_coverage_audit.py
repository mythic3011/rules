from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "internal" / "python"))

from ai_profiles.catalog import load_catalog
from ai_profiles.coverage import audit_rule_coverage
from ai_profiles.upstream_sources import load_upstream_source_manifest


class CoverageAuditTest(unittest.TestCase):
    def test_missing_snapshot_is_warning_not_silent(self) -> None:
        findings = audit_rule_coverage(
            load_catalog(),
            ini_plan_path=ROOT / "internal" / "generated" / "ai-routing" / "hk.ini-mvp-plan.json",
        )
        codes = {item.code for item in findings}
        self.assertIn("missing-adguard-snapshot", codes)
        self.assertFalse(any(item.severity == "error" for item in findings))

    def _plan(self, revision: str) -> dict[str, object]:
        return {
            "rules": {
                "beforeLegacy": [],
                "afterLegacy": [
                    {"kind": "geosite", "target": "🤖 AI Other", "value": "google-deepmind"},
                    {"kind": "geosite", "target": "🤖 AI Other", "value": "category-ai-!cn"},
                    {
                        "kind": "remote-classical",
                        "target": "🤖 AI Other",
                        "url": f"https://raw.githubusercontent.com/VPSDance/ai-proxy-rules/{revision}/rules/clash/all.yaml",
                    },
                ],
            }
        }

    def test_shared_manifest_pin_is_not_reported_as_stale_by_itself(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            plan_path = Path(temp) / "plan.json"
            revision = load_upstream_source_manifest(catalog_dir=ROOT / "internal" / "config" / "ai-routing").by_id()["vpsdance"].revision
            plan_path.write_text(json.dumps(self._plan(revision)), encoding="utf-8")
            findings = audit_rule_coverage(load_catalog(), ini_plan_path=plan_path)
            self.assertNotIn("pinned-vpsdance-upstream", {item.code for item in findings})
            self.assertNotIn("ini-upstream-drift", {item.code for item in findings})

    def test_manifest_and_materialized_ini_revision_drift_is_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            plan_path = Path(temp) / "plan.json"
            plan_path.write_text(json.dumps(self._plan("1" * 40)), encoding="utf-8")
            findings = audit_rule_coverage(load_catalog(), ini_plan_path=plan_path)
            drift = [item for item in findings if item.code == "ini-upstream-drift"]
            self.assertEqual(len(drift), 1)
            self.assertEqual(drift[0].severity, "error")

    def test_missing_ini_plan_is_warning(self) -> None:
        findings = audit_rule_coverage(
            load_catalog(),
            ini_plan_path=ROOT / "does-not-exist.ini-mvp-plan.json",
        )
        missing = [item for item in findings if item.code == "missing-ini-plan"]
        self.assertEqual(len(missing), 1)
        self.assertEqual(missing[0].severity, "warning")

    def test_invalid_ini_plan_is_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            plan_path = Path(temp) / "plan.json"
            plan_path.write_text("{not json", encoding="utf-8")
            findings = audit_rule_coverage(load_catalog(), ini_plan_path=plan_path)
            invalid = [item for item in findings if item.code == "invalid-ini-plan"]
            self.assertEqual(len(invalid), 1)
            self.assertEqual(invalid[0].severity, "error")

    def test_unpinned_ini_source_is_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            plan_path = Path(temp) / "plan.json"
            plan_path.write_text(json.dumps(self._plan("main")), encoding="utf-8")
            findings = audit_rule_coverage(load_catalog(), ini_plan_path=plan_path)
            unpinned = [item for item in findings if item.code == "unpinned-upstream-source"]
            self.assertEqual(len(unpinned), 1)
            self.assertEqual(unpinned[0].severity, "error")


if __name__ == "__main__":
    unittest.main()
