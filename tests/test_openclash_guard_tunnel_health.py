from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TUNNEL_HEALTH = ROOT / "shell" / "apps" / "openclash-guard" / "tunnel-health.sh"


class OpenClashGuardTunnelHealthTests(unittest.TestCase):
    def run_shell(self, body: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", "-c", body],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def probe(self, listing: str, *, mark: str = "0x162", ifaces: str = "utun") -> subprocess.CompletedProcess[str]:
        script = f'''\
set -eu
. "{TUNNEL_HEALTH}"
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=openclash-guard
nft() {{
    case "$*" in
        "-a list chain inet openclash_guard forward") cat <<'EOF'
{listing}
EOF
            ;;
        *) printf 'unexpected nft call: %s\\n' "$*" >&2; return 99 ;;
    esac
}}
rc=0
guard_health_tunnel_probe "{mark}" "{ifaces}" || rc=$?
printf 'rc=%s expected=%s state=%s mark=%s ifaces=%s rules=%s reason=%s\\n' \
    "$rc" "$_GUARD_HEALTH_TUN_EXPECTED" "$_GUARD_HEALTH_TUN_STATE" \
    "$_GUARD_HEALTH_TUN_MARK" "$_GUARD_HEALTH_TUN_IFACES" \
    "$_GUARD_HEALTH_TUN_RULES" "$_GUARD_HEALTH_TUN_REASON"
'''
        return self.run_shell(script)

    def test_valid_rules_for_all_expected_ifaces_pass_with_padded_live_mark(self) -> None:
        listing = '''chain forward {
    udp dport @protected_udp reject comment "openclash-guard:protected-udp" # handle 10
    meta mark 0x00000162 oifname "utun" accept comment "openclash-guard:tunnel-egress" # handle 11
    meta mark 0x162 oifname "Meta" accept comment "openclash-guard:tunnel-egress" # handle 12
    reject comment "openclash-guard:kill-switch" # handle 13
}'''
        result = self.probe(listing, ifaces="utun Meta")
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("rc=0", result.stdout)
        self.assertIn("state=ready", result.stdout)
        self.assertIn("rules=present", result.stdout)

    def test_missing_expected_iface_fails(self) -> None:
        listing = '''chain forward {
    udp dport @protected_udp reject comment "openclash-guard:protected-udp"
    meta mark 0x162 oifname "utun" accept comment "openclash-guard:tunnel-egress"
    reject comment "openclash-guard:kill-switch"
}'''
        result = self.probe(listing, ifaces="utun Meta")
        self.assertIn("rc=1", result.stdout)
        self.assertIn("rules=missing", result.stdout)
        self.assertIn("reason=missing-interface-Meta", result.stdout)

    def test_wrong_mark_is_malformed(self) -> None:
        listing = '''chain forward {
    udp dport @protected_udp reject comment "openclash-guard:protected-udp"
    meta mark 0x163 oifname "utun" accept comment "openclash-guard:tunnel-egress"
    reject comment "openclash-guard:kill-switch"
}'''
        result = self.probe(listing)
        self.assertIn("rc=1", result.stdout)
        self.assertIn("rules=malformed", result.stdout)
        self.assertIn("reason=malformed-interface-utun", result.stdout)

    def test_duplicate_iface_rule_fails(self) -> None:
        listing = '''chain forward {
    udp dport @protected_udp reject comment "openclash-guard:protected-udp"
    meta mark 0x162 oifname "utun" accept comment "openclash-guard:tunnel-egress"
    meta mark 0x162 oifname "utun" accept comment "openclash-guard:tunnel-egress"
    reject comment "openclash-guard:kill-switch"
}'''
        result = self.probe(listing)
        self.assertIn("rc=1", result.stdout)
        self.assertIn("rules=duplicate", result.stdout)
        self.assertIn("reason=duplicate-interface-utun", result.stdout)

    def test_unexpected_extra_tunnel_rule_fails(self) -> None:
        listing = '''chain forward {
    udp dport @protected_udp reject comment "openclash-guard:protected-udp"
    meta mark 0x162 oifname "utun" accept comment "openclash-guard:tunnel-egress"
    meta mark 0x162 oifname "OtherTun" accept comment "openclash-guard:tunnel-egress"
    reject comment "openclash-guard:kill-switch"
}'''
        result = self.probe(listing)
        self.assertIn("rc=1", result.stdout)
        self.assertIn("rules=unexpected", result.stdout)
        self.assertIn("reason=unexpected-tunnel-egress-rule", result.stdout)

    def test_rule_before_protected_udp_fails_ordering(self) -> None:
        listing = '''chain forward {
    meta mark 0x162 oifname "utun" accept comment "openclash-guard:tunnel-egress"
    udp dport @protected_udp reject comment "openclash-guard:protected-udp"
    reject comment "openclash-guard:kill-switch"
}'''
        result = self.probe(listing)
        self.assertIn("rc=1", result.stdout)
        self.assertIn("rules=misordered", result.stdout)
        self.assertIn("reason=misordered-interface-utun", result.stdout)

    def test_rule_after_kill_switch_fails_ordering(self) -> None:
        listing = '''chain forward {
    udp dport @protected_udp reject comment "openclash-guard:protected-udp"
    reject comment "openclash-guard:kill-switch"
    meta mark 0x162 oifname "utun" accept comment "openclash-guard:tunnel-egress"
}'''
        result = self.probe(listing)
        self.assertIn("rc=1", result.stdout)
        self.assertIn("rules=misordered", result.stdout)
        self.assertIn("reason=misordered-interface-utun", result.stdout)

    def test_unhealthy_openclash_is_inactive_and_does_not_probe_runtime(self) -> None:
        script = f'''\
set -eu
. "{TUNNEL_HEALTH}"
guard_env_detect() {{ _GUARD_OC_HEALTHY=0; _GUARD_NFT_AVAILABLE=1; }}
_guard_policy_default_path() {{ printf '%s\\n' /tmp/policy.json; }}
guard_policy_load() {{ printf 'policy must not load\\n' >&2; return 99; }}
_guard_kill_openclash_tunnel_mark() {{ printf 'mark discovery must not run\\n' >&2; return 99; }}
_guard_kill_openclash_tunnel_ifaces() {{ printf 'iface discovery must not run\\n' >&2; return 99; }}
nft() {{ printf 'nft must not be called\\n' >&2; return 99; }}
guard_health_tunnel_assess
printf 'expected=%s state=%s rules=%s reason=%s\\n' \
    "$_GUARD_HEALTH_TUN_EXPECTED" "$_GUARD_HEALTH_TUN_STATE" \
    "$_GUARD_HEALTH_TUN_RULES" "$_GUARD_HEALTH_TUN_REASON"
'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(
            result.stdout.strip(),
            "expected=0 state=inactive rules=not-required reason=openclash-unhealthy",
        )
        self.assertEqual(result.stderr, "")


if __name__ == "__main__":
    unittest.main()
