from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JSON = ROOT / "shell" / "lib" / "json.sh"
POLICY_SOURCE = ROOT / "shell" / "apps" / "openclash-guard" / "policy.sh"
GAMING = ROOT / "shell" / "apps" / "openclash-guard" / "gaming.sh"
POLICY_FIXTURE = ROOT / "tests" / "fixtures" / "synthetic" / "openclash-guard" / "policy.json"


class OpenClashGuardGamingPerformanceTests(unittest.TestCase):
    def test_destination_filter_uses_loaded_protected_port_snapshot(self) -> None:
        document = json.loads(POLICY_FIXTURE.read_text(encoding="utf-8"))
        document["gaming"]["udpDestinationPorts"] = list(range(1000, 1353))

        with tempfile.TemporaryDirectory(prefix="guard-gaming-protected-cache-") as temp:
            policy = Path(temp) / "policy.json"
            filtered = Path(temp) / "filtered-ports.txt"
            reads = Path(temp) / "protected-list-reads.txt"
            policy.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
            script = f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
. "{GAMING}"
guard_policy_load "$1"
json_list() {{
    case ${{2:-}} in
        gaming.protectedUdpPorts)
            printf 'unexpected-read\\n' >> "$3"
            printf '443\\n'
            ;;
        gaming.udpDestinationPorts)
            _guard_test_port=1000
            while [ "$_guard_test_port" -le 1352 ]; do
                printf '%s\\n' "$_guard_test_port"
                _guard_test_port=$((_guard_test_port + 1))
            done
            ;;
        *) return 1 ;;
    esac
}}
guard_game_safe_udp_destination_ports > "$2"
_guard_test_count=$(awk 'END {{ print NR + 0 }}' "$2")
if [ -f "$3" ]; then
    _guard_test_reads=$(awk 'END {{ print NR + 0 }}' "$3")
else
    _guard_test_reads=0
fi
printf 'destination_count=%s\\nprotected_list_reads=%s\\n' \\
    "$_guard_test_count" "$_guard_test_reads"
'''
            result = subprocess.run(
                ["/bin/sh", "-c", script, "sh", str(policy), str(filtered), str(reads)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
                env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "JSON_FORCE_AWK": "1"},
            )

        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("destination_count=353", result.stdout)
        self.assertIn("protected_list_reads=0", result.stdout)


if __name__ == "__main__":
    unittest.main()
