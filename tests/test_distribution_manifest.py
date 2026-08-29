from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
import subprocess

from ai_profiles.distribution import (
    load_distribution,
    managed_git_pathspecs,
    managed_output_paths,
    render_distribution_manifest,
)
from ai_profiles.settings import AI_DISTRIBUTION_PATH, BASE_URL


class DistributionManifestTest(unittest.TestCase):
    def test_generated_guard_dist_contract_is_current_and_executable(self) -> None:
        root = Path(__file__).parents[1]
        artifact = root / "dist" / "openclash-guard.sh"
        checksum = root / "dist" / "openclash-guard.sha256"
        manifest = json.loads((root / "dist" / "manifest.json").read_text(encoding="utf-8"))
        digest = __import__("hashlib").sha256(artifact.read_bytes()).hexdigest()
        self.assertEqual(manifest["artifact"], "dist/openclash-guard.sh")
        self.assertEqual(manifest["buildFormat"], "posix-shell-bundle")
        self.assertEqual(manifest["sha256"], digest)
        self.assertEqual(checksum.read_text(encoding="utf-8"), f"{digest}  openclash-guard.sh\n")
        self.assertTrue(artifact.stat().st_mode & 0o111)
        self.assertEqual(subprocess.run(["/bin/sh", "-n", str(artifact)]).returncode, 0)

    def test_public_source_paths_resolve_to_same_dist_artifact(self) -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        path = "dist/openclash-guard.sh"
        self.assertEqual(
            catalog.url_for("raw", path),
            "https://raw.githubusercontent.com/mythic3011/rules/main/dist/openclash-guard.sh",
        )
        self.assertEqual(
            catalog.url_for("cdn", path),
            "https://cdn.jsdelivr.net/gh/mythic3011/rules@main/dist/openclash-guard.sh",
        )
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
        value["channels"][0]["type"] = "magic"
        with tempfile.TemporaryDirectory() as raw_tmp:
            path = Path(raw_tmp) / "distribution.json"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "Unknown distribution source type"):
                load_distribution(path)

    def test_source_resolver_generates_raw_and_cdn_urls_from_catalog(self) -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        path = "cfg/yaml/Custom_Clash_AI.yaml"
        raw = catalog.url_for("raw", path)
        cdn = catalog.url_for("cdn", path)
        for source_id, url in (("raw", raw), ("cdn", cdn)):
            source = catalog.channel(source_id)
            expected_base = source.base_url.format(repository=catalog.repository, version=catalog.default_ref)
            self.assertTrue(url.startswith(expected_base + "/"), url)
            self.assertTrue(url.endswith("/" + path), url)
        self.assertEqual([source.id for source in catalog.resolve()], ["rolling", "cdn", "raw", "immutable"])
        self.assertEqual(catalog.channel("github-raw").id, "raw")
        self.assertEqual(catalog.channel("jsdelivr").id, "cdn")

    def test_bootstrap_installer_sources_match_catalog(self) -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        installer = (Path(__file__).parents[1] / "setup" / "openclash" / "install.sh").read_text(encoding="utf-8")
        for source_id, variable in (("cdn", "SOURCE_CDN_BASE"), ("raw", "SOURCE_GITHUB_RAW_BASE")):
            source = catalog.channel(source_id)
            expected = source.base_url.format(repository=catalog.repository, version=catalog.default_ref)
            self.assertIn(f'{variable}="{expected}"', installer)

    def test_default_managed_output_paths_exclude_optional_process_rules(self) -> None:
        paths = managed_output_paths()
        self.assertNotIn("rule/Process_P2P_Classical.yaml", paths)
        self.assertIn("rule/Process_P2P_Classical.yaml", managed_output_paths(include_process_rules=True))


if __name__ == "__main__":
    unittest.main()
