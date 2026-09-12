from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "shell" / "apps" / "openclash-guard"
GAMING = APP_DIR / "gaming.sh"
KILLSWITCH = APP_DIR / "killswitch.sh"
POLICY = APP_DIR / "policy.sh"
MAIN = APP_DIR / "main.sh"


class OpenClashGuardGamingContractTests(unittest.TestCase):
    def run_shell(self, body: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", "-c", body],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def test_gaming_source_has_no_game_or_openclash_dataplane_hardcode(self) -> None:
        text = GAMING.read_text(encoding="utf-8")
        for forbidden in (
            "4950",
            "4955",
            "0x162",
            "openclash_mangle",
            "openclash_guard.udp.port",
        ):
            self.assertNotIn(forbidden, text)

    def test_shell_sources_are_syntax_valid(self) -> None:
        result = subprocess.run(
            ["/bin/sh", "-n", str(GAMING), str(KILLSWITCH), str(POLICY), str(MAIN)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_gaming_flow_eligibility_is_scoped_and_fail_closed(self) -> None:
        script = f'''
set -eu
. "{GAMING}"
_GUARD_POLICY_FILE=/synthetic/policy.json
_GUARD_GAME_ENABLED=1
_GUARD_OC_HEALTHY=1

json_list() {{
    case "$2" in
        gaming.udpPorts) printf '%s\\n' "3074 27015" ;;
        gaming.destinationCidrs) printf '%s\\n' "203.0.113.0/24" ;;
        *) return 1 ;;
    esac
}}
json_has() {{ [ "$2" = gaming.destinationCidrs ]; }}
guard_policy_port_in_list() {{
    [ "$2" = gaming.protectedUdpPorts ] && [ "$1" = 443 ]
}}
guard_game_src_ips() {{ printf '%s\\n' "10.0.0.11"; }}

expect_ok() {{ "$@" || exit 10; }}
expect_fail() {{ if "$@"; then exit 11; fi; }}

expect_ok guard_game_flow_eligible udp 3074 10.0.0.11 203.0.113.10
expect_fail guard_game_flow_eligible udp 443 10.0.0.11 203.0.113.10
expect_fail guard_game_flow_eligible udp 9999 10.0.0.11 203.0.113.10
expect_fail guard_game_flow_eligible udp 3074 10.0.0.12 203.0.113.10
expect_fail guard_game_flow_eligible udp 3074 10.0.0.11 198.51.100.10
_GUARD_OC_HEALTHY=0
expect_fail guard_game_flow_eligible udp 3074 10.0.0.11 203.0.113.10
'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def test_orchestrator_orders_scoped_gaming_before_final_kill_switch(self) -> None:
        text = MAIN.read_text(encoding="utf-8")
        start = text.index("_guard_write_batch() {")
        end = text.index("\nguard_cmd_reconcile()", start)
        body = text[start:end]
        base = body.index("        guard_kill_render\n")
        gaming = body.index("        guard_game_render\n")
        final = body.index("        guard_kill_render_final\n")
        self.assertLess(base, gaming)
        self.assertLess(gaming, final)
        self.assertNotIn("guard_kill_render_final", GAMING.read_text(encoding="utf-8"))

    def test_final_kill_switch_is_separate_from_base_renderer(self) -> None:
        text = KILLSWITCH.read_text(encoding="utf-8")
        base_start = text.index("guard_kill_render() {")
        final_start = text.index("guard_kill_render_final() {")
        base = text[base_start:final_start]
        final = text[final_start:]
        self.assertNotIn("kill-switch", base)
        self.assertIn("kill-switch", final)
        self.assertIn("guard_kill_render_final", MAIN.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
