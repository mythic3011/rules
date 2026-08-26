from __future__ import annotations

from pathlib import Path
import re
import tempfile
import unittest

from ai_profiles_test_support import CATALOG_DIR, copy_catalog, load_generator, read_json, write_json
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_mihomo_profile, compile_subconverter_plan
from ai_profiles.models import IniProxyGroup
from ai_profiles.schema import load_catalog_documents


MODULE = load_generator("generate_ai_profiles_account_sensitive")


class AccountSensitivePolicyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()

    def test_profile_declares_stable_session_and_high_risk_kill_switch_groups(self) -> None:
        documents = load_catalog_documents(CATALOG_DIR)
        groups = documents.profile.policy_groups
        self.assertEqual(len(groups), 2)
        stable, high_risk = groups
        self.assertEqual(stable.id, "account-sensitive")
        self.assertEqual(stable.group_key, "stable-session")
        self.assertEqual(
            [(candidate.kind, candidate.value) for candidate in stable.candidates],
            [("builtin", "DIRECT"), ("builtin", "REJECT")],
        )
        self.assertTrue(stable.include_provider_nodes)
        self.assertIsNone(stable.default_selected)

        self.assertEqual(high_risk.id, "high-risk-account-kill-switch")
        self.assertEqual(high_risk.group_key, "high-risk-account")
        self.assertEqual(
            [(candidate.kind, candidate.value) for candidate in high_risk.candidates],
            [("builtin", "REJECT"), ("group-ref", "stable-session")],
        )
        self.assertFalse(high_risk.include_provider_nodes)
        self.assertEqual((high_risk.default_selected.kind, high_risk.default_selected.value), ("builtin", "REJECT"))
        self.assertTrue(all(group.kind == "select" for group in groups))
        self.assertTrue(all(group.mihomo_when == "relaxed" for group in groups))
        self.assertTrue(all(group.subconverter for group in groups))

    def test_mihomo_stable_session_group_is_relaxed_only_and_exposes_raw_provider_nodes(self) -> None:
        relaxed = compile_mihomo_profile(
            strict=False, include_process_rules=False, catalog=self.catalog
        )
        strict = compile_mihomo_profile(
            strict=True, include_process_rules=False, catalog=self.catalog
        )
        self.assertEqual(
            [group.name for group in relaxed.policy_groups],
            [self.catalog.group("stable-session"), self.catalog.group("high-risk-account")],
        )
        self.assertEqual(strict.policy_groups, ())

        rendered = MODULE.render_yaml(strict=False)
        block = rendered.split(f'- name: "{self.catalog.group("stable-session")}"', 1)[1].split(
            '- name:', 1
        )[0]
        self.assertIn('type: select', block)
        self.assertIn('- "DIRECT"', block)
        self.assertIn('- "REJECT"', block)
        self.assertIn('use:', block)
        self.assertIn('- provider1', block)
        self.assertNotIn(f'- name: "{self.catalog.group("stable-session")}"', MODULE.render_yaml(strict=True))

    def test_subconverter_stable_session_group_has_independent_provider_node_filter(self) -> None:
        plan = compile_subconverter_plan(
            MODULE.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        shared = plan.section("shared-routing-groups").groups
        stable = next(group for group in shared if group.name == self.catalog.group("stable-session"))
        self.assertIsInstance(stable, IniProxyGroup)
        self.assertEqual(stable.kind, "select")
        self.assertEqual([candidate.value for candidate in stable.candidates], ["[]DIRECT", "[]REJECT"])
        self.assertEqual(stable.filter_pattern, self.catalog.provider_pool_filter)

    def test_stable_provider_pool_keeps_hk_nodes_while_ai_pool_still_excludes_them(self) -> None:
        hk_node = "🇭🇰 香港 HK-01"
        self.assertIsNotNone(re.match(self.catalog.provider_pool_filter, hk_node))
        self.assertIsNone(re.match(self.catalog.ai_pool_filter, hk_node))

    def test_all_finance_companions_target_high_risk_kill_switch(self) -> None:
        finance = [rule for rule in self.catalog.companion_rulesets if rule.category == "finance"]
        self.assertGreaterEqual(len(finance), 6)
        self.assertTrue(finance)
        self.assertTrue(all(rule.group == self.catalog.group("high-risk-account") for rule in finance))
        self.assertTrue(all(rule.subconverter_cluster == "finance" for rule in finance))

    def test_schema_and_catalog_reject_invalid_policy_group_declarations(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            profile_path = catalog_dir / "profile.json"
            value = read_json(profile_path)
            value["policyGroups"][0]["kind"] = "fallback"
            write_json(profile_path, value)
            with self.assertRaisesRegex(RuntimeError, "Unknown AI profile policy group kind"):
                load_catalog_documents(catalog_dir)

        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            profile_path = catalog_dir / "profile.json"
            value = read_json(profile_path)
            value["policyGroups"][0]["candidates"][0]["value"] = "MAGIC"
            write_json(profile_path, value)
            load_catalog_documents(catalog_dir)
            with self.assertRaisesRegex(RuntimeError, "Unknown profile policy builtin candidate"):
                load_catalog(catalog_dir)

    def test_schema_rejects_default_selected_outside_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            profile_path = catalog_dir / "profile.json"
            value = read_json(profile_path)
            high_risk = next(
                group for group in value["policyGroups"]
                if group["id"] == "high-risk-account-kill-switch"
            )
            high_risk["defaultSelected"] = {"kind": "builtin", "value": "DIRECT"}
            write_json(profile_path, value)
            with self.assertRaisesRegex(RuntimeError, "defaultSelected must reference a candidate"):
                load_catalog_documents(catalog_dir)


if __name__ == "__main__":
    unittest.main()
