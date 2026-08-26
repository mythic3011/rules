from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from ai_profiles_test_support import CATALOG_DIR, copy_catalog, read_json, write_json
from ai_profiles.catalog import load_catalog
from ai_profiles.schema import load_catalog_documents


class CatalogSchemaTest(unittest.TestCase):
    def test_current_catalog_has_a_valid_declared_shape(self) -> None:
        documents = load_catalog_documents(CATALOG_DIR)
        self.assertEqual(documents.regions.primary_order, ("us", "jp", "sg", "tw", "kr"))
        self.assertIn("global-ai", documents.profile.dns_resolver_sets)
        self.assertIn("jules", {service.id for service in documents.services.services})

    def test_schema_rejects_unknown_service_fields(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "services.json"
            value = read_json(path)
            value["services"][0]["typoField"] = True
            write_json(path, value)

            with self.assertRaisesRegex(RuntimeError, "service record has invalid shape"):
                load_catalog_documents(catalog_dir)

    def test_schema_rejects_duplicate_service_provider_keys(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "services.json"
            value = read_json(path)
            value["services"][1]["providerKey"] = value["services"][0]["providerKey"]
            write_json(path, value)

            with self.assertRaisesRegex(RuntimeError, "Duplicate AI service id/provider/file"):
                load_catalog_documents(catalog_dir)

    def test_catalog_rejects_unknown_region_reference_after_schema_passes(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "services.json"
            value = read_json(path)
            value["services"][0]["regions"][0] = "moon"
            write_json(path, value)

            documents = load_catalog_documents(catalog_dir)
            self.assertEqual(documents.services.services[0].regions[0], "moon")
            with self.assertRaisesRegex(RuntimeError, "references unknown regions"):
                load_catalog(catalog_dir)

    def test_catalog_rejects_unknown_dns_resolver_after_schema_passes(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "services.json"
            value = read_json(path)
            value["services"][0]["dnsPolicies"][0]["resolverSet"] = "missing"
            write_json(path, value)

            documents = load_catalog_documents(catalog_dir)
            self.assertEqual(
                documents.services.services[0].dns_policies[0].resolver_set,
                "missing",
            )
            with self.assertRaisesRegex(RuntimeError, "unknown resolver set: missing"):
                load_catalog(catalog_dir)

    def test_catalog_rejects_duplicate_dns_order_globally(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "services.json"
            value = read_json(path)
            jules = next(service for service in value["services"] if service["id"] == "jules")
            jules["dnsPolicies"][0]["order"] = 30
            write_json(path, value)

            with self.assertRaisesRegex(RuntimeError, "orders must be globally unique"):
                load_catalog(catalog_dir)

    def test_schema_rejects_unknown_subconverter_selector_mode(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "services.json"
            value = read_json(path)
            value["services"][0]["subconverter"]["selector"] = {
                "mode": "magic",
                "emitWhenLegacyReplaced": False,
            }
            write_json(path, value)
            with self.assertRaisesRegex(RuntimeError, "Unknown subconverter selector mode"):
                load_catalog_documents(catalog_dir)

    def test_catalog_rejects_unknown_fixed_selector_group_key(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "services.json"
            value = read_json(path)
            value["services"][0]["subconverter"]["selector"]["groupKeys"] = ["missing"]
            write_json(path, value)
            with self.assertRaisesRegex(RuntimeError, "unknown group keys"):
                load_catalog(catalog_dir)

    def test_catalog_rejects_noncontiguous_subconverter_rule_cluster(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "services.json"
            value = read_json(path)
            value["services"][0]["subconverter"]["ruleCluster"] = "split"
            value["services"][2]["subconverter"] = {"ruleCluster": "split"}
            write_json(path, value)
            with self.assertRaisesRegex(RuntimeError, "ruleCluster must be contiguous"):
                load_catalog(catalog_dir)


if __name__ == "__main__":
    unittest.main()
