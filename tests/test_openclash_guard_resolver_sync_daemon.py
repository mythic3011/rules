from __future__ import annotations

import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIB_FILE = ROOT / "shell" / "lib" / "file.sh"
LIB_JSON = ROOT / "shell" / "lib" / "json.sh"
LIB_NFT = ROOT / "shell" / "lib" / "nft.sh"
DATA = ROOT / "internal" / "generated" / "ai-routing" / "openclash-guard-resolver-sync-data.sh"
RESOLVER = ROOT / "shell" / "apps" / "openclash-guard" / "resolver-sync.sh"
SOURCE_REVISION = "d07cac190c33e7914ba7adaf7e7c14298fba7024"

FAKE_CURL = r'''#!/usr/bin/env python3
import os
import shutil
import sys
from pathlib import Path

args = sys.argv[1:]
out = None
for index, value in enumerate(args[:-1]):
    if value == "-o":
        out = args[index + 1]
        break
if not out:
    sys.exit(2)
url = args[-1]
fixtures = Path(os.environ["RESOLVER_SYNC_FIXTURES"])
if url.endswith("/control/querylog/config"):
    source = fixtures / "config.json"
elif "/control/querylog?" in url:
    source = fixtures / "querylog.json"
else:
    sys.exit(3)
shutil.copyfile(source, out)
'''

FAKE_JSONFILTER = r'''#!/usr/bin/env python3
import json
import sys

args = sys.argv[1:]
source = None
if "-i" in args:
    with open(args[args.index("-i") + 1], encoding="utf-8") as handle:
        source = json.load(handle)
elif "-s" in args:
    source = json.loads(args[args.index("-s") + 1])
else:
    sys.exit(2)
expr = args[args.index("-t") + 1] if "-t" in args else args[args.index("-e") + 1]
if expr == "@.data" and "-t" in args:
    print("array" if isinstance(source.get("data"), list) else type(source.get("data")).__name__)
    sys.exit(0)
if expr == "@.data[*]":
    for item in source.get("data", []):
        print(json.dumps(item, separators=(",", ":")))
    sys.exit(0)
if expr == "@.answer[*]":
    for item in source.get("answer", []):
        print(json.dumps(item, separators=(",", ":")))
    sys.exit(0)
if not expr.startswith("@."):
    sys.exit(3)
node = source
for part in expr[2:].split("."):
    if not isinstance(node, dict) or part not in node:
        sys.exit(1)
    node = node[part]
if isinstance(node, bool):
    print("true" if node else "false")
elif isinstance(node, (dict, list)):
    print(json.dumps(node, separators=(",", ":")))
else:
    print(node)
'''

FAKE_NFT = r'''#!/usr/bin/env python3
import os
import sys
from pathlib import Path

args = sys.argv[1:]
if args[:2] == ["list", "set"] and len(args) == 5:
    _, _, family, table, name = args
    if (family, table) != ("inet", "openclash_guard"):
        sys.exit(1)
    if name == "resolver_sync_v4":
        typ = "ipv4_addr"
        comment = "openclash-guard:resolver-sync-v4-set"
    elif name == "resolver_sync_v6":
        typ = "ipv6_addr"
        comment = "openclash-guard:resolver-sync-v6-set"
    else:
        sys.exit(1)
    print(f"table inet openclash_guard {{\n set {name} {{\n  type {typ}\n  flags timeout\n  comment \"{comment}\"\n }}\n}}")
    sys.exit(0)
if args[:3] == ["-a", "list", "chain"] and len(args) == 6:
    print('table inet openclash_guard {')
    print(' chain forward {')
    print('  oifname "wan" ip daddr @resolver_sync_v4 reject comment "openclash-guard:resolver-sync-v4" # handle 10')
    print('  oifname "wan" ip6 daddr @resolver_sync_v6 reject comment "openclash-guard:resolver-sync-v6" # handle 11')
    print(' }')
    print('}')
    sys.exit(0)
if len(args) == 2 and args[0] == "-f":
    batch = Path(args[1]).read_text(encoding="utf-8")
    log = Path(os.environ["RESOLVER_SYNC_NFT_BATCH_LOG"])
    with log.open("a", encoding="utf-8") as handle:
        handle.write("--- batch ---\n")
        handle.write(batch)
    if os.environ.get("RESOLVER_SYNC_NFT_APPLY_FAIL") == "1":
        sys.exit(1)
    sys.exit(0)
sys.exit(1)
'''


def entry(name: str, answers: list[dict[str, object]], *, client: str = "10.0.0.2") -> dict[str, object]:
    return {
        "question": {"name": name, "type": "A"},
        "answer": answers,
        "client": client,
        "time": "2026-09-22T00:00:00Z",
    }


class ResolverSyncDaemonTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.work = Path(self.tmp.name)
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.fixtures = self.work / "fixtures"
        self.fixtures.mkdir()
        self.state = self.work / "resolver-sync.json"
        self.cache = self.work / "resolver-sync.cache"
        self.cursor = self.work / "resolver-sync.cursor"
        self.batch_log = self.work / "nft-batches.log"
        for name, body in (("curl", FAKE_CURL), ("jsonfilter", FAKE_JSONFILTER), ("nft", FAKE_NFT)):
            path = self.bin / name
            path.write_text(body, encoding="utf-8")
            path.chmod(path.stat().st_mode | stat.S_IXUSR)
        self.write_config(True)
        self.write_querylog([])

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write_config(self, enabled: bool) -> None:
        (self.fixtures / "config.json").write_text(
            json.dumps({"enabled": enabled, "interval": 90}) + "\n", encoding="utf-8"
        )

    def write_querylog(self, entries: list[dict[str, object]]) -> None:
        (self.fixtures / "querylog.json").write_text(
            json.dumps({"data": entries, "oldest": ""}) + "\n", encoding="utf-8"
        )

    def write_state(self, revision: str = SOURCE_REVISION, *, status: str = "ready") -> None:
        self.state.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "helper": "openclash-guard-resolver-sync",
                    "backend": "adguardhome-resolver-sync",
                    "status": status,
                    "pid": os.getpid(),
                    "updatedAtEpoch": 1_000,
                    "reason": "ok",
                    "sourceRevision": revision,
                    "nft": {
                        "family": "inet",
                        "table": "openclash_guard",
                        "chain": "forward",
                        "ipv4Set": "resolver_sync_v4",
                        "ipv6Set": "resolver_sync_v6",
                        "directInterface": "wan",
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )

    def env(self, now: int, *, fail_nft: bool = False) -> dict[str, str]:
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{self.bin}{os.pathsep}{env.get('PATH', '')}",
                "RESOLVER_SYNC_FIXTURES": str(self.fixtures),
                "RESOLVER_SYNC_NFT_BATCH_LOG": str(self.batch_log),
                "GUARD_RESOLVER_SYNC_STATE_FILE": str(self.state),
                "GUARD_RESOLVER_SYNC_CACHE_FILE": str(self.cache),
                "GUARD_RESOLVER_SYNC_CURSOR_FILE": str(self.cursor),
                "GUARD_RESOLVER_SYNC_NOW_EPOCH": str(now),
                "GUARD_DIRECT_WAN_IFACE": "wan",
                "GUARD_AGH_API_BASE": "http://127.0.0.1:3000",
            }
        )
        if fail_nft:
            env["RESOLVER_SYNC_NFT_APPLY_FAIL"] = "1"
        return env

    def run_cycle(self, now: int, *, fail_nft: bool = False) -> subprocess.CompletedProcess[str]:
        script = "\n".join(
            [
                "set -eu",
                f'. "{LIB_FILE}"',
                f'. "{LIB_JSON}"',
                f'. "{LIB_NFT}"',
                f'. "{DATA}"',
                f'. "{RESOLVER}"',
                "guard_dns_backend() { printf '%s\\n' adguardhome; }",
                "guard_resolver_sync_cycle",
            ]
        )
        return subprocess.run(
            ["/bin/sh", "-c", script],
            text=True,
            capture_output=True,
            env=self.env(now, fail_nft=fail_nft),
            check=False,
        )

    def run_stop(self, now: int = 1_030) -> subprocess.CompletedProcess[str]:
        script = "\n".join(
            [
                "set -eu",
                f'. "{LIB_FILE}"',
                f'. "{LIB_JSON}"',
                f'. "{DATA}"',
                f'. "{RESOLVER}"',
                "guard_resolver_sync_stop",
            ]
        )
        return subprocess.run(
            ["/bin/sh", "-c", script],
            text=True,
            capture_output=True,
            env=self.env(now),
            check=False,
        )

    def state_json(self) -> dict[str, object]:
        return json.loads(self.state.read_text(encoding="utf-8"))

    def test_first_poll_is_warming_and_does_not_replay_log_history(self) -> None:
        self.write_querylog(
            [entry("chatgpt.com", [{"type": "A", "value": "203.0.113.7", "ttl": 120}])]
        )
        result = self.run_cycle(1_000)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state_json()["status"], "warming")
        self.assertEqual(self.cache.read_text(encoding="utf-8"), "")
        self.assertTrue(self.cursor.read_text(encoding="utf-8").strip().endswith(" 1000"))
        self.assertNotIn("203.0.113.7", self.batch_log.read_text(encoding="utf-8"))

    def test_new_answer_uses_dns_ttl_minus_elapsed_poll_time(self) -> None:
        old = entry("example.invalid", [{"type": "A", "value": "192.0.2.1", "ttl": 60}])
        self.write_querylog([old])
        self.assertEqual(self.run_cycle(1_000).returncode, 0)

        fresh = entry("api.openai.com", [{"type": "A", "value": "203.0.113.7", "ttl": 120}])
        self.write_querylog([fresh, old])
        result = self.run_cycle(1_030)
        self.assertEqual(result.returncode, 0, result.stderr)
        state = self.state_json()
        self.assertEqual(state["status"], "ready")
        self.assertEqual(state["reason"], "ok")
        self.assertIn("4 203.0.113.7 1120", self.cache.read_text(encoding="utf-8"))
        batches = self.batch_log.read_text(encoding="utf-8")
        self.assertIn("203.0.113.7 timeout 90s", batches)

    def test_ipv4_family_mismatch_is_ignored_while_valid_ipv6_is_kept(self) -> None:
        old = entry("example.invalid", [])
        self.write_querylog([old])
        self.assertEqual(self.run_cycle(2_000).returncode, 0)
        fresh = entry(
            "claude.ai",
            [
                {"type": "A", "value": "2001:db8::1", "ttl": 90},
                {"type": "AAAA", "value": "2001:db8::1", "ttl": 90},
            ],
        )
        self.write_querylog([fresh, old])
        result = self.run_cycle(2_030)
        self.assertEqual(result.returncode, 0, result.stderr)
        cache = self.cache.read_text(encoding="utf-8")
        self.assertNotIn("4 2001:db8::1", cache)
        self.assertIn("6 2001:db8::1 2090", cache)

    def test_querylog_disabled_never_becomes_ready(self) -> None:
        self.write_config(False)
        result = self.run_cycle(3_000)
        self.assertNotEqual(result.returncode, 0)
        state = self.state_json()
        self.assertEqual(state["status"], "degraded")
        self.assertEqual(state["reason"], "querylog-disabled-or-unavailable")
        self.assertFalse(self.cursor.exists())

    def test_malformed_querylog_does_not_advance_cursor_or_cache(self) -> None:
        old = entry("example.invalid", [])
        self.write_querylog([old])
        self.assertEqual(self.run_cycle(3_500).returncode, 0)
        cursor_before = self.cursor.read_text(encoding="utf-8")
        cache_before = self.cache.read_text(encoding="utf-8")
        (self.fixtures / "querylog.json").write_text(
            json.dumps({"data": {"not": "an-array"}}) + "\n",
            encoding="utf-8",
        )

        result = self.run_cycle(3_530)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.cursor.read_text(encoding="utf-8"), cursor_before)
        self.assertEqual(self.cache.read_text(encoding="utf-8"), cache_before)
        state = self.state_json()
        self.assertEqual(state["status"], "degraded")
        self.assertEqual(state["reason"], "querylog-unavailable")

    def test_nft_failure_does_not_advance_cursor_or_publish_cache(self) -> None:
        old = entry("example.invalid", [])
        self.write_querylog([old])
        self.assertEqual(self.run_cycle(4_000).returncode, 0)
        cursor_before = self.cursor.read_text(encoding="utf-8")
        cache_before = self.cache.read_text(encoding="utf-8")

        fresh = entry("poe.com", [{"type": "A", "value": "198.51.100.8", "ttl": 120}])
        self.write_querylog([fresh, old])
        result = self.run_cycle(4_030, fail_nft=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.cursor.read_text(encoding="utf-8"), cursor_before)
        self.assertEqual(self.cache.read_text(encoding="utf-8"), cache_before)
        self.assertEqual(self.state_json()["reason"], "nft-update-failed")

    def test_querylog_restart_or_rotation_returns_to_warming_baseline(self) -> None:
        old = entry("example.invalid", [])
        self.write_querylog([old])
        self.assertEqual(self.run_cycle(5_000).returncode, 0)
        replacement = entry("chatgpt.com", [{"type": "A", "value": "203.0.113.9", "ttl": 120}])
        self.write_querylog([replacement])
        result = self.run_cycle(5_030)
        self.assertEqual(result.returncode, 0, result.stderr)
        state = self.state_json()
        self.assertEqual(state["status"], "warming")
        self.assertEqual(state["reason"], "cursor-baseline")
        self.assertNotIn("203.0.113.9", self.cache.read_text(encoding="utf-8"))

    def test_stop_preserves_current_revision_as_degraded_provenance(self) -> None:
        self.write_state()
        self.cache.write_text("4 203.0.113.7 1090\n", encoding="utf-8")
        result = self.run_stop()
        self.assertEqual(result.returncode, 0, result.stderr)
        state = self.state_json()
        self.assertEqual(state["status"], "degraded")
        self.assertEqual(state["reason"], "stopped")
        self.assertEqual(state["sourceRevision"], SOURCE_REVISION)
        self.assertEqual(self.cache.read_text(encoding="utf-8"), "4 203.0.113.7 1090\n")

    def test_stop_discards_state_from_different_selector_revision(self) -> None:
        self.write_state("0" * 40)
        result = self.run_stop()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.state.exists())


if __name__ == "__main__":
    unittest.main()
