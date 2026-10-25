from __future__ import annotations

import unittest

from ai_profiles_test_support import ROOT, load_generator
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import (
    compile_ai_routing_rules,
    compile_dns_policies,
    compile_mihomo_profile,
    compile_routing_entries,
    compile_rule_providers,
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

    def test_full_region_services_share_one_pinned_pool(self) -> None:
        plan = compile_mihomo_profile(strict=False, include_process_rules=False, catalog=self.catalog)
        self.assertEqual(len({service.service.group for service in plan.services}), len(plan.services))
        full_region_services = [
            service for service in plan.services
            if service.region_groups == self.catalog.all_region_groups
        ]
        self.assertTrue(full_region_services)
        self.assertTrue(all(service.auto_group == self.catalog.group("auto") for service in full_region_services))
        for service in plan.services:
            if not service.service.direct_relaxed:
                self.assertNotIn(self.catalog.group("manual"), service.ui_proxies)
                self.assertNotIn(self.catalog.group("direct"), service.ui_proxies)

    def test_provider_inventory_follows_the_selected_routes(self) -> None:
        for strict in (False, True):
            for include_process in (False, True):
                with self.subTest(strict=strict, include_process=include_process):
                    routes = compile_routing_entries(
                        strict=strict, include_process_rules=include_process, catalog=self.catalog
                    )
                    providers = compile_rule_providers(
                        strict=strict, include_process_rules=include_process, catalog=self.catalog
                    )
                    expected = list(dict.fromkeys(
                        rule.value for rule in routes if getattr(rule, "kind", None) == "RULE-SET"
                    ))
                    self.assertEqual([provider.name for provider in providers], expected)

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
            [*self.catalog.stable_group_names(), self.catalog.group("reject")],
        )
        self.assertEqual(first.comments, ())

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
        expected_groups = list(dict.fromkeys(
            service.group
            for service in self.catalog.services
            if service.subconverter.rule_cluster == cluster_key
        ))
        actual_cluster = next(
            cluster
            for cluster in plan.service_rule_clusters
            if any(rule.target == jules.group for rule in cluster.rules)
        )
        actual_groups = list(dict.fromkeys(rule.target for rule in actual_cluster.rules))
        self.assertEqual(actual_groups, expected_groups)


if __name__ == "__main__":
    unittest.main()
