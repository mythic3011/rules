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
PROTECTION_VIEW = APP / "htdocs" / "luci-static" / "resources" / "view" / "openclash-guard" / "protection.js"
ROUTING_VIEW = APP / "htdocs" / "luci-static" / "resources" / "view" / "openclash-guard" / "routing.js"
DNS_VIEW = APP / "htdocs" / "luci-static" / "resources" / "view" / "openclash-guard" / "dns.js"
MONITORING_VIEW = APP / "htdocs" / "luci-static" / "resources" / "view" / "openclash-guard" / "monitoring.js"
MONITOR_INIT = APP / "root" / "etc" / "init.d" / "openclash-guard-egress-monitor"
MONITOR_HELPER = APP / "root" / "usr" / "libexec" / "openclash-guard" / "egress-monitor"
UCI_DEFAULTS = APP / "root" / "etc" / "config" / "openclash_guard"


class LuCIOpenClashGuardContractTests(unittest.TestCase):
    def test_region_registry_is_exact_shared_data(self) -> None:
        self.assertEqual(PACKAGED_REGIONS.read_bytes(), CANONICAL_REGIONS.read_bytes(), "LuCI must consume the same generated Region Registry as routing")

    def test_proxy_region_uses_routable_primary_order(self) -> None:
        catalog = json.loads(CANONICAL_REGIONS.read_text(encoding="utf-8"))
        config = UCI_DEFAULTS.read_text(encoding="utf-8")
        view = ROUTING_VIEW.read_text(encoding="utf-8")
        self.assertIn("option direct_region 'hk'", config)
        self.assertIn("option proxy_region 'us'", config)
        self.assertIn("us", catalog["primaryOrder"])
        self.assertNotIn("hk", catalog["primaryOrder"])
        self.assertIn("Array.isArray(catalog.primaryOrder)", view)
        self.assertIn("addRegions(proxy, catalog, true)", view)
        self.assertIn("addRegions(direct, catalog, false)", view)

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
        self.assertIn("probeProfile", PROFILE_VIEW.read_text(encoding="utf-8"))

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

    def test_background_monitor_is_opt_in_bounded_and_fixed_service_only(self) -> None:
        config = UCI_DEFAULTS.read_text(encoding="utf-8")
        view = MONITORING_VIEW.read_text(encoding="utf-8")
        init = MONITOR_INIT.read_text(encoding="utf-8")
        helper = MONITOR_HELPER.read_text(encoding="utf-8")
        self.assertIn("config monitoring 'monitoring'", config)
        self.assertIn("option enabled '0'", config)
        self.assertIn("option interval '900'", config)
        self.assertIn("Enable background monitoring", view)
        for seconds in ("300", "900", "1800", "3600"):
            self.assertIn(f"interval.value('{seconds}'", view)
        self.assertIn("USE_PROCD=1", init)
        self.assertIn("procd_add_reload_trigger", init)
        self.assertIn("monitoring.enabled", init)
        self.assertIn("MIN_INTERVAL=300", helper)
        self.assertIn("MAX_INTERVAL=86400", helper)
        self.assertIn("for service in chatgpt claude grok", helper)
        self.assertIn("RPCD_BACKEND='/usr/libexec/rpcd/luci.openclash-guard'", helper)
        self.assertNotIn("http://", helper)
        self.assertNotIn("https://", helper)
        self.assertNotIn("/etc/openclash-guard/egress-history", helper)

    def test_runtime_effective_controls_are_exposed_without_overriding_signed_policy(self) -> None:
        config = UCI_DEFAULTS.read_text(encoding="utf-8")
        protection = PROTECTION_VIEW.read_text(encoding="utf-8")
        dns = DNS_VIEW.read_text(encoding="utf-8")
        self.assertIn("option kill_switch '1'", config)
        self.assertIn("option dns_kill_switch '0'", config)
        self.assertIn("config udp 'udp'", config)
        self.assertIn("option enabled '1'", config)
        for key in ("kill_switch", "dns_kill_switch", "src_ip"):
            self.assertIn(f"'{key}'", protection)
        self.assertIn("Effective now", protection)
        self.assertIn("signed runtime policy determines eligible/protected ports", protection)
        self.assertNotIn("udpSourcePorts", protection)
        self.assertNotIn("udpDestinationPorts", protection)
        self.assertIn("Staged intent", dns)
        self.assertIn("not yet a direct Guard runtime input", dns)

    def test_default_config_exposes_first_class_profile_and_service_intent(self) -> None:
        config = UCI_DEFAULTS.read_text(encoding="utf-8")
        self.assertIn("option profile_mode 'remote_ini'", config)
        self.assertIn("option profile_url ''", config)
        self.assertIn("option chatgpt 'proxy'", config)
        self.assertIn("option claude 'proxy'", config)
        self.assertIn("option grok 'proxy'", config)


if __name__ == "__main__":
    unittest.main()
