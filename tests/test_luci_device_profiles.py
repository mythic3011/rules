from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps" / "luci-app-openclash-guard"
VIEW = APP / "htdocs" / "luci-static" / "resources" / "view" / "openclash-guard" / "devices.js"
MENU = APP / "root" / "usr" / "share" / "luci" / "menu.d" / "luci-app-openclash-guard.json"
ACL = APP / "root" / "usr" / "share" / "rpcd" / "acl.d" / "luci-app-openclash-guard.json"
RPCD = APP / "root" / "usr" / "libexec" / "rpcd" / "luci.openclash-guard-devices"
UCI_DEFAULTS = APP / "root" / "etc" / "config" / "openclash_guard_devices"
DEVICE_CATALOG = ROOT / "internal" / "config" / "openclash-guard" / "device-profiles.json"
PACKAGED_DEVICE_CATALOG = APP / "root" / "usr" / "share" / "openclash-guard" / "device-profiles.json"
PROFILE_TEMPLATES = ROOT / "internal" / "config" / "ai-routing" / "catalogs" / "profile-templates.json"


class LuCIDeviceProfilesContractTests(unittest.TestCase):
    def test_devices_page_is_registered_in_menu(self) -> None:
        menu = json.loads(MENU.read_text(encoding="utf-8"))
        entry = menu["admin/services/openclash-guard/devices"]
        self.assertEqual(entry["action"], {"type": "view", "path": "openclash-guard/devices"})

    def test_manual_metadata_uses_separate_uci_namespace(self) -> None:
        acl = json.loads(ACL.read_text(encoding="utf-8"))["luci-app-openclash-guard"]
        self.assertIn("openclash_guard_devices", acl["read"]["uci"])
        self.assertIn("openclash_guard_devices", acl["write"]["uci"])
        self.assertIn("openclash_guard", acl["read"]["uci"])
        self.assertIn("openclash_guard", acl["write"]["uci"])
        self.assertNotIn("luci.openclash-guard-devices", acl["write"]["ubus"])
        defaults = UCI_DEFAULTS.read_text(encoding="utf-8")
        self.assertIn("separate from openclash_guard runtime policy", defaults)

    def test_device_rpc_is_read_only_and_acl_allows_only_catalog_reads(self) -> None:
        acl = json.loads(ACL.read_text(encoding="utf-8"))["luci-app-openclash-guard"]
        methods = acl["read"]["ubus"]["luci.openclash-guard-devices"]
        self.assertEqual(methods, ["getCatalog", "getDevices"])

        rpcd = RPCD.read_text(encoding="utf-8")
        self.assertIn("getCatalog) emit_helper_result catalog", rpcd)
        self.assertIn("getDevices) emit_helper_result list", rpcd)
        self.assertNotIn("uci set", rpcd)
        self.assertNotIn("uci commit", rpcd)

        view = VIEW.read_text(encoding="utf-8")
        self.assertIn("method: 'getCatalog'", view)
        self.assertIn("method: 'getDevices'", view)
        self.assertNotIn("method: 'setDevices'", view)
        self.assertNotIn("method: 'applySuggestion'", view)

    def test_view_uses_catalog_bounds_and_keeps_suggestions_advisory(self) -> None:
        view = VIEW.read_text(encoding="utf-8")
        self.assertIn("catalog.limits.maxDevices", view)
        self.assertIn("catalog.limits.maxLabelLength", view)
        self.assertIn("catalog.limits.maxRoles", view)
        self.assertIn("catalog.deviceIdPattern", view)
        self.assertIn("manual_roles", view)
        self.assertIn("role_suggestions", view)
        self.assertIn("Role hints are tentative and may be incomplete", view)
        self.assertIn("Technical details", view)
        self.assertIn("Device ID", view)
        self.assertIn("forced SSH key", view)
        self.assertIn("deviceId.modalonly = true", view)

    def test_catalog_profiles_disambiguate_same_template_id_across_formats(self) -> None:
        templates = json.loads(PROFILE_TEMPLATES.read_text(encoding="utf-8"))["templates"]
        source_pairs = {
            (template["outputFormat"], template["id"])
            for template in templates
        }
        self.assertIn(("ini", "ai-balanced"), source_pairs)
        self.assertIn(("yaml", "ai-balanced"), source_pairs)

        source = json.loads(DEVICE_CATALOG.read_text(encoding="utf-8"))
        packaged = json.loads(PACKAGED_DEVICE_CATALOG.read_text(encoding="utf-8"))
        self.assertEqual(packaged["version"], 1)
        for key in ("roles", "profiles", "kinds", "limits"):
            self.assertIn(key, packaged)
        self.assertEqual(packaged["limits"]["deviceIdPattern"], source["deviceId"]["pattern"])
        self.assertEqual(packaged["limits"]["maxRoles"], len(packaged["roles"]))
        profiles = {profile["id"]: profile for profile in packaged["profiles"]}
        self.assertEqual(len(profiles), len(packaged["profiles"]))
        self.assertIn("ini:ai-balanced", profiles)
        self.assertIn("yaml:ai-balanced", profiles)
        self.assertNotEqual(profiles["ini:ai-balanced"]["label"], profiles["yaml:ai-balanced"]["label"])
        self.assertIn(source["profileFormatLabels"]["ini"], profiles["ini:ai-balanced"]["label"])
        self.assertIn(source["profileFormatLabels"]["yaml"], profiles["yaml:ai-balanced"]["label"])

        expected_ids = {f"{template['outputFormat']}:{template['id']}" for template in templates}
        self.assertEqual(set(profiles), expected_ids)


if __name__ == "__main__":
    unittest.main()
