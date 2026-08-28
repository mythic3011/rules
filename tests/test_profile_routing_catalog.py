from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from ai_profiles_test_support import CATALOG_DIR, ROOT, copy_catalog, load_generator, read_json, write_json
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_routing_entries, compile_subconverter_plan
from ai_profiles.models import RoutingRule
from ai_profiles.schema import load_catalog_documents


class ProfileRoutingCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.generator = load_generator("generate_ai_profiles_profile_routing_contracts")

    def test_current_profile_declares_foundation_routes_and_subconverter_groups(self) -> None:
        profile = load_catalog_documents(CATALOG_DIR).profile
        self.assertEqual(
            [(route.kind, route.value, route.target_group_key, route.options) for route in profile.foundation_routes],
            [
                ("GEOSITE", "private", "direct", ()),
                ("GEOIP", "private", "direct", ("no-resolve",)),
            ],
        )
        self.assertTrue(all(route.subconverter for route in profile.foundation_routes))
        self.assertEqual(
            [group.group_key for group in profile.subconverter_groups.foundation],
            ["direct", "reject"],
        )
        self.assertEqual(profile.subconverter_groups.final.group_key, "fallback")
        self.assertEqual(
            [candidate.value for candidate in profile.subconverter_groups.final.candidates],
            ["direct", "manual", "auto", "other", "reject"],
        )

    def test_schema_rejects_unknown_foundation_route_kind(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "profile.json"
            value = read_json(path)
            value["foundationRoutes"][0]["kind"] = "MAGIC"
            write_json(path, value)
            with self.assertRaisesRegex(RuntimeError, "Unknown AI profile foundation route kind"):
                load_catalog_documents(catalog_dir)

    def test_catalog_rejects_unknown_profile_group_reference(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "profile.json"
            value = read_json(path)
            value["foundationRoutes"][0]["targetGroupKey"] = "missing"
            write_json(path, value)
            load_catalog_documents(catalog_dir)
            with self.assertRaisesRegex(RuntimeError, "Unknown foundation route group key"):
                load_catalog(catalog_dir)

    def test_foundation_routes_drive_both_mihomo_and_subconverter(self) -> None:
        routing = compile_routing_entries(
            strict=False,
            include_process_rules=False,
            catalog=self.catalog,
        )
        foundation = [
            entry for entry in routing[: len(self.catalog.foundation_routes)] if isinstance(entry, RoutingRule)
        ]
        self.assertEqual(
            [(rule.kind, rule.value, rule.target, rule.options) for rule in foundation],
            [
                (route.kind, route.value, route.target, route.options)
                for route in self.catalog.foundation_routes
            ],
        )

        plan = compile_subconverter_plan(
            self.generator.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        foundation_rules_section = plan._rules_section("foundation-rules")
        self.assertEqual(
            [(rule.kind, rule.value, rule.target, rule.options) for rule in foundation_rules_section.rules],
            [
                ("geosite", "private", self.catalog.group("direct"), ()),
                ("geoip", "private", self.catalog.group("direct"), ("no-resolve",)),
            ],
        )

    def test_final_group_candidate_order_is_profile_data_driven(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "profile.json"
            value = read_json(path)
            candidates = value["subconverterGroups"]["final"]["candidates"]
            candidates[0], candidates[1] = candidates[1], candidates[0]
            write_json(path, value)

            catalog = load_catalog(catalog_dir)
            plan = compile_subconverter_plan(
                self.generator.load_ini_mvp_plan(),
                include_process_rules=False,
                catalog=catalog,
            )
            self.assertEqual(
                [candidate.value for candidate in plan.final_group.candidates[:2]],
                [catalog.group("manual"), catalog.group("direct")],
            )

    def test_runtime_modules_do_not_embed_foundation_literals(self) -> None:
        for relative in (
            "internal/python/ai_profiles/compiler.py",
            "internal/python/ai_profiles/render/subconverter.py",
        ):
            source = (ROOT / relative).read_text(encoding="utf-8").lower()
            for literal in ('"private"', "'private'", "[]direct", "[]reject"):
                self.assertNotIn(literal, source, relative)


if __name__ == "__main__":
    unittest.main()
