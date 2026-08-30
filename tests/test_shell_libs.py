from __future__ import annotations

import importlib.util
import json
import os
import pty
import select
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import Mapping

ROOT = Path(__file__).resolve().parents[1]
LIB_DIR = ROOT / "shell" / "lib"
FIXTURE_APP = (
    ROOT / "tests" / "fixtures" / "synthetic" / "shell-libs" / "app" / "main.sh"
)
SHBUNDLE_PATH = ROOT / "tools" / "shbundle.py"

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
import sys
from pathlib import Path

STATE_PATH = Path(os.environ["NFT_FAKE_STATE"])


def load():
    if not STATE_PATH.is_file():
        return {"tables": {}}
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def save(state):
    STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def table_key(family, name):
    return f"{family} {name}"


def get_table(state, family, name):
    return state["tables"].get(table_key(family, name))


def format_rule(rule, with_handle):
    comment = rule.get("comment", "")
    text = rule.get("text", "counter")
    line = f"\t\t{text} comment \"{comment}\""
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
        out.append(f"\t\ttype ipv4_addr{extra}")
        out.append("\t}")
    out.append("}")


def apply_line(state, line):
    line = line.strip()
    if not line or line.startswith("#") or line.startswith("flush"):
        return 0
    parts = line.split()
    if parts[:2] == ["delete", "rule"] and "handle" in parts:
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
    if parts[:2] == ["delete", "set"]:
        family, table, name = parts[2], parts[3], parts[4]
        tbl = get_table(state, family, table)
        if tbl is None or name not in tbl.get("sets", {}):
            print("Error: No such file or directory", file=sys.stderr)
            return 1
        del tbl["sets"][name]
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
        rc = 0
        for line in raw.splitlines():
            line_rc = apply_line(state, line)
            if line_rc != 0:
                rc = line_rc
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
            print("\t\ttype ipv4_addr")
            print("\t}")
            print("}")
            return 0
    if cmd == "delete" and rest:
        return apply_line(state, " ".join([cmd] + rest)) or save(state) or 0
    print(f"nft: unsupported: {' '.join(argv)}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
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
        if arg in ("--connect-timeout", "--max-time", "-m", "--retry", "--retry-delay"):
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

FAKE_WGET = r'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

MAP_PATH = Path(os.environ["FETCH_FAKE_MAP"])
LOG_PATH = Path(os.environ["FETCH_FAKE_LOG"])


def main(argv):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write("wget " + " ".join(argv) + "\n")
    output = None
    url = None
    args = list(argv)
    i = 0
    while i < len(args):
        arg = args[i]
        if arg in ("-O", "--output-document"):
            output = args[i + 1]
            i += 2
            continue
        if arg in ("-T", "--timeout"):
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
        print(f"wget: failed to fetch {url}", file=sys.stderr)
        return 1
    body = spec.get("body", "ok\n")
    if output in (None, "-"):
        sys.stdout.write(body)
        return 0
    Path(output).write_text(body, encoding="utf-8")
    return 0


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
    *)
        printf '%s\n' "usage: $name enabled|status|running|restart|enable" >&2
        exit 1
        ;;
esac
'''


def _write_exec(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


class ShellLibHarness(unittest.TestCase):
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
        _write_exec(self.bin / "uci", FAKE_UCI)
        _write_exec(self.bin / "nft", FAKE_NFT)
        _write_exec(self.bin / "curl", FAKE_CURL)
        _write_exec(self.bin / "wget", FAKE_WGET)
        self._write_uci({})
        self._write_nft()
        self._write_fetch({})

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write_uci(self, committed: dict, pending: dict | None = None) -> None:
        self.uci_state.write_text(
            json.dumps({"committed": committed, "pending": pending or {}}, indent=2)
            + "\n",
            encoding="utf-8",
        )

    def _write_nft(self) -> None:
        self.nft_state.write_text(
            json.dumps(
                {
                    "tables": {
                        "inet fw4": {
                            "chains": {
                                "forward": [
                                    {
                                        "handle": 1,
                                        "text": "ct state established accept",
                                        "comment": "fw4-allow",
                                    },
                                    {
                                        "handle": 2,
                                        "text": "ip daddr @ocg_ips drop",
                                        "comment": "ocg-drop-v4",
                                    },
                                    {
                                        "handle": 3,
                                        "text": "udp dport 53 accept",
                                        "comment": "openclash-redirect",
                                    },
                                ]
                            },
                            "sets": {
                                "ocg_ips": {"comment": "ocg-ips"},
                                "lan_networks": {"comment": "fw4-lan"},
                            },
                        }
                    }
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    def _write_fetch(self, mapping: dict) -> None:
        self.fetch_map.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
        if self.fetch_log.exists():
            self.fetch_log.write_text("", encoding="utf-8")

    def _install_service(
        self, name: str, *, enabled: bool = False, running: bool = False
    ) -> None:
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
            "SVC_INITD_DIR": str(self.initd),
            "SVC_FAKE_STATE": str(self.svc_state),
            "UCI_FAKE_STATE": str(self.uci_state),
            "NFT_FAKE_STATE": str(self.nft_state),
            "FETCH_FAKE_MAP": str(self.fetch_map),
            "FETCH_FAKE_LOG": str(self.fetch_log),
        }
        if extra:
            env.update(extra)
        return env

    def source_script(self, libs: list[str], body: str) -> str:
        lines = ["set -eu"]
        for name in libs:
            lines.append(f'. "{LIB_DIR / (name + ".sh")}"')
        lines.append(body.rstrip())
        lines.append("")
        return "\n".join(lines)

    def run_sh(
        self,
        libs: list[str],
        body: str,
        extra_env: Mapping[str, str] | None = None,
        timeout: float = 5,
        stdin_data: str | None = None,
        hang_stdin: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        script = self.source_script(libs, body)
        kwargs: dict = {
            "args": ["/bin/sh", "-c", script],
            "capture_output": True,
            "text": True,
            "env": self.env(extra_env),
            "timeout": timeout,
            "cwd": str(self.work),
        }
        if hang_stdin:
            read_fd, write_fd = os.pipe()
            try:
                proc = subprocess.Popen(
                    ["/bin/sh", "-c", script],
                    stdin=read_fd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    env=self.env(extra_env),
                    cwd=str(self.work),
                )
                try:
                    stdout, stderr = proc.communicate(timeout=timeout)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.communicate()
                    self.fail("shell helper hung waiting for input")
                return subprocess.CompletedProcess(
                    proc.args, proc.returncode, stdout, stderr
                )
            finally:
                os.close(read_fd)
                os.close(write_fd)
        if stdin_data is not None:
            kwargs["input"] = stdin_data
        return subprocess.run(**kwargs, check=False)

    def run_pty(
        self,
        libs: list[str],
        body: str,
        extra_env: Mapping[str, str] | None = None,
        input_text: str = "",
        timeout: float = 5,
    ) -> tuple[int, str]:
        script = self.source_script(libs, body)
        master, slave = pty.openpty()
        try:
            proc = subprocess.Popen(
                ["/bin/sh", "-c", script],
                stdin=slave,
                stdout=slave,
                stderr=slave,
                env=self.env(extra_env),
                cwd=str(self.work),
                close_fds=True,
            )
            os.close(slave)
            slave = -1
            if input_text:
                time.sleep(0.05)
                os.write(master, input_text.encode("utf-8"))
            chunks: list[bytes] = []
            deadline = time.time() + timeout
            while time.time() < deadline:
                ready, _, _ = select.select([master], [], [], 0.1)
                if ready:
                    try:
                        data = os.read(master, 4096)
                    except OSError:
                        break
                    if not data:
                        break
                    chunks.append(data)
                elif proc.poll() is not None:
                    while True:
                        more, _, _ = select.select([master], [], [], 0.05)
                        if not more:
                            break
                        try:
                            data = os.read(master, 4096)
                        except OSError:
                            data = b""
                        if not data:
                            break
                        chunks.append(data)
                    break
            try:
                rc = proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
                self.fail("PTY shell helper hung")
            text = b"".join(chunks).decode("utf-8", "replace")
            return rc, text.replace("\r\n", "\n").replace("\r", "\n")
        finally:
            if slave != -1:
                os.close(slave)
            os.close(master)


class CliLibTests(ShellLibHarness):
    def test_non_tty_has_no_ansi(self) -> None:
        result = self.run_sh(
            ["cli"],
            """
if cli_is_tty; then echo TTY; else echo NOTTY; fi
if cli_color_enabled; then echo COLOR; else echo NOCOLOR; fi
cli_info hello
cli_success done
cli_section title
cli_kv key value
cli_warn careful
cli_error boom
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("NOTTY", result.stdout)
        self.assertIn("NOCOLOR", result.stdout)
        self.assertIn("info: hello", result.stdout)
        self.assertIn("ok: done", result.stdout)
        self.assertIn("== title ==", result.stdout)
        self.assertIn("key: value", result.stdout)
        self.assertIn("warn: careful", result.stderr)
        self.assertIn("error: boom", result.stderr)
        self.assertNotIn("\033[", result.stdout)
        self.assertNotIn("\033[", result.stderr)

    def test_tty_emits_color_unless_no_color(self) -> None:
        rc, text = self.run_pty(
            ["cli"],
            """
if cli_is_tty; then echo TTY; else echo NOTTY; fi
if cli_color_enabled; then echo COLOR; else echo NOCOLOR; fi
cli_info hello
""",
        )
        self.assertEqual(rc, 0, text)
        self.assertIn("TTY", text)
        self.assertIn("COLOR", text)
        self.assertIn("\033[", text)

        rc, text = self.run_pty(
            ["cli"],
            """
if cli_color_enabled; then echo COLOR; else echo NOCOLOR; fi
cli_info hello
""",
            extra_env={"NO_COLOR": "1"},
        )
        self.assertEqual(rc, 0, text)
        self.assertIn("NOCOLOR", text)
        self.assertIn("info: hello", text)
        self.assertNotIn("\033[", text)

    def test_confirm_non_tty_does_not_hang_and_is_false(self) -> None:
        start = time.time()
        result = self.run_sh(
            ["cli"],
            'if cli_confirm "Continue?"; then echo YES; else echo NO; fi',
            hang_stdin=True,
            timeout=2,
        )
        self.assertLess(time.time() - start, 2)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "NO")

    def test_confirm_assume_yes_env_and_function(self) -> None:
        result = self.run_sh(
            ["cli"],
            'if cli_confirm; then echo YES; else echo NO; fi',
            extra_env={"CLI_ASSUME_YES": "1"},
            hang_stdin=True,
            timeout=2,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "YES")

        result = self.run_sh(
            ["cli"],
            """
cli_set_assume_yes 1
if cli_confirm; then echo YES; else echo NO; fi
""",
            hang_stdin=True,
            timeout=2,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "YES")

        result = self.run_sh(
            ["cli"],
            """
cli_set_assume_yes 0
if cli_confirm; then echo YES; else echo NO; fi
""",
            extra_env={"CLI_ASSUME_YES": "1"},
            hang_stdin=True,
            timeout=2,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "NO")

    def test_confirm_tty_yes(self) -> None:
        rc, text = self.run_pty(
            ["cli"],
            'if cli_confirm "Continue?"; then echo YES; else echo NO; fi',
            input_text="y\n",
        )
        self.assertEqual(rc, 0, text)
        self.assertIn("YES", text)

    def test_die_exits(self) -> None:
        result = self.run_sh(["cli"], 'cli_die "fatal" 3')
        self.assertEqual(result.returncode, 3)
        self.assertIn("error: fatal", result.stderr)


class EnvLibTests(ShellLibHarness):
    def test_bool_int_default(self) -> None:
        result = self.run_sh(
            ["env"],
            """
printf '%s\n' "$(env_default MISSING fallback)"
if env_is_set EMPTY; then echo set; else echo unset; fi
printf '%s\n' "$(env_get EMPTY)"
printf '%s\n' "$(env_bool FLAG)"
printf '%s\n' "$(env_bool MISSING 0)"
printf '%s\n' "$(env_int COUNT)"
""",
            extra_env={"EMPTY": "", "FLAG": "yes", "COUNT": "12"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["fallback", "set", "", "1", "0", "12"])

    def test_invalid_bool_and_int(self) -> None:
        result = self.run_sh(["env"], "env_bool FLAG", extra_env={"FLAG": "maybe"})
        self.assertNotEqual(result.returncode, 0)
        result = self.run_sh(["env"], "env_int COUNT", extra_env={"COUNT": "nope"})
        self.assertNotEqual(result.returncode, 0)


class ServiceLibTests(ShellLibHarness):
    def test_installed_enabled_running_distinctions(self) -> None:
        self._install_service("alpha")
        self._install_service("bravo", enabled=True)
        self._install_service("charlie", enabled=True, running=True)
        result = self.run_sh(
            ["service"],
            """
if svc_exists missing; then echo missing-yes; else echo missing-no; fi
svc_status missing || true
for name in alpha bravo charlie; do
  printf '%s exists=' "$name"
  if svc_exists "$name"; then printf 1; else printf 0; fi
  printf ' enabled='
  if svc_enabled "$name"; then printf 1; else printf 0; fi
  printf ' running='
  if svc_running "$name"; then printf 1; else printf 0; fi
  printf ' status='
  svc_status "$name"
done
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.splitlines()
        self.assertEqual(lines[0], "missing-no")
        self.assertEqual(lines[1], "missing")
        self.assertEqual(lines[2], "alpha exists=1 enabled=0 running=0 status=stopped")
        self.assertEqual(lines[3], "bravo exists=1 enabled=1 running=0 status=stopped")
        self.assertEqual(lines[4], "charlie exists=1 enabled=1 running=1 status=running")

    def test_helpers_do_not_restart_without_mutate(self) -> None:
        self._install_service("dnsmasq", enabled=True, running=True)
        result = self.run_sh(
            ["service"],
            """
svc_status dnsmasq
if svc_exists dnsmasq; then echo exists; fi
if svc_enabled dnsmasq; then echo enabled; fi
if svc_running dnsmasq; then echo running; fi
if svc_restart dnsmasq; then echo restarted; else echo refused; fi
if svc_enable dnsmasq; then echo enabled-mutate; else echo enable-refused; fi
svc_restart --mutate dnsmasq
svc_enable --mutate dnsmasq
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("refused", result.stdout)
        self.assertIn("enable-refused", result.stdout)
        log = (self.svc_state / "dnsmasq.log").read_text(encoding="utf-8").splitlines()
        self.assertEqual(log, ["restart", "enable"])
        self.assertIn("without --mutate", result.stderr)

    def test_other_libs_do_not_call_mutate_helpers(self) -> None:
        for path in sorted(LIB_DIR.glob("*.sh")):
            if path.name == "service.sh":
                continue
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("svc_restart", text, path.name)
            self.assertNotIn("svc_enable", text, path.name)


class UciLibTests(ShellLibHarness):
    def test_default_bool_list_and_commit(self) -> None:
        self._write_uci(
            {
                "network.lan.ipaddr": "192.0.2.1",
                "network.lan.enabled": "yes",
                "network.lan.dns": ["1.1.1.1", "8.8.8.8"],
            }
        )
        result = self.run_sh(
            ["uci"],
            """
printf 'ip=%s\n' "$(uci_get network.lan.ipaddr)"
printf 'missing=%s\n' "$(uci_get_default network.lan.missing fallback)"
printf 'bool=%s\n' "$(uci_get_bool network.lan.enabled)"
uci_get_list network.lan.dns > dns.txt
uci_set network.lan.ipaddr 192.0.2.9
uci_add_list network.lan.dns 9.9.9.9
printf 'changes-before\n'
uci changes
uci_commit_if_changed network
printf 'ip2=%s\n' "$(uci_get network.lan.ipaddr)"
uci_commit_if_changed network
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ip=192.0.2.1", result.stdout)
        self.assertIn("missing=fallback", result.stdout)
        self.assertIn("bool=1", result.stdout)
        dns = (self.work / "dns.txt").read_text(encoding="utf-8").splitlines()
        self.assertEqual(dns, ["1.1.1.1", "8.8.8.8"])
        self.assertIn("ip2=192.0.2.9", result.stdout)
        state = json.loads(self.uci_state.read_text(encoding="utf-8"))
        self.assertEqual(state["committed"]["network.lan.ipaddr"], "192.0.2.9")
        self.assertEqual(
            state["committed"]["network.lan.dns"], ["1.1.1.1", "8.8.8.8", "9.9.9.9"]
        )
        self.assertEqual(state["pending"], {})

    def test_get_missing_is_not_hidden(self) -> None:
        self._write_uci({})
        result = self.run_sh(["uci"], "uci_get network.lan.missing")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Entry not found", result.stderr)


class NftLibTests(ShellLibHarness):
    def test_comment_handles_and_owned_delete(self) -> None:
        result = self.run_sh(
            ["nft"],
            """
if nft_table_exists inet fw4; then echo table-yes; fi
if nft_chain_exists inet fw4 forward; then echo chain-yes; fi
if nft_set_exists inet fw4 ocg_ips; then echo set-yes; fi
if nft_set_exists inet fw4 missing; then echo set-missing; else echo set-no; fi
nft_rule_handles_by_comment inet fw4 forward ocg- > handles.txt
nft_dump_owned_state inet fw4 ocg > dump.txt
nft_delete_rules_by_comment inet fw4 forward ocg-
if nft_delete_owned_set inet fw4 lan_networks ocg-; then echo stole; else echo refused; fi
nft_delete_owned_set inet fw4 ocg_ips ocg_
printf 'handles=' ; tr '\\n' ' ' < handles.txt ; printf '\\n'
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("table-yes", result.stdout)
        self.assertIn("chain-yes", result.stdout)
        self.assertIn("set-yes", result.stdout)
        self.assertIn("set-no", result.stdout)
        self.assertIn("refused", result.stdout)
        self.assertNotIn("stole", result.stdout)
        handles = (self.work / "handles.txt").read_text(encoding="utf-8").split()
        self.assertEqual(handles, ["2"])
        dump = (self.work / "dump.txt").read_text(encoding="utf-8")
        self.assertIn("ocg-drop-v4", dump)
        self.assertIn("ocg_ips", dump)
        self.assertNotIn("fw4-allow", dump)
        self.assertNotIn("openclash-redirect", dump)
        state = json.loads(self.nft_state.read_text(encoding="utf-8"))
        comments = [
            rule["comment"]
            for rule in state["tables"]["inet fw4"]["chains"]["forward"]
        ]
        self.assertEqual(comments, ["fw4-allow", "openclash-redirect"])
        self.assertNotIn("ocg_ips", state["tables"]["inet fw4"]["sets"])
        self.assertIn("lan_networks", state["tables"]["inet fw4"]["sets"])

    def test_apply_batch_does_not_delete_unrelated(self) -> None:
        batch = self.work / "batch.nft"
        batch.write_text(
            "delete rule inet fw4 forward handle 2\n",
            encoding="utf-8",
        )
        result = self.run_sh(["nft"], f'nft_apply_batch "{batch}"')
        self.assertEqual(result.returncode, 0, result.stderr)
        state = json.loads(self.nft_state.read_text(encoding="utf-8"))
        comments = [
            rule["comment"]
            for rule in state["tables"]["inet fw4"]["chains"]["forward"]
        ]
        self.assertEqual(comments, ["fw4-allow", "openclash-redirect"])

    def test_empty_prefix_refused(self) -> None:
        result = self.run_sh(
            ["nft"],
            'nft_delete_rules_by_comment inet fw4 forward ""',
        )
        self.assertNotEqual(result.returncode, 0)
        state = json.loads(self.nft_state.read_text(encoding="utf-8"))
        self.assertEqual(len(state["tables"]["inet fw4"]["chains"]["forward"]), 3)


class FileLibTests(ShellLibHarness):
    def test_mktemp_sha256_atomic_replace(self) -> None:
        source = self.work / "src.txt"
        dest = self.work / "dest.txt"
        source.write_text("new-bytes\n", encoding="utf-8")
        dest.write_text("old-bytes\n", encoding="utf-8")
        result = self.run_sh(
            ["file"],
            f"""
tmp=$(file_mktemp "{self.work}")
printf 'tmp-exists='
if [ -f "$tmp" ]; then echo 1; else echo 0; fi
printf 'sha=%s\\n' "$(file_sha256 "{source}")"
file_atomic_replace "{dest}" "{source}"
cat "{dest}"
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("tmp-exists=1", result.stdout)
        expected = __import__("hashlib").sha256(b"new-bytes\n").hexdigest()
        self.assertIn(f"sha={expected}", result.stdout)
        self.assertTrue(dest.read_text(encoding="utf-8").endswith("new-bytes\n"))


class FetchLibTests(ShellLibHarness):
    def test_atomic_replace_and_failed_preserves_good_file(self) -> None:
        dest = self.work / "policy.txt"
        dest.write_text("last-known-good\n", encoding="utf-8")
        self._write_fetch(
            {
                "http://example.invalid/ok": {"body": "fresh-payload\n"},
                "http://example.invalid/fail": {"fail": True},
            }
        )
        result = self.run_sh(
            ["file", "fetch"],
            f"""
fetch_atomic http://example.invalid/ok "{dest}"
cat "{dest}"
if fetch_atomic http://example.invalid/fail "{dest}"; then echo fetched-fail; else echo preserved; fi
cat "{dest}"
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.splitlines(),
            ["fresh-payload", "preserved", "fresh-payload"],
        )
        self.assertEqual(dest.read_text(encoding="utf-8"), "fresh-payload\n")

    def test_validator_failure_preserves_destination(self) -> None:
        dest = self.work / "policy.txt"
        dest.write_text("good\n", encoding="utf-8")
        self._write_fetch({"http://example.invalid/ok": {"body": "bad-payload\n"}})
        result = self.run_sh(
            ["file", "fetch"],
            f"""
reject() {{ return 1; }}
if fetch_atomic http://example.invalid/ok "{dest}" reject; then echo replaced; else echo kept; fi
cat "{dest}"
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("kept", result.stdout)
        self.assertEqual(dest.read_text(encoding="utf-8"), "good\n")


class LockLibTests(ShellLibHarness):
    def test_acquire_release_and_conflict(self) -> None:
        lock_path = self.work / "app.lock"
        result = self.run_sh(
            ["lock"],
            f"""
lock_acquire "{lock_path}" 0
if lock_is_held "{lock_path}"; then echo held; fi
if lock_acquire "{lock_path}" 0; then echo second-got; else echo conflict; fi
lock_release "{lock_path}"
if lock_is_held "{lock_path}"; then echo still; else echo released; fi
lock_acquire "{lock_path}" 0
lock_release "{lock_path}"
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("held", result.stdout)
        self.assertIn("conflict", result.stdout)
        self.assertIn("released", result.stdout)
        self.assertFalse(lock_path.exists())

    def test_stale_lock_is_stolen(self) -> None:
        dead = subprocess.Popen(["/bin/sh", "-c", "exit 0"])
        dead.wait()
        lock_path = self.work / "stale.lock"
        lock_path.mkdir()
        (lock_path / "pid").write_text(str(dead.pid), encoding="utf-8")
        result = self.run_sh(
            ["lock"],
            f"""
lock_acquire "{lock_path}" 0
cat "{lock_path}/pid"
lock_release "{lock_path}"
""",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.strip().isdigit())
        self.assertNotEqual(result.stdout.strip(), str(dead.pid))
        self.assertFalse(lock_path.exists())


class BundleParityTests(ShellLibHarness):
    def test_source_and_bundle_share_implementation(self) -> None:
        payload = self.work / "payload.txt"
        payload.write_text("bundle-parity\n", encoding="utf-8")
        source = self.run_sh(
            ["cli", "env", "file"],
            f"""
file_sha256 "{payload}"
env_bool FLAG 0
cli_info hello-from-source
""",
            extra_env={"FLAG": "yes"},
        )
        self.assertEqual(source.returncode, 0, source.stderr)

        repo = self.base / "bundle-repo"
        (repo / "shell" / "lib").mkdir(parents=True)
        (repo / "shell" / "apps" / "demo").mkdir(parents=True)
        for lib in LIB_DIR.glob("*.sh"):
            shutil.copy2(lib, repo / "shell" / "lib" / lib.name)
        shutil.copy2(FIXTURE_APP, repo / "shell" / "apps" / "demo" / "main.sh")
        manifest = {
            "schemaVersion": 1,
            "generatedRoot": "dist",
            "contract": shbundle.load_json(shbundle.default_manifest_path())["contract"],
            "modules": {
                "cli": {"path": "shell/lib/cli.sh", "depends": []},
                "env": {"path": "shell/lib/env.sh", "depends": []},
                "file": {"path": "shell/lib/file.sh", "depends": []},
                "main": {
                    "path": "shell/apps/demo/main.sh",
                    "depends": ["cli", "env", "file"],
                },
            },
            "apps": {
                "demo": {
                    "entry": "shell/apps/demo/main.sh",
                    "depends": ["cli", "env", "file"],
                    "output": "dist/demo.sh",
                }
            },
        }
        man_path = repo / "shell" / "manifest.json"
        man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        loaded = shbundle.load_manifest(man_path)
        output = shbundle.build_app(loaded, "demo")
        rendered = output.read_text(encoding="utf-8")
        self.assertIn("# BEGIN MODULE: file", rendered)
        self.assertIn("file_sha256()", rendered)
        self.assertIn("# BEGIN MODULE: main", rendered)
        self.assertTrue(rendered.startswith("#!/bin/sh\n"))

        bundled_sha = subprocess.run(
            ["/bin/sh", str(output), "sha256", str(payload)],
            capture_output=True,
            text=True,
            env=self.env(),
            check=False,
        )
        bundled_bool = subprocess.run(
            ["/bin/sh", str(output), "bool", "FLAG"],
            capture_output=True,
            text=True,
            env=self.env({"FLAG": "yes"}),
            check=False,
        )
        bundled_info = subprocess.run(
            ["/bin/sh", str(output), "info", "hello-from-source"],
            capture_output=True,
            text=True,
            env=self.env(),
            check=False,
        )
        self.assertEqual(bundled_sha.returncode, 0, bundled_sha.stderr)
        self.assertEqual(bundled_bool.returncode, 0, bundled_bool.stderr)
        self.assertEqual(bundled_info.returncode, 0, bundled_info.stderr)
        self.assertEqual(
            bundled_sha.stdout.splitlines()[0], source.stdout.splitlines()[0]
        )
        self.assertEqual(bundled_bool.stdout.strip(), "1")
        self.assertIn("info: hello-from-source", bundled_info.stdout)
        self.assertNotIn("\033[", bundled_info.stdout)

    def test_shbundle_check_accepts_shared_libs(self) -> None:
        code, stdout, stderr = 0, "", ""
        from io import StringIO
        from contextlib import redirect_stderr, redirect_stdout

        buf_out, buf_err = StringIO(), StringIO()
        with redirect_stdout(buf_out), redirect_stderr(buf_err):
            code = shbundle.main(["check"])
        stdout, stderr = buf_out.getvalue(), buf_err.getvalue()
        self.assertEqual(code, 0, stderr)
        manifest = shbundle.load_manifest(ROOT / "shell" / "manifest.json")
        self.assertIn(f"{len(manifest.modules)} modules", stdout)
        self.assertIn(f"{len(manifest.apps)} apps", stdout)
        entry_names = {
            shbundle.entry_module_name(manifest, app)
            for app in manifest.apps.values()
        }
        for name, module in manifest.modules.items():
            source = shbundle.read_module_source(manifest, module)
            if name in entry_names:
                continue
            self.assertEqual(
                shbundle.toplevel_side_effects(source), [], name
            )
            self.assertFalse(shbundle.toplevel_main_dispatch(source), name)


if __name__ == "__main__":
    unittest.main()
