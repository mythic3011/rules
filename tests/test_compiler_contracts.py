from __future__ import annotations

import unittest

from ai_profiles_test_support import ROOT, load_generator
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import (
    compile_ai_routing_rules,
    compile_dns_policies,
    compile_service_routing,
    compile_subconverter_plan,
)


class CompilerContractsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.jules = next(service for service in cls.catalog.services if service.id == "jules")
        cls.generator = load_generator("generate_ai_profiles_compiler_contracts")

    def test_relaxed_service_plan_can_offer_direct_only_when_declared(self) -> None:
        relaxed = compile_service_routing(self.jules, strict=False, catalog=self.catalog)
        strict = compile_service_routing(self.jules, strict=True, catalog=self.catalog)

        self.assertIn(self.catalog.group("direct"), relaxed.ui_proxies)
        self.assertNotIn(self.catalog.group("direct"), strict.ui_proxies)
        self.assertNotIn(self.catalog.group("direct"), relaxed.auto_proxies)
        self.assertNotIn(self.catalog.group("direct"), strict.auto_proxies)

    def test_jules_local_rule_is_compiled_before_global_ai_aggregates(self) -> None:
        rules = compile_ai_routing_rules(self.catalog)
        jules_index = next(
            index
            for index, rule in enumerate(rules)
            if rule.kind == "RULE-SET" and rule.value == "AI_Jules_Classical"
        )
        aggregate_indexes = [
            index
            for index, rule in enumerate(rules)
            if rule.kind == "GEOSITE" and rule.target in {"🤖 AI Other", "🤖 AI CN Other"}
        ]
        self.assertTrue(aggregate_indexes)
        self.assertLess(jules_index, min(aggregate_indexes))

    def test_dns_compiler_returns_one_globally_ordered_policy_stream(self) -> None:
        policies = compile_dns_policies(self.catalog)
        orders = [policy.order for policy in policies]
        selectors = [policy.selector for policy in policies]

        self.assertEqual(orders, sorted(orders))
        self.assertEqual(len(orders), len(set(orders)))
        self.assertEqual(len(selectors), len(set(selectors)))
        self.assertIn("jules.google.com", selectors)
        self.assertIn("jules.googleapis.com", selectors)

    def test_subconverter_service_specific_policy_is_catalog_driven(self) -> None:
        plan = compile_subconverter_plan(
            self.generator.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        first = plan.service_selectors[0]
        self.assertEqual(
            first.group.name,
            next(service.group for service in self.catalog.services if service.id == "chatgpt"),
        )
        self.assertEqual(
            [candidate.value for candidate in first.group.candidates],
            [self.catalog.group("reject"), self.catalog.group("manual")],
        )
        self.assertEqual(
            first.comments,
            ("; ChatGPT is fail-closed.", "; User must explicitly select 手動選擇."),
        )

    def test_compiler_has_no_named_service_policy_literals(self) -> None:
        compiler_source = (ROOT / "internal" / "python" / "ai_profiles" / "compiler.py").read_text(
            encoding="utf-8"
        ).lower()
        for service_id in ("chatgpt", "gemini", "poe", "jules"):
            self.assertNotIn(service_id, compiler_source)

    def test_declared_rule_cluster_is_projected_without_named_compiler_logic(self) -> None:
        plan = compile_subconverter_plan(
            self.generator.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        jules = next(service for service in self.catalog.services if service.id == "jules")
        cluster_key = jules.subconverter.rule_cluster
        self.assertIsNotNone(cluster_key)
        expected_groups = [
            service.group
            for service in self.catalog.services
            if service.subconverter.rule_cluster == cluster_key
        ]
        actual_cluster = next(
            cluster
            for cluster in plan.service_rule_clusters
            if any(rule.target == jules.group for rule in cluster.rules)
        )
        actual_groups = list(dict.fromkeys(rule.target for rule in actual_cluster.rules))
        self.assertEqual(actual_groups, expected_groups)


if __name__ == "__main__":
    unittest.main()
