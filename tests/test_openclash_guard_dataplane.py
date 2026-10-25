from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NFT = ROOT / "shell" / "lib" / "nft.sh"
DATAPLANE = ROOT / "shell" / "apps" / "openclash-guard" / "dataplane.sh"


class OpenClashGuardDataplaneTests(unittest.TestCase):
    def run_shell(self, body: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", "-c", body],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def test_adapter_does_not_persist_handles_or_game_ports(self) -> None:
        text = DATAPLANE.read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"\bposition\s+\d+\b", text))
        self.assertNotIn("0x162", text)
        for forbidden in ("443", "4950", "4955", "27015", "27000", "27250"):
            self.assertNotIn(forbidden, text)

    def test_reconcile_rediscovers_anchor_and_replaces_only_owned_jump(self) -> None:
        script = f'''
set -eu
. "{NFT}"
. "{DATAPLANE}"
GUARD_DIRECT_WAN_IFACE=eth1
_GUARD_OC_HEALTHY=1

ip() {{ return 0; }}
nft() {{
    case "$*" in
        "list table inet fw4") return 0 ;;
        "list chain inet fw4 openclash_mangle") return 0 ;;
        "list chain inet fw4 openclash_guard_gaming_direct") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_src") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_sport") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_dport") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_dst") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_protected") return 1 ;;
        "-a list chain inet fw4 openclash_mangle")
            cat <<'EOF'
chain openclash_mangle {{
    ip saddr 10.0.0.9 udp dport 30000 counter return comment "foreign:keep" # handle 76
    ip saddr 10.0.0.9 meta l4proto udp jump openclash_guard_gaming_direct comment "openclash-guard:gaming-direct:jump" # handle 77
    ip protocol udp counter packets 1 bytes 1 jump openclash_upnp # handle 88
    meta l4proto udp meta mark set 0x00000162 counter packets 1 bytes 1 # handle 89
}}
EOF
            ;;
        *) printf 'unexpected nft call: %s\\n' "$*" >&2; return 1 ;;
    esac
}}

guard_dataplane_prepare "10.0.0.11" "" "30000 30001" "" "443" || exit 10
guard_dataplane_ready || exit 11
guard_dataplane_render
'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("delete rule inet fw4 openclash_mangle handle 77", result.stdout)
        self.assertNotIn("handle 76\n", result.stdout)
        self.assertIn("insert rule inet fw4 openclash_mangle position 88", result.stdout)
        self.assertIn("meta mark 0 ip saddr @openclash_guard_gaming_src", result.stdout)
        self.assertIn("udp dport != @openclash_guard_gaming_protected udp dport @openclash_guard_gaming_dport meta mark set 0x40000000 return", result.stdout)
        self.assertIn("udp dport != @openclash_guard_gaming_protected", result.stdout)
        self.assertNotIn(" jump openclash_guard_gaming_direct ", result.stdout)

    def test_existing_owned_objects_are_flushed_not_duplicated(self) -> None:
        script = f'''
set -eu
. "{NFT}"
. "{DATAPLANE}"
GUARD_DIRECT_WAN_IFACE=eth1
_GUARD_OC_HEALTHY=1

ip() {{ return 0; }}
nft() {{
    case "$*" in
        "list table inet fw4") return 0 ;;
        "list chain inet fw4 openclash_mangle") return 0 ;;
        "list chain inet fw4 openclash_guard_gaming_direct") return 0 ;;
        "list set inet fw4 openclash_guard_gaming_src") return 0 ;;
        "list set inet fw4 openclash_guard_gaming_sport") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_dport") return 0 ;;
        "list set inet fw4 openclash_guard_gaming_dst") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_protected") return 1 ;;
        "-a list chain inet fw4 openclash_mangle")
            cat <<'EOF'
chain openclash_mangle {{
    ip saddr @openclash_guard_gaming_src meta l4proto udp jump openclash_guard_gaming_direct comment "openclash-guard:gaming-direct:jump" # handle 377
    ip protocol udp counter packets 1 bytes 1 jump openclash_upnp # handle 388
}}
EOF
            ;;
        *) return 1 ;;
    esac
}}

guard_dataplane_prepare "10.0.0.11" "" "30000" "" "443" || exit 15
guard_dataplane_ready || exit 16
guard_dataplane_render
'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("flush chain inet fw4 openclash_guard_gaming_direct", result.stdout)
        self.assertIn("delete chain inet fw4 openclash_guard_gaming_direct", result.stdout)
        self.assertIn("flush set inet fw4 openclash_guard_gaming_src", result.stdout)
        self.assertIn("flush set inet fw4 openclash_guard_gaming_dport", result.stdout)
        self.assertIn("add set inet fw4 openclash_guard_gaming_protected", result.stdout)
        self.assertNotIn("add chain inet fw4 openclash_guard_gaming_direct", result.stdout)
        self.assertNotIn("add set inet fw4 openclash_guard_gaming_src", result.stdout)
        self.assertNotIn("add set inet fw4 openclash_guard_gaming_dport", result.stdout)
        self.assertEqual(result.stdout.count("insert rule inet fw4 openclash_mangle position 388"), 1)

    def test_missing_protected_metadata_disables_direct_bypass(self) -> None:
        text = DATAPLANE.read_text(encoding="utf-8")
        self.assertIn('[ -n "$_GUARD_DATAPLANE_PROTECTED_PORTS" ] || return 0', text)
        self.assertIn("udp dport != @%s", text)

    def test_unresolved_direct_iface_fails_closed_and_only_cleans_stale_jump(self) -> None:
        script = f'''
set -eu
. "{NFT}"
. "{DATAPLANE}"
unset GUARD_DIRECT_WAN_IFACE
_GUARD_OC_HEALTHY=1

uci() {{ return 1; }}
ip() {{
    case "$*" in
        "-4 route show default") return 0 ;;
        *) return 1 ;;
    esac
}}
nft() {{
    case "$*" in
        "list table inet fw4") return 0 ;;
        "list chain inet fw4 openclash_mangle") return 0 ;;
        "list chain inet fw4 openclash_guard_gaming_direct") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_src") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_sport") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_dport") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_dst") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_protected") return 1 ;;
        "-a list chain inet fw4 openclash_mangle")
            cat <<'EOF'
chain openclash_mangle {{
    ip saddr 10.0.0.9 meta l4proto udp jump openclash_guard_gaming_direct comment "openclash-guard:gaming-direct:jump" # handle 177
    ip protocol udp counter packets 1 bytes 1 jump openclash_upnp # handle 188
}}
EOF
            ;;
        *) return 1 ;;
    esac
}}

guard_dataplane_prepare "10.0.0.11" "" "30000" "" "443" || exit 20
if guard_dataplane_ready; then exit 21; fi
guard_dataplane_render
'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("delete rule inet fw4 openclash_mangle handle 177", result.stdout)
        self.assertNotIn("insert rule inet fw4 openclash_mangle", result.stdout)
        self.assertNotIn("add rule inet fw4 openclash_guard_gaming_direct", result.stdout)

    def test_unhealthy_openclash_never_installs_new_direct_jump(self) -> None:
        script = f'''
set -eu
. "{NFT}"
. "{DATAPLANE}"
GUARD_DIRECT_WAN_IFACE=eth1
_GUARD_OC_HEALTHY=0

ip() {{ return 0; }}
nft() {{
    case "$*" in
        "list table inet fw4") return 0 ;;
        "list chain inet fw4 openclash_mangle") return 0 ;;
        "list chain inet fw4 openclash_guard_gaming_direct") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_src") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_sport") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_dport") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_dst") return 1 ;;
        "list set inet fw4 openclash_guard_gaming_protected") return 1 ;;
        "-a list chain inet fw4 openclash_mangle")
            printf '%s\\n' 'ip protocol udp counter packets 1 bytes 1 jump openclash_upnp # handle 288'
            ;;
        *) return 1 ;;
    esac
}}

guard_dataplane_prepare "10.0.0.11" "30000" "" "" "443" || exit 30
if guard_dataplane_ready; then exit 31; fi
guard_dataplane_render
'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertNotIn("insert rule inet fw4 openclash_mangle", result.stdout)


if __name__ == "__main__":
    unittest.main()
