from __future__ import annotations

import unittest

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_routing_entries, compile_rule_providers
from ai_profiles.distribution import managed_git_pathspecs, managed_output_paths
from ai_profiles_test_support import ROOT, load_generator


MODULE = load_generator("generate_ai_profiles_google_finance")


class GoogleFinanceCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()

    def service(self, service_id: str):
        return next(service for service in self.catalog.services if service.id == service_id)

    def companion(self, rule_id: str):
        return next(rule for rule in self.catalog.companion_rulesets if rule.id == rule_id)

    def test_google_ai_extensions_are_data_only_and_narrowly_scoped(self) -> None:
        antigravity = self.service("antigravity")
        self.assertEqual(
            antigravity.payload,
            (
                "DOMAIN-SUFFIX,antigravity.google",
                "DOMAIN-SUFFIX,antigravity-unleash.goog",
            ),
        )

        labs = self.service("google-labs")
        self.assertEqual(labs.payload, ("DOMAIN-SUFFIX,labs.google",))

        stitch = self.service("stitch")
        self.assertEqual(stitch.payload, ("DOMAIN,stitch.withgoogle.com",))

        android_studio = self.service("android-studio-ai")
        self.assertEqual(
            android_studio.payload,
            (
                "DOMAIN,cloudaicompanion.googleapis.com",
                "DOMAIN,cloudcode-pa.googleapis.com",
            ),
        )
        self.assertFalse(android_studio.direct_relaxed)

        cloud = self.service("gemini-cloud")
        self.assertEqual(cloud.payload, ("DOMAIN,geminicloudassist.googleapis.com",))
        # Shared Google auth/profile APIs must not be captured by the AI policy.
        for payload in (android_studio.payload, cloud.payload):
            self.assertNotIn("DOMAIN,oauth2.googleapis.com", payload)
            self.assertNotIn("DOMAIN,people.googleapis.com", payload)
            self.assertNotIn("DOMAIN-SUFFIX,googleapis.com", payload)

        vertex = self.service("vertex-ai")
        self.assertEqual(
            vertex.payload,
            (
                "DOMAIN,aiplatform.googleapis.com",
                "DOMAIN-KEYWORD,-aiplatform.googleapis.com",
            ),
        )

    def test_google_ai_extensions_project_through_existing_pipeline(self) -> None:
        relaxed = MODULE.render_yaml(strict=False)
        strict = MODULE.render_yaml(strict=True)
        ini = MODULE.render_ini()

        for service_id in (
            "antigravity",
            "google-labs",
            "stitch",
            "android-studio-ai",
            "gemini-cloud",
            "vertex-ai",
        ):
            service = self.service(service_id)
            self.assertIn(f'name: "{service.group}"', relaxed)
            self.assertIn(service.provider_key + ":", relaxed)
            self.assertIn(f"custom_proxy_group={service.group}`select`", ini)
            strict_block = strict.split(f'- name: "{service.group}"', 1)[1].split(
                f'- name: "{service.group} · 自動"', 1
            )[0]
            self.assertNotIn(MODULE.GROUP["direct"], strict_block)

    def test_finance_rules_are_fail_closed_high_risk_routes(self) -> None:
        expected = {
            "finance-stripe-sensitive": (
                "Finance_Stripe_Classical",
                (
                    "DOMAIN-SUFFIX,stripe.com",
                    "DOMAIN-SUFFIX,stripecdn.com",
                    "DOMAIN,m.stripe.network",
                ),
            ),
            "finance-paypal-sensitive": (
                "Finance_PayPal_Classical",
                (
                    "DOMAIN-SUFFIX,paypal.com",
                    "DOMAIN-SUFFIX,paypalobjects.com",
                ),
            ),
            "finance-wise-sensitive": (
                "Finance_Wise_Classical",
                (
                    "DOMAIN-SUFFIX,wise.com",
                    "DOMAIN-SUFFIX,wise-sandbox.com",
                    "DOMAIN,api-mtls.transferwise.com",
                ),
            ),
            "finance-revolut-sensitive": (
                "Finance_Revolut_Classical",
                ("DOMAIN-SUFFIX,revolut.com",),
            ),
            "finance-ibkr-sensitive": (
                "Finance_IBKR_Classical",
                ("DOMAIN,api.ibkr.com", "DOMAIN-SUFFIX,interactivebrokers.com"),
            ),
            "finance-alpaca-sensitive": (
                "Finance_Alpaca_Classical",
                (
                    "DOMAIN,api.alpaca.markets",
                    "DOMAIN,paper-api.alpaca.markets",
                    "DOMAIN,data.alpaca.markets",
                    "DOMAIN,stream.data.alpaca.markets",
                    "DOMAIN,broker-api.alpaca.markets",
                    "DOMAIN,authx.alpaca.markets",
                    "DOMAIN,data.sandbox.alpaca.markets",
                    "DOMAIN,stream.data.sandbox.alpaca.markets",
                    "DOMAIN,broker-api.sandbox.alpaca.markets",
                ),
            ),
        }
        for rule_id, (provider_key, payload) in expected.items():
            rule = self.companion(rule_id)
            self.assertEqual(rule.provider_key, provider_key)
            self.assertEqual(rule.group, MODULE.GROUP["high-risk-account"])
            self.assertEqual(rule.category, "finance")
            self.assertEqual(rule.payload, payload)
            self.assertEqual(rule.subconverter_cluster, "finance")
            self.assertTrue(rule.mihomo)

    def test_finance_routes_are_relaxed_only_and_never_auto_service_groups(self) -> None:
        relaxed = compile_routing_entries(
            strict=False, include_process_rules=False, catalog=self.catalog
        )
        strict = compile_routing_entries(
            strict=True, include_process_rules=False, catalog=self.catalog
        )
        relaxed_values = {getattr(rule, "value", None) for rule in relaxed}
        strict_values = {getattr(rule, "value", None) for rule in strict}

        finance_providers = {
            "Finance_Stripe_Classical",
            "Finance_PayPal_Classical",
            "Finance_Wise_Classical",
            "Finance_Revolut_Classical",
            "Finance_IBKR_Classical",
            "Finance_Alpaca_Classical",
        }
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
        for path in (
            "rule/AI_Antigravity_Classical.yaml",
            "rule/AI_GoogleLabs_Classical.yaml",
            "rule/AI_Stitch_Classical.yaml",
            "rule/AI_AndroidStudioAI_Classical.yaml",
            "rule/AI_GeminiCloud_Classical.yaml",
            "rule/AI_VertexAI_Classical.yaml",
            "rule/Finance_Stripe_Classical.yaml",
            "rule/Finance_PayPal_Classical.yaml",
            "rule/Finance_Wise_Classical.yaml",
            "rule/Finance_Revolut_Classical.yaml",
            "rule/Finance_IBKR_Classical.yaml",
            "rule/Finance_Alpaca_Classical.yaml",
        ):
            self.assertIn(path, managed)
        # AI services are covered by the dynamic glob; companions are explicit pathspecs.
        self.assertIn(":(glob)rule/AI_*_Classical.yaml", specs)
        for path in (
            "rule/Finance_Stripe_Classical.yaml",
            "rule/Finance_PayPal_Classical.yaml",
            "rule/Finance_Wise_Classical.yaml",
            "rule/Finance_Revolut_Classical.yaml",
            "rule/Finance_IBKR_Classical.yaml",
            "rule/Finance_Alpaca_Classical.yaml",
        ):
            self.assertIn(path, specs)

    def test_runtime_mechanisms_do_not_name_google_or_finance_extensions(self) -> None:
        names = (
            "antigravity",
            "google-labs",
            "stitch",
            "android-studio-ai",
            "gemini-cloud",
            "vertex-ai",
            "finance_stripe",
            "finance_paypal",
            "finance_wise",
            "finance_revolut",
            "finance_ibkr",
            "finance_alpaca",
        )
        for relative in (
            "internal/python/ai_profiles/compiler.py",
            "internal/python/ai_profiles/routing_ir.py",
            "internal/python/ai_profiles/render/mihomo.py",
            "internal/python/ai_profiles/render/subconverter.py",
            "internal/python/ai_profiles/writer.py",
            "internal/python/ai_profiles/distribution.py",
        ):
            source = (ROOT / relative).read_text(encoding="utf-8").lower()
            for name in names:
                self.assertNotIn(name, source, relative)


if __name__ == "__main__":
    unittest.main()
