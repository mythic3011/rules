from __future__ import annotations

import fnmatch
from pathlib import Path
import tempfile
import unittest
import yaml

from ai_profiles_test_support import (
    copy_catalog,
    load_generator,
    read_json,
    write_json,
)
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import (
    compile_mihomo_profile,
    compile_routing_entries,
    compile_rule_providers,
    compile_subconverter_plan,
)
from ai_profiles.distribution import managed_git_pathspecs, managed_output_paths
from ai_profiles.validation import (
    validate_companion_rule_payload_scope,
    validate_service_payload_scope,
)

MODULE = load_generator("generate_ai_profiles_google_finance")


class GoogleFinanceCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.google_services = cls.catalog.services_by_family("google-ai")
        cls.finance_rules = cls.catalog.rules_by_category("finance")

    def test_google_ai_extensions_are_data_only_and_narrowly_scoped(self) -> None:
        self.assertTrue(self.google_services)
        for service in self.google_services:
            with self.subTest(service=service.id):
                validate_service_payload_scope(service)
                if service.fail_closed:
                    self.assertFalse(service.direct_relaxed)

    def test_google_ai_extensions_project_through_existing_pipeline(self) -> None:
        relaxed_doc = yaml.safe_load(MODULE.render_yaml(strict=False))
        strict_doc = yaml.safe_load(MODULE.render_yaml(strict=True))
        ini = MODULE.render_ini()

        relaxed_group_names = {
            group["name"] for group in relaxed_doc.get("proxy-groups", []) if "name" in group
        }
        strict_groups = {
            group["name"]: group
            for group in strict_doc.get("proxy-groups", [])
            if "name" in group
        }

        plan = compile_subconverter_plan(
            MODULE.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        ini_selector_groups = {s.group.name for s in plan.service_selectors}

        for service in self.google_services:
            with self.subTest(service=service.id):
                self.assertIn(service.group, relaxed_group_names)
                self.assertIn(service.group, ini_selector_groups)
                self.assertIn(f"custom_proxy_group={service.group}`select`", ini)
                if service.fail_closed:
                    strict_group = strict_groups.get(service.group)
                    self.assertIsNotNone(
                        strict_group, f"Group missing in strict mode: {service.group}"
                    )
                    self.assertNotIn(
                        MODULE.GROUP["direct"],
                        strict_group.get("proxies", []),
                    )

    def test_finance_rules_follow_high_risk_policy(self) -> None:
        self.assertTrue(self.finance_rules)
        high_risk_group = self.catalog.group("high-risk-account")
        for rule in self.finance_rules:
            with self.subTest(rule=rule.id):
                self.assertTrue(rule.fail_closed)
                self.assertEqual(rule.risk, "high")
                self.assertEqual(rule.group, high_risk_group)
                self.assertEqual(rule.subconverter_cluster, rule.category)
                self.assertTrue(rule.mihomo)
                self.assertEqual(rule.provider_key, rule.file.rsplit(".", 1)[0])
                validate_companion_rule_payload_scope(rule)

    def test_finance_routes_are_relaxed_only_and_never_auto_service_groups(self) -> None:
        relaxed = compile_routing_entries(
            strict=False, include_process_rules=False, catalog=self.catalog
        )
        strict = compile_routing_entries(
            strict=True, include_process_rules=False, catalog=self.catalog
        )
        relaxed_values = {getattr(rule, "value", None) for rule in relaxed}
        strict_values = {getattr(rule, "value", None) for rule in strict}

        finance_providers = {rule.provider_key for rule in self.finance_rules}
        self.assertTrue(finance_providers <= relaxed_values)
        self.assertTrue(finance_providers.isdisjoint(strict_values))

        providers = {
            provider.name
            for provider in compile_rule_providers(
                strict=False, include_process_rules=False, catalog=self.catalog
            )
        }
        self.assertTrue(finance_providers <= providers)

    def test_generated_artifacts_are_managed(self) -> None:
        managed = set(managed_output_paths())
        specs = set(managed_git_pathspecs())

        ai_rule_paths = {f"rule/{service.file}" for service in self.google_services}
        finance_rule_paths = {f"rule/{rule.file}" for rule in self.finance_rules}

        self.assertTrue(ai_rule_paths <= managed)
        self.assertTrue(finance_rule_paths <= managed)

        clean_specs = [spec.removeprefix(":(glob)") for spec in specs]
        for path in ai_rule_paths | finance_rule_paths:
            self.assertTrue(
                any(fnmatch.fnmatch(path, spec) for spec in clean_specs),
                f"Path {path} is not covered by git pathspecs",
            )

    def test_runtime_pipeline_handles_synthetic_catalog_entries_without_code_changes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            catalog_dir = copy_catalog(Path(tmp_dir))

            # Inject synthetic Google AI service contiguous with other clustered services
            services_path = catalog_dir / "catalogs" / "services.json"
            services_data = read_json(services_path)
            synthetic_service = {
                "id": "synthetic-google-ai",
                "family": "google-ai",
                "providerKey": "AI_Synthetic_Google_Classical",
                "group": "🤖 Synthetic Google AI",
                "file": "AI_Synthetic_Google_Classical.yaml",
                "payload": ["DOMAIN-SUFFIX,synthetic.google"],
                "regions": ["us", "sg"],
                "directRelaxed": False,
                "dnsPolicies": [],
                "subconverter": {"ruleCluster": "legacy-ai-merged"},
                "upstreamRules": [],
                "projections": ["mihomo", "subconverter"],
            }
            # Insert alongside google-ai services to maintain ruleCluster contiguity
            services_data["services"].insert(14, synthetic_service)
            write_json(services_path, services_data)

            # Inject synthetic finance rule
            companion_path = catalog_dir / "catalogs" / "companion-rules.json"
            companion_data = read_json(companion_path)
            synthetic_rule = {
                "id": "finance-synthetic-sensitive",
                "category": "finance",
                "providerKey": "Finance_Synthetic_Classical",
                "groupKey": "high-risk-account",
                "file": "Finance_Synthetic_Classical.yaml",
                "render": {
                    "mode": "classical",
                    "payload": ["DOMAIN-SUFFIX,synthetic-bank.com"],
                    "comments": ["Synthetic Bank"],
                },
                "mihomo": True,
                "subconverterCluster": "finance",
            }
            companion_data["rulesets"].append(synthetic_rule)
            write_json(companion_path, companion_data)

            # Load modified catalog and verify runtime pipeline compiles & projects without errors
            synthetic_catalog = load_catalog(catalog_dir)

            google_services = synthetic_catalog.services_by_family("google-ai")
            self.assertTrue(any(s.id == "synthetic-google-ai" for s in google_services))

            finance_rules = synthetic_catalog.rules_by_category("finance")
            self.assertTrue(any(r.id == "finance-synthetic-sensitive" for r in finance_rules))

            # Compile Mihomo and INI routing entries with synthetic catalog
            mihomo_plan = compile_mihomo_profile(
                strict=False, include_process_rules=False, catalog=synthetic_catalog
            )
            compile_subconverter_plan(
                MODULE.load_ini_mvp_plan(),
                include_process_rules=False,
                catalog=synthetic_catalog,
            )

            mihomo_provider_keys = {
                rule.value
                for rule in mihomo_plan.ai_routing_entries
                if getattr(rule, "kind", None) == "RULE-SET"
            }
            self.assertIn("AI_Synthetic_Google_Classical", mihomo_provider_keys)

            managed_paths = set(managed_output_paths(catalog=synthetic_catalog))
            self.assertIn("rule/AI_Synthetic_Google_Classical.yaml", managed_paths)
            self.assertIn("rule/Finance_Synthetic_Classical.yaml", managed_paths)


if __name__ == "__main__":
    unittest.main()
