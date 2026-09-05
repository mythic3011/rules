from __future__ import annotations

import inspect
import unittest
from dataclasses import fields, replace

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_subconverter_plan
from ai_profiles.models import IniProxyGroup, IniSection, SubconverterPlan
from ai_profiles.render.subconverter import _render_ini
from ai_profiles_test_support import load_generator


class SubconverterSectionsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.generator = load_generator("generate_ai_profiles_p13_sections")
        cls.plan = compile_subconverter_plan(
            cls.generator.load_ini_mvp_plan(),
            include_process_rules=True,
            catalog=cls.catalog,
        )

    def test_plan_storage_shape_is_only_ordered_sections(self) -> None:
        self.assertEqual([field.name for field in fields(SubconverterPlan)], ["sections"])
        self.assertEqual(len(self.plan.sections), len({section.role for section in self.plan.sections}))

    def test_compiler_emits_sections_in_one_explicit_order(self) -> None:
        self.assertEqual(
            [section.role for section in self.plan.sections],
            [
                "foundation-rules",
                "legacy-before",
                "service-rule-clusters",
                "legacy-after-head",
                "process-rules",
                "legacy-after-tail",
                "routing-tail-clusters",
                "foundation-groups",
                "automatic-region-groups",
                "stable-region-groups",
                "shared-routing-groups",
                "service-selectors",
                "account-group",
                "stable-session-groups",
                "final-group",
            ],
        )

    def test_legacy_plan_views_are_derived_from_sections(self) -> None:
        self.assertIs(self.plan.service_selectors, self.plan.section("service-selectors").selectors)
        self.assertEqual(
            self.plan.companion_rule_clusters,
            tuple(
                cluster
                for cluster in self.plan.section("routing-tail-clusters").clusters
                if cluster.source == "companion"
            ),
        )
        self.assertEqual(
            self.plan.external_rule_clusters,
            tuple(
                cluster
                for cluster in self.plan.section("routing-tail-clusters").clusters
                if cluster.source == "external"
            ),
        )

    def test_render_plan_contains_automatic_and_shared_groups(self) -> None:
        automatic = self.plan.section("automatic-region-groups").groups
        shared = self.plan.section("shared-routing-groups").groups
        self.assertTrue(automatic)
        self.assertTrue(all(isinstance(group, IniProxyGroup) for group in automatic))
        other = next(group for group in automatic if group.name == "🌐 其他／未識別節點")
        self.assertEqual(other.kind, "select")
        self.assertIsNotNone(other.filter_pattern)
        self.assertIsNone(other.health_check_url)
        self.assertEqual([group.kind for group in shared], ["fallback", "select", "select", "select"])
        self.assertTrue(all(group.kind == "url-test" for group in automatic if group.name != "🌐 其他／未識別節點"))

    def test_render_ini_does_not_reload_catalog(self) -> None:
        source = inspect.getsource(_render_ini)
        self.assertNotIn("load_catalog", source)
        self.assertNotIn("catalog.", source)

    def test_compiled_group_mutation_renders_without_catalog_rebuild(self) -> None:
        section = self.plan.section("automatic-region-groups")
        first = section.groups[0]
        self.assertIsInstance(first, IniProxyGroup)
        mutated_group = replace(first, filter_pattern="P13-SENTINEL")
        mutated_section = replace(section, groups=(mutated_group, *section.groups[1:]))
        mutated_plan = SubconverterPlan(
            sections=tuple(
                mutated_section if item.role == section.role else item
                for item in self.plan.sections
            )
        )
        rendered = _render_ini(mutated_plan)
        self.assertIn("P13-SENTINEL", rendered)

    def test_duplicate_section_roles_fail_fast(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "section roles must be unique"):
            SubconverterPlan(
                sections=(
                    IniSection("foundation-rules"),
                    IniSection("foundation-rules"),
                )
            )


if __name__ == "__main__":
    unittest.main()
