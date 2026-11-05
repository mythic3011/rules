from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KILLSWITCH = ROOT / "shell" / "apps" / "openclash-guard" / "killswitch.sh"


class OpenClashGuardFirewallOrderTests(unittest.TestCase):
    def render(
        self,
        *,
        enforcement: str,
        global_failclosed: bool,
        dns_kill_switch: bool,
    ) -> list[str]:
        script = f'''\
set -eu
. "{KILLSWITCH}"
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=openclash-guard
_GUARD_NFT_TABLE_EXISTS=0
_GUARD_NFT_AVAILABLE=1
_GUARD_OC_HEALTHY=0
_GUARD_DNS_BACKEND=dnsmasq
_GUARD_POLICY_ENFORCEMENT={enforcement}
_GUARD_POLICY_GLOBAL_FAILCLOSED={1 if global_failclosed else 0}
_GUARD_UCI_DNS_KILL_SWITCH={1 if dns_kill_switch else 0}
guard_policy_protected_udp_ports() {{
    printf '%s\\n' 443
}}
nft() {{ echo unexpected-nft-probe >&2; return 99; }}
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

    @staticmethod
    def rules_for(rules: list[str], chain: str) -> list[str]:
        return [line for line in rules if f" openclash_guard {chain} " in line]

    @staticmethod
    def comments(rules: list[str]) -> list[str]:
        return [line.rsplit(' comment "', 1)[-1][:-1] for line in rules]

    def test_global_failclosed_omits_forward_state_fastpath(self) -> None:
        rules = self.render(
            enforcement="reject", global_failclosed=True, dns_kill_switch=False
        )
        forward = self.rules_for(rules, "forward")
        comments = self.comments(forward)

        self.assertFalse(any("ct state established,related accept" in line for line in forward))
        positions = {
            comment: comments.index(f"openclash-guard:{comment}")
            for comment in ("lo", "dhcp", "lan-dst", "protected-udp", "kill-switch")
        }
        self.assertLess(positions["lo"], positions["kill-switch"])
        self.assertLess(positions["dhcp"], positions["kill-switch"])
        self.assertLess(positions["lan-dst"], positions["kill-switch"])
        self.assertLess(positions["protected-udp"], positions["kill-switch"])

    def test_service_scoped_reject_retains_state_fastpath_after_protected_deny(self) -> None:
        rules = self.render(
            enforcement="reject", global_failclosed=False, dns_kill_switch=False
        )
        forward = self.rules_for(rules, "forward")
        comments = self.comments(forward)
        protected = comments.index("openclash-guard:protected-udp")
        established = comments.index("openclash-guard:est")

        self.assertLess(protected, established)
        self.assertIn("ct state established,related accept", forward[established])
        self.assertNotIn("openclash-guard:kill-switch", comments)

    def test_enabled_dns_rejects_precede_input_state_accept(self) -> None:
        rules = self.render(
            enforcement="allow-proxy", global_failclosed=False, dns_kill_switch=True
        )
        inputs = self.rules_for(rules, "input")
        comments = self.comments(inputs)
        established = comments.index("openclash-guard:est-in")
        dns_udp = comments.index("openclash-guard:dns-ks")
        dns_tcp = comments.index("openclash-guard:dns-ks-tcp")

        self.assertLess(dns_udp, established)
        self.assertLess(dns_tcp, established)
        self.assertIn('iifname != "lo" udp dport 53 reject', inputs[dns_udp])
        self.assertIn('iifname != "lo" tcp dport 53 reject', inputs[dns_tcp])

    def test_dns_kill_switch_remains_disabled_by_default(self) -> None:
        rules = self.render(
            enforcement="allow-proxy", global_failclosed=False, dns_kill_switch=False
        )
        self.assertFalse(any("openclash-guard:dns-ks" in line for line in rules))


if __name__ == "__main__":
    unittest.main()
