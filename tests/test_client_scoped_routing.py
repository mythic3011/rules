from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from ai_profiles_test_support import copy_catalog, load_generator, read_json, write_json
from ai_profiles.catalog import load_catalog
from ai_profiles.schema import load_catalog_documents
from ai_profiles.compiler import compile_routing_entries, compile_subconverter_plan
from ai_profiles.models import RoutingRule


class ClientScopedRoutingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.generator = load_generator("generate_ai_profiles_client_scoped")

    def test_gaming_pc_default_direct_is_relaxed_mihomo_only(self) -> None:
        route = next(
            route for route in self.catalog.external_routes
            if route.id == "gaming-pc-default-direct"
        )
        self.assertEqual(route.kind, "SRC-IP-CIDR")
        self.assertEqual(route.value, "10.0.0.11/32")
        self.assertEqual(route.target, self.catalog.group("direct"))
        self.assertEqual(route.mihomo_when, "relaxed")
        self.assertIsNone(route.subconverter_cluster)

        relaxed = compile_routing_entries(
            strict=False,
            include_process_rules=False,
            catalog=self.catalog,
        )
        strict = compile_routing_entries(
            strict=True,
            include_process_rules=False,
            catalog=self.catalog,
        )
        relaxed_rules = [entry for entry in relaxed if isinstance(entry, RoutingRule)]
        strict_rules = [entry for entry in strict if isinstance(entry, RoutingRule)]

        client_index = next(
            index for index, rule in enumerate(relaxed_rules)
            if rule.kind == "SRC-IP-CIDR" and rule.value == "10.0.0.11/32"
        )
        final_index = next(index for index, rule in enumerate(relaxed_rules) if rule.kind == "MATCH")
        self.assertLess(client_index, final_index)
        self.assertFalse(
            any(rule.kind == "SRC-IP-CIDR" and rule.value == "10.0.0.11/32" for rule in strict_rules)
        )

    def test_ai_finance_and_custom_rules_precede_client_default(self) -> None:
        relaxed = [
            entry for entry in compile_routing_entries(
                strict=False,
                include_process_rules=False,
                catalog=self.catalog,
            )
            if isinstance(entry, RoutingRule)
        ]
        client_index = next(
            index for index, rule in enumerate(relaxed)
            if rule.kind == "SRC-IP-CIDR" and rule.value == "10.0.0.11/32"
        )

        # AI rules are service-specific and must win before the client fallback.
        openrouter_index = next(
            index for index, rule in enumerate(relaxed)
            if rule.kind == "RULE-SET" and rule.value == "AI_OpenRouter_Classical"
        )
        # High-risk account traffic must still hit the fail-closed account group.
        finance_index = next(
            index for index, rule in enumerate(relaxed)
            if rule.kind == "RULE-SET" and rule.value == "Finance_Stripe_Classical"
        )
        # Explicit gaming/CDN DIRECT policy still wins before the client default.
        gaming_index = next(
            index for index, rule in enumerate(relaxed)
            if rule.kind == "RULE-SET" and rule.value == "Gaming_Direct_Classical"
        )
        # User custom proxy rules remain an explicit override for this client.
        custom_proxy_index = next(
            index for index, rule in enumerate(relaxed)
            if rule.kind == "RULE-SET" and rule.value == "Custom_Proxy_Domain"
        )

        self.assertLess(openrouter_index, client_index)
        self.assertLess(finance_index, client_index)
        self.assertLess(gaming_index, client_index)
        self.assertLess(custom_proxy_index, client_index)

    def test_client_route_is_not_projected_to_subconverter(self) -> None:
        plan = compile_subconverter_plan(
            self.generator.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        rendered = self.generator.render_ini()
        self.assertNotIn("10.0.0.11", rendered)
        self.assertFalse(
            any(
                rule.value == "10.0.0.11/32"
                for cluster in plan.external_rule_clusters
                for rule in cluster.rules
            )
        )

    def test_schema_rejects_subconverter_projection_for_source_ip_route(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "external-routing.json"
            value = read_json(path)
            route = next(
                route for route in value["routes"]
                if route["id"] == "gaming-pc-default-direct"
            )
            route["subconverterCluster"] = "client-default"
            write_json(path, value)
            with self.assertRaisesRegex(RuntimeError, "SRC-IP-CIDR external routes are Mihomo-only"):
                load_catalog_documents(catalog_dir)

    def test_runtime_mechanism_does_not_name_the_gaming_pc(self) -> None:
        root = Path(__file__).resolve().parent.parent
        for relative in (
            "internal/python/ai_profiles/compiler.py",
            "internal/python/ai_profiles/render/mihomo.py",
            "internal/python/ai_profiles/routing_ir.py",
        ):
            self.assertNotIn(
                "10.0.0.11",
                (root / relative).read_text(encoding="utf-8"),
                relative,
            )


if __name__ == "__main__":
    unittest.main()
