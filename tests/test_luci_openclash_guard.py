from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps" / "luci-app-openclash-guard"
RPCD = APP / "root" / "usr" / "libexec" / "rpcd" / "luci.openclash-guard"
ACL = APP / "root" / "usr" / "share" / "rpcd" / "acl.d" / "luci-app-openclash-guard.json"
PACKAGED_REGIONS = APP / "root" / "usr" / "share" / "openclash-guard" / "regions.json"
CANONICAL_REGIONS = ROOT / "internal" / "config" / "ai-routing" / "catalogs" / "regions.json"
OVERVIEW = APP / "htdocs" / "luci-static" / "resources" / "view" / "openclash-guard" / "overview.js"
TESTS_VIEW = APP / "htdocs" / "luci-static" / "resources" / "view" / "openclash-guard" / "tests.js"
PROFILE_VIEW = APP / "htdocs" / "luci-static" / "resources" / "view" / "openclash-guard" / "profile.js"
UCI_DEFAULTS = APP / "root" / "etc" / "config" / "openclash_guard"


class LuCIOpenClashGuardContractTests(unittest.TestCase):
    def test_region_registry_is_exact_shared_data(self) -> None:
        self.assertEqual(
            PACKAGED_REGIONS.read_bytes(),
            CANONICAL_REGIONS.read_bytes(),
            "LuCI must consume the same generated Region Registry as routing",
        )

    def test_trace_endpoints_are_fixed_allowlist(self) -> None:
        rpcd = RPCD.read_text(encoding="utf-8")
        self.assertIn("https://chatgpt.com/cdn-cgi/trace", rpcd)
        self.assertIn("https://claude.ai/cdn-cgi/trace", rpcd)
        self.assertIn("https://grok.com/cdn-cgi/trace", rpcd)
        self.assertIn("trace endpoint returned an unexpected host", rpcd)
        self.assertIn("chatgpt|claude|grok", rpcd)
        self.assertNotIn("trace_url=$(uci_get", rpcd)

    def test_history_is_bounded_volatile_and_delimiter_safe(self) -> None:
        rpcd = RPCD.read_text(encoding="utf-8")
        self.assertIn("HISTORY_DIR='/tmp/openclash-guard/egress-history'", rpcd)
        self.assertIn("HISTORY_LIMIT_PER_SERVICE=60", rpcd)
        self.assertIn("HISTORY_LIMIT_TOTAL=180", rpcd)
        self.assertIn("tr '\\t\\r\\n|' '    '", rpcd)
        self.assertIn("IFS='|' read -r epoch service ok", rpcd)
        self.assertIn("json_add_boolean volatile 1", rpcd)
        self.assertIn("json_add_object getHistory", rpcd)
        self.assertIn("json_add_object clearHistory", rpcd)

    def test_acl_separates_observation_from_operator_controlled_writes(self) -> None:
        acl = json.loads(ACL.read_text(encoding="utf-8"))["luci-app-openclash-guard"]
        read_methods = acl["read"]["ubus"]["luci.openclash-guard"]
        write_methods = acl["write"]["ubus"]["luci.openclash-guard"]
        self.assertEqual(read_methods, ["getStatus", "getRegions", "getHistory", "trace"])
        self.assertEqual(write_methods, ["probeProfile", "clearHistory"])
        self.assertNotIn("probeProfile", read_methods)
        self.assertNotIn("clearHistory", read_methods)

    def test_profile_probe_keeps_https_and_size_boundaries(self) -> None:
        rpcd = RPCD.read_text(encoding="utf-8")
        self.assertIn("PROFILE_MAX_BYTES=262144", rpcd)
        self.assertIn("profile URL must use HTTPS", rpcd)
        self.assertIn("profile URL must not contain embedded credentials", rpcd)
        self.assertIn("profile URL contains whitespace", rpcd)
        profile = PROFILE_VIEW.read_text(encoding="utf-8")
        self.assertIn("probeProfile", profile)

    def test_dashboard_uses_real_history_not_placeholder_charts(self) -> None:
        overview = OVERVIEW.read_text(encoding="utf-8")
        self.assertIn("method: 'getHistory'", overview)
        self.assertIn("Egress observations · last 24 hours", overview)
        self.assertIn("Recent egress events", overview)
        self.assertIn("/tmp only", overview)
        self.assertIn("ocg-trend-cell", overview)

    def test_tests_page_restores_last_result_and_can_clear_history(self) -> None:
        view = TESTS_VIEW.read_text(encoding="utf-8")
        self.assertIn("method: 'getHistory'", view)
        self.assertIn("method: 'clearHistory'", view)
        self.assertIn("latestFor(records, service.id)", view)
        self.assertIn("Recent history", view)

    def test_default_config_exposes_first_class_profile_and_service_intent(self) -> None:
        config = UCI_DEFAULTS.read_text(encoding="utf-8")
        self.assertIn("option profile_mode 'remote_ini'", config)
        self.assertIn("option profile_url ''", config)
        self.assertIn("option chatgpt 'proxy'", config)
        self.assertIn("option claude 'proxy'", config)
        self.assertIn("option grok 'proxy'", config)


if __name__ == "__main__":
    unittest.main()
