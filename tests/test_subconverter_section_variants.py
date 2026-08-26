from __future__ import annotations

import inspect
import unittest
from dataclasses import replace

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_subconverter_plan
from ai_profiles.models import (
    IniClustersSection,
    IniGroupsSection,
    IniRulesSection,
    IniSection,
    IniSelectorsSection,
    SubconverterPlan,
)
from ai_profiles.render.subconverter import _emit_ini_section, _render_ini
from ai_profiles_test_support import load_generator


class SubconverterSectionVariantsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.generator = load_generator("generate_ai_profiles_p14_section_variants")
        cls.plan = compile_subconverter_plan(
            cls.generator.load_ini_mvp_plan(),
            include_process_rules=True,
            catalog=cls.catalog,
        )

    def test_compiler_emits_typed_section_variants(self) -> None:
        expected = {
            "foundation-rules": IniRulesSection,
            "legacy-before": IniRulesSection,
            "service-rule-clusters": IniClustersSection,
            "legacy-after-head": IniRulesSection,
            "process-rules": IniRulesSection,
            "legacy-after-tail": IniRulesSection,
            "routing-tail-clusters": IniClustersSection,
            "foundation-groups": IniGroupsSection,
            "automatic-region-groups": IniGroupsSection,
            "stable-region-groups": IniGroupsSection,
            "shared-routing-groups": IniGroupsSection,
            "service-selectors": IniSelectorsSection,
            "account-group": IniGroupsSection,
            "stable-session-groups": IniGroupsSection,
            "final-group": IniGroupsSection,
        }
        self.assertEqual(
            {section.role: type(section) for section in self.plan.sections},
            expected,
        )

    def test_renderer_dispatch_does_not_depend_on_section_roles(self) -> None:
        source = inspect.getsource(_emit_ini_section)
        self.assertNotIn("section.role", source)
        for role in (
            "foundation-rules",
            "service-rule-clusters",
            "process-rules",
            "foundation-groups",
            "service-selectors",
            "final-group",
        ):
            self.assertNotIn(role, source)

    def test_presentation_metadata_is_part_of_render_plan(self) -> None:
        section = self.plan.section("foundation-groups")
        self.assertIsInstance(section, IniGroupsSection)
        mutated = replace(section, title="P14-TYPED-SECTION-SENTINEL")
        mutated_plan = SubconverterPlan(
            sections=tuple(
                mutated if item.role == section.role else item
                for item in self.plan.sections
            )
        )
        self.assertIn("P14-TYPED-SECTION-SENTINEL", _render_ini(mutated_plan))

    def test_generic_section_is_not_a_renderable_plan_variant(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "typed section variants"):
            SubconverterPlan(sections=(IniSection("foundation-rules"),))

    def test_layout_mutation_is_data_driven_not_role_driven(self) -> None:
        section = self.plan.section("routing-tail-clusters")
        self.assertIsInstance(section, IniClustersSection)
        mutated = replace(section, blank_between=False)
        mutated_plan = SubconverterPlan(
            sections=tuple(
                mutated if item.role == section.role else item
                for item in self.plan.sections
            )
        )
        # The renderer accepts layout metadata from the variant; it does not
        # rebuild spacing from the semantic role.
        self.assertNotEqual(_render_ini(mutated_plan), _render_ini(self.plan))


if __name__ == "__main__":
    unittest.main()
