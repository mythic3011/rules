from __future__ import annotations

import unittest

import yaml

from ai_profiles_test_support import load_generator
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_mihomo_profile


MODULE = load_generator("generate_ai_profiles_jules")


class JulesCatalogTest(unittest.TestCase):
    def test_jules_is_declared_as_exact_domain_rules(self) -> None:
        service = next(item for item in MODULE.AI_SERVICES if item["id"] == "jules")
        self.assertEqual(service["provider_key"], "AI_Jules_Classical")
        self.assertEqual(service["group"], "🤖 Google AI Tools")
        self.assertEqual(service["file"], "AI_Jules_Classical.yaml")
        self.assertEqual(
            service["payload"],
            ["DOMAIN,jules.google.com", "DOMAIN,jules.googleapis.com"],
        )
        self.assertNotIn("DOMAIN-SUFFIX,google.com", service["payload"])
        self.assertNotIn("DOMAIN-SUFFIX,googleapis.com", service["payload"])
        self.assertNotIn("DOMAIN,accounts.google.com", service["payload"])

    def test_jules_projects_into_mihomo_rules_provider_group_and_dns(self) -> None:
        service = next(item for item in MODULE.AI_SERVICES if item["id"] == "jules")
        group = service["group"]
        catalog = load_catalog()
        plan = compile_mihomo_profile(
            strict=False, include_process_rules=False, catalog=catalog
        )
        group_plan = next(item for item in plan.services if item.service.group == group)
        self.assertEqual(group_plan.auto_group, catalog.group("auto"))
        relaxed = MODULE.render_yaml(strict=False)
        strict = MODULE.render_yaml(strict=True)
        rules = MODULE.render_yaml_rules(strict=False, include_process_rules=False)
        providers = MODULE.render_rule_providers(include_process_rules=False, strict=False)

        self.assertIn(f'name: "{group}"', relaxed)
        self.assertIn(f'"RULE-SET,AI_Jules_Classical,{group}"', rules)
        self.assertIn("AI_Jules_Classical:", providers)
        self.assertIn('"jules.google.com":', relaxed)
        self.assertIn('"jules.googleapis.com":', relaxed)

        strict_groups = {
            item["name"]: item for item in yaml.safe_load(strict).get("proxy-groups", [])
        }
        self.assertNotIn(MODULE.GROUP["direct"], strict_groups[group].get("proxies", []))

    def test_jules_projects_into_subconverter(self) -> None:
        service = next(item for item in MODULE.AI_SERVICES if item["id"] == "jules")
        group = service["group"]
        rendered_ini = MODULE.render_ini()
        self.assertIn(
            f"ruleset={group},clash-classic:"
            "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Jules_Classical.yaml,28800",
            rendered_ini,
        )
        self.assertIn(f"custom_proxy_group={group}`select`", rendered_ini)
        self.assertIn(f"[]{MODULE.GROUP['us']}", rendered_ini)
        self.assertIn(f"[]{MODULE.GROUP['reject']}", rendered_ini)

    def test_jules_is_in_legacy_ruleset_projection(self) -> None:
        provider_keys = [item["provider_key"] for item in MODULE.AI_RULESETS]
        self.assertIn("AI_Jules_Classical", provider_keys)


if __name__ == "__main__":
    unittest.main()
