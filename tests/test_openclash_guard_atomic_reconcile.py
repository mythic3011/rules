from __future__ import annotations

import importlib.util
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "tests" / "fixtures" / "synthetic" / "openclash-guard" / "policy.json"
TEMPLATES = ROOT / "cfg" / "runtime" / "openclash-guard-templates.json"
SHBUNDLE = ROOT / "tools" / "shbundle.py"


def _load_shbundle():
    spec = importlib.util.spec_from_file_location("guard_runtime_test_shbundle", SHBUNDLE)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the shell bundle renderer")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_SHBUNDLE = _load_shbundle()


FAKE_UCI = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

state_path = Path(os.environ["UCI_FAKE_STATE"])
log_path = Path(os.environ["UCI_FAKE_LOG"])
args = list(sys.argv[1:])
with log_path.open("a", encoding="utf-8") as log:
    log.write(json.dumps(args) + "\n")

delimiter = " "
quiet = False
while args and args[0] in ("-q", "-d"):
    if args[0] == "-q":
        quiet = True
        args.pop(0)
    else:
        delimiter = args[1]
        del args[:2]

if not args:
    raise SystemExit(2)
command, *rest = args
try:
    payload = json.loads(state_path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    payload = {"options": {}}
if payload.get("error"):
    print("uci: permission denied", file=sys.stderr)
    raise SystemExit(1)
options = payload.get("options", {})

def fail():
    if not quiet:
        print("uci: Entry not found", file=sys.stderr)
    raise SystemExit(1)

def uci_quote(value):
    return "'" + str(value).replace("'", "'\\''") + "'"

if command == "show":
    if not options:
        print("uci: Entry not found", file=sys.stderr)
        raise SystemExit(1)
    package = rest[0] if rest else "openclash_guard"
    if package != "openclash_guard":
        fail()
    sections = sorted({path.split(".", 1)[0] for path in options})
    lines = [f"openclash_guard.{section}=openclash_guard" for section in sections]
    for path, value in sorted(options.items()):
        values = value if isinstance(value, list) else [value]
        for index, item in enumerate(values):
            suffix = f"[{index}]" if isinstance(value, list) else ""
            lines.append(f"openclash_guard.{path}{suffix}={uci_quote(item)}")
    print("\n".join(lines))
    raise SystemExit(0)

if command == "get":
    path = rest[0].removeprefix("openclash_guard.") if rest else ""
    if path not in options:
        fail()
    value = options[path]
    if isinstance(value, list):
        print(delimiter.join(str(item) for item in value))
    else:
        print(value)
    raise SystemExit(0)

print("uci: unsupported command", file=sys.stderr)
raise SystemExit(2)
'''


FAKE_NFT = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]
state_path = Path(os.environ["NFT_FAKE_STATE"])
log_path = Path(os.environ["NFT_FAKE_MUTATIONS"])
batch_path = Path(os.environ["NFT_FAKE_BATCH"])
state = json.loads(state_path.read_text(encoding="utf-8"))

def record(kind, detail):
    with log_path.open("a", encoding="utf-8") as log:
        log.write(json.dumps({"kind": kind, "detail": detail}) + "\n")

if args == ["--version"]:
    print("nftables v1.0")
    raise SystemExit(0)

if "-f" in args:
    index = args.index("-f")
    batch = sys.stdin.read() if args[index + 1] == "-" else Path(args[index + 1]).read_text(encoding="utf-8")
    batch_path.write_text(batch, encoding="utf-8")
    record("batch", batch)
    raise SystemExit(0)

if args and args[0] in ("add", "delete", "flush", "insert", "replace"):
    record("command", args)
    raise SystemExit(0)

if args and args[0] == "list":
    if len(args) >= 2 and args[1] == "tables":
        for table in sorted(state.get("tables", {})):
            family, name = table.split(" ", 1)
            print(f"table {family} {name}")
        raise SystemExit(0)
    if len(args) >= 4 and args[1] == "table":
        key = f"{args[2]} {args[3]}"
        if key not in state.get("tables", {}):
            raise SystemExit(1)
        print(f"table {key} {{")
        print("}")
        raise SystemExit(0)
    raise SystemExit(1)

raise SystemExit(1)
'''


class GuardRuntimeHarness(unittest.TestCase):
    """Small fake-UCI/nft harness that renders the real bundle into temp space."""

    @classmethod
    def setUpClass(cls) -> None:
        cls._bundle_tmp = tempfile.TemporaryDirectory(prefix="guard-uci-bundle-")
        cls.bundle_path = Path(cls._bundle_tmp.name) / "openclash-guard.sh"
        manifest = _SHBUNDLE.load_manifest(ROOT / "shell" / "manifest.json")
        cls.bundle_text = _SHBUNDLE.render_bundle(manifest, "openclash-guard")
        cls.bundle_path.write_text(cls.bundle_text, encoding="utf-8")

    @classmethod
    def tearDownClass(cls) -> None:
        cls._bundle_tmp.cleanup()

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory(prefix="guard-uci-runtime-")
        self.base = Path(self._tmp.name)
        self.bin = self.base / "bin"
        self.work = self.base / "work"
        self.initd = self.base / "init.d"
        for path in (self.bin, self.work, self.initd):
            path.mkdir()
        self.uci_state = self.base / "uci.json"
        self.uci_log = self.base / "uci.jsonl"
        self.nft_state = self.base / "nft.json"
        self.nft_mutations = self.base / "nft-mutations.jsonl"
        self.nft_batch = self.base / "nft-batch.txt"
        self._write_executable(self.bin / "uci", FAKE_UCI)
        self._write_executable(self.bin / "nft", FAKE_NFT)
        self.write_uci({})
        self.write_nft({})
        self.uci_log.write_text("", encoding="utf-8")
        self.nft_mutations.write_text("", encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    @staticmethod
    def _write_executable(path: Path, content: str) -> None:
        path.write_text(content, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    def write_uci(self, options: dict[str, Any], *, error: str = "") -> None:
        self.uci_state.write_text(
            json.dumps({"options": options, "error": error}) + "\n",
            encoding="utf-8",
        )

    def write_nft(self, tables: dict[str, str]) -> None:
        self.nft_state.write_text(json.dumps({"tables": tables}, sort_keys=True) + "\n", encoding="utf-8")

    def env(self, **overrides: str) -> dict[str, str]:
        env = {
            "PATH": f"{self.bin}{os.pathsep}{Path(sys.executable).parent}{os.pathsep}/usr/bin:/bin",
            "HOME": str(self.base),
            "TMPDIR": str(self.work),
            "LC_ALL": "C",
            "LANG": "C",
            "NO_COLOR": "1",
            "GUARD_PREFIX": str(self.base / "prefix"),
            "GUARD_LOCK_PATH": str(self.work / "guard.lock"),
            "GUARD_STALE_CONF_DIRS": str(self.work / "stale"),
            "GUARD_POLICY_FILE": str(POLICY),
            "GUARD_TEMPLATES_FILE": str(TEMPLATES),
            "GUARD_DIRECT_REGION": "us",
            "GUARD_PROXY_REGION": "jp",
            "GUARD_OPENCLASH_HEALTHY": "0",
            "GUARD_PROXY_HEALTHY": "0",
            "GUARD_IPV6": "0",
            "SVC_INITD_DIR": str(self.initd),
            "JSON_FORCE_AWK": "1",
            "UCI_FAKE_STATE": str(self.uci_state),
            "UCI_FAKE_LOG": str(self.uci_log),
            "NFT_FAKE_STATE": str(self.nft_state),
            "NFT_FAKE_MUTATIONS": str(self.nft_mutations),
            "NFT_FAKE_BATCH": str(self.nft_batch),
        }
        env.update(overrides)
        return env

    def run_cli(self, *args: str, **overrides: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", str(self.bundle_path), *args],
            capture_output=True,
            text=True,
            timeout=20,
            cwd=self.work,
            env=self.env(**overrides),
            check=False,
        )

    def run_bundle_functions(self, body: str, **overrides: str) -> subprocess.CompletedProcess[str]:
        suffix = 'main "$@"\n'
        if not self.bundle_text.endswith(suffix):
            self.fail("generated bundle entrypoint changed; update the test harness")
        source = self.bundle_text[: -len(suffix)] + body + "\n"
        script_path = self.work / "bundle-functions.sh"
        script_path.write_text(source, encoding="utf-8")
        return subprocess.run(
            ["/bin/sh", str(script_path)],
            capture_output=True,
            text=True,
            timeout=20,
            cwd=self.work,
            env=self.env(**overrides),
            check=False,
        )

    def mutations(self) -> list[dict[str, Any]]:
        if not self.nft_mutations.is_file():
            return []
        return [json.loads(line) for line in self.nft_mutations.read_text(encoding="utf-8").splitlines() if line]

    def uci_calls(self) -> list[list[str]]:
        return [json.loads(line) for line in self.uci_log.read_text(encoding="utf-8").splitlines() if line]


class AtomicReconcileTests(GuardRuntimeHarness):
    def test_invalid_known_value_refuses_reconcile_before_nft_and_preserves_table(self) -> None:
        sentinel_table = "inet openclash_guard"
        self.write_nft({sentinel_table: "last-good-state"})
        before = self.nft_state.read_bytes()
        self.write_uci(
            {
                "main.enabled": "1",
                "main.profile_url": "http://URL_SENTINEL.invalid/private",
            }
        )

        result = self.run_bundle_functions(
            "_GUARD_PREFLIGHT_COMPLETE=1\n"
            "_GUARD_PREFLIGHT_SETUP_VALID=1\n"
            "guard_cmd_reconcile"
        )

        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("UCI overlay", result.stderr)
        self.assertEqual(self.mutations(), [])
        self.assertEqual(self.nft_state.read_bytes(), before)

    def test_preflight_and_reconcile_reuse_one_coherent_snapshot(self) -> None:
        self.write_uci(
            {
                "main.enabled": "1",
                "main.kill_switch": "1",
                "main.dns_kill_switch": "1",
                "udp.enabled": "1",
                "udp.src_ip": ["192.0.2.44"],
            }
        )

        result = self.run_cli("reconcile")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        show_calls = [call for call in self.uci_calls() if "show" in call and "openclash_guard" in call]
        self.assertEqual(len(show_calls), 3, "expected one availability probe and one before/after snapshot pair")
        batch = self.nft_batch.read_text(encoding="utf-8")
        self.assertIn('iifname != "lo" udp dport 53 reject', batch)
        self.assertIn("udp dport @protected_udp reject", batch)


if __name__ == "__main__":
    unittest.main()
