from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "internal" / "python"))

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import (
    compile_ai_routing_rules,
    compile_rule_providers,
    compile_subconverter_plan,
)
from ai_profiles.models import RemoteRuleSource
from ai_profiles.plans.ini_mvp import load_ini_mvp_plan


class UpstreamRuleSourceTest(unittest.TestCase):
    def _catalog_with_remote_jules_source(self):
        temp_dir = tempfile.TemporaryDirectory()
        catalog_dir = Path(temp_dir.name) / "ai-routing"
        shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)

        services_path = catalog_dir / "catalogs" / "services.json"
        document = json.loads(services_path.read_text(encoding="utf-8"))
        jules = next(service for service in document["services"] if service["id"] == "jules")
        jules["upstreamRules"].append(
            {
                "kind": "remote",
                "providerKey": "Upstream_Jules_Test",
                "url": "https://example.com/jules.yaml",
                "behavior": "classical",
                "format": "yaml",
                "interval": 14400,
                "iniInterval": 28800,
            }
        )
        services_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return temp_dir, load_catalog(catalog_dir)

    def test_remote_upstream_source_projects_without_renderer_changes(self) -> None:
        temp_dir, catalog = self._catalog_with_remote_jules_source()
        self.addCleanup(temp_dir.cleanup)

        jules = next(service for service in catalog.services if service.id == "jules")
        remote = next(source for source in jules.upstream_rules if isinstance(source, RemoteRuleSource))
        self.assertEqual(remote.provider_key, "Upstream_Jules_Test")

        routing = compile_ai_routing_rules(catalog)
        local_index = routing.index(next(rule for rule in routing if rule.value == "AI_Jules_Classical"))
        upstream_index = routing.index(next(rule for rule in routing if rule.value == "Upstream_Jules_Test"))
        self.assertLess(local_index, upstream_index)

        providers = compile_rule_providers(strict=False, include_process_rules=False, catalog=catalog)
        provider = next(item for item in providers if item.name == "Upstream_Jules_Test")
        self.assertEqual(provider.url, "https://example.com/jules.yaml")
        self.assertEqual(provider.interval, 14400)

        ini_plan = compile_subconverter_plan(
            load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=catalog,
        )
        upstream_ini_rules = [
            rule
            for cluster in ini_plan.service_rule_clusters
            for rule in cluster.rules
            if rule.url == "https://example.com/jules.yaml"
        ]
        self.assertEqual(len(upstream_ini_rules), 1)
        self.assertEqual(upstream_ini_rules[0].kind, "remote-classical")
        self.assertEqual(upstream_ini_rules[0].interval, 28800)

    def test_jules_exact_local_rule_precedes_shared_google_ai_aggregate(self) -> None:
        routing = compile_ai_routing_rules()
        jules_index = routing.index(next(rule for rule in routing if rule.value == "AI_Jules_Classical"))
        aggregate_index = routing.index(
            next(
                rule
                for rule in routing
                if rule.kind == "GEOSITE" and rule.value == "google-deepmind" and rule.target == "🤖 AI Other"
            )
        )
        self.assertLess(jules_index, aggregate_index)


    def test_remote_domain_source_projects_to_clash_domain_for_ini(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            services_path = catalog_dir / "catalogs" / "services.json"
            document = json.loads(services_path.read_text(encoding="utf-8"))
            jules = next(service for service in document["services"] if service["id"] == "jules")
            jules["upstreamRules"].append(
                {
                    "kind": "remote",
                    "providerKey": "Upstream_Jules_Domain_Test",
                    "url": "https://example.com/jules-domain.yaml",
                    "behavior": "domain",
                    "format": "yaml",
                    "interval": 10800,
                    "iniInterval": 21600,
                }
            )
            services_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            catalog = load_catalog(catalog_dir)

            providers = compile_rule_providers(strict=False, include_process_rules=False, catalog=catalog)
            provider = next(item for item in providers if item.name == "Upstream_Jules_Domain_Test")
            self.assertEqual(provider.behavior, "domain")

            ini_plan = compile_subconverter_plan(
                load_ini_mvp_plan(),
                include_process_rules=False,
                catalog=catalog,
            )
            rule = next(
                rule
                for cluster in ini_plan.service_rule_clusters
                for rule in cluster.rules
                if rule.url == "https://example.com/jules-domain.yaml"
            )
            self.assertEqual(rule.kind, "remote-domain")
            self.assertEqual(rule.interval, 21600)

    def test_remote_upstream_source_rejects_non_https_url(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            services_path = catalog_dir / "catalogs" / "services.json"
            document = json.loads(services_path.read_text(encoding="utf-8"))
            jules = next(service for service in document["services"] if service["id"] == "jules")
            jules["upstreamRules"].append(
                {
                    "kind": "remote",
                    "providerKey": "Unsafe_Jules_Test",
                    "url": "http://example.com/jules.yaml",
                    "behavior": "classical",
                    "format": "yaml",
                    "interval": 10800,
                    "iniInterval": 28800,
                }
            )
            services_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "must use HTTPS"):
                load_catalog(catalog_dir)


if __name__ == "__main__":
    unittest.main()
