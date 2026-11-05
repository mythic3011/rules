from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JSON = ROOT / "shell" / "lib" / "json.sh"
POLICY_SOURCE = ROOT / "shell" / "apps" / "openclash-guard" / "policy.sh"
MAIN = ROOT / "shell" / "apps" / "openclash-guard" / "main.sh"
KILLSWITCH = ROOT / "shell" / "apps" / "openclash-guard" / "killswitch.sh"
POLICY_FIXTURE = ROOT / "tests" / "fixtures" / "synthetic" / "openclash-guard" / "policy.json"


class OpenClashGuardProtectedPortsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.base = json.loads(POLICY_FIXTURE.read_text(encoding="utf-8"))

    def _write_policy(self, path: Path, document: dict) -> None:
        path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

    def _run_shell(self, body: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", "-c", body, "sh", *args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
            env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "JSON_FORCE_AWK": "1"},
        )

    def _reader_script(self) -> str:
        return f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
_guard_policy_protected_udp_ports_from_file "$1"
'''

    def _validator_script(self) -> str:
        return f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
_GUARD_POLICY_PROTECTED_UDP_PORTS=preserve-this-snapshot
_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID=1
if guard_policy_validate_file "$1"; then
    printf 'result=valid\\n'
else
    printf 'result=invalid\\n'
fi
printf 'snapshot_valid=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID"
printf 'snapshot=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
'''

    def test_reader_rejects_wrong_shapes_types_bounds_duplicates_and_missing_443(self) -> None:
        invalid_values: list[tuple[str, object]] = [
            ("null", None),
            ("scalar", 443),
            ("object", {"port": 443}),
            ("numeric-key object", {"0": 443}),
            ("empty array", []),
            ("string item", ["443"]),
            ("boolean item", [443, True]),
            ("fractional item", [443, 50000.5]),
            ("below range", [0, 443]),
            ("above range", [443, 65536]),
            ("duplicate numeric value", [443, 443.0]),
            ("missing required port", [50000]),
        ]
        with tempfile.TemporaryDirectory(prefix="guard-protected-schema-") as temp:
            for name, value in invalid_values:
                with self.subTest(case=name):
                    document = json.loads(json.dumps(self.base))
                    document["gaming"]["protectedUdpPorts"] = value
                    path = Path(temp) / f"{name.replace(' ', '-')}.json"
                    self._write_policy(path, document)
                    result = self._run_shell(self._reader_script(), str(path))
                    self.assertNotEqual(result.returncode, 0)

    def test_typed_reader_rejects_duplicate_ancestors_and_escaped_ambiguity(self) -> None:
        documents = (
            '{"gaming":{"protectedUdpPorts":[443]},"gaming":{}}',
            '{"gaming":{"protectedUdpPorts":[443],"protectedUdpPorts":[]}}',
            r'{"gaming":{"protectedUdpPorts":[443]},"gam\u0069ng":{}}',
            r'{"gaming":{"protectedUdpPorts":[443],"protectedUdp\u0050orts":[]}}',
        )
        with tempfile.TemporaryDirectory(prefix="guard-protected-ambiguous-") as temp:
            for index, document in enumerate(documents):
                with self.subTest(document=document):
                    path = Path(temp) / f"duplicate-{index}.json"
                    path.write_text(document, encoding="utf-8")
                    result = self._run_shell(self._reader_script(), str(path))
                    self.assertNotEqual(result.returncode, 0)

    def test_candidate_validation_is_pure_and_rejects_invalid_ports(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-candidate-") as temp:
            path = Path(temp) / "policy.json"
            document = json.loads(json.dumps(self.base))
            document["gaming"]["protectedUdpPorts"] = [50000]
            self._write_policy(path, document)
            result = self._run_shell(self._validator_script(), str(path))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("result=invalid", result.stdout)
        self.assertIn("snapshot_valid=1", result.stdout)
        self.assertIn("snapshot=preserve-this-snapshot", result.stdout)

    def test_load_normalizes_integer_decimals_and_exponents(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-integral-") as temp:
            path = Path(temp) / "policy.json"
            raw = json.dumps(self.base, separators=(",", ":"))
            raw = raw.replace(
                '"protectedUdpPorts":[443]',
                '"protectedUdpPorts":[4.43e2,5e4]',
            )
            path.write_text(raw, encoding="utf-8")
            script = f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
guard_policy_load "$1"
printf 'valid=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID"
printf 'snapshot=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
'''
            result = self._run_shell(script, str(path))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("valid=1", result.stdout)
        self.assertIn("snapshot=443\n50000", result.stdout)

    def test_failed_second_load_clears_previous_snapshot(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-reload-") as temp:
            valid_path = Path(temp) / "valid.json"
            invalid_path = Path(temp) / "invalid.json"
            valid = json.loads(json.dumps(self.base))
            valid["gaming"]["protectedUdpPorts"] = [443, 50000]
            self._write_policy(valid_path, valid)
            invalid = json.loads(json.dumps(self.base))
            invalid["gaming"]["protectedUdpPorts"] = [50000]
            self._write_policy(invalid_path, invalid)
            script = f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
guard_policy_load "$1"
printf 'first_valid=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID"
printf 'first_snapshot=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
if guard_policy_load "$2"; then
    printf 'second_load=accepted\\n'
else
    printf 'second_load=rejected\\n'
fi
printf 'second_valid=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID"
printf 'second_snapshot=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
if guard_policy_protected_udp_ports; then
    printf 'stale_accessor=accepted\\n'
else
    printf 'stale_accessor=rejected\\n'
fi
'''
            result = self._run_shell(script, str(valid_path), str(invalid_path))

        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("first_valid=1", result.stdout)
        self.assertIn("first_snapshot=443\n50000", result.stdout)
        self.assertIn("second_load=rejected", result.stdout)
        self.assertIn("second_valid=0", result.stdout)
        self.assertIn("second_snapshot=", result.stdout)
        self.assertIn("stale_accessor=rejected", result.stdout)

    def test_killswitch_consumes_the_same_loaded_port_snapshot(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-killswitch-") as temp:
            path = Path(temp) / "policy.json"
            reads = Path(temp) / "protected-list-reads.txt"
            batch = Path(temp) / "batch.nft"
            document = json.loads(json.dumps(self.base))
            document["gaming"]["protectedUdpPorts"] = [443, 50000]
            self._write_policy(path, document)
            script = f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
. "{KILLSWITCH}"
guard_policy_load "$1"
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=openclash-guard
_GUARD_NFT_TABLE_EXISTS=0
_GUARD_UCI_DNS_KILL_SWITCH=0
_GUARD_TEST_READS="$2"
_guard_kill_render_resolver_sync_sets() {{ return 0; }}
_guard_kill_render_resolver_sync_cache() {{ return 0; }}
_guard_kill_render_resolver_sync_rules() {{ return 0; }}
json_list() {{
    if [ "${{2:-}}" = gaming.protectedUdpPorts ]; then
        printf 'unexpected-read\\n' >> "$_GUARD_TEST_READS"
    fi
    return 1
}}
guard_kill_render > "$3"
if [ -f "$_GUARD_TEST_READS" ]; then
    _guard_test_reads=$(awk 'END {{ print NR + 0 }}' "$_GUARD_TEST_READS")
else
    _guard_test_reads=0
fi
printf 'protected_list_reads=%s\\n' "$_guard_test_reads"
'''
            result = self._run_shell(script, str(path), str(reads), str(batch))
            batch_text = batch.read_text(encoding="utf-8") if batch.exists() else ""

        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("protected_list_reads=0", result.stdout)
        self.assertIn(
            "add element inet openclash_guard protected_udp { 443, 50000 }",
            batch_text,
        )

    def test_same_path_reload_refreshes_snapshot_for_watch_iterations(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-watch-reload-") as temp:
            path = Path(temp) / "policy.json"
            updated_path = Path(temp) / "updated-policy.json"
            first = json.loads(json.dumps(self.base))
            first["gaming"]["protectedUdpPorts"] = [443, 50000]
            self._write_policy(path, first)
            second = json.loads(json.dumps(self.base))
            second["gaming"]["protectedUdpPorts"] = [443]
            second["nft"]["table"] = "openclash_guard_next"
            self._write_policy(updated_path, second)
            script = f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
guard_policy_load "$1"
printf 'first=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
printf 'first_table=%s\\n' "$_GUARD_NFT_TABLE"
cp "$2" "$1"
guard_policy_load "$1"
printf 'second=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
printf 'second_table=%s\\n' "$_GUARD_NFT_TABLE"
'''
            result = self._run_shell(script, str(path), str(updated_path))

        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("first=443\n50000", result.stdout)
        self.assertIn("first_table=openclash_guard", result.stdout)
        self.assertIn("second=443", result.stdout)
        self.assertNotIn("second=443\n50000", result.stdout)
        self.assertIn("second_table=openclash_guard_next", result.stdout)

    def test_batch_writer_propagates_render_failure_and_cleans_partial_batch(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-writer-") as temp:
            batch = Path(temp) / "batch.nft"
            events = Path(temp) / "events.log"
            script = f'''
set -eu
set -- --help
. "{MAIN}" >/dev/null
_GUARD_PREFLIGHT_COMPLETE=1
_GUARD_NFT_AVAILABLE=1
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_UCI_ENABLED=1
_GUARD_POLICY_ENFORCEMENT=reject
_GUARD_TEST_BATCH="{batch}"
_GUARD_TEST_EVENTS="{events}"
_guard_require_setup_for_apply() {{ return 0; }}
_guard_require_atomic_overlay_for_apply() {{ return 0; }}
_guard_prepare() {{
    _GUARD_POLICY_PROTECTED_UDP_PORTS=443
    _GUARD_POLICY_PROTECTED_UDP_PORTS_VALID=1
}}
guard_migrate_stale() {{ printf 'migrate\\n' >> "$_GUARD_TEST_EVENTS"; }}
nft_table_exists() {{ printf 'probe\\n' >> "$_GUARD_TEST_EVENTS"; return 1; }}
file_mktemp() {{ : > "$_GUARD_TEST_BATCH"; printf '%s\\n' "$_GUARD_TEST_BATCH"; }}
guard_kill_render() {{ printf 'base\\n'; }}
guard_game_render() {{ printf 'partial\\n'; printf 'game\\n' >> "$_GUARD_TEST_EVENTS"; return 37; }}
guard_kill_render_final() {{ printf 'final\\n' >> "$_GUARD_TEST_EVENTS"; }}
guard_kill_apply_batch() {{ printf 'apply\\n' >> "$_GUARD_TEST_EVENTS"; return 0; }}
if guard_cmd_reconcile; then
    printf 'reconcile=accepted\\n'
else
    printf 'reconcile=rejected:%s\\n' "$?"
fi
if [ -e "$_GUARD_TEST_BATCH" ]; then printf 'batch_exists=1\\n'; else printf 'batch_exists=0\\n'; fi
'''
            result = self._run_shell(script)
            event_text = events.read_text(encoding="utf-8") if events.exists() else ""

        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("reconcile=rejected:37", result.stdout)
        self.assertIn("batch_exists=0", result.stdout)
        self.assertIn("migrate", event_text)
        self.assertIn("probe", event_text)
        self.assertIn("game", event_text)
        self.assertNotIn("final", event_text)
        self.assertNotIn("apply", event_text)


if __name__ == "__main__":
    unittest.main()
