from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KILLSWITCH = ROOT / "shell" / "apps" / "openclash-guard" / "killswitch.sh"


class OpenClashGuardTunnelEgressTests(unittest.TestCase):
    def run_shell(self, body: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", "-c", body],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def base_script(self, nft_body: str, ip_body: str = '[ "$1 $2 $3 $4" = "link show dev utun" ]') -> str:
        return f'''\\
set -eu
. "{KILLSWITCH}"

_GUARD_OC_HEALTHY=1
_GUARD_NFT_AVAILABLE=1
_GUARD_POLICY_ENFORCEMENT=reject
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=openclash-guard

nft() {{
    cat <<'EOF'
{nft_body}
EOF
}}

ip() {{
    {ip_body}
}}

guard_kill_render_final
'''

    def test_compact_generic_mark_is_allowed_before_kill_switch(self) -> None:
        script = self.base_script(
            """table inet fw4 {
    chain openclash_mangle {
        meta l4proto udp meta mark set 0x162 counter packets 1 bytes 102
    }
}"""
        )
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        tunnel = 'meta mark 0x162 oifname "utun" accept comment "openclash-guard:tunnel-egress"'
        kill = 'reject comment "openclash-guard:kill-switch"'
        self.assertIn(tunnel, result.stdout)
        self.assertIn(kill, result.stdout)
        self.assertLess(result.stdout.index(tunnel), result.stdout.index(kill))

    def test_padded_and_compact_same_mark_are_not_ambiguous(self) -> None:
        script = self.base_script(
            """table inet fw4 {
    chain openclash_mangle {
        meta l4proto udp meta mark set 0x00000162
        ip protocol udp meta mark set 0x162
    }
}"""
        )
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(result.stdout.count('comment "openclash-guard:tunnel-egress"'), 1)
        self.assertIn('meta mark 0x162 oifname "utun" accept', result.stdout)

    def test_distinct_generic_marks_fail_closed(self) -> None:
        script = self.base_script(
            """table inet fw4 {
    chain openclash_mangle {
        meta l4proto udp meta mark set 0x162
        meta l4proto udp meta mark set 0x163
    }
}"""
        )
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertNotIn("tunnel-egress", result.stdout)
        self.assertIn('reject comment "openclash-guard:kill-switch"', result.stdout)

    def test_scoped_mark_does_not_authorize_tunnel_egress(self) -> None:
        script = self.base_script(
            """table inet fw4 {
    chain openclash_mangle {
        ip saddr 10.0.0.11 meta l4proto udp meta mark set 0x40000000
    }
}"""
        )
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertNotIn("tunnel-egress", result.stdout)
        self.assertIn('reject comment "openclash-guard:kill-switch"', result.stdout)

    def test_unrelated_tun0_is_not_a_default_openclash_interface(self) -> None:
        script = self.base_script(
            """table inet fw4 {
    chain openclash_mangle {
        meta l4proto udp meta mark set 0x162
    }
}""",
            'case "$1 $2 $3 $4" in "link show dev tun0") return 0 ;; *) return 1 ;; esac',
        )
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertNotIn("tunnel-egress", result.stdout)
        self.assertIn('reject comment "openclash-guard:kill-switch"', result.stdout)

    def test_explicit_tun0_override_can_authorize_existing_interface(self) -> None:
        script = self.base_script(
            """table inet fw4 {
    chain openclash_mangle {
        meta l4proto udp meta mark set 0x162
    }
}""",
            '[ "$1 $2 $3 $4" = "link show dev tun0" ]',
        ).replace(
            "_GUARD_NFT_PREFIX=openclash-guard\n",
            "_GUARD_NFT_PREFIX=openclash-guard\nGUARD_OPENCLASH_TUN_IFACES=\"tun0\"\n",
        )
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn('meta mark 0x162 oifname "tun0" accept', result.stdout)

    def test_unhealthy_openclash_never_probes_nft(self) -> None:
        script = f'''\\
set -eu
. "{KILLSWITCH}"

_GUARD_OC_HEALTHY=0
_GUARD_NFT_AVAILABLE=1
_GUARD_POLICY_ENFORCEMENT=reject
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=openclash-guard

nft() {{
    echo unexpected-nft-probe >&2
    return 99
}}

guard_kill_render_final
'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertNotIn("unexpected-nft-probe", result.stderr)
        self.assertNotIn("tunnel-egress", result.stdout)
        self.assertIn('reject comment "openclash-guard:kill-switch"', result.stdout)


if __name__ == "__main__":
    unittest.main()
