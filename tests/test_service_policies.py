from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from ai_profiles_test_support import CATALOG_DIR, copy_catalog, read_json, write_json
from ai_profiles.catalog import load_catalog
from ai_profiles.schema import load_catalog_documents


class ServicePoliciesTest(unittest.TestCase):
    def test_services_resolve_their_shared_routing_policy(self) -> None:
        documents = load_catalog_documents(CATALOG_DIR)
        self.assertTrue(documents.services.policies)
        for policy_id, policy in documents.services.policies.items():
            with self.subTest(policy=policy_id):
                selected = {
                    service.id: service
                    for service in documents.services.services
                    if service.policy_id == policy_id
                }
                self.assertTrue(selected)
                for service in selected.values():
                    self.assertEqual(service.group, policy.group)
                    self.assertEqual(service.regions, policy.regions)
                    self.assertEqual(service.direct_relaxed, policy.direct_relaxed)
                    self.assertEqual(service.subconverter, policy.subconverter)

    def test_policy_requires_exact_shape(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "services.json"
            value = read_json(path)
            del value["policies"]["google-ai-tools"]["regions"]
            write_json(path, value)

            with self.assertRaisesRegex(RuntimeError, "service policy has invalid shape"):
                load_catalog_documents(catalog_dir)

    def test_policy_section_is_optional_for_inline_service_declarations(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "services.json"
            value = read_json(path)
            value.pop("policies")
            value["services"] = [
                next(item for item in value["services"] if item["id"] == "chatgpt")
            ]
            write_json(path, value)

            documents = load_catalog_documents(catalog_dir)
            self.assertEqual(dict(documents.services.policies), {})
            self.assertIsNone(documents.services.services[0].policy_id)

    def test_service_policy_rejects_unknown_references(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "services.json"
            value = read_json(path)
            service = next(item for item in value["services"] if "policy" in item)
            service["policy"] = "missing-policy"
            write_json(path, value)

            with self.assertRaisesRegex(RuntimeError, "references unknown policy"):
                load_catalog_documents(catalog_dir)

    def test_service_policy_rejects_inline_routing_fields(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "services.json"
            value = read_json(path)
            service = next(item for item in value["services"] if "policy" in item)
            service["regions"] = ["us"]
            write_json(path, value)

            with self.assertRaisesRegex(RuntimeError, "combine policy reference with inline"):
                load_catalog_documents(catalog_dir)

    def test_shared_group_requires_the_same_policy_reference(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "services.json"
            value = read_json(path)
            service = next(
                item for item in value["services"] if item.get("policy") == "google-ai-tools"
            )
            del service["policy"]
            service.update(value["policies"]["google-ai-tools"])
            write_json(path, value)

            with self.assertRaisesRegex(RuntimeError, "shared without a common policy"):
                load_catalog(catalog_dir)

    def test_shared_group_rejects_different_policy_ids(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "services.json"
            value = read_json(path)
            value["policies"]["second-google-tools"] = dict(
                value["policies"]["google-ai-tools"]
            )
            service = next(
                item for item in value["services"] if item.get("policy") == "google-ai-tools"
            )
            service["policy"] = "second-google-tools"
            write_json(path, value)

            with self.assertRaisesRegex(RuntimeError, "shared without a common policy"):
                load_catalog(catalog_dir)

    def test_shared_policy_keeps_service_observations_separate_from_routing(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "services.json"
            value = read_json(path)
            service = next(
                item for item in value["services"] if item.get("policy") == "google-ai-tools"
            )
            service["availability"] = {
                "workingRegions": ["us"],
                "blockedRegions": [],
            }
            write_json(path, value)

            catalog = load_catalog(catalog_dir)
            compiled = next(item for item in catalog.services if item.id == service["id"])
            self.assertEqual(compiled.availability.working_regions, ("us",))
            self.assertEqual(compiled.regions, tuple(value["policies"][service["policy"]]["regions"]))

    def test_shared_policy_requires_explicit_routing_regions(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "services.json"
            value = read_json(path)
            next(iter(value["policies"].values()))["regions"] = []
            write_json(path, value)
            with self.assertRaisesRegex(RuntimeError, "at least one routing region"):
                load_catalog_documents(catalog_dir)

    def test_service_group_rejects_core_and_region_group_names(self) -> None:
        catalog = load_catalog()
        collisions = (catalog.group("reject"), catalog.primary_regions[0].group)
        for collision in collisions:
            with self.subTest(group=collision), tempfile.TemporaryDirectory() as raw_tmp:
                catalog_dir = copy_catalog(Path(raw_tmp))
                path = catalog_dir / "catalogs" / "services.json"
                value = read_json(path)
                value["policies"]["google-ai-tools"]["group"] = collision
                write_json(path, value)

                with self.assertRaisesRegex(RuntimeError, "collides with an existing core or region"):
                    load_catalog(catalog_dir)

    def test_privacy_is_an_allowed_companion_category(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            path = catalog_dir / "catalogs" / "companion-rules.json"
            value = read_json(path)
            value["rulesets"][0]["category"] = "privacy"
            write_json(path, value)

            documents = load_catalog_documents(catalog_dir)
            self.assertEqual(documents.companion_rules.rulesets[0].category, "privacy")


if __name__ == "__main__":
    unittest.main()
