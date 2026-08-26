from __future__ import annotations

import unittest

from ai_profiles_test_support import load_generator


MODULE = load_generator("generate_ai_profiles_jules")


class JulesCatalogTest(unittest.TestCase):
    def test_jules_is_declared_as_exact_domain_rules(self) -> None:
        service = next(item for item in MODULE.AI_SERVICES if item["id"] == "jules")
        self.assertEqual(service["provider_key"], "AI_Jules_Classical")
        self.assertEqual(service["group"], "🤖 Jules")
        self.assertEqual(service["file"], "AI_Jules_Classical.yaml")
        self.assertEqual(
            service["payload"],
            ["DOMAIN,jules.google.com", "DOMAIN,jules.googleapis.com"],
        )
        self.assertNotIn("DOMAIN-SUFFIX,google.com", service["payload"])
        self.assertNotIn("DOMAIN-SUFFIX,googleapis.com", service["payload"])
        self.assertNotIn("DOMAIN,accounts.google.com", service["payload"])

    def test_jules_projects_into_mihomo_rules_provider_group_and_dns(self) -> None:
        relaxed = MODULE.render_yaml(strict=False)
        strict = MODULE.render_yaml(strict=True)
        rules = MODULE.render_yaml_rules(strict=False, include_process_rules=False)
        providers = MODULE.render_rule_providers(include_process_rules=False, strict=False)

        self.assertIn('name: "🤖 Jules"', relaxed)
        self.assertIn('name: "🤖 Jules · 自動"', relaxed)
        self.assertIn('"RULE-SET,AI_Jules_Classical,🤖 Jules"', rules)
        self.assertIn("AI_Jules_Classical:", providers)
        self.assertIn('"jules.google.com":', relaxed)
        self.assertIn('"jules.googleapis.com":', relaxed)

        strict_block = strict.split('- name: "🤖 Jules"', 1)[1].split('- name: "🤖 Jules · 自動"', 1)[0]
        self.assertNotIn(MODULE.GROUP["direct"], strict_block)

    def test_jules_projects_into_subconverter(self) -> None:
        rendered_ini = MODULE.render_ini()
        self.assertIn(
            "ruleset=🤖 Jules,clash-classic:"
            "https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/rule/AI_Jules_Classical.yaml,28800",
            rendered_ini,
        )
        self.assertIn("custom_proxy_group=🤖 Jules`select`", rendered_ini)
        self.assertIn(f"[]{MODULE.GROUP['us']}", rendered_ini)
        self.assertIn(f"[]{MODULE.GROUP['reject']}", rendered_ini)

    def test_jules_is_in_legacy_ruleset_projection(self) -> None:
        provider_keys = [item["provider_key"] for item in MODULE.AI_RULESETS]
        self.assertIn("AI_Jules_Classical", provider_keys)


if __name__ == "__main__":
    unittest.main()
