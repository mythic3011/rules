from __future__ import annotations

import importlib.util
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Mapping

ROOT = Path(__file__).resolve().parents[1]
SHBUNDLE_PATH = ROOT / "tools" / "shbundle.py"
BUNDLE = ROOT / "dist" / "openclash-guard.sh"
LIB_JSON = ROOT / "shell" / "lib" / "json.sh"
APP_DIR = ROOT / "shell" / "apps" / "openclash-guard"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "synthetic" / "openclash-guard"
POLICY = FIXTURE_DIR / "policy.json"
POLICY_INVALID = FIXTURE_DIR / "policy-invalid.json"

SPEC = importlib.util.spec_from_file_location("shbundle", SHBUNDLE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load module from {SHBUNDLE_PATH}")
shbundle = importlib.util.module_from_spec(SPEC)
sys.modules.setdefault("shbundle", shbundle)
SPEC.loader.exec_module(shbundle)

FAKE_UCI = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

STATE_PATH = Path(os.environ["UCI_FAKE_STATE"])


def load():
    if not STATE_PATH.is_file():
        return {"committed": {}, "pending": {}}
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def save(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def package_of(option):
    return option.split(".", 1)[0]


def lookup(state, option):
    if option in state["pending"]:
        return True, state["pending"][option]
    if option in state["committed"]:
        return True, state["committed"][option]
    return False, None


def render(value, delim):
    if isinstance(value, list):
        return delim.join(value)
    return str(value)


def main(argv):
    delim = " "
    quiet = False
    args = list(argv)
    while args:
        if args[0] == "-q":
            quiet = True
            args.pop(0)
            continue
        if args[0] == "-d":
            delim = args[1]
            args = args[2:]
            continue
        break
    if not args:
        print("uci: no command", file=sys.stderr)
        return 1
    cmd = args[0]
    rest = args[1:]
    state = load()
    if cmd == "get":
        if not rest:
            print("uci: missing option", file=sys.stderr)
            return 1
        found, value = lookup(state, rest[0])
        if not found:
            if not quiet:
                print("uci: Entry not found", file=sys.stderr)
            return 1
        print(render(value, delim))
        return 0
    if cmd == "set":
        if not rest or "=" not in rest[0]:
            print("uci: invalid set", file=sys.stderr)
            return 1
        option, value = rest[0].split("=", 1)
        state["pending"][option] = value
        save(state)
        return 0
    if cmd == "add_list":
        if not rest or "=" not in rest[0]:
            print("uci: invalid add_list", file=sys.stderr)
            return 1
        option, value = rest[0].split("=", 1)
        found, current = lookup(state, option)
        items = list(current) if found and isinstance(current, list) else ([] if not found else [current])
        items.append(value)
        state["pending"][option] = items
        save(state)
        return 0
    if cmd == "changes":
        pkg = rest[0] if rest else ""
        for option, value in state["pending"].items():
            if pkg and package_of(option) != pkg:
                continue
            print(f"{option}='{render(value, ' ')}'")
        return 0
    if cmd == "commit":
        pkg = rest[0] if rest else ""
        keep = {}
        for option, value in state["pending"].items():
            if pkg and package_of(option) != pkg:
                keep[option] = value
                continue
            state["committed"][option] = value
        state["pending"] = keep
        save(state)
        return 0
    print(f"uci: unknown command {cmd}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
'''

FAKE_NFT = r'''#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path

STATE_PATH = Path(os.environ["NFT_FAKE_STATE"])


def load():
    if not STATE_PATH.is_file():
        return {"tables": {}, "batches": [], "next_handle": 1}
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def save(state):
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def table_key(family, name):
    return f"{family} {name}"


def get_table(state, family, name):
    return state["tables"].get(table_key(family, name))


def ensure_table(state, family, name):
    key = table_key(family, name)
    tbl = state["tables"].get(key)
    if tbl is None:
        tbl = {"chains": {}, "sets": {}, "elements": {}}
        state["tables"][key] = tbl
    return tbl


def format_rule(rule, with_handle):
    comment = rule.get("comment", "")
    text = rule.get("text", "counter")
    line = f"\t\t{text}"
    if comment:
        line += f' comment "{comment}"'
    if with_handle:
        line += f" # handle {rule['handle']}"
    return line


def emit_table(table, family, name, with_handle, out):
    out.append(f"table {family} {name} {{")
    for chain, rules in table.get("chains", {}).items():
        out.append(f"\tchain {chain} {{")
        for rule in rules:
            out.append(format_rule(rule, with_handle))
        out.append("\t}")
    for set_name, spec in table.get("sets", {}).items():
        comment = spec.get("comment", "")
        extra = f' comment "{comment}"' if comment else ""
        out.append(f"\tset {set_name} {{")
        out.append(f"\t\ttype {spec.get('type', 'ipv4_addr')}{extra}")
        out.append("\t}")
    out.append("}")


def comment_of(text):
    match = re.search(r'comment\s+"([^"]*)"', text)
    return match.group(1) if match else ""


def apply_line(state, line):
    line = line.strip()
    if not line or line.startswith("#") or line.startswith("flush"):
        return 0
    if line.startswith("add table "):
        parts = line.split()
        family, name = parts[2], parts[3]
        key = table_key(family, name)
        if key in state["tables"]:
            print("Error: File exists", file=sys.stderr)
            return 1
        ensure_table(state, family, name)
        return 0
    if line.startswith("delete table "):
        parts = line.split()
        family, name = parts[2], parts[3]
        key = table_key(family, name)
        if key not in state["tables"]:
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        del state["tables"][key]
        return 0
    if line.startswith("add chain "):
        match = re.match(r"add chain (\S+) (\S+) (\S+)\s*(?:\{(.*)\})?\s*$", line)
        if not match:
            print(f"nft: bad add chain: {line}", file=sys.stderr)
            return 1
        family, table, chain = match.group(1), match.group(2), match.group(3)
        tbl = get_table(state, family, table)
        if tbl is None:
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        tbl.setdefault("chains", {})[chain] = []
        return 0
    if line.startswith("delete chain "):
        parts = line.split()
        family, table, chain = parts[2], parts[3], parts[4]
        tbl = get_table(state, family, table)
        if tbl is None or chain not in tbl.get("chains", {}):
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        del tbl["chains"][chain]
        return 0
    if line.startswith("add set "):
        match = re.match(r"add set (\S+) (\S+) (\S+)\s*\{(.*)\}\s*$", line)
        if not match:
            print(f"nft: bad add set: {line}", file=sys.stderr)
            return 1
        family, table, name, spec = match.group(1), match.group(2), match.group(3), match.group(4)
        tbl = get_table(state, family, table)
        if tbl is None:
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        type_m = re.search(r"type\s+(\S+);", spec)
        comment = comment_of(spec)
        tbl.setdefault("sets", {})[name] = {
            "type": type_m.group(1) if type_m else "ipv4_addr",
            "comment": comment,
        }
        tbl.setdefault("elements", {})[name] = []
        return 0
    if line.startswith("add element "):
        match = re.match(r"add element (\S+) (\S+) (\S+)\s*\{(.*)\}\s*$", line)
        if not match:
            print(f"nft: bad add element: {line}", file=sys.stderr)
            return 1
        family, table, name, body = match.group(1), match.group(2), match.group(3), match.group(4)
        tbl = get_table(state, family, table)
        if tbl is None or name not in tbl.get("sets", {}):
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        items = [item.strip() for item in body.split(",") if item.strip()]
        tbl.setdefault("elements", {}).setdefault(name, []).extend(items)
        return 0
    if line.startswith("add rule "):
        match = re.match(r"add rule (\S+) (\S+) (\S+)\s+(.*)$", line)
        if not match:
            print(f"nft: bad add rule: {line}", file=sys.stderr)
            return 1
        family, table, chain, rest = match.group(1), match.group(2), match.group(3), match.group(4)
        tbl = get_table(state, family, table)
        if tbl is None or chain not in tbl.get("chains", {}):
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        comment = comment_of(rest)
        text = re.sub(r'\s*comment\s+"[^"]*"\s*$', "", rest).strip()
        handle = int(state.get("next_handle", 1))
        state["next_handle"] = handle + 1
        tbl["chains"][chain].append({"handle": handle, "text": text, "comment": comment})
        return 0
    if line.startswith("delete rule ") and "handle" in line:
        parts = line.split()
        family, table, chain = parts[2], parts[3], parts[4]
        handle = int(parts[parts.index("handle") + 1])
        tbl = get_table(state, family, table)
        if tbl is None or chain not in tbl.get("chains", {}):
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        rules = tbl["chains"][chain]
        kept = [rule for rule in rules if int(rule["handle"]) != handle]
        if len(kept) == len(rules):
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        tbl["chains"][chain] = kept
        return 0
    if line.startswith("delete set "):
        parts = line.split()
        family, table, name = parts[2], parts[3], parts[4]
        tbl = get_table(state, family, table)
        if tbl is None or name not in tbl.get("sets", {}):
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        del tbl["sets"][name]
        tbl.get("elements", {}).pop(name, None)
        return 0
    print(f"nft: unsupported batch line: {line}", file=sys.stderr)
    return 1


def main(argv):
    with_handle = False
    args = list(argv)
    file_path = None
    filtered = []
    i = 0
    while i < len(args):
        if args[i] == "-a":
            with_handle = True
            i += 1
            continue
        if args[i] == "-f":
            file_path = args[i + 1]
            i += 2
            continue
        filtered.append(args[i])
        i += 1
    state = load()
    if file_path is not None:
        raw = sys.stdin.read() if file_path == "-" else Path(file_path).read_text(encoding="utf-8")
        lines = [line for line in raw.splitlines() if line.strip() and not line.strip().startswith("#")]
        state.setdefault("batches", []).append(lines)
        rc = 0
        for line in raw.splitlines():
            line_rc = apply_line(state, line)
            if line_rc != 0:
                rc = line_rc
                break
        save(state)
        return rc
    if not filtered:
        print("nft: missing command", file=sys.stderr)
        return 1
    cmd = filtered[0]
    rest = filtered[1:]
    if cmd == "list" and rest[:1] == ["tables"]:
        for key in state["tables"]:
            print(f"table {key}")
        return 0
    if cmd == "list" and rest:
        kind = rest[0]
        if kind == "table" and len(rest) >= 3:
            family, name = rest[1], rest[2]
            tbl = get_table(state, family, name)
            if tbl is None:
                print("Error: No such file or directory", file=sys.stderr)
                return 1
            lines = []
            emit_table(tbl, family, name, with_handle, lines)
            print("\n".join(lines))
            return 0
        if kind == "chain" and len(rest) >= 4:
            family, name, chain = rest[1], rest[2], rest[3]
            tbl = get_table(state, family, name)
            if tbl is None or chain not in tbl.get("chains", {}):
                print("Error: No such file or directory", file=sys.stderr)
                return 1
            print(f"table {family} {name} {{")
            print(f"\tchain {chain} {{")
            for rule in tbl["chains"][chain]:
                print(format_rule(rule, with_handle))
            print("\t}")
            print("}")
            return 0
        if kind == "set" and len(rest) >= 4:
            family, name, set_name = rest[1], rest[2], rest[3]
            tbl = get_table(state, family, name)
            if tbl is None or set_name not in tbl.get("sets", {}):
                print("Error: No such file or directory", file=sys.stderr)
                return 1
            print(f"table {family} {name} {{")
            print(f"\tset {set_name} {{")
            print(f"\t\ttype {tbl['sets'][set_name].get('type', 'ipv4_addr')}")
            print("\t}")
            print("}")
            return 0
    if cmd == "delete":
        rc = apply_line(state, " ".join([cmd] + rest))
        save(state)
        return rc
    print(f"nft: unsupported: {' '.join(argv)}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
'''

FAKE_INITD = r'''#!/bin/sh
set -eu
name=$(basename "$0")
state=${SVC_FAKE_STATE:?}
cmd=${1:-}
mkdir -p "$state"
case $cmd in
    enabled)
        [ -f "$state/$name.enabled" ]
        ;;
    status)
        if [ -f "$state/$name.running" ]; then
            printf '%s\n' "running"
            exit 0
        fi
        printf '%s\n' "inactive"
        exit 1
        ;;
    running)
        [ -f "$state/$name.running" ]
        ;;
    restart)
        printf '%s\n' "restart" >> "$state/$name.log"
        ;;
    enable)
        printf '%s\n' "enable" >> "$state/$name.log"
        : > "$state/$name.enabled"
        ;;
    start)
        printf '%s\n' "start" >> "$state/$name.log"
        : > "$state/$name.running"
        ;;
    *)
        printf '%s\n' "usage: $name enabled|status|running|restart|enable|start" >&2
        exit 1
        ;;
esac
'''

FAKE_CURL = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

MAP_PATH = Path(os.environ["FETCH_FAKE_MAP"])
LOG_PATH = Path(os.environ["FETCH_FAKE_LOG"])


def main(argv):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write("curl " + " ".join(argv) + "\n")
    output = None
    url = None
    args = list(argv)
    i = 0
    while i < len(args):
        arg = args[i]
        if arg in ("-o", "--output"):
            output = args[i + 1]
            i += 2
            continue
        if arg in ("--connect-timeout", "--max-time", "-m"):
            i += 2
            continue
        if arg.startswith("-"):
            i += 1
            continue
        url = arg
        i += 1
    mapping = json.loads(MAP_PATH.read_text(encoding="utf-8")) if MAP_PATH.is_file() else {}
    spec = mapping.get(url or "")
    if spec is None or spec.get("fail"):
        print(f"curl: failed to fetch {url}", file=sys.stderr)
        return 22
    body = spec.get("body", "ok\n")
    if output is None:
        sys.stdout.write(body)
        return 0
    Path(output).write_text(body, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
'''


def _write_exec(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _service_logs(svc_state: Path, name: str) -> list[str]:
    log = svc_state / f"{name}.log"
    if not log.is_file():
        return []
    return [line for line in log.read_text(encoding="utf-8").splitlines() if line]


class JsonHelperTests(unittest.TestCase):
    def test_get_keys_list_on_synthetic_policy(self) -> None:
        script = f"""
set -eu
. "{LIB_JSON}"
json_get "{POLICY}" schemaVersion
json_get "{POLICY}" nft.table
json_get "{POLICY}" services.svc-proxy-only.protectionClass
json_keys "{POLICY}" services
json_list "{POLICY}" gaming.protectedUdpPorts
json_list "{POLICY}" gaming.tcpPorts
if json_has "{POLICY}" protectionClasses.stable-session; then echo has-class; fi
"""
        result = subprocess.run(
            ["/bin/sh", "-c", script],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
            env={**os.environ, "JSON_FORCE_AWK": "1", "LC_ALL": "C"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.splitlines()
        self.assertEqual(lines[0], "1")
        self.assertEqual(lines[1], "openclash_guard")
        self.assertEqual(lines[2], "stable-session")
        self.assertIn("svc-proxy-only", lines)
        self.assertIn("443", lines)
        self.assertIn("has-class", lines)

    def test_invalid_json_fails_load(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "bad.json"
            path.write_text("{not json", encoding="utf-8")
            script = f"""
set -eu
. "{LIB_JSON}"
if json_load "{path}"; then echo loaded; else echo rejected; fi
"""
            result = subprocess.run(
                ["/bin/sh", "-c", script],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
                env={**os.environ, "JSON_FORCE_AWK": "1", "LC_ALL": "C"},
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("rejected", result.stdout)


class GuardAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        loaded = shbundle.load_manifest(ROOT / "shell" / "manifest.json")
        shbundle.build_app(loaded, "openclash-guard")
        if not BUNDLE.is_file():
            raise RuntimeError(f"missing bundle {BUNDLE}")

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.bin = self.base / "bin"
        self.initd = self.base / "init.d"
        self.svc_state = self.base / "svc-state"
        self.work = self.base / "work"
        for path in (self.bin, self.initd, self.svc_state, self.work):
            path.mkdir()
        self.uci_state = self.base / "uci-state.json"
        self.nft_state = self.base / "nft-state.json"
        self.fetch_map = self.base / "fetch-map.json"
        self.fetch_log = self.base / "fetch.log"
        self.lock_path = self.work / "openclash-guard.lock"
        self.stale_dir = self.work / "dnsmasq.d"
        self.stale_dir.mkdir()
        _write_exec(self.bin / "uci", FAKE_UCI)
        _write_exec(self.bin / "nft", FAKE_NFT)
        _write_exec(self.bin / "curl", FAKE_CURL)
        self._write_uci({})
        self._write_nft()
        self.fetch_map.write_text("{}\n", encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write_uci(self, committed: dict[str, Any], pending: dict | None = None) -> None:
        self.uci_state.write_text(
            json.dumps({"committed": committed, "pending": pending or {}}, indent=2)
            + "\n",
            encoding="utf-8",
        )

    def _write_nft(self, tables: dict | None = None) -> None:
        self.nft_state.write_text(
            json.dumps(
                {"tables": tables or {}, "batches": [], "next_handle": 1},
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    def _default_uci(self, **overrides: Any) -> dict[str, Any]:
        data: dict[str, Any] = {
            "openclash_guard.main.enabled": "1",
            "openclash_guard.main.mode": "auto",
            "openclash_guard.main.kill_switch": "1",
            "openclash_guard.main.dns_kill_switch": "0",
            "openclash_guard.udp.enabled": "1",
            "openclash_guard.udp.src_ip": ["10.0.0.11"],
        }
        data.update(overrides)
        return data

    def _install_service(self, name: str, *, enabled: bool = False, running: bool = False) -> None:
        _write_exec(self.initd / name, FAKE_INITD)
        if enabled:
            (self.svc_state / f"{name}.enabled").write_text("", encoding="utf-8")
        if running:
            (self.svc_state / f"{name}.running").write_text("", encoding="utf-8")

    def env(self, extra: Mapping[str, str] | None = None) -> dict[str, str]:
        env = {
            "PATH": f"{self.bin}{os.pathsep}{os.environ.get('PATH', '/usr/bin:/bin')}",
            "HOME": str(self.base),
            "TMPDIR": str(self.work),
            "LC_ALL": "C",
            "LANG": "C",
            "JSON_FORCE_AWK": "1",
            "SVC_INITD_DIR": str(self.initd),
            "SVC_FAKE_STATE": str(self.svc_state),
            "UCI_FAKE_STATE": str(self.uci_state),
            "NFT_FAKE_STATE": str(self.nft_state),
            "FETCH_FAKE_MAP": str(self.fetch_map),
            "FETCH_FAKE_LOG": str(self.fetch_log),
            "GUARD_POLICY_FILE": str(POLICY),
            "GUARD_LOCK_PATH": str(self.lock_path),
            "GUARD_STALE_CONF_DIRS": str(self.stale_dir),
            "GUARD_IPV6": "0",
            "GUARD_DIRECT_REGION": "zz",
            "GUARD_PROXY_REGION": "aa",
            "NO_COLOR": "1",
        }
        if extra:
            env.update(extra)
        return env

    def run_guard(self, *args: str, extra: Mapping[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", str(BUNDLE), *args],
            capture_output=True,
            text=True,
            env=self.env(extra),
            timeout=10,
            cwd=str(self.work),
            check=False,
        )

    def load_nft_state(self) -> dict[str, Any]:
        return json.loads(self.nft_state.read_text(encoding="utf-8"))

    def guard_table(self) -> dict[str, Any] | None:
        return self.load_nft_state()["tables"].get("inet openclash_guard")

    def rule_comments(self, chain: str = "forward") -> list[str]:
        table = self.guard_table()
        if not table:
            return []
        return [rule.get("comment", "") for rule in table.get("chains", {}).get(chain, [])]

    def rule_texts(self, chain: str = "forward") -> list[str]:
        table = self.guard_table()
        if not table:
            return []
        return [rule.get("text", "") for rule in table.get("chains", {}).get(chain, [])]

    def test_bundle_builds_single_shebang_and_main(self) -> None:
        text = BUNDLE.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("#!/bin/sh\n"))
        self.assertEqual(text.count("#!/bin/sh"), 1)
        self.assertEqual(sum(1 for line in text.splitlines() if line.strip() == 'main "$@"'), 1)
        syntax = subprocess.run(
            ["sh", "-n", str(BUNDLE)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(syntax.returncode, 0, syntax.stderr)
        loaded = shbundle.load_manifest(ROOT / "shell" / "manifest.json")
        order, entry, included = shbundle.topological_order(loaded, "openclash-guard")
        self.assertEqual(entry, "guard-main")
        self.assertIn("json", included)
        self.assertLess(order.index("guard-killswitch"), order.index("guard-gaming"))
        self.assertEqual(order[-1], "guard-main")

    def test_sources_never_mutate_dnsmasq_lifecycle(self) -> None:
        for path in APP_DIR.glob("*.sh"):
            text = path.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"\bsvc_restart\b", text), path.name)
            self.assertIsNone(re.search(r"\bsvc_enable\b", text), path.name)
            self.assertNotIn("/etc/init.d/dnsmasq", text, path.name)

    def test_agh_active_does_not_restart_dnsmasq(self) -> None:
        self._install_service("adguardhome", enabled=True, running=True)
        self._install_service("dnsmasq", enabled=False, running=False)
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        result = self.run_guard(
            "apply",
            extra={"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"},
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(_service_logs(self.svc_state, "dnsmasq"), [])
        status = self.run_guard(
            "status",
            "--json",
            extra={"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"},
        )
        self.assertEqual(status.returncode, 0, status.stderr)
        payload = json.loads(status.stdout)
        self.assertEqual(payload["dns"]["backend"], "adguardhome")
        self.assertFalse(payload["dns"]["dnsmasqEnabled"])
        self.assertFalse(payload["dns"]["dnsmasqRunning"])
        self.assertEqual(payload["dns"]["domainSetBackend"], "unavailable")
        self.assertEqual(payload["enforcement"], "reject")
        self.assertEqual(payload["state"], "degraded")

    def test_gaming_udp_443_is_not_bypassed(self) -> None:
        self._install_service("adguardhome", enabled=True, running=True)
        self._install_service("dnsmasq")
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        apply = self.run_guard(
            "apply",
            extra={"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"},
        )
        self.assertEqual(apply.returncode, 0, apply.stderr + apply.stdout)
        texts = "\n".join(self.rule_texts())
        self.assertNotIn("meta l4proto udp", texts)
        self.assertNotRegex(texts, r"ip saddr @gaming_src meta l4proto udp")
        comments = self.rule_comments()
        self.assertTrue(any(c.endswith("protected-udp") for c in comments))
        self.assertFalse(any("game-udp" in c and "443" in t for c, t in zip(comments, self.rule_texts())))
        decision = self.run_guard(
            "eval",
            "--json",
            "--service",
            "svc-proxy-only",
            "--proto",
            "udp",
            "--dport",
            "443",
            "--src",
            "10.0.0.11",
            "--dest",
            "203.0.113.10",
            extra={"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"},
        )
        self.assertEqual(decision.returncode, 0, decision.stderr)
        payload = json.loads(decision.stdout)
        self.assertIn(payload["verdict"], {"reject", "reject-direct"})
        self.assertNotEqual(payload["verdict"], "allow-direct")

    def test_openclash_stopped_kill_switch_rejects(self) -> None:
        self._install_service("dnsmasq", enabled=True, running=True)
        self._install_service("openclash", enabled=True, running=False)
        self._write_uci(self._default_uci())
        result = self.run_guard(
            "apply",
            extra={"GUARD_OPENCLASH_HEALTHY": "0", "GUARD_PROXY_HEALTHY": "0"},
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        comments = self.rule_comments()
        self.assertTrue(any(c.endswith("kill-switch") for c in comments), comments)
        texts = self.rule_texts()
        self.assertTrue(any(text.strip() == "reject" for text in texts), texts)
        self.assertFalse(any("accept remaining" in text for text in texts))
        decision = self.run_guard(
            "eval",
            "--json",
            "--service",
            "svc-proxy-only",
            "--proto",
            "tcp",
            "--dport",
            "443",
            "--src",
            "10.0.0.11",
            extra={"GUARD_OPENCLASH_HEALTHY": "0", "GUARD_PROXY_HEALTHY": "0"},
        )
        self.assertEqual(decision.returncode, 0, decision.stderr)
        self.assertEqual(json.loads(decision.stdout)["verdict"], "reject")

    def test_reconcile_twice_does_not_duplicate_nft_objects(self) -> None:
        self._install_service("adguardhome", enabled=True, running=True)
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        extra = {"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"}
        first = self.run_guard("reconcile", extra=extra)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        second = self.run_guard("reconcile", extra=extra)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        state = self.load_nft_state()
        self.assertGreaterEqual(len(state["batches"]), 2)
        table = self.guard_table()
        assert table is not None
        comments = [rule["comment"] for rule in table["chains"]["forward"]]
        self.assertEqual(len(comments), len(set(comments)), comments)
        self.assertEqual(list(state["tables"]), ["inet openclash_guard"])

    def test_status_and_doctor_json_emit_normalized_env(self) -> None:
        self._install_service("adguardhome", enabled=True, running=True)
        self._install_service("dnsmasq")
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        extra = {"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"}
        for cmd in ("status", "doctor"):
            result = self.run_guard(cmd, "--json", extra=extra)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            payload = json.loads(result.stdout)
            self.assertIn("openclash", payload)
            self.assertEqual(
                set(payload["openclash"]),
                {"installed", "enabled", "running", "healthy"},
            )
            self.assertEqual(
                set(payload["dns"]),
                {
                    "backend",
                    "dnsmasqEnabled",
                    "dnsmasqRunning",
                    "adguardhomeEnabled",
                    "adguardhomeRunning",
                    "domainSetBackend",
                },
            )
            self.assertEqual(set(payload["network"]), {"ipv6", "directRegion"})
            self.assertEqual(set(payload["proxy"]), {"healthy", "region"})
            self.assertEqual(payload["gaming"]["clients"]["count"], 1)
            self.assertTrue(payload["nft"]["available"])
            self.assertTrue(payload["openclash"]["installed"])
            self.assertTrue(payload["openclash"]["running"])
            self.assertTrue(payload["openclash"]["healthy"])
            self.assertEqual(payload["network"]["directRegion"], "zz")
            self.assertEqual(payload["proxy"]["region"], "aa")
            self.assertFalse(payload["network"]["ipv6"])

    def test_invalid_policy_does_not_mutate_nft(self) -> None:
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        before = self.load_nft_state()
        result = self.run_guard(
            "apply",
            extra={
                "GUARD_POLICY_FILE": str(POLICY_INVALID),
                "GUARD_OPENCLASH_HEALTHY": "1",
            },
        )
        self.assertNotEqual(result.returncode, 0)
        after = self.load_nft_state()
        self.assertEqual(after["tables"], before["tables"])
        self.assertEqual(after["batches"], before["batches"])

    def test_openclash_health_is_not_only_initd_status(self) -> None:
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        result = self.run_guard("status", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["openclash"]["running"])
        self.assertFalse(payload["openclash"]["healthy"])

    def test_apply_does_not_persist_detected_facts_to_uci(self) -> None:
        self._install_service("adguardhome", enabled=True, running=True)
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        result = self.run_guard(
            "apply",
            extra={"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        uci = json.loads(self.uci_state.read_text(encoding="utf-8"))
        keys = set(uci["committed"]) | set(uci["pending"])
        self.assertNotIn("openclash_guard.main.running", keys)
        self.assertNotIn("openclash_guard.detected.backend", keys)
        self.assertEqual(uci["committed"]["openclash_guard.main.enabled"], "1")
        self.assertEqual(uci["pending"], {})


if __name__ == "__main__":
    unittest.main()
