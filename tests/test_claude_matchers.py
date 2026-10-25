from __future__ import annotations

import unittest

import yaml

from ai_profiles_test_support import find_service, load_generator
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_ai_routing_rules, compile_subconverter_plan
from ai_profiles.models import RoutingRule
from ai_profiles.plans.ini_mvp import account_protection_group_candidates


MODULE = load_generator("generate_ai_profiles_claude_matchers")
EXPECTED_MATCHERS = (
    "DOMAIN-SUFFIX,anthropic.com",
    "DOMAIN-SUFFIX,claude.ai",
    "DOMAIN-SUFFIX,claude.com",
    "DOMAIN-SUFFIX,clau.de",
    "DOMAIN-SUFFIX,claudemcpclient.com",
    "DOMAIN-SUFFIX,claudemcpcontent.com",
    "DOMAIN-SUFFIX,claudeusercontent.com",
    "DOMAIN-SUFFIX,sentry.io",
    "DOMAIN-SUFFIX,statsigapi.net",
    "DOMAIN-SUFFIX,intercom.io",
    "DOMAIN-SUFFIX,intercomcdn.com",
    "DOMAIN,servd-anthropic-website.b-cdn.net",
    "DOMAIN,anthropic.com.cdn.cloudflare.net",
    "DOMAIN,anthropic.auth0.com",
    "DOMAIN,anthropic-com.ghost.io",
    "DOMAIN,browser-intake-us5-datadoghq.com",
    "DOMAIN,cdn.usefathom.com",
    "DOMAIN-KEYWORD,datadog",
    "DOMAIN-KEYWORD,sentry",
    "DOMAIN-KEYWORD,sift",
    "IP-CIDR,160.79.104.0/21",
    "IP-CIDR6,2607:6bc0::/32",
)


class ClaudeMatchersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.claude = find_service(cls.catalog, "claude")

    def test_matchers_and_geosites_are_canonical_and_deduplicated(self) -> None:
        self.assertEqual(self.claude.payload, EXPECTED_MATCHERS)
        self.assertEqual(len(self.claude.payload), len(set(self.claude.payload)))
        self.assertEqual(self.claude.geosites, ("anthropic", "category-ntp"))

    def test_claude_routes_target_the_account_guard(self) -> None:
        claude_rules = [
            rule
            for rule in compile_ai_routing_rules(self.catalog)
            if isinstance(rule, RoutingRule)
            and rule.target == self.claude.group
            and rule.value in {"AI_Claude_Classical", "anthropic", "category-ntp"}
        ]
        self.assertEqual(
            [(rule.kind, rule.value, rule.target) for rule in claude_rules],
            [
                ("RULE-SET", "AI_Claude_Classical", self.claude.group),
                ("GEOSITE", "anthropic", self.claude.group),
                ("GEOSITE", "category-ntp", self.claude.group),
            ],
        )


class ClaudeAccountProtectionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.claude = find_service(cls.catalog, "claude")
        cls.ini_mvp = MODULE.load_ini_mvp_plan()

    def test_account_guard_keeps_reject_first_and_never_exposes_direct(self) -> None:
        plan = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
        )
        group = plan.account_group
        self.assertEqual(self.claude.group, self.ini_mvp["accountProtection"]["protectedGroup"])
        self.assertEqual(group.name, self.ini_mvp["accountProtection"]["protectedGroup"])
        reject_candidate = group.candidates[0]
        self.assertEqual(reject_candidate.kind, "group-ref")
        self.assertEqual(
            reject_candidate.value,
            self.ini_mvp["accountProtection"]["rejectGroup"],
        )
        self.assertFalse(
            any(candidate.kind == "builtin" and candidate.value == "DIRECT" for candidate in group.candidates)
        )

    def test_ini_keeps_authored_matchers_before_the_legacy_anthropic_rule(self) -> None:
        plan = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
        )
        protected_group = self.ini_mvp["accountProtection"]["protectedGroup"]
        claude_rules = [
            rule
            for rule in plan.section("legacy-before").rules
            if rule.target == protected_group
        ]
        self.assertEqual(
            [(rule.kind, rule.value) for rule in claude_rules[1:-1]],
            [("geosite", geosite) for geosite in self.claude.geosites],
        )
        self.assertEqual(claude_rules[0].kind, "remote-classical")
        self.assertEqual(claude_rules[-1].kind, "remote-classical")
        self.assertNotEqual(claude_rules[0].url, claude_rules[-1].url)

    def test_yaml_account_group_uses_only_typed_reject_first_candidates(self) -> None:
        rendered = MODULE.render_yaml(strict=False)
        document = yaml.safe_load(rendered)
        protected_group = self.ini_mvp["accountProtection"]["protectedGroup"]
        group = next(
            item for item in document["proxy-groups"] if item["name"] == protected_group
        )
        candidates = account_protection_group_candidates(self.ini_mvp)
        self.assertEqual(group["proxies"], list(candidates))
        self.assertEqual(candidates[0], self.ini_mvp["accountProtection"]["rejectGroup"])
        self.assertNotIn("DIRECT", candidates)


if __name__ == "__main__":
    unittest.main()
