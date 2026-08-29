from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai_profiles import intake
from ai_profiles.catalog import load_catalog
from ai_profiles.schema import load_catalog_documents

ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = ROOT / "internal/config/ai-routing"


def issue_body(*, name="Example AI", service_id="", matcher_type="DOMAIN-SUFFIX", values="example.com", working="us — United States", blocked="hk — Hong Kong", additional=None):
    fields = {
        "Service name": name,
        "Service ID (optional)": service_id,
        "Matcher type": matcher_type,
        "Matcher values": values,
        "Confirmed working regions": working,
        "Confirmed blocked regions": blocked,
        "Other / new region": "- [x] I need to add one or more unlisted regions." if additional else "- [ ] I need to add one or more unlisted regions.",
    }
    additional = additional or []
    for slot in range(1, intake.MAX_ADDITIONAL_REGIONS + 1):
        record = additional[slot - 1] if slot <= len(additional) else {}
        fields.update({
            f"Additional region {slot} status": record.get("status", "Not used"),
            f"Additional region {slot} code": record.get("code", ""),
            f"Additional region {slot} name": record.get("name", ""),
            f"Additional region {slot} aliases": record.get("aliases", ""),
            f"Additional region {slot} node keywords": record.get("keywords", ""),
            f"Additional region {slot} routing exit": record.get("routable", "No — observation only"),
        })
    return "\n\n".join(f"### {key}\n{value or '_No response_'}" for key, value in fields.items())


class ServiceIntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.regions = root / "regions.json"
        self.services = root / "services.json"
        self.regions.write_text((CATALOG_DIR / "catalogs" / "regions.json").read_text(encoding="utf-8"), encoding="utf-8")
        self.services.write_text((CATALOG_DIR / "catalogs" / "services.json").read_text(encoding="utf-8"), encoding="utf-8")
        self.patchers = [
            patch.object(intake, "REGIONS_PATH", self.regions),
            patch.object(intake, "SERVICES_PATH", self.services),
        ]
        for item in self.patchers:
            item.start()

    def tearDown(self):
        for item in reversed(self.patchers):
            item.stop()
        self.tmp.cleanup()

    def test_observation_only_hk_does_not_become_route_candidate(self):
        result = intake.apply_issue(issue_body())
        self.assertEqual(result["service"], "example-ai")
        services = json.loads(self.services.read_text(encoding="utf-8"))["services"]
        service = next(x for x in services if x["id"] == "example-ai")
        self.assertEqual(service["regions"], ["us"])
        self.assertEqual(service["availability"], {"workingRegions": ["us"], "blockedRegions": ["hk"]})
        self.assertEqual(service["payload"], ["DOMAIN-SUFFIX,example.com"])

    def test_multiple_new_regions_can_be_added_in_one_ticket(self):
        body = issue_body(
            working="us — United States",
            blocked="hk — Hong Kong",
            additional=[
                {
                    "status": "Works",
                    "code": "IS",
                    "name": "Iceland",
                    "aliases": "Ísland",
                    "keywords": "Reykjavik\nKEF\n🇮🇸",
                    "routable": "Yes — add as routing exit",
                },
                {
                    "status": "Blocked",
                    "code": "AE",
                    "name": "United Arab Emirates",
                    "aliases": "UAE",
                    "keywords": "Dubai\nDXB\n🇦🇪",
                    "routable": "No — observation only",
                },
            ],
        )
        result = intake.apply_issue(body)
        regions = json.loads(self.regions.read_text(encoding="utf-8"))
        self.assertIn("is", regions["primaryOrder"])
        self.assertNotIn("ae", regions["primaryOrder"])
        iceland = next(x for x in regions["regions"] if x["id"] == "is")
        self.assertEqual(iceland["group"], "🇮🇸 Iceland 節點")
        self.assertEqual(iceland["countryCodes"], ["IS"])
        self.assertIn(r"\bIS", iceland["terms"])
        service = next(x for x in json.loads(self.services.read_text(encoding="utf-8"))["services"] if x["id"] == "example-ai")
        self.assertEqual(service["regions"], ["us", "is"])
        self.assertEqual(service["availability"]["workingRegions"], ["us", "is"])
        self.assertEqual(service["availability"]["blockedRegions"], ["hk", "ae"])
        self.assertEqual([x["region"] for x in result["regions"]], ["is", "ae"])

    def test_new_region_id_is_derived_from_code_not_user_text(self):
        body = issue_body(additional=[{
            "status": "Works", "code": "NZ", "name": "New Zealand", "keywords": "Auckland\nAKL", "routable": "Yes — add as routing exit"
        }])
        intake.apply_issue(body)
        regions = json.loads(self.regions.read_text(encoding="utf-8"))
        record = next(x for x in regions["regions"] if x["id"] == "nz")
        self.assertEqual(record["name"], "New Zealand")
        self.assertEqual(record["group"], "🇳🇿 New Zealand 節點")

    def test_existing_region_is_reused_by_country_code_and_may_gain_keywords(self):
        body = issue_body(
            working="us — United States",
            blocked="",
            additional=[{
                "status": "Blocked",
                "code": "HK",
                "name": "Hong Kong SAR",
                "aliases": "香港特別行政區",
                "keywords": "Kowloon",
                "routable": "No — observation only",
            }],
        )
        result = intake.apply_issue(body)
        regions = json.loads(self.regions.read_text(encoding="utf-8"))
        self.assertEqual(sum(1 for x in regions["regions"] if x["id"] == "hk"), 1)
        hk = next(x for x in regions["regions"] if x["id"] == "hk")
        self.assertIn("Kowloon", hk["keywords"])
        self.assertIn("香港特別行政區", hk["aliases"])
        self.assertEqual(result["regions"][0]["action"], "updated")
        service = next(x for x in json.loads(self.services.read_text(encoding="utf-8"))["services"] if x["id"] == "example-ai")
        self.assertIn("hk", service["availability"]["blockedRegions"])

    def test_public_intake_cannot_promote_existing_observation_region(self):
        with self.assertRaisesRegex(ValueError, "routing-exit promotion requires a maintainer change"):
            intake.apply_issue(issue_body(additional=[{
                "status": "Works", "code": "HK", "name": "Hong Kong", "routable": "Yes — add as routing exit"
            }]))

    def test_duplicate_additional_region_slots_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "submitted more than once"):
            intake.apply_issue(issue_body(additional=[
                {"status": "Works", "code": "IS", "name": "Iceland", "routable": "Yes — add as routing exit"},
                {"status": "Blocked", "code": "IS", "name": "Ísland", "routable": "No — observation only"},
            ]))

    def test_metadata_in_unused_slot_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "metadata but its status is Not used"):
            intake.apply_issue(issue_body(additional=[{"code": "IS", "name": "Iceland"}]))

    def test_too_broad_short_keyword_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "too broad"):
            intake.apply_issue(issue_body(additional=[{
                "status": "Works", "code": "IS", "name": "Iceland", "keywords": "IS", "routable": "Yes — add as routing exit"
            }]))

    def test_checked_other_without_completed_slot_is_rejected(self):
        body = issue_body().replace(
            "### Other / new region\n- [ ] I need to add one or more unlisted regions.",
            "### Other / new region\n- [x] I need to add one or more unlisted regions.",
        )
        with self.assertRaisesRegex(ValueError, "selected but no Additional region slot"):
            intake.apply_issue(body)

    def test_region_code_and_existing_identity_must_agree(self):
        with self.assertRaisesRegex(ValueError, "code CA conflicts with existing region us"):
            intake.apply_issue(issue_body(additional=[{
                "status": "Works", "code": "CA", "name": "United States", "routable": "No — observation only"
            }]))

    def test_public_intake_rejects_private_cidr(self):
        with self.assertRaisesRegex(ValueError, "private/reserved"):
            intake.apply_issue(issue_body(matcher_type="IP-CIDR", values="10.0.0.0/8"))

    def test_update_existing_service_merges_matchers_and_observations(self):
        body = issue_body(name="GitHub", service_id="copilot", values="githubassets.example", working="jp — Japan", blocked="hk — Hong Kong")
        result = intake.apply_issue(body)
        self.assertEqual(result["action"], "updated")
        service = next(x for x in json.loads(self.services.read_text(encoding="utf-8"))["services"] if x["id"] == "copilot")
        self.assertIn("DOMAIN-SUFFIX,githubassets.example", service["payload"])
        self.assertIn("jp", service["regions"])
        self.assertEqual(service["availability"]["blockedRegions"], ["hk"])

    def test_explicit_observation_moves_region_between_states(self):
        body1 = issue_body(name="Stateful", working="us — United States", blocked="jp — Japan")
        intake.apply_issue(body1)
        body2 = issue_body(name="Stateful", working="jp — Japan", blocked="us — United States")
        intake.apply_issue(body2)
        service = next(x for x in json.loads(self.services.read_text(encoding="utf-8"))["services"] if x["id"] == "stateful")
        self.assertEqual(service["availability"]["workingRegions"], ["jp"])
        self.assertEqual(service["availability"]["blockedRegions"], ["us"])
        self.assertEqual(service["regions"], ["jp"])


class RegionAvailabilitySchemaTests(unittest.TestCase):
    def test_registry_may_contain_non_routable_regions(self):
        docs = load_catalog_documents(CATALOG_DIR)
        self.assertIn("hk", {region.id for region in docs.regions.regions})
        self.assertNotIn("hk", docs.regions.primary_order)
        catalog = load_catalog(CATALOG_DIR)
        self.assertNotIn("🇭🇰 香港節點", catalog.all_region_groups)
        region = next(item for item in docs.regions.regions if item.id == "hk")
        import re
        pattern = re.compile(rf"(?i)(?:{region.terms})")
        self.assertIsNotNone(pattern.search("HK-01"))
        self.assertIsNone(pattern.search("CHUNK"))

    def test_service_can_derive_routable_regions_from_availability(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "catalog"
            import shutil
            shutil.copytree(CATALOG_DIR, target)
            path = target / "catalogs" / "services.json"
            doc = json.loads(path.read_text(encoding="utf-8"))
            service = doc["services"][0]
            service.pop("regions")
            service["availability"] = {"workingRegions": ["us", "hk", "jp"], "blockedRegions": []}
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            compiled = load_catalog(target)
            first = compiled.services[0]
            self.assertEqual(first.regions, ("us", "jp"))
            self.assertEqual(first.availability.working_regions, ("us", "hk", "jp"))


if __name__ == "__main__":
    unittest.main()
