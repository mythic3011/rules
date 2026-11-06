from __future__ import annotations

import json
import os
import signal
import stat
import subprocess
import tempfile
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIB_FILE = ROOT / "shell" / "lib" / "file.sh"
LIB_JSON = ROOT / "shell" / "lib" / "json.sh"
DATA = ROOT / "internal" / "generated" / "ai-routing" / "openclash-guard-resolver-sync-data.sh"
RESOLVER = ROOT / "shell" / "apps" / "openclash-guard" / "resolver-sync.sh"
PROBE = ROOT / "shell" / "apps" / "openclash-guard" / "resolver-probe.sh"

SCRIPT = "\n".join(
    [
        "set -eu",
        f'. "{LIB_FILE}"',
        f'. "{LIB_JSON}"',
        f'. "{DATA}"',
        f'. "{RESOLVER}"',
        f'. "{PROBE}"',
        'guard_resolver_probe_run "$@"',
    ]
)

FAKE_CURL = r'''#!/usr/bin/env python3
import os
import shutil
import sys
from pathlib import Path

args = sys.argv[1:]
if not args or args[0] != "--disable":
    sys.exit(10)
url = args[-1]
if not url.startswith("http://127.0.0.1:") or "/dns/query?name=" not in url:
    sys.exit(11)
if "/control/querylog" in url:
    sys.exit(12)
out = None
auth = None
for index, value in enumerate(args[:-1]):
    if value == "-o":
        out = Path(args[index + 1])
    if value == "--config":
        auth = Path(args[index + 1])
if out is None:
    sys.exit(13)
if auth is not None:
    if os.environ.get("RESOLVER_PROBE_EXPECT_AUTH") != "1":
        sys.exit(14)
    if "Authorization: Bearer test-private-token" not in auth.read_text(encoding="utf-8"):
        sys.exit(15)
log = Path(os.environ["RESOLVER_PROBE_REQUESTS"])
with log.open("a", encoding="utf-8") as handle:
    handle.write(url + "\n")
if os.environ.get("RESOLVER_PROBE_FAIL") == "1":
    sys.exit(16)
if os.environ.get("RESOLVER_PROBE_BLOCK") == "1":
    Path(os.environ["RESOLVER_PROBE_STARTED"]).touch()
    import time
    time.sleep(30)
fixture = Path(os.environ["RESOLVER_PROBE_RESPONSE"])
shutil.copyfile(fixture, out)
'''

FAKE_JSONFILTER = r'''#!/usr/bin/env python3
import json
import sys

args = sys.argv[1:]
if "-i" in args:
    with open(args[args.index("-i") + 1], encoding="utf-8") as handle:
        source = json.load(handle)
elif "-s" in args:
    source = json.loads(args[args.index("-s") + 1])
else:
    sys.exit(2)
typed = "-t" in args
expr = args[args.index("-t") + 1] if typed else args[args.index("-e") + 1]
if expr.endswith("[*]"):
    key = expr[2:-3]
    node = source.get(key)
    if not isinstance(node, list) or not node:
        sys.exit(1)
    for item in node:
        print(json.dumps(item, separators=(",", ":")))
    sys.exit(0)
if not expr.startswith("@."):
    sys.exit(3)
node = source
for part in expr[2:].split("."):
    if not isinstance(node, dict) or part not in node:
        sys.exit(1)
    node = node[part]
if typed:
    if isinstance(node, list):
        print("array")
    elif isinstance(node, dict):
        print("object")
    elif node is None:
        print("null")
    elif isinstance(node, bool):
        print("boolean")
    elif isinstance(node, (int, float)):
        print("number")
    else:
        print("string")
elif isinstance(node, bool):
    print("true" if node else "false")
elif isinstance(node, (dict, list)):
    print(json.dumps(node, separators=(",", ":")))
else:
    print(node)
'''

FAKE_NFT = r'''#!/bin/sh
printf '%s\n' called >> "$RESOLVER_PROBE_NFT_LOG"
exit 1
'''

FAKE_MV = r'''#!/usr/bin/env python3
import os
import sys
from pathlib import Path

args = [arg for arg in sys.argv[1:] if arg not in ("-f", "-T")]
raw_args = sys.argv[1:]
if len(args) != 2:
    sys.exit(2)
source = Path(args[0])
destination = Path(args[1])
is_snapshot = destination.name == "resolver-probe.json"
if is_snapshot and "-T" not in raw_args:
    sys.exit(3)
if is_snapshot and os.environ.get("RESOLVER_PROBE_DEST_DIR_RACE") == "1" and not destination.exists():
    destination.mkdir()
if "-T" in raw_args and destination.is_dir():
    sys.exit(4)
if destination.is_dir():
    destination = destination / source.name
os.replace(source, destination)
'''


def response(
    name: str = "chatgpt.com.",
    qtype: int = 1,
    answers: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    document: dict[str, object] = {
        "Status": 0,
        "Question": [{"Name": name, "Qtype": qtype, "Qclass": 1}],
        "TC": False,
        "RD": True,
        "RA": True,
    }
    if answers is not None:
        document["Answer"] = answers
    return document


class ResolverProbeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.out = self.root / "runtime" / "resolver-probe.json"
        self.response_file = self.root / "response.json"
        self.requests = self.root / "requests.log"
        self.nft_log = self.root / "nft.log"
        self.requests.touch()
        self.nft_log.touch()
        self.write_response(
            response(
                answers=[{"name": "chatgpt.com.", "type": 1, "TTL": 120, "data": "203.0.113.7"}]
            )
        )
        for name, body in (
            ("curl", FAKE_CURL),
            ("jsonfilter", FAKE_JSONFILTER),
            ("nft", FAKE_NFT),
            ("mv", FAKE_MV),
        ):
            path = self.bin / name
            path.write_text(body, encoding="utf-8")
            path.chmod(path.stat().st_mode | stat.S_IXUSR)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def write_response(self, document: dict[str, object]) -> None:
        self.response_file.write_text(json.dumps(document) + "\n", encoding="utf-8")

    def env(self, **extra: str) -> dict[str, str]:
        result = os.environ.copy()
        result.update(
            {
                "PATH": f"{self.bin}{os.pathsep}{result.get('PATH', '')}",
                "GUARD_RESOLVER_PROBE_FILE": str(self.out),
                "GUARD_RESOLVER_PROBE_NOW_EPOCH": "1000",
                "RESOLVER_PROBE_RESPONSE": str(self.response_file),
                "RESOLVER_PROBE_REQUESTS": str(self.requests),
                "RESOLVER_PROBE_NFT_LOG": str(self.nft_log),
                "TMPDIR": str(self.root),
            }
        )
        result.update(extra)
        return result

    def run_probe(self, *args: str, **extra: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", "-c", SCRIPT, "resolver-probe", *args],
            cwd=ROOT,
            env=self.env(**extra),
            text=True,
            capture_output=True,
            check=False,
        )

    def standard_args(self, *targets: str, budget: str = "4") -> tuple[str, ...]:
        return (
            "--api-base",
            "http://127.0.0.1:9090",
            "--max-probes",
            budget,
            *[part for target in targets for part in ("--target", target)],
        )

    def assert_private_workdirs_removed(self) -> None:
        self.assertEqual(list(self.root.glob("**/openclash-guard-probe.*")), [])

    def test_snapshot_is_partial_private_and_never_touches_nft(self) -> None:
        result = self.run_probe(*self.standard_args("chatgpt/chatgpt.com/A"))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        receipt = json.loads(result.stdout)
        self.assertEqual(receipt["status"], "partial")
        self.assertFalse(receipt["enforcementReady"])
        self.assertEqual(receipt["completedProbes"], 1)
        self.assertEqual(receipt["addresses"], 1)
        self.assertNotIn("chatgpt.com", result.stdout)
        self.assertNotIn("203.0.113.7", result.stdout)
        snapshot = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertEqual(snapshot["adapter"], "mihomo-dns-query")
        self.assertEqual(snapshot["status"], "partial")
        self.assertFalse(snapshot["enforcementReady"])
        self.assertFalse(snapshot["coverage"]["fullSelectorCoverage"])
        address = snapshot["targets"][0]["addresses"][0]
        self.assertEqual(address, {"family": 4, "address": "203.0.113.7", "ttl": 120, "expiresAtEpoch": 1120})
        self.assertEqual(self.out.stat().st_mode & 0o777, 0o600)
        self.assertEqual(len(self.requests.read_text(encoding="utf-8").splitlines()), 1)
        self.assertEqual(self.nft_log.read_text(encoding="utf-8"), "")
        self.assert_private_workdirs_removed()

    def test_nodata_is_valid_zero_address_result(self) -> None:
        self.write_response(response(name="chatgpt.com.", qtype=28))
        result = self.run_probe(*self.standard_args("chatgpt/chatgpt.com/AAAA"))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        receipt = json.loads(result.stdout)
        self.assertEqual(receipt["completedProbes"], 1)
        self.assertEqual(receipt["addresses"], 0)
        snapshot = json.loads(self.out.read_text(encoding="utf-8"))
        self.assertEqual(snapshot["targets"][0]["status"], "no-data")
        self.assertEqual(snapshot["targets"][0]["addresses"], [])

    def test_cname_chain_uses_earliest_ttl(self) -> None:
        self.write_response(
            response(
                answers=[
                    {"name": "chatgpt.com.", "type": 5, "TTL": 60, "data": "edge.example.net."},
                    {"name": "edge.example.net.", "type": 1, "TTL": 120, "data": "203.0.113.7"},
                ]
            )
        )
        result = self.run_probe(*self.standard_args("chatgpt/chatgpt.com/A"))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        address = json.loads(self.out.read_text(encoding="utf-8"))["targets"][0]["addresses"][0]
        self.assertEqual(address["ttl"], 60)
        self.assertEqual(address["expiresAtEpoch"], 1060)

    def test_unrelated_answer_owner_is_rejected(self) -> None:
        self.write_response(
            response(
                answers=[{"name": "unrelated.example.net.", "type": 1, "TTL": 120, "data": "203.0.113.7"}]
            )
        )
        result = self.run_probe(*self.standard_args("chatgpt/chatgpt.com/A"))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["reason"], "malformed-response")
        self.assertFalse(self.out.exists())
        self.assert_private_workdirs_removed()

    def test_fake_ip_and_api_failure_preserve_last_good_snapshot(self) -> None:
        args = self.standard_args("chatgpt/chatgpt.com/A")
        first = self.run_probe(*args)
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        before = self.out.read_bytes()

        self.write_response(
            response(answers=[{"name": "chatgpt.com.", "type": 1, "TTL": 120, "data": "198.18.0.1"}])
        )
        fake = self.run_probe(*args)
        self.assertNotEqual(fake.returncode, 0)
        self.assertEqual(json.loads(fake.stdout)["reason"], "fake-ip-response")
        self.assertEqual(self.out.read_bytes(), before)

        failed = self.run_probe(*args, **{"RESOLVER_PROBE_FAIL": "1"})
        self.assertNotEqual(failed.returncode, 0)
        self.assertEqual(json.loads(failed.stdout)["reason"], "api-unavailable")
        self.assertEqual(self.out.read_bytes(), before)
        self.assert_private_workdirs_removed()

    def test_mismatched_question_preserves_last_good_snapshot(self) -> None:
        args = self.standard_args("chatgpt/chatgpt.com/A")
        first = self.run_probe(*args)
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        before = self.out.read_bytes()
        self.write_response(
            response(name="other.example.net.", answers=[{"name": "other.example.net.", "type": 1, "TTL": 120, "data": "203.0.113.7"}])
        )

        malformed = self.run_probe(*args)
        self.assertNotEqual(malformed.returncode, 0)
        self.assertEqual(json.loads(malformed.stdout)["reason"], "malformed-response")
        self.assertEqual(self.out.read_bytes(), before)
        self.assert_private_workdirs_removed()

    def test_existing_directory_snapshot_destination_is_refused(self) -> None:
        self.out.mkdir(parents=True)
        mode_before = stat.S_IMODE(self.out.stat().st_mode)
        result = self.run_probe(*self.standard_args("chatgpt/chatgpt.com/A"))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["reason"], "snapshot-write-failed")
        self.assertTrue(self.out.is_dir())
        self.assertEqual(list(self.out.iterdir()), [])
        self.assertEqual(stat.S_IMODE(self.out.stat().st_mode), mode_before)
        self.assert_private_workdirs_removed()

    def test_symlink_snapshot_destination_is_refused(self) -> None:
        target = self.root / "sentinel.json"
        target.write_text('{"keep":true}\n', encoding="utf-8")
        self.out.parent.mkdir(parents=True)
        self.out.symlink_to(target)
        before = target.read_bytes()
        result = self.run_probe(*self.standard_args("chatgpt/chatgpt.com/A"))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["reason"], "snapshot-write-failed")
        self.assertTrue(self.out.is_symlink())
        self.assertEqual(target.read_bytes(), before)
        self.assert_private_workdirs_removed()

    def test_directory_appearing_at_rename_is_not_used_as_container(self) -> None:
        result = self.run_probe(
            *self.standard_args("chatgpt/chatgpt.com/A"),
            **{"RESOLVER_PROBE_DEST_DIR_RACE": "1"},
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["reason"], "snapshot-write-failed")
        self.assertTrue(self.out.is_dir())
        self.assertEqual(list(self.out.iterdir()), [])
        self.assert_private_workdirs_removed()

    def test_interrupted_fetch_cleans_private_work_directory(self) -> None:
        marker = self.root / "started"
        env = self.env(
            RESOLVER_PROBE_BLOCK="1",
            RESOLVER_PROBE_STARTED=str(marker),
        )
        process = subprocess.Popen(
            ["/bin/sh", "-c", SCRIPT, "resolver-probe", *self.standard_args("chatgpt/chatgpt.com/A")],
            cwd=ROOT,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and not marker.exists() and process.poll() is None:
                time.sleep(0.01)
            self.assertTrue(marker.exists(), "fake controller was not reached")
            os.killpg(process.pid, signal.SIGTERM)
            process.communicate(timeout=5)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate(timeout=5)
        self.assertFalse(self.out.exists())
        self.assert_private_workdirs_removed()

    def test_only_canonical_selector_apexes_are_accepted(self) -> None:
        result = self.run_probe(*self.standard_args("chatgpt/api.openai.com/A"))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.requests.read_text(encoding="utf-8"), "")
        result = self.run_probe(*self.standard_args("chatgpt/unowned.example/A"))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.requests.read_text(encoding="utf-8"), "")

    def test_nonloopback_controller_is_rejected_without_request(self) -> None:
        args = list(self.standard_args("chatgpt/chatgpt.com/A"))
        args[1] = "http://192.0.2.1:9090"
        result = self.run_probe(*args)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["reason"], "controller-not-loopback")
        self.assertEqual(self.requests.read_text(encoding="utf-8"), "")

    def test_probe_budget_records_partial_selection(self) -> None:
        args = self.standard_args("chatgpt/chatgpt.com/A", "claude/claude.ai/A", budget="1")
        result = self.run_probe(*args)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        receipt = json.loads(result.stdout)
        self.assertEqual(receipt["selectedProbes"], 2)
        self.assertEqual(receipt["attemptedProbes"], 1)
        self.assertEqual(receipt["completedProbes"], 1)
        self.assertEqual(len(self.requests.read_text(encoding="utf-8").splitlines()), 1)

    def test_authorization_file_stays_private_and_never_appears_in_receipt(self) -> None:
        token_file = self.root / "controller-token"
        token_file.write_text("test-private-token\n", encoding="utf-8")
        token_file.chmod(0o600)
        (self.bin / "stat").write_text("#!/bin/sh\nprintf '600\\n'\n", encoding="utf-8")
        (self.bin / "stat").chmod(0o755)
        result = self.run_probe(
            *self.standard_args("chatgpt/chatgpt.com/A"),
            "--token-file",
            str(token_file),
            **{"RESOLVER_PROBE_EXPECT_AUTH": "1"},
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("test-private-token", result.stdout + result.stderr)
        self.assert_private_workdirs_removed()


if __name__ == "__main__":
    unittest.main()
