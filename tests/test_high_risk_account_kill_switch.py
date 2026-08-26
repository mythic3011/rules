from __future__ import annotations

import unittest

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_mihomo_profile, compile_subconverter_plan
from ai_profiles.models import IniProxyGroup
from ai_profiles_test_support import load_generator


MODULE = load_generator("generate_ai_profiles_high_risk_account")


class HighRiskAccountKillSwitchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()

    def test_high_risk_group_defaults_to_reject_then_explicit_stable_session(self) -> None:
        relaxed = compile_mihomo_profile(
            strict=False,
            include_process_rules=False,
            catalog=self.catalog,
        )
        group = next(
            group for group in relaxed.policy_groups
            if group.name == self.catalog.group("high-risk-account")
        )
        self.assertEqual(
            [candidate.value for candidate in group.candidates],
            ["REJECT", self.catalog.group("stable-session")],
        )
        self.assertFalse(group.include_provider_nodes)
        self.assertEqual(group.default_selected, "REJECT")

    def test_mihomo_render_is_fail_closed_and_has_no_auto_or_direct_escape(self) -> None:
        rendered = MODULE.render_yaml(strict=False)
        name = self.catalog.group("high-risk-account")
        block = rendered.split(f'- name: "{name}"', 1)[1].split('- name:', 1)[0]
        reject_pos = block.index('- "REJECT"')
        stable_pos = block.index(f'- "{self.catalog.group("stable-session")}"')
        self.assertLess(reject_pos, stable_pos)
        self.assertNotIn('- "DIRECT"', block)
        self.assertNotIn(self.catalog.group("auto"), block)
        self.assertNotIn('use:', block)
        self.assertIn('default-selected: "REJECT"', block)

    def test_subconverter_group_keeps_same_fail_closed_order(self) -> None:
        plan = compile_subconverter_plan(
            MODULE.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        shared = plan.section("shared-routing-groups").groups
        group = next(
            group for group in shared
            if group.name == self.catalog.group("high-risk-account")
        )
        self.assertIsInstance(group, IniProxyGroup)
        self.assertEqual(group.kind, "select")
        self.assertEqual(
            [candidate.value for candidate in group.candidates],
            ["[]REJECT", self.catalog.group("stable-session")],
        )
        self.assertIsNone(group.filter_pattern)

    def test_all_finance_rules_terminate_at_kill_switch_not_stable_session(self) -> None:
        finance = [rule for rule in self.catalog.companion_rulesets if rule.category == "finance"]
        self.assertTrue(finance)
        self.assertTrue(
            all(rule.group == self.catalog.group("high-risk-account") for rule in finance)
        )
        self.assertTrue(
            all(rule.group != self.catalog.group("stable-session") for rule in finance)
        )

    def test_strict_profile_does_not_expose_relaxed_account_groups(self) -> None:
        strict = compile_mihomo_profile(
            strict=True,
            include_process_rules=False,
            catalog=self.catalog,
        )
        self.assertEqual(strict.policy_groups, ())
        rendered = MODULE.render_yaml(strict=True)
        self.assertNotIn(self.catalog.group("high-risk-account"), rendered)
        self.assertNotIn(self.catalog.group("stable-session"), rendered)


if __name__ == "__main__":
    unittest.main()
