from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POLICY_SOURCE = ROOT / "shell" / "apps" / "openclash-guard" / "policy.sh"
GAMING = ROOT / "shell" / "apps" / "openclash-guard" / "gaming.sh"
KILLSWITCH = ROOT / "shell" / "apps" / "openclash-guard" / "killswitch.sh"
MAIN = ROOT / "shell" / "apps" / "openclash-guard" / "main.sh"
JSON = ROOT / "shell" / "lib" / "json.sh"
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
        )

    def _validator_script(self) -> str:
        return f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
_GUARD_POLICY_PROTECTED_UDP_PORTS=stale-snapshot
_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID=1
if guard_policy_validate_file "$1"; then
    printf 'result=valid\\n'
else
    printf 'result=invalid\\n'
fi
printf 'snapshot_valid=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID"
printf 'snapshot=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
'''

    def _run_port_reader(self, path: Path) -> subprocess.CompletedProcess[str]:
        script = f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
_guard_policy_protected_udp_ports_from_file "$1"
'''
        return self._run_shell(script, str(path))

    def test_protected_port_reader_rejects_invalid_shapes_and_bounds(self) -> None:
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
            ("missing required 443", [50000]),
        ]

        with tempfile.TemporaryDirectory(prefix="guard-protected-schema-") as temp:
            for name, value in invalid_values:
                with self.subTest(case=name):
                    document = json.loads(json.dumps(self.base))
                    document["gaming"]["protectedUdpPorts"] = value
                    path = Path(temp) / f"{name.replace(' ', '-')}.json"
                    self._write_policy(path, document)

                    result = self._run_port_reader(path)
                    self.assertNotEqual(result.returncode, 0)

    def test_file_validator_rejects_missing_protected_ports_without_mutating_snapshot(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-missing-") as temp:
            path = Path(temp) / "policy.json"
            document = json.loads(json.dumps(self.base))
            document["gaming"].pop("protectedUdpPorts")
            self._write_policy(path, document)
            result = self._run_shell(self._validator_script(), str(path))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("result=invalid", result.stdout)
        self.assertIn("snapshot_valid=1", result.stdout)
        self.assertIn("snapshot=stale-snapshot", result.stdout)

    def test_port_reader_rejects_dotted_key_spoof(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-dotted-key-") as temp:
            path = Path(temp) / "policy.json"
            document = json.loads(json.dumps(self.base))
            document["gaming"].pop("protectedUdpPorts")
            document["gaming.protectedUdpPorts"] = [443]
            self._write_policy(path, document)
            result = self._run_port_reader(path)

        self.assertNotEqual(result.returncode, 0)

    def test_candidate_validation_is_pure_and_loader_normalizes_integer_numbers(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-integral-") as temp:
            path = Path(temp) / "policy.json"
            raw = json.dumps(self.base, separators=(",", ":"))
            raw = raw.replace(
                '"protectedUdpPorts":[443]',
                '"protectedUdpPorts":[4.43e2,5e4]',
            )
            path.write_text(raw, encoding="utf-8")

            validated = self._run_shell(self._validator_script(), str(path))
            self.assertEqual(validated.returncode, 0, validated.stderr)
            self.assertIn("result=valid", validated.stdout)
            self.assertIn("snapshot_valid=1", validated.stdout)
            self.assertIn("snapshot=stale-snapshot", validated.stdout)

            script = f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
guard_policy_load "$1"
printf 'valid=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID"
printf 'snapshot=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
'''
            loaded = self._run_shell(script, str(path))

        self.assertEqual(loaded.returncode, 0, loaded.stderr)
        self.assertIn("valid=1", loaded.stdout)
        self.assertIn("snapshot=443\n50000", loaded.stdout)

    def test_failed_second_load_clears_previous_snapshot(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-reload-snapshot-") as temp:
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
'''
            result = self._run_shell(script, str(valid_path), str(invalid_path))

        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("first_valid=1", result.stdout)
        self.assertIn("first_snapshot=443\n50000", result.stdout)
        self.assertIn("second_load=rejected", result.stdout)
        self.assertIn("second_valid=0", result.stdout)
        self.assertIn("second_snapshot=", result.stdout)

    def test_batch_writer_propagates_render_failure_and_reconcile_cleans_partial_batch(self) -> None:
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
_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID=1
_GUARD_POLICY_ENFORCEMENT=reject
_GUARD_TEST_BATCH="{batch}"
_GUARD_TEST_EVENTS="{events}"
_guard_require_setup_for_apply() {{ return 0; }}
_guard_prepare() {{ return 0; }}
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

    def test_later_snapshot_read_error_aborts_before_migration_or_apply_in_both_modes(self) -> None:
        with tempfile.TemporaryDirectory(prefix="guard-protected-reload-") as temp:
            path = Path(temp) / "policy.json"
            event_log = Path(temp) / "events.log"
            self._write_policy(path, self.base)
            for mode in ("reject", "allow-proxy"):
                with self.subTest(mode=mode):
                    event_log.write_text("", encoding="utf-8")
                    script = f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
_GUARD_REVIEW_POLICY="$1"
_GUARD_REVIEW_EVENTS="$2"
guard_policy_validate_file "$_GUARD_REVIEW_POLICY"
json_array_items_typed() {{ return 1; }}
set -- --help
. "{MAIN}" >/dev/null
set --
_GUARD_PREFLIGHT_COMPLETE=1
_GUARD_NFT_AVAILABLE=1
_GUARD_UCI_ENABLED=1
_GUARD_POLICY_ENFORCEMENT={mode}
GUARD_POLICY_FILE=$_GUARD_REVIEW_POLICY
_guard_require_setup_for_apply() {{ return 0; }}
_guard_prepare() {{ guard_policy_load "$GUARD_POLICY_FILE"; }}
guard_migrate_stale() {{ printf 'migrate\\n' >> "$_GUARD_REVIEW_EVENTS"; }}
nft_table_exists() {{ printf 'nft-probe\\n' >> "$_GUARD_REVIEW_EVENTS"; return 0; }}
file_mktemp() {{ printf 'mktemp\\n' >> "$_GUARD_REVIEW_EVENTS"; return 1; }}
guard_kill_apply_batch() {{ printf 'apply\\n' >> "$_GUARD_REVIEW_EVENTS"; return 0; }}
if guard_cmd_reconcile; then
    printf 'reconcile=accepted\\n'
else
    printf 'reconcile=rejected\\n'
fi
printf 'valid=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS_VALID"
printf 'snapshot=%s\\n' "$_GUARD_POLICY_PROTECTED_UDP_PORTS"
'''
                    result = self._run_shell(script, str(path), str(event_log))

                    self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                    self.assertIn("reconcile=rejected", result.stdout)
                    self.assertIn("valid=0", result.stdout)
                    self.assertEqual(event_log.read_text(encoding="utf-8"), "")

    def test_gaming_and_killswitch_consume_the_same_loaded_snapshot(self) -> None:
        first = json.loads(json.dumps(self.base))
        first["gaming"]["protectedUdpPorts"] = [443, 50000]
        first["gaming"]["udpDestinationPorts"] = [50000, 27015]
        second = json.loads(json.dumps(first))
        second["gaming"]["protectedUdpPorts"] = [443]

        with tempfile.TemporaryDirectory(prefix="guard-protected-snapshot-") as temp:
            first_path = Path(temp) / "first.json"
            second_path = Path(temp) / "second.json"
            batch = Path(temp) / "batch.nft"
            self._write_policy(first_path, first)
            self._write_policy(second_path, second)
            script = f'''
set -eu
. "{JSON}"
. "{POLICY_SOURCE}"
. "{KILLSWITCH}"
. "{GAMING}"
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=openclash-guard
_GUARD_NFT_TABLE_EXISTS=0
_GUARD_UCI_DNS_KILL_SWITCH=0
guard_policy_load "$1"
_GUARD_POLICY_FILE="$2"
_guard_safe=$(guard_game_safe_udp_destination_ports)
guard_kill_render > "$3"
printf 'safe=%s\\n' "$_guard_safe"
'''
            result = self._run_shell(script, str(first_path), str(second_path), str(batch))
            batch_text = batch.read_text(encoding="utf-8") if batch.exists() else ""

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("safe=27015", result.stdout)
        self.assertIn(
            "add element inet openclash_guard protected_udp { 443, 50000 }",
            batch_text,
        )


if __name__ == "__main__":
    unittest.main()
