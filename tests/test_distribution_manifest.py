from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from ai_profiles.distribution import (
    load_distribution,
    managed_git_pathspecs,
    managed_output_paths,
    render_distribution_manifest,
)
from ai_profiles.settings import AI_DISTRIBUTION_PATH, BASE_URL


class DistributionManifestTest(unittest.TestCase):
    def test_rolling_channel_preserves_existing_rule_provider_base_url(self) -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        self.assertEqual(catalog.base_url("rolling"), BASE_URL)
        self.assertEqual(
            catalog.base_url("cdn"),
            "https://cdn.jsdelivr.net/gh/mythic3011/rules@main",
        )
        self.assertEqual(
            catalog.base_url("raw"),
            "https://raw.githubusercontent.com/mythic3011/rules/main",
        )
        self.assertEqual(
            catalog.url_for("immutable", "rule/AI_Jules_Classical.yaml"),
            "https://cdn.jsdelivr.net/gh/mythic3011/rules@{sha}/rule/AI_Jules_Classical.yaml",
        )

    def test_manifest_is_deterministic_and_includes_service_and_companion_artifacts(self) -> None:
        first = render_distribution_manifest()
        second = render_distribution_manifest()
        self.assertEqual(first, second)
        value = json.loads(first)
        paths = [item["path"] for item in value["artifacts"]]
        for path in (
            "rule/AI_OpenRouter_Classical.yaml",
            "rule/AI_Cursor_Classical.yaml",
            "rule/AI_HuggingFace_Classical.yaml",
            "rule/HuggingFace_Download_Direct_Classical.yaml",
            "rule/Cursor_Download_Direct_Classical.yaml",
            "internal/generated/ai-routing/distribution-manifest.json",
        ):
            self.assertIn(path, paths)

    def test_managed_git_pathspecs_cover_dynamic_companions_and_stale_ai_outputs(self) -> None:
        specs = managed_git_pathspecs()
        self.assertIn(":(glob)rule/AI_*_Classical.yaml", specs)
        self.assertIn("rule/HuggingFace_Download_Direct_Classical.yaml", specs)
        self.assertIn("rule/Cursor_Download_Direct_Classical.yaml", specs)
        self.assertIn("internal/generated/ai-routing/distribution-manifest.json", specs)
        self.assertEqual(len(specs), len(set(specs)))

    def test_schema_rejects_unknown_distribution_strategy(self) -> None:
        value = json.loads(AI_DISTRIBUTION_PATH.read_text(encoding="utf-8"))
        value["channels"][0]["kind"] = "magic"
        with tempfile.TemporaryDirectory() as raw_tmp:
            path = Path(raw_tmp) / "distribution.json"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "Unknown distribution strategy"):
                load_distribution(path)

    def test_default_managed_output_paths_exclude_optional_process_rules(self) -> None:
        paths = managed_output_paths()
        self.assertNotIn("rule/Process_P2P_Classical.yaml", paths)
        self.assertIn("rule/Process_P2P_Classical.yaml", managed_output_paths(include_process_rules=True))


if __name__ == "__main__":
    unittest.main()
