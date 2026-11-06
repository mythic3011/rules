from __future__ import annotations

import json
import hashlib
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "internal" / "python"))

from ai_profiles.blocking import OUTPUT_PATH, compile_ai_service_blocking_policy, render_ai_service_blocking_policy
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_adguard_home_plan
from ai_profiles.distribution import managed_git_pathspecs, managed_output_paths, render_distribution_manifest


class AiServiceBlockingPolicyTests(unittest.TestCase):
    def test_projection_preserves_supported_matchers_and_exposes_incomplete_coverage(self) -> None:
        catalog = load_catalog()
        policy = compile_ai_service_blocking_policy(catalog)

        expected_domains = {
            (rule.kind, rule.domain.casefold())
            for rule in compile_adguard_home_plan(catalog).rules
            if rule.kind in {"exact", "suffix"}
        }
        actual_domains = {(rule["match"], rule["value"].casefold()) for rule in policy["domains"]}
        self.assertEqual(actual_domains, expected_domains)
        self.assertEqual(policy["coverage"]["complete"], False)
        self.assertIn("no_canonical_dynamic_ip_feed", policy["coverage"]["reasons"])
        self.assertIn("unmaterialized_geosite_sources", policy["coverage"]["reasons"])
        self.assertIn("unsupported_domain_matcher", policy["coverage"]["reasons"])
        self.assertEqual(
            {entry["cidr"] for entry in policy["ipv4Cidrs"]},
            {"160.79.104.0/21", "153.61.224.0/22", "153.61.208.0/20"},
        )
        self.assertEqual({entry["cidr"] for entry in policy["ipv6Cidrs"]}, {"2607:6bc0::/32"})
        unsupported_kinds = {entry["kind"] for entry in policy["unsupportedRules"]}
        self.assertIn("DOMAIN-KEYWORD", unsupported_kinds)
        self.assertIn("GEOSITE", unsupported_kinds)
        self.assertEqual(render_ai_service_blocking_policy(), render_ai_service_blocking_policy())

    def test_projection_records_source_hashes_and_upstream_snapshot_age(self) -> None:
        policy = compile_ai_service_blocking_policy()
        files = {entry["path"]: entry["sha256"] for entry in policy["source"]["files"]}
        self.assertEqual(files["internal/config/ai-routing/catalogs/services.json"],
                         hashlib.sha256(
                             (ROOT / "internal/config/ai-routing/catalogs/services.json").read_bytes()
                         ).hexdigest())
        self.assertIn("internal/config/ai-routing/sources/adguard-upstream.json", files)
        self.assertIsNotNone(policy["upstream"]["snapshotRefreshedAt"])
        self.assertTrue(policy["upstream"]["rootLists"])

    def test_output_is_in_the_owner_generated_and_distributed_surfaces(self) -> None:
        catalog = load_catalog()
        host_path = f"rule/{catalog.adguard_home.output_file}"
        self.assertIn(OUTPUT_PATH, managed_output_paths())
        self.assertIn(OUTPUT_PATH, managed_git_pathspecs())
        self.assertIn(host_path, managed_output_paths())
        self.assertIn(host_path, managed_git_pathspecs())
        manifest = json.loads(render_distribution_manifest())
        artifact_paths = {artifact["path"] for artifact in manifest["artifacts"]}
        self.assertIn(OUTPUT_PATH, artifact_paths)
        self.assertIn(host_path, artifact_paths)

    def test_wrong_family_cidr_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            catalog_dir = Path(temporary) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            services_path = catalog_dir / "catalogs" / "services.json"
            document = json.loads(services_path.read_text(encoding="utf-8"))
            claude = next(service for service in document["services"] if service["id"] == "claude")
            claude["payload"] = [
                "IP-CIDR6,160.79.104.0/21" if rule == "IP-CIDR6,2607:6bc0::/32" else rule
                for rule in claude["payload"]
            ]
            services_path.write_text(json.dumps(document), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "family does not match"):
                compile_ai_service_blocking_policy(load_catalog(catalog_dir))


if __name__ == "__main__":
    unittest.main()
