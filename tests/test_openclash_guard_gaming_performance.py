from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GAMING = ROOT / "shell" / "apps" / "openclash-guard" / "gaming.sh"
POLICY = ROOT / "shell" / "apps" / "openclash-guard" / "policy.sh"
JSON = ROOT / "shell" / "lib" / "json.sh"


class OpenClashGuardGamingPerformanceTests(unittest.TestCase):
    def _run_safe_ports(
        self,
        *,
        destination_ports: list[int],
        protected_ports: list[int],
        legacy: bool = False,
        protected_read_fails: bool = False,
    ) -> tuple[list[str], list[str], list[str]]:
        with tempfile.TemporaryDirectory(prefix="openclash-guard-gaming-perf-") as temp:
            call_log = Path(temp) / "calls.log"
            destination_path = "gaming.udpPorts" if legacy else "gaming.udpDestinationPorts"
            destination_values = " ".join(str(port) for port in destination_ports)
            protected_values = " ".join(str(port) for port in protected_ports)
            protected_result = (
                "return 1"
                if protected_read_fails
                else f"printf '%s\\n' '{protected_values}'"
            )
            script = f'''
set -eu
. "{JSON}"
. "{POLICY}"
. "{GAMING}"
_GUARD_POLICY_FILE=/synthetic/openclash-guard.json
GUARD_JSON_CALL_LOG="{call_log}"
json_has() {{
    printf 'has:%s\\n' "$2" >> "$GUARD_JSON_CALL_LOG"
    [ "$2" = gaming.udpDestinationPorts ] && [ "{1 if not legacy else 0}" = 1 ]
}}
json_list() {{
    printf 'list:%s\\n' "$2" >> "$GUARD_JSON_CALL_LOG"
    case $2 in
        {destination_path}) printf '%s\\n' '{destination_values}' ;;
        gaming.protectedUdpPorts) {protected_result} ;;
        *) return 1 ;;
    esac
}}
guard_game_safe_udp_destination_ports
'''
            result = subprocess.run(
                ["/bin/sh", "-c", script],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = call_log.read_text(encoding="utf-8").splitlines()
            json_has_calls = [line.removeprefix("has:") for line in calls if line.startswith("has:")]
            json_list_calls = [line.removeprefix("list:") for line in calls if line.startswith("list:")]
            return result.stdout.splitlines(), json_has_calls, json_list_calls

    def test_safe_destination_filter_reads_protected_list_once_and_preserves_order(self) -> None:
        actual, has_calls, list_calls = self._run_safe_ports(
            destination_ports=[27015, 443, 27015, 53, 80],
            protected_ports=[443, 53],
        )

        self.assertEqual(actual, ["27015", "27015", "80"])
        self.assertEqual(has_calls, ["gaming.udpDestinationPorts"])
        self.assertEqual(
            list_calls,
            ["gaming.udpDestinationPorts", "gaming.protectedUdpPorts"],
        )

    def test_safe_destination_filter_has_constant_json_reads_for_353_ports(self) -> None:
        destination_ports = list(range(20000, 20353))
        actual, has_calls, list_calls = self._run_safe_ports(
            destination_ports=destination_ports,
            protected_ports=[443],
        )

        self.assertEqual(actual, [str(port) for port in destination_ports])
        self.assertEqual(has_calls, ["gaming.udpDestinationPorts"])
        self.assertEqual(
            list_calls,
            ["gaming.udpDestinationPorts", "gaming.protectedUdpPorts"],
        )

    def test_safe_destination_filter_keeps_legacy_destination_fallback(self) -> None:
        actual, has_calls, list_calls = self._run_safe_ports(
            destination_ports=[3074, 443, 3074],
            protected_ports=[443],
            legacy=True,
        )

        self.assertEqual(actual, ["3074", "3074"])
        self.assertEqual(has_calls, ["gaming.udpDestinationPorts"])
        self.assertEqual(
            list_calls,
            ["gaming.udpPorts", "gaming.protectedUdpPorts"],
        )

    def test_safe_destination_filter_keeps_empty_protected_list_fallback(self) -> None:
        actual, has_calls, list_calls = self._run_safe_ports(
            destination_ports=[27015, 443, 27015],
            protected_ports=[],
            protected_read_fails=True,
        )

        self.assertEqual(actual, ["27015", "443", "27015"])
        self.assertEqual(has_calls, ["gaming.udpDestinationPorts"])
        self.assertEqual(
            list_calls,
            ["gaming.udpDestinationPorts", "gaming.protectedUdpPorts"],
        )

    def test_empty_destination_list_does_not_load_protected_ports(self) -> None:
        actual, has_calls, list_calls = self._run_safe_ports(
            destination_ports=[],
            protected_ports=[443],
        )

        self.assertEqual(actual, [])
        self.assertEqual(has_calls, ["gaming.udpDestinationPorts"])
        self.assertEqual(list_calls, ["gaming.udpDestinationPorts"])


if __name__ == "__main__":
    unittest.main()
