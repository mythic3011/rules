from __future__ import annotations

import unittest

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import (
    compile_routing_entries,
    compile_rule_providers,
    compile_subconverter_plan,
)
from ai_profiles.models import RoutingRule
from ai_profiles.plans.ini_mvp import load_ini_mvp_plan


class LeakProtectionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.guard = next(
            rule
            for rule in cls.catalog.companion_rulesets
            if rule.category == "privacy"
        )

    def test_privacy_guard_blocks_known_stun_turn_and_ipv6_bypasses(self) -> None:
        self.assertEqual(self.guard.id, "privacy-stun-turn")
        self.assertEqual(self.guard.provider_key, "Privacy_Guard_Classical")
        self.assertEqual(self.guard.file, "Privacy_Guard_Classical.yaml")
        self.assertEqual(self.guard.group, self.catalog.group("reject"))
        self.assertTrue(self.guard.mihomo)
        self.assertIsNone(self.guard.subconverter_cluster)
        self.assertEqual(
            self.guard.payload,
            (
                "IP-CIDR6,::/0,no-resolve",
                "DST-PORT,53",
                "DST-PORT,853",
                "DST-PORT,3478",
                "DST-PORT,5349",
                "DST-PORT,19302-19309",
                "DOMAIN-KEYWORD,stun",
            ),
        )
        self.assertNotIn("DOMAIN-KEYWORD,turn", self.guard.payload)

    def test_mihomo_guard_precedes_private_ai_gaming_and_bypass_rules(self) -> None:
        for strict in (True, False):
            with self.subTest(strict=strict):
                entries = compile_routing_entries(
                    strict=strict,
                    include_process_rules=False,
                    catalog=self.catalog,
                )
                guard_indexes = [
                    index
                    for index, entry in enumerate(entries)
                    if isinstance(entry, RoutingRule)
                    and entry.kind == "RULE-SET"
                    and entry.value == self.guard.provider_key
                ]
                self.assertEqual(len(guard_indexes), 1)
                guard_index = guard_indexes[0]

                protected_later_rules = [
                    index
                    for index, entry in enumerate(entries)
                    if isinstance(entry, RoutingRule)
                    and (
                        entry.value == "private"
                        or entry.value.startswith("AI_")
                        or entry.value
                        in {
                            "Gaming_Direct_Classical",
                            "Custom_Direct_Domain",
                            "Custom_Direct_Classical_IP",
                        }
                        or entry.kind == "SRC-IP-CIDR"
                        or entry.target == self.catalog.group("direct")
                    )
                ]
                self.assertTrue(protected_later_rules)
                self.assertLess(guard_index, min(protected_later_rules))

                providers = compile_rule_providers(
                    strict=strict,
                    include_process_rules=False,
                    catalog=self.catalog,
                )
                guard_provider = next(
                    provider
                    for provider in providers
                    if provider.name == self.guard.provider_key
                )
                self.assertEqual(guard_provider.behavior, "classical")
                self.assertTrue(guard_provider.url.endswith(self.guard.file))

    def test_subconverter_guard_is_in_foundation_before_private_and_direct_rules(self) -> None:
        plan = compile_subconverter_plan(
            load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        foundation = plan.section("foundation-rules").rules
        guard_indexes = [
            index
            for index, rule in enumerate(foundation)
            if rule.kind == "remote-classical"
            and rule.url.endswith(self.guard.file)
        ]
        self.assertEqual(len(guard_indexes), 1)
        guard_index = guard_indexes[0]
        self.assertEqual(foundation[guard_index].target, self.catalog.group("reject"))
        self.assertEqual(guard_index, 0)
        self.assertTrue(
            any(
                rule.kind in {"geosite", "geoip"}
                and rule.value == "private"
                and rule.target == self.catalog.group("direct")
                for rule in foundation[guard_index + 1 :]
            )
        )
        self.assertFalse(
            any(
                rule.url.endswith(self.guard.file)
                for cluster in plan.companion_rule_clusters
                for rule in cluster.rules
            )
        )


if __name__ == "__main__":
    unittest.main()
