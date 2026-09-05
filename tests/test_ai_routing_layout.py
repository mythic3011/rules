from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "internal" / "config" / "ai-routing"


class AiRoutingLayoutTest(unittest.TestCase):
    def test_root_contains_only_layout_metadata(self) -> None:
        self.assertEqual(
            {path.name for path in ROOT.iterdir()},
            {"README.md", "profile.json", "project.yaml", "core", "projections", "catalogs", "sources"},
        )

    def test_authority_files_have_one_owned_directory(self) -> None:
        self.assertEqual(
            {path.name for path in (ROOT / "core").iterdir()},
            {
                "00-base.yaml",
                "10-route-targets.yaml",
                "20-protection-classes.yaml",
                "30-services.yaml",
                "40-access-profiles.yaml",
                "50-dns.yaml",
                "60-shared-backends.yaml",
            },
        )
        self.assertEqual(
            {path.name for path in (ROOT / "projections").iterdir()},
            {"mihomo.yaml", "parity.yaml"},
        )
        self.assertEqual(
            {path.name for path in (ROOT / "sources").iterdir()},
            {"adguard-upstream.json", "upstream-sources.json"},
        )
        self.assertEqual(
            {path.name for path in (ROOT / "catalogs").iterdir()},
            {
                "companion-rules.json",
                "distribution.json",
                "external-routing.json",
                "process-rules.yaml",
                "regions.json",
                "regions.source.json",
                "services.json",
            },
        )


if __name__ == "__main__":
    unittest.main()
