from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from ai_profiles_test_support import CATALOG_DIR, ROOT, copy_catalog, load_generator, read_json, write_json
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_routing_entries, compile_rule_providers, compile_subconverter_plan
from ai_profiles.models import RoutingRule
from ai_profiles.schema import load_catalog_documents


class ExternalRoutingCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.generator = load_generator("generate_ai_profiles_external_routing_contracts")

    def test_current_external_routes_declare_ordered_projection_metadata(self) -> None:
        documents = load_catalog_documents(CATALOG_DIR)
        routes = documents.external_routing.routes
        self.assertEqual(
            [route.id for route in routes],
            [
                "custom-direct-domain",
                "custom-direct-classical-ip",
                "custom-proxy-domain",
                "custom-proxy-classical-ip",
                "hk-direct",
                "gaming-pc-default-direct",
                "final",
            ],
        )
        self.assertEqual(
            [route.subconverter_cluster for route in routes],
            ["custom-direct", "custom-direct", "custom-proxy", "custom-proxy", "geoip-hk", None, "final"],
        )
        self.assertEqual(
            [route.provider.behavior if route.provider else None for route in routes],
            ["domain", "classical", "domain", "classical", None, None, None],
        )

    def test_schema_rejects_provider_on_non_ruleset_route(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "external-routing.json"
            value = read_json(path)
            hk = next(route for route in value["routes"] if route["id"] == "hk-direct")
            hk["provider"] = {"behavior": "classical", "file": "HK.yaml"}
            write_json(path, value)
            with self.assertRaisesRegex(RuntimeError, "Only RULE-SET external routes may declare providers"):
                load_catalog_documents(catalog_dir)

    def test_catalog_rejects_unknown_external_group_after_schema_passes(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "external-routing.json"
            value = read_json(path)
            value["routes"][0]["targetGroupKey"] = "missing"
            write_json(path, value)
            documents = load_catalog_documents(catalog_dir)
            self.assertEqual(documents.external_routing.routes[0].target_group_key, "missing")
            with self.assertRaisesRegex(RuntimeError, "Unknown external route group key"):
                load_catalog(catalog_dir)

    def test_mihomo_external_tail_and_provider_order_are_catalog_driven(self) -> None:
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
        external_values = [route.value for route in self.catalog.external_routes]
        relaxed_tail = [
            entry for entry in relaxed
            if isinstance(entry, RoutingRule) and entry.value in set(external_values)
        ]
        self.assertEqual([entry.value for entry in relaxed_tail], external_values)
        self.assertEqual(relaxed_tail[-1].kind, "MATCH")
        self.assertEqual(relaxed_tail[-1].target, self.catalog.group("fallback"))

        strict_external = [
            entry for entry in strict
            if isinstance(entry, RoutingRule) and entry.value in set(external_values)
        ]
        self.assertEqual(len(strict_external), 1)
        self.assertEqual(strict_external[0].kind, "MATCH")
        self.assertEqual(strict_external[0].target, self.catalog.group("reject"))

        providers = compile_rule_providers(
            strict=False,
            include_process_rules=False,
            catalog=self.catalog,
        )
        expected_external_providers = [
            route.value for route in self.catalog.external_routes if route.provider_behavior is not None
        ]
        self.assertEqual(
            [provider.name for provider in providers[: len(expected_external_providers)]],
            expected_external_providers,
        )

    def test_subconverter_external_clusters_are_catalog_driven(self) -> None:
        plan = compile_subconverter_plan(
            self.generator.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        rendered = self.generator.render_ini()
        self.assertEqual(
            [[rule.kind for rule in cluster.rules] for cluster in plan.external_rule_clusters],
            [
                ["remote-domain", "remote-classical"],
                ["remote-domain", "remote-classical"],
                ["geoip"],
                ["final"],
            ],
        )
        self.assertIn(
            f"ruleset={self.catalog.group('direct')},clash-domain:"
            "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/Custom_Direct_Domain.yaml,28800",
            rendered,
        )
        self.assertIn(f"ruleset={self.catalog.group('direct')},[]GEOIP,HK,no-resolve", rendered)
        self.assertIn(f"ruleset={self.catalog.group('fallback')},[]FINAL", rendered)

    def test_runtime_modules_do_not_name_legacy_external_routes(self) -> None:
        legacy_literals = (
            "custom_direct_domain",
            "custom_direct_classical_ip",
            "custom_proxy_domain",
            "custom_proxy_classical_ip",
            '"hk"',
        )
        for relative in (
            "internal/python/ai_profiles/compiler.py",
            "internal/python/ai_profiles/render/subconverter.py",
        ):
            source = (ROOT / relative).read_text(encoding="utf-8").lower()
            for literal in legacy_literals:
                self.assertNotIn(literal, source, relative)


if __name__ == "__main__":
    unittest.main()
