from __future__ import annotations

import unittest

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_routing_entries, compile_rule_providers
from ai_profiles_test_support import load_generator


MODULE = load_generator("generate_ai_profiles_related_services")


class RelatedServicesCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()

    def service(self, service_id: str):
        return next(service for service in self.catalog.services if service.id == service_id)

    def test_openrouter_is_data_only_and_scoped_to_official_service_domain(self) -> None:
        service = self.service("openrouter")
        self.assertEqual(service.provider_key, "AI_OpenRouter_Classical")
        self.assertEqual(service.payload, ("DOMAIN-SUFFIX,openrouter.ai",))
        self.assertEqual(service.group, "🤖 OpenRouter")

    def test_cursor_routes_backend_domains_but_not_update_cdn(self) -> None:
        service = self.service("cursor")
        self.assertEqual(
            service.payload,
            (
                "DOMAIN-SUFFIX,cursor.sh",
                "DOMAIN-SUFFIX,cursorapi.com",
                "DOMAIN-SUFFIX,cursorvm.com",
            ),
        )
        self.assertNotIn("DOMAIN-SUFFIX,cursor-cdn.com", service.payload)
        self.assertNotIn("DOMAIN-SUFFIX,cursor.com", service.payload)
        download = next(
            rule for rule in self.catalog.companion_rulesets
            if rule.id == "cursor-download-direct"
        )
        self.assertEqual(download.group, MODULE.GROUP["direct"])
        self.assertEqual(download.payload, ("DOMAIN-SUFFIX,cursor-cdn.com",))

    def test_huggingface_separates_ui_api_from_bulk_download_cdn(self) -> None:
        service = self.service("huggingface")
        self.assertEqual(service.payload, ("DOMAIN-SUFFIX,huggingface.co",))

        download = next(
            rule for rule in self.catalog.companion_rulesets
            if rule.id == "huggingface-download-direct"
        )
        self.assertEqual(download.group, MODULE.GROUP["direct"])
        self.assertEqual(download.payload, ("DOMAIN-SUFFIX,hf.co",))
        self.assertTrue(download.mihomo)

    def test_new_services_project_without_named_service_code(self) -> None:
        relaxed = MODULE.render_yaml(strict=False)
        strict = MODULE.render_yaml(strict=True)
        ini = MODULE.render_ini()

        for service_id in ("openrouter", "cursor", "huggingface"):
            service = self.service(service_id)
            self.assertIn(f'name: "{service.group}"', relaxed)
            self.assertIn(service.provider_key + ":", relaxed)
            self.assertIn(f"custom_proxy_group={service.group}`select`", ini)
            strict_block = strict.split(f'- name: "{service.group}"', 1)[1].split(
                f'- name: "{service.group} · 自動"', 1
            )[0]
            self.assertNotIn(MODULE.GROUP["direct"], strict_block)

        routing = compile_routing_entries(
            strict=False,
            include_process_rules=False,
            catalog=self.catalog,
        )
        providers = compile_rule_providers(
            strict=False,
            include_process_rules=False,
            catalog=self.catalog,
        )
        values = {getattr(rule, "value", None) for rule in routing}
        provider_names = {provider.name for provider in providers}
        for provider_key in (
            "AI_OpenRouter_Classical",
            "AI_Cursor_Classical",
            "AI_HuggingFace_Classical",
            "HuggingFace_Download_Direct_Classical",
            "Cursor_Download_Direct_Classical",
        ):
            self.assertIn(provider_key, values)
            self.assertIn(provider_key, provider_names)

        strict_routing = compile_routing_entries(
            strict=True,
            include_process_rules=False,
            catalog=self.catalog,
        )
        strict_values = {getattr(rule, "value", None) for rule in strict_routing}
        self.assertNotIn("HuggingFace_Download_Direct_Classical", strict_values)
        self.assertNotIn("Cursor_Download_Direct_Classical", strict_values)

    def test_runtime_mechanisms_do_not_name_new_services(self) -> None:
        from ai_profiles_test_support import ROOT

        names = ("openrouter", "cursor", "huggingface")
        for relative in (
            "internal/python/ai_profiles/compiler.py",
            "internal/python/ai_profiles/routing_ir.py",
            "internal/python/ai_profiles/render/mihomo.py",
            "internal/python/ai_profiles/render/subconverter.py",
            "internal/python/ai_profiles/writer.py",
        ):
            source = (ROOT / relative).read_text(encoding="utf-8").lower()
            for name in names:
                self.assertNotIn(name, source, relative)


if __name__ == "__main__":
    unittest.main()
