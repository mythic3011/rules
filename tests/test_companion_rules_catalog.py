from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from ai_profiles_test_support import CATALOG_DIR, ROOT, copy_catalog, load_generator, read_json, write_json
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_routing_entries, compile_rule_providers, compile_subconverter_plan
from ai_profiles.schema import load_catalog_documents


class CompanionRulesCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.generator = load_generator("generate_ai_profiles_companion_contracts")

    def test_current_companion_rules_have_declared_projection_metadata(self) -> None:
        documents = load_catalog_documents(CATALOG_DIR)
        rules = documents.companion_rules.rulesets
        self.assertEqual(
            [rule.provider_key for rule in rules],
            [
                "SSH_Direct_Classical",
                "SSH_Proxy_Classical",
                "SSH_Process_Classical",
                "Gaming_Direct_Classical",
                "HuggingFace_Download_Direct_Classical",
                "Cursor_Download_Direct_Classical",
                "Finance_Stripe_Classical",
                "Finance_PayPal_Classical",
                "Finance_Wise_Classical",
                "Finance_Revolut_Classical",
                "Finance_IBKR_Classical",
                "Finance_Alpaca_Classical",
            ],
        )
        self.assertEqual(
            [rule.mihomo for rule in rules],
            [True, True, False, True, True, True, True, True, True, True, True, True],
        )
        self.assertEqual(
            [rule.subconverter_cluster for rule in rules],
            ["ssh", "ssh", None, "gaming", "downloads", "downloads", "finance", "finance", "finance", "finance", "finance", "finance"],
        )
        self.assertEqual(len(documents.companion_rules.process_rulesets), 4)
        self.assertTrue(documents.companion_rules.process_warning_lines)

    def test_schema_rejects_unknown_companion_render_mode(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "companion-rules.json"
            value = read_json(path)
            value["rulesets"][0]["render"] = {"mode": "magic"}
            write_json(path, value)
            with self.assertRaisesRegex(RuntimeError, "Unknown companion rule render mode"):
                load_catalog_documents(catalog_dir)

    def test_catalog_rejects_unknown_companion_group_after_schema_passes(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "companion-rules.json"
            value = read_json(path)
            value["rulesets"][0]["groupKey"] = "missing"
            write_json(path, value)
            documents = load_catalog_documents(catalog_dir)
            self.assertEqual(documents.companion_rules.rulesets[0].group_key, "missing")
            with self.assertRaisesRegex(RuntimeError, "Unknown companion rule group key"):
                load_catalog(catalog_dir)

    def test_mihomo_projection_comes_from_declared_companion_rules(self) -> None:
        expected = [rule for rule in self.catalog.companion_rulesets if rule.mihomo]
        routing = compile_routing_entries(
            strict=False,
            include_process_rules=False,
            catalog=self.catalog,
        )
        routing_provider_keys = [
            rule.value
            for rule in routing
            if getattr(rule, "kind", None) == "RULE-SET"
            and rule.value in {item.provider_key for item in expected}
        ]
        self.assertEqual(routing_provider_keys, [rule.provider_key for rule in expected])

        providers = compile_rule_providers(
            strict=False,
            include_process_rules=False,
            catalog=self.catalog,
        )
        provider_names = [
            provider.name
            for provider in providers
            if provider.name in {item.provider_key for item in expected}
        ]
        self.assertEqual(provider_names, [rule.provider_key for rule in expected])

    def test_subconverter_companion_clusters_are_data_driven(self) -> None:
        plan = compile_subconverter_plan(
            self.generator.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        actual = [
            [rule.url.rsplit("/", 1)[-1] for rule in cluster.rules]
            for cluster in plan.companion_rule_clusters
        ]
        self.assertEqual(
            actual,
            [
                ["SSH_Direct_Classical.yaml", "SSH_Proxy_Classical.yaml"],
                ["Gaming_Direct_Classical.yaml"],
                ["HuggingFace_Download_Direct_Classical.yaml", "Cursor_Download_Direct_Classical.yaml"],
                [
                    "Finance_Stripe_Classical.yaml",
                    "Finance_PayPal_Classical.yaml",
                    "Finance_Wise_Classical.yaml",
                    "Finance_Revolut_Classical.yaml",
                    "Finance_IBKR_Classical.yaml",
                    "Finance_Alpaca_Classical.yaml",
                ],
            ],
        )

    def test_process_warning_and_rules_are_catalog_owned(self) -> None:
        plan = compile_subconverter_plan(
            self.generator.load_ini_mvp_plan(),
            include_process_rules=True,
            catalog=self.catalog,
        )
        self.assertEqual(plan.process_warning_lines, self.catalog.process_rules_warning)
        self.assertEqual(
            [rule.url.rsplit("/", 1)[-1] for rule in plan.process_rules],
            [rule.file for rule in self.catalog.process_rulesets],
        )

    def test_runtime_modules_do_not_name_legacy_companion_providers(self) -> None:
        provider_names = (
            "ssh_direct_classical",
            "ssh_proxy_classical",
            "ssh_process_classical",
            "gaming_direct_classical",
            "process_p2p_classical",
        )
        for relative in (
            "internal/python/ai_profiles/compiler.py",
            "internal/python/ai_profiles/writer.py",
            "internal/python/ai_profiles/render/subconverter.py",
            "internal/python/ai_profiles/static_rules.py",
        ):
            source = (ROOT / relative).read_text(encoding="utf-8").lower()
            for provider_name in provider_names:
                self.assertNotIn(provider_name, source, relative)


if __name__ == "__main__":
    unittest.main()
