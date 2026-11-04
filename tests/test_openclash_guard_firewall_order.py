from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KILLSWITCH = ROOT / "shell" / "apps" / "openclash-guard" / "killswitch.sh"


class OpenClashGuardFirewallOrderTests(unittest.TestCase):
    def render(self, *, enforcement: str, dns_kill_switch: bool) -> list[str]:
        script = f'''\
set -eu
. "{KILLSWITCH}"
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=openclash-guard
_GUARD_NFT_TABLE_EXISTS=0
_GUARD_NFT_AVAILABLE=1
_GUARD_OC_HEALTHY=0
_GUARD_POLICY_ENFORCEMENT={enforcement}
_GUARD_UCI_DNS_KILL_SWITCH={1 if dns_kill_switch else 0}
_GUARD_POLICY_FILE=/tmp/openclash-guard-order-test-policy.json
json_list() {{
    case ${{2:-}} in
        gaming.protectedUdpPorts) printf '%s\\n' '443 50000' ;;
        *) return 1 ;;
    esac
}}
guard_kill_render
guard_kill_render_final
'''
        result = subprocess.run(
            ["/bin/sh", "-c", script],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return [line for line in result.stdout.splitlines() if line.startswith("add rule ")]

    def test_reject_mode_has_no_established_or_related_forward_fastpath(self) -> None:
        rules = self.render(enforcement="reject", dns_kill_switch=False)
        forward = [line for line in rules if " openclash_guard forward " in line]
        comments = [line.rsplit(' comment "', 1)[-1][:-1] for line in forward]

        self.assertNotIn("openclash-guard:est", comments)
        self.assertFalse(any("ct state" in line for line in forward))
        kill = next(
            line
            for line in forward
            if 'comment "openclash-guard:kill-switch"' in line
        )
        for family in ("IPv4", "IPv6"):
            with self.subTest(family=family):
                # The `inet` chain and family-neutral reject cover both
                # families; no conntrack state rule exempts either one.
                self.assertIn("add rule inet ", kill)
                self.assertNotIn("ip saddr", kill)
                self.assertNotIn("ip daddr", kill)
                self.assertNotIn("ip6 saddr", kill)
                self.assertNotIn("ip6 daddr", kill)

        positions = {
            comment: comments.index(f"openclash-guard:{comment}")
            for comment in ("lo", "dhcp", "lan-dst", "protected-udp", "kill-switch")
        }
        self.assertLess(positions["lo"], positions["kill-switch"])
        self.assertLess(positions["dhcp"], positions["kill-switch"])
        self.assertLess(positions["lan-dst"], positions["kill-switch"])
        self.assertLess(positions["protected-udp"], positions["kill-switch"])

    def test_protected_udp_reject_precedes_nonreject_conntrack_fastpath(self) -> None:
        rules = self.render(enforcement="allow-proxy", dns_kill_switch=False)
        forward = [line for line in rules if " openclash_guard forward " in line]
        protected = next(
            i
            for i, line in enumerate(forward)
            if 'comment "openclash-guard:protected-udp"' in line
        )
        established = next(
            i for i, line in enumerate(forward) if 'comment "openclash-guard:est"' in line
        )

        self.assertLess(protected, established)
        self.assertIn("ct state established,related accept", forward[established])
        self.assertFalse(
            any('comment "openclash-guard:kill-switch"' in line for line in forward)
        )

    def test_enabled_dns_kill_switch_precedes_established_input_accept(self) -> None:
        rules = self.render(enforcement="allow-proxy", dns_kill_switch=True)
        inputs = [line for line in rules if " openclash_guard input " in line]
        dns_udp = next(
            i for i, line in enumerate(inputs) if 'comment "openclash-guard:dns-ks"' in line
        )
        dns_tcp = next(
            i
            for i, line in enumerate(inputs)
            if 'comment "openclash-guard:dns-ks-tcp"' in line
        )
        established = next(
            i
            for i, line in enumerate(inputs)
            if 'comment "openclash-guard:est-in"' in line
        )

        self.assertLess(dns_udp, established)
        self.assertLess(dns_tcp, established)
        self.assertIn('iifname != "lo" udp dport 53 reject', inputs[dns_udp])
        self.assertIn('iifname != "lo" tcp dport 53 reject', inputs[dns_tcp])

    def test_dns_kill_switch_remains_disabled_by_default(self) -> None:
        rules = self.render(enforcement="allow-proxy", dns_kill_switch=False)
        self.assertFalse(any(":dns-ks" in line for line in rules))


if __name__ == "__main__":
    unittest.main()
