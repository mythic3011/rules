from __future__ import annotations

import json
import unittest
from pathlib import Path

from internal.python.generate_profile_service_runtime import build_runtime_data
from internal.python.ai_profiles.plans.ini_mvp import (
    account_protection_group_candidates,
    load_ini_mvp_plan,
)
from internal.python.ai_profiles.profile_templates import load_profile_template_registry

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_PATH = ROOT / "apps/profile-service/worker/generated/runtime-data.mjs"


class GenerateProfileServiceRuntimeTest(unittest.TestCase):
    def test_build_runtime_data_matches_checked_in_worker_artifact(self) -> None:
        data = build_runtime_data()
        self.assertEqual(data["schemaVersion"], 1)
        self.assertIn("ai-balanced", {profile["id"] for profile in data["baseProfiles"]})
        services = {service["id"]: service for service in data["services"]}
        self.assertEqual(services["chatgpt"]["outputFormats"], ["ini", "yaml"])
        self.assertTrue(all(
            set(service["outputFormats"]) <= {"ini", "yaml"}
            for service in data["services"]
        ))
        for key in ("groups", "regions", "stableRegionGroups", "plan", "parityFixtures", "render", "mihomoProfile"):
            self.assertIn(key, data)
        self.assertEqual(
            set(data["parityFixtures"]),
            {
                "disable-jp",
                "only-us-sg-prefer-sg",
                "disable-hk",
                "disable-account-protected-service",
                "block-direct",
                "fail-closed",
                "service-groups-hk-reordered",
                "service-groups-unassigned-chatgpt",
            },
        )
        for fixture in data["parityFixtures"].values():
            self.assertEqual(len(fixture["customBodySha256"]), 64)

        artifact = RUNTIME_PATH.read_text(encoding="utf-8")
        self.assertTrue(artifact.startswith("// GENERATED. Do not edit.\nexport default "))
        body = artifact.removeprefix("// GENERATED. Do not edit.\nexport default ").removesuffix(";\n")
        self.assertEqual(json.loads(body), data)

    def test_converter_profile_bundles_local_rules_and_omits_controller_secrets(self) -> None:
        data = build_runtime_data()
        profile = data["mihomoProfile"]
        self.assertNotIn("secret", profile)
        self.assertNotIn("external-controller", profile)
        self.assertTrue(all(group["type"] == "select" for group in profile["proxy-groups"]))
        providers = profile["rule-providers"]
        first_provider = profile["rules"][0].split(",")[1]
        self.assertEqual(providers[first_provider]["type"], "inline")
        self.assertTrue(providers[first_provider]["payload"])

    def test_protected_service_rules_and_yaml_group_come_from_typed_account_plan(self) -> None:
        data = build_runtime_data()
        plan = load_ini_mvp_plan()
        account = plan["accountProtection"]
        self.assertEqual(data["accountProtection"], account)

        protected_group = next(
            group
            for group in data["mihomoProfile"]["proxy-groups"]
            if group["name"] == account["protectedGroup"]
        )
        self.assertEqual(
            protected_group["proxies"],
            list(account_protection_group_candidates(plan)),
        )
        self.assertEqual(protected_group["proxies"][0], account["rejectGroup"])
        self.assertNotIn("DIRECT", protected_group["proxies"])

        service = next(item for item in data["services"] if item["id"] == account["serviceId"])
        before_legacy = next(
            section["rules"]
            for section in data["plan"]["sections"]
            if section["role"] == "legacy-before"
        )
        protected_rules = [rule for rule in before_legacy if rule["target"] == account["protectedGroup"]]
        for reference in service["ruleRefs"]:
            expected_kind = reference["iniKind"]
            expected_value = reference["iniValue"]
            self.assertTrue(any(
                rule["kind"] == expected_kind
                and rule["target"] == account["protectedGroup"]
                and (rule.get("url") == expected_value or rule.get("value") == expected_value)
                for rule in protected_rules
            ))
        legacy_rule = plan["rules"]["beforeLegacy"][-1]
        self.assertEqual(protected_rules[-1]["url"], legacy_rule["url"])

    def test_static_yaml_uses_registered_proxy_egress_for_dns(self) -> None:
        data = build_runtime_data()
        template = load_profile_template_registry().get("yaml", "standard")
        profile = data["outputProfiles"]["yaml"][template.id]
        groups = {group["name"]: group for group in profile["proxy-groups"]}

        self.assertEqual(
            groups[data["groups"]["dns"]]["proxies"],
            [template.dns_egress_group, data["groups"]["reject"]],
        )
        self.assertEqual(groups[data["groups"]["reject"]]["proxies"], ["REJECT"])
        self.assertNotIn("DIRECT", groups[data["groups"]["dns"]]["proxies"])
        self.assertIs(profile["dns"]["ipv6"], False)
        self.assertTrue(profile["rules"][0].startswith("RULE-SET,"))
        self.assertEqual(profile["rules"][0].split(",")[2], "REJECT")


if __name__ == "__main__":
    unittest.main()
