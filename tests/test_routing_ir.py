from __future__ import annotations

import unittest
from pathlib import Path

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_ai_routing_rules
from ai_profiles.models import RoutingRule
from ai_profiles.routing_ir import (
    cluster_ini_rules,
    project_ini_rule,
    project_rule_provider,
    ruleset_rule,
)


class RoutingIrTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()

    def test_ruleset_metadata_drives_both_dialect_projections(self) -> None:
        rule = ruleset_rule(
            "Example_Rules",
            "Example Group",
            "Example_Rules.yaml",
            "domain",
        )

        provider = project_rule_provider(rule)
        ini = project_ini_rule(rule)

        self.assertEqual(provider.name, rule.value)
        self.assertEqual(provider.behavior, "domain")
        self.assertTrue(provider.url.endswith("/rule/Example_Rules.yaml"))
        self.assertEqual(ini.kind, "remote-domain")
        self.assertEqual(ini.target, rule.target)
        self.assertEqual(ini.url, provider.url)

    def test_non_ruleset_routes_project_without_dialect_specific_rebuild(self) -> None:
        geosite = project_ini_rule(RoutingRule("GEOSITE", "private", "DIRECT"))
        geoip = project_ini_rule(
            RoutingRule("GEOIP", "HK", "DIRECT", ("no-resolve",))
        )
        final = project_ini_rule(RoutingRule("MATCH", "", "FINAL"))

        self.assertEqual((geosite.kind, geosite.value), ("geosite", "private"))
        self.assertEqual((geoip.kind, geoip.value, geoip.options), ("geoip", "HK", ("no-resolve",)))
        self.assertEqual((final.kind, final.target), ("final", "FINAL"))

    def test_ruleset_projection_rejects_missing_provider_metadata(self) -> None:
        incomplete = RoutingRule("RULE-SET", "Missing", "Group")
        with self.assertRaises(RuntimeError):
            project_ini_rule(incomplete)
        with self.assertRaises(RuntimeError):
            project_rule_provider(incomplete)

    def test_contiguous_cluster_state_machine_is_shared(self) -> None:
        a = RoutingRule("GEOSITE", "a.example", "A")
        b = RoutingRule("GEOSITE", "b.example", "B")
        c = RoutingRule("GEOSITE", "c.example", "C")

        clusters = cluster_ini_rules(
            [
                ("merged", (a,)),
                ("merged", (b,)),
                (None, (c,)),
            ],
            emit_unclustered=True,
        )

        self.assertEqual(len(clusters), 2)
        self.assertEqual([rule.target for rule in clusters[0].rules], ["A", "B"])
        self.assertEqual([rule.target for rule in clusters[1].rules], ["C"])

    def test_compiler_no_longer_owns_cluster_state_machine(self) -> None:
        compiler_source = (
            Path(__file__).resolve().parents[1] / "internal" / "python" / "ai_profiles" / "compiler.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn("active_cluster", compiler_source)
        self.assertNotIn("def flush()", compiler_source)

    def test_service_rules_carry_provider_projection_metadata_in_canonical_ir(self) -> None:
        jules = next(service for service in self.catalog.services if service.id == "jules")
        rule = next(
            rule
            for rule in compile_ai_routing_rules(self.catalog)
            if rule.kind == "RULE-SET" and rule.value == jules.provider_key
        )

        self.assertEqual(rule.provider_file, jules.file)
        self.assertEqual(rule.provider_behavior, "classical")
        self.assertEqual(project_ini_rule(rule).target, jules.group)


if __name__ == "__main__":
    unittest.main()
