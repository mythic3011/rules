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
from internal.python.check_bootstrap_alias import validate_guard_artifact


class DistributionManifestTest(unittest.TestCase):
    def test_bootstrap_alias_and_readme_projection_are_catalog_driven(self) -> None:
        root = Path(__file__).parents[1]
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        readme = (root / "README.md").read_text(encoding="utf-8")
        guide = (root / "docs/openclash-guard.md").read_text(encoding="utf-8")
        self.assertIn(f"curl -fsSL {catalog.bootstrap_alias} | sh", readme)
        for source in catalog.channels:
            if source.type in {"github-raw", "cdn"} and source.version_source == "ref" and source.immutable_revision_support:
                self.assertIn(
                    catalog.url_for(source.id, catalog.artifact("guard-bundle").path),
                    guide,
                )

    def test_catalog_exposes_required_guard_artifact_roles(self) -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        for role in ("guard-bundle", "guard-manifest", "guard-checksum", "runtime-policy"):
            self.assertTrue(catalog.artifact(role).path)

    def test_publication_validator_accepts_checked_in_generated_guard(self) -> None:
        root = Path(__file__).parents[1]
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        artifact = (root / catalog.artifact("guard-bundle").path).read_bytes()
        manifest = json.loads(
            (root / catalog.artifact("guard-manifest").path).read_text(encoding="utf-8")
        )
        self.assertEqual(validate_guard_artifact(artifact), manifest["sha256"])

    def test_generated_guard_dist_contract_is_current_and_executable(self) -> None:
        root = Path(__file__).parents[1]
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        artifact_meta = catalog.artifact("guard-bundle")
        checksum_meta = catalog.artifact("guard-checksum")
        manifest_meta = catalog.artifact("guard-manifest")
        artifact = root / artifact_meta.path
        checksum = root / checksum_meta.path
        manifest = json.loads((root / manifest_meta.path).read_text(encoding="utf-8"))
        digest = __import__("hashlib").sha256(artifact.read_bytes()).hexdigest()
        self.assertEqual(manifest["artifact"], artifact_meta.path)
        self.assertEqual(manifest["buildFormat"], "posix-shell-bundle")
        self.assertEqual(manifest["sha256"], digest)
        self.assertEqual(checksum.read_text(encoding="utf-8"), f"{digest}  {Path(artifact_meta.path).name}\n")
        self.assertTrue(artifact.stat().st_mode & 0o111)
        self.assertEqual(subprocess.run(["/bin/sh", "-n", str(artifact)]).returncode, 0)

    def test_public_source_paths_resolve_to_same_dist_artifact(self) -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        path = catalog.artifact("guard-bundle").path
        for source in catalog.channels:
            if source.type not in {"github-raw", "cdn"} or source.version_source != "ref" or not source.immutable_revision_support:
                continue
            expected_base = source.base_url.format(
                repository=catalog.repository, version=catalog.default_ref
            )
            self.assertEqual(catalog.url_for(source.id, path), f"{expected_base}/{path}")
    def test_rolling_channel_preserves_existing_rule_provider_base_url(self) -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        self.assertEqual(catalog.base_url("rolling"), BASE_URL)
        for source in catalog.channels:
            if source.type not in {"github-raw", "cdn"} or source.version_source != "ref" or not source.immutable_revision_support:
                continue
            self.assertEqual(
                catalog.base_url(source.id),
                source.base_url.format(
                    repository=catalog.repository, version=catalog.default_ref
                ),
            )
        immutable = next(source for source in catalog.channels if source.version_source == "sha")
        path = catalog.artifact("guard-bundle").path
        expected = immutable.base_url.format(
            repository=catalog.repository, version="{sha}"
        )
        self.assertEqual(catalog.url_for(immutable.id, path), f"{expected}/{path}")

    def test_manifest_is_deterministic_and_includes_service_and_companion_artifacts(self) -> None:
        first = render_distribution_manifest()
        second = render_distribution_manifest()
        self.assertEqual(first, second)
        value = json.loads(first)
        paths = [item["path"] for item in value["artifacts"]]
        self.assertIn(load_distribution(AI_DISTRIBUTION_PATH).manifest_path, paths)
        self.assertTrue(any(path.startswith("rule/") for path in paths))

    def test_managed_git_pathspecs_cover_dynamic_companions_and_stale_ai_outputs(self) -> None:
        specs = managed_git_pathspecs()
        self.assertTrue(any(spec.startswith(":(glob)rule/") for spec in specs))
        self.assertIn(load_distribution(AI_DISTRIBUTION_PATH).manifest_path, specs)
        self.assertIn("README.md", specs)
        self.assertIn("docs/openclash-guard.md", specs)
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
        path = catalog.artifact("runtime-policy").path
        sources = [
            source
            for source in catalog.channels
            if source.type in {"github-raw", "cdn"}
            and source.version_source == "ref"
            and source.immutable_revision_support
        ]
        urls = [catalog.url_for(source.id, path) for source in sources]
        for source, url in zip(sources, urls):
            expected_base = source.base_url.format(repository=catalog.repository, version=catalog.default_ref)
            self.assertTrue(url.startswith(expected_base + "/"), url)
            self.assertTrue(url.endswith("/" + path), url)
        resolved = catalog.resolve()
        self.assertEqual(
            [source.priority for source in resolved],
            sorted(source.priority for source in resolved),
        )
        self.assertEqual(catalog.channel_by_type("github-raw").type, "github-raw")
        self.assertEqual(catalog.channel_by_type("cdn").type, "cdn")

    def test_bootstrap_installer_sources_match_catalog(self) -> None:
        catalog = load_distribution(AI_DISTRIBUTION_PATH)
        installer = (Path(__file__).parents[1] / "setup" / "openclash" / "install.sh").read_text(encoding="utf-8")
        for source in catalog.channels:
            if source.type not in {"github-raw", "cdn"} or source.version_source != "ref" or not source.immutable_revision_support:
                continue
            expected = source.base_url.format(repository=catalog.repository, version=catalog.default_ref)
            self.assertIn(expected, installer)

    def test_default_managed_output_paths_exclude_optional_process_rules(self) -> None:
        paths = managed_output_paths()
        self.assertNotIn("rule/Process_P2P_Classical.yaml", paths)
        self.assertIn("rule/Process_P2P_Classical.yaml", managed_output_paths(include_process_rules=True))


if __name__ == "__main__":
    unittest.main()
