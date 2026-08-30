from __future__ import annotations

import unittest

from ai_profiles_test_support import (
    ROOT,
    RUNTIME_MODULE_RELATIVE_PATHS,
    find_service,
    load_generator,
)
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_rule_providers, compile_routing_entries
from ai_profiles.distribution import managed_git_pathspecs, managed_output_paths

MODULE = load_generator("generate_ai_profiles_google_finance")

# ---------------------------------------------------------------------------
# Design-intent anchors. These pin *which* catalog entries form the Google AI
# extension surface and the finance fail-closed ruleset family, plus the
# security invariants that must hold for them. Everything else -- payloads,
# groups, provider keys, rule files, projections -- is owned by the catalog
# under internal/config/ai-routing and read at test runtime.
# ---------------------------------------------------------------------------

GOOGLE_AI_EXTENSION_SERVICE_IDS = (
    "antigravity",
    "google-labs",
    "stitch",
    "android-studio-ai",
    "gemini-cloud",
    "vertex-ai",
)

FINANCE_CATEGORY = "finance"
HIGH_RISK_GROUP_KEY = "high-risk-account"

# Extensions that must stay fail-closed (no DIRECT relaxation) even in
# relaxed mode. All remaining extensions are expected to allow DIRECT.
FAIL_CLOSED_GOOGLE_EXTENSION_SERVICE_IDS = frozenset(
    {"android-studio-ai", "vertex-ai"}
)

# Shared Google auth/profile APIs must never be captured by a narrow AI
# extension policy, and apex domains must never be swept in wholesale.
FORBIDDEN_BROAD_GOOGLE_PAYLOADS = (
    "DOMAIN,oauth2.googleapis.com",
    "DOMAIN,people.googleapis.com",
    "DOMAIN-SUFFIX,google.com",
    "DOMAIN-SUFFIX,googleapis.com",
    "DOMAIN-SUFFIX,goog",
    "DOMAIN-SUFFIX,withgoogle.com",
    "DOMAIN-KEYWORD,google",
)

# Only exact/classical shapes are narrow enough for these surfaces.
NARROW_PAYLOAD_KINDS = frozenset({"DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD"})

# Every Google extension payload entry must resolve to a Google-owned host.
GOOGLE_OWNED_DOMAIN_SUFFIXES = (
    ".google",
    ".goog",
    ".googleapis.com",
    ".withgoogle.com",
    "google.com",
)

# AI rule files ride the dynamic glob; companion rule files are explicit.
AI_RULE_GLOB_PATHSPEC = ":(glob)rule/AI_*_Classical.yaml"


def payload_host(entry: str) -> str:
    _, _, host = entry.partition(",")
    return host


def is_narrow_payload_entry(entry: str) -> bool:
    kind, _, host = entry.partition(",")
    return kind in NARROW_PAYLOAD_KINDS and bool(host)


class GoogleFinanceCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.google_services = tuple(
            find_service(cls.catalog, service_id)
            for service_id in GOOGLE_AI_EXTENSION_SERVICE_IDS
        )
        cls.finance_rules = tuple(
            rule
            for rule in cls.catalog.companion_rulesets
            if rule.category == FINANCE_CATEGORY
        )

    def test_google_ai_extensions_are_data_only_and_narrowly_scoped(self) -> None:
        for service in self.google_services:
            with self.subTest(service=service.id):
                self.assertTrue(service.payload)
                for entry in service.payload:
                    self.assertNotIn(entry, FORBIDDEN_BROAD_GOOGLE_PAYLOADS)
                    self.assertTrue(
                        is_narrow_payload_entry(entry),
                        f"{service.id}: payload entry is not a narrow rule: {entry}",
                    )
                    self.assertTrue(
                        payload_host(entry).endswith(GOOGLE_OWNED_DOMAIN_SUFFIXES),
                        f"{service.id}: payload entry is not Google-owned: {entry}",
                    )
        self.assertEqual(
            {service.id for service in self.google_services if not service.direct_relaxed},
            FAIL_CLOSED_GOOGLE_EXTENSION_SERVICE_IDS,
        )

    def test_google_ai_extensions_project_through_existing_pipeline(self) -> None:
        relaxed = MODULE.render_yaml(strict=False)
        strict = MODULE.render_yaml(strict=True)
        ini = MODULE.render_ini()

        for service in self.google_services:
            with self.subTest(service=service.id):
                self.assertIn(f'name: "{service.group}"', relaxed)
                self.assertIn(service.provider_key + ":", relaxed)
                self.assertIn(f"custom_proxy_group={service.group}`select`", ini)
                strict_block = strict.split(f'- name: "{service.group}"', 1)[1].split(
                    f'- name: "{service.group} · 自動"', 1
                )[0]
                self.assertNotIn(MODULE.GROUP["direct"], strict_block)

    def test_finance_rules_are_fail_closed_high_risk_routes(self) -> None:
        self.assertTrue(self.finance_rules)
        high_risk_group = self.catalog.group(HIGH_RISK_GROUP_KEY)
        for rule in self.finance_rules:
            with self.subTest(rule=rule.id):
                self.assertEqual(rule.group, high_risk_group)
                self.assertEqual(rule.category, FINANCE_CATEGORY)
                self.assertEqual(rule.subconverter_cluster, FINANCE_CATEGORY)
                self.assertTrue(rule.mihomo)
                self.assertEqual(rule.provider_key, rule.file.rsplit(".", 1)[0])
                self.assertTrue(rule.payload)
                for entry in rule.payload:
                    self.assertTrue(
                        is_narrow_payload_entry(entry),
                        f"{rule.id}: payload entry is not a narrow rule: {entry}",
                    )

    def test_finance_routes_are_relaxed_only_and_never_auto_service_groups(self) -> None:
        relaxed = compile_routing_entries(
            strict=False, include_process_rules=False, catalog=self.catalog
        )
        strict = compile_routing_entries(
            strict=True, include_process_rules=False, catalog=self.catalog
        )
        relaxed_values = {getattr(rule, "value", None) for rule in relaxed}
        strict_values = {getattr(rule, "value", None) for rule in strict}

        finance_providers = {rule.provider_key for rule in self.finance_rules}
        self.assertTrue(finance_providers <= relaxed_values)
        self.assertTrue(finance_providers.isdisjoint(strict_values))

        providers = {
            provider.name
            for provider in compile_rule_providers(
                strict=False, include_process_rules=False, catalog=self.catalog
            )
        }
        self.assertTrue(finance_providers <= providers)

    def test_distribution_and_workflow_pathspecs_pick_up_new_artifacts_automatically(self) -> None:
        managed = set(managed_output_paths())
        specs = set(managed_git_pathspecs())
        ai_rule_paths = {f"rule/{service.file}" for service in self.google_services}
        finance_rule_paths = {f"rule/{rule.file}" for rule in self.finance_rules}

        self.assertTrue(ai_rule_paths <= managed)
        self.assertTrue(finance_rule_paths <= managed)
        # AI services are covered by the dynamic glob; companions are explicit pathspecs.
        self.assertIn(AI_RULE_GLOB_PATHSPEC, specs)
        self.assertTrue(finance_rule_paths <= specs)

    def test_runtime_mechanisms_do_not_name_google_or_finance_extensions(self) -> None:
        forbidden_names = set(GOOGLE_AI_EXTENSION_SERVICE_IDS)
        forbidden_names.update(
            rule.provider_key.removesuffix("_Classical").lower()
            for rule in self.finance_rules
        )
        for relative in RUNTIME_MODULE_RELATIVE_PATHS:
            source = (ROOT / relative).read_text(encoding="utf-8").lower()
            for name in sorted(forbidden_names):
                self.assertNotIn(name, source, relative)


if __name__ == "__main__":
    unittest.main()
