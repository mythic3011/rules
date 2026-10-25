from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from test_openclash_guard_atomic_reconcile import GuardRuntimeHarness, POLICY, ROOT  # noqa: E402

RUNTIME_POLICY = ROOT / "cfg" / "runtime" / "openclash-guard.json"


class UciOverlayRuntimeCompatibilityTests(GuardRuntimeHarness):
    def test_package_absence_is_a_valid_empty_snapshot(self) -> None:
        self.write_uci({})

        result = self.run_cli("status", "--json")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        overlay = json.loads(result.stdout)["uciOverlay"]
        self.assertTrue(overlay["available"])
        self.assertTrue(overlay["valid"])
        self.assertEqual(overlay["errors"], [])
        self.assertEqual(overlay["unknownOptions"], [])

    def test_legacy_dns_and_global_killswitch_settings_remain_effective(self) -> None:
        self.write_uci(
            {
                "main.enabled": "1",
                "main.kill_switch": "0",
                "main.dns_kill_switch": "1",
            }
        )

        dns_only = self.run_cli("reconcile")

        self.assertEqual(dns_only.returncode, 0, dns_only.stdout + dns_only.stderr)
        dns_batch = self.nft_batch.read_text(encoding="utf-8")
        self.assertIn('iifname != "lo" udp dport 53 reject', dns_batch)
        self.assertIn('iifname != "lo" tcp dport 53 reject', dns_batch)
        self.assertNotIn("comment \"openclash-guard:kill-switch\"", dns_batch)

        self.write_uci(
            {
                "main.enabled": "1",
                "main.kill_switch": "1",
                "main.dns_kill_switch": "0",
            }
        )
        self.nft_mutations.write_text("", encoding="utf-8")
        self.nft_batch.unlink(missing_ok=True)

        global_kill = self.run_cli("reconcile")

        self.assertEqual(global_kill.returncode, 0, global_kill.stdout + global_kill.stderr)
        kill_batch = self.nft_batch.read_text(encoding="utf-8")
        self.assertIn('forward reject comment "openclash-guard:kill-switch"', kill_batch)
        self.assertNotIn('iifname != "lo" udp dport 53 reject', kill_batch)

    def test_udp_intent_is_reported_but_never_creates_direct_bypass_rules(self) -> None:
        scoped_client = "192.0.2.44"
        self.write_uci(
            {
                "main.enabled": "1",
                "main.dns_kill_switch": "1",
                "udp.enabled": "1",
                "udp.src_ip": [scoped_client],
                "udp.direct_iface": "wan0",
                "udp.protect_udp_443": "0",
            }
        )

        applied = self.run_cli("reconcile")

        self.assertEqual(applied.returncode, 0, applied.stdout + applied.stderr)
        batch = self.nft_batch.read_text(encoding="utf-8")
        self.assertIn("udp dport @protected_udp reject", batch)
        self.assertNotIn(scoped_client, batch)
        self.assertNotIn("gaming_direct", batch)
        self.assertNotIn("openclash_guard_gaming_", batch)

        status = self.run_cli("status", "--json")
        self.assertEqual(status.returncode, 0, status.stdout + status.stderr)
        payload = json.loads(status.stdout)
        self.assertEqual(payload["gaming"]["clients"]["count"], 1)
        self.assertEqual(payload["gaming"]["clients"]["items"], [])
        self.assertTrue(payload["uciOverlay"]["valid"])
        self.assertEqual(
            payload["uciOverlay"]["unknownOptions"],
            [{"option": "udp.direct_iface"}, {"option": "udp.protect_udp_443"}],
        )
        deferred = {item["option"]: item["reason"] for item in payload["uciDeferredOptions"]}
        self.assertIn("disabled", deferred["udp.enabled"])
        self.assertIn("gate", deferred["udp.src_ip"])
        self.assertNotIn(scoped_client, status.stdout)

    def test_signed_policy_ceiling_floor_and_live_dns_gate_survive_the_overlay(self) -> None:
        self.write_uci(
            {
                "main.enabled": "1",
                "routing.chatgpt": "direct",
                "routing.direct_region": "hk",
                "routing.proxy_region": "us",
                "dns.backend": "auto",
                "dns.fail_closed": "0",
                "dns.resolver_sync": "0",
            }
        )

        result = self.run_bundle_functions(
            "_GUARD_PREFLIGHT_COMPLETE=1\n"
            "_GUARD_PREFLIGHT_SETUP_VALID=1\n"
            "_guard_prepare\n"
            "printf 'route=%s floor=%s backend=%s direct_region=%s proxy_region=%s resolver_sync=%s\\n' \\\n"
            "  \"$(guard_uci_overlay_effective routing.chatgpt)\" \\\n"
            "  \"$(guard_uci_overlay_effective dns.fail_closed)\" \\\n"
            "  \"$(guard_uci_overlay_effective dns.backend)\" \\\n"
            "  \"$(guard_uci_overlay_effective routing.direct_region)\" \\\n"
            "  \"$(guard_uci_overlay_effective routing.proxy_region)\" \\\n"
            "  \"$(guard_uci_overlay_effective dns.resolver_sync)\"",
            GUARD_POLICY_FILE=str(RUNTIME_POLICY),
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("route=proxy floor=1 backend=none", result.stdout)
        self.assertIn("direct_region=DEFERRED:hk", result.stdout)
        self.assertIn("proxy_region=DEFERRED:us", result.stdout)
        self.assertIn("resolver_sync=DEFERRED:0", result.stdout)

    def test_failed_explicit_reload_invalidates_the_previous_snapshot_and_resolution(self) -> None:
        self.write_uci({"main.enabled": "0", "dns.backend": "dnsmasq"})
        failed_state = self.base / "uci-failed.json"
        failed_state.write_text(json.dumps({"options": {}, "error": "unreadable"}) + "\n", encoding="utf-8")

        body = (
            "_GUARD_UCOR_POLICY_FILE='" + str(POLICY) + "'\n"
            "_GUARD_UCOR_DNS_BACKEND=none\n"
            "guard_uci_overlay_load\n"
            "guard_uci_overlay_resolve\n"
            "printf 'before=%s resolved=%s\\n' \"$(guard_uci_overlay_get main.enabled)\" \"$(guard_uci_overlay_resolve_state_valid && printf yes || printf no)\"\n"
            "UCI_FAKE_STATE=$UCI_SECOND_STATE\n"
            "export UCI_FAKE_STATE\n"
            "if guard_uci_overlay_load; then printf 'reload=unexpected-success\\n'; else printf 'reload=failed\\n'; fi\n"
            "printf 'after=%s available=%s valid=%s resolved=%s\\n' \"$(guard_uci_overlay_get main.enabled)\" \"$(guard_uci_overlay_available)\" \"$(guard_uci_overlay_valid)\" \"$(guard_uci_overlay_resolve_state_valid && printf yes || printf no)\"\n"
            "if guard_uci_overlay_effective dns.backend >/dev/null 2>&1; then printf 'effective=available\\n'; else printf 'effective=refused\\n'; fi"
        )
        result = self.run_bundle_functions(body, UCI_SECOND_STATE=str(failed_state))

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("before=0 resolved=yes", result.stdout)
        self.assertIn("reload=failed", result.stdout)
        self.assertIn("after=1 available=0 valid=0 resolved=no", result.stdout)
        self.assertIn("effective=refused", result.stdout)


if __name__ == "__main__":
    unittest.main()
