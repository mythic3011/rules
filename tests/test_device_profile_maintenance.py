import json
import os
import shlex
import signal
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INIT_SCRIPT = (
    ROOT
    / "apps/luci-app-openclash-guard/root/etc/init.d/openclash-guard-device-cache"
)
MAINTENANCE_SCRIPT = (
    ROOT
    / "apps/luci-app-openclash-guard/root/usr/libexec/openclash-guard-device-cache"
)


class DeviceCacheMaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="device-cache-maintenance-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        (self.bin / "python3").symlink_to(sys.executable)

        self.catalog = self.root / "device-profiles.json"
        self.jq_log = self.root / "jq.jsonl"
        self.helper_log = self.root / "helper.jsonl"
        self.sleep_log = self.root / "sleep.jsonl"
        self.forbidden_log = self.root / "forbidden.jsonl"
        self.script = self.root / "device-cache-loop"

        source = MAINTENANCE_SCRIPT.read_text(encoding="utf-8")
        source = self.replace_constant(
            source,
            "CATALOG_FILE",
            "/usr/share/openclash-guard/device-profiles.json",
            str(self.catalog),
        )
        source = self.replace_constant(
            source,
            "PRUNE_COMMAND",
            "/usr/libexec/openclash-guard-devices",
            str(self.bin / "openclash-guard-devices"),
        )
        self.write_executable(self.script, source)

        self.write_executable(self.bin / "jq", self.jq_stub())
        self.write_executable(self.bin / "openclash-guard-devices", self.helper_stub())
        self.write_executable(self.bin / "sleep", self.sleep_stub())
        for command in ("uci", "nft", "curl", "wget", "ssh"):
            self.write_executable(self.bin / command, self.forbidden_stub(command))

    @staticmethod
    def replace_constant(source, name, old_value, new_value):
        old = f"{name}='{old_value}'"
        if old not in source:
            raise AssertionError(f"expected path constant {name} was not found")
        return source.replace(old, f"{name}={shlex.quote(new_value)}", 1)

    @staticmethod
    def write_executable(path, content):
        path.write_text(content, encoding="utf-8")
        path.chmod(0o700)

    def jq_stub(self):
        return textwrap.dedent(
            f"""\
            #!/usr/bin/env python3
            import json
            import os
            import sys

            args = sys.argv[1:]
            with open(os.environ["JQ_LOG"], "a", encoding="utf-8") as log:
                log.write(json.dumps(args) + "\\n")
            if len(args) != 3 or args[0] != "-er":
                raise SystemExit(2)
            expression, path = args[1], args[2]
            required = (".version == 1", ".cache.root", ".cache.volatile", ".cache.pruneIntervalSeconds", "floor == .")
            if any(value not in expression for value in required):
                raise SystemExit(2)
            try:
                with open(path, encoding="utf-8") as source:
                    value = json.load(source)
                cache = value["cache"]
                interval = cache["pruneIntervalSeconds"]
                valid = (
                    type(value) is dict
                    and value.get("version") == 1
                    and type(cache) is dict
                    and type(cache.get("root")) is str
                    and bool(cache["root"])
                    and cache.get("volatile") is True
                    and type(interval) is int
                    and interval > 0
                )
            except (OSError, ValueError, KeyError, TypeError):
                valid = False
                interval = None
            if not valid:
                raise SystemExit(1)
            print(interval)
            """
        )

    def helper_stub(self):
        return textwrap.dedent(
            """\
            #!/usr/bin/env python3
            import json
            import os
            import sys

            args = sys.argv[1:]
            path = os.environ["HELPER_LOG"]
            try:
                with open(path, encoding="utf-8") as source:
                    count = sum(1 for _ in source) + 1
            except FileNotFoundError:
                count = 1
            with open(path, "a", encoding="utf-8") as log:
                log.write(json.dumps(args) + "\\n")
            fail_on = os.environ.get("HELPER_FAIL_ON_CALL")
            raise SystemExit(1 if fail_on and count >= int(fail_on) else 0)
            """
        )

    def sleep_stub(self):
        return textwrap.dedent(
            """\
            #!/usr/bin/env python3
            import json
            import os
            import signal
            import sys

            with open(os.environ["SLEEP_LOG"], "a", encoding="utf-8") as log:
                log.write(json.dumps(sys.argv[1:]) + "\\n")
            if os.environ.get("SLEEP_MODE") == "interrupt":
                os.kill(os.getppid(), signal.SIGTERM)
                raise SystemExit(0)
            raise SystemExit(int(os.environ.get("SLEEP_EXIT", "0")))
            """
        )

    def forbidden_stub(self, name):
        return textwrap.dedent(
            f"""\
            #!/usr/bin/env python3
            import json
            import os
            import sys

            with open(os.environ["FORBIDDEN_LOG"], "a", encoding="utf-8") as log:
                log.write(json.dumps({name!r}) + "\\n")
            raise SystemExit(97)
            """
        )

    def write_catalog(self, interval):
        self.catalog.write_text(
            json.dumps(
                {
                    "version": 1,
                    "cache": {
                        "root": "/tmp/openclash-guard/device-observations",
                        "volatile": True,
                        "pruneIntervalSeconds": interval,
                    },
                }
            ),
            encoding="utf-8",
        )

    def run_service(self, **extra_env):
        env = {
            "PATH": str(self.bin),
            "JQ_LOG": str(self.jq_log),
            "HELPER_LOG": str(self.helper_log),
            "SLEEP_LOG": str(self.sleep_log),
            "FORBIDDEN_LOG": str(self.forbidden_log),
            **extra_env,
        }
        return subprocess.run(
            ["/bin/sh", str(self.script)],
            env=env,
            text=True,
            capture_output=True,
            timeout=5,
            check=False,
        )

    @staticmethod
    def lines(path):
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

    def test_catalog_interval_drives_fixed_prune_and_failure_stops_loop(self):
        self.write_catalog(7)

        result = self.run_service(HELPER_FAIL_ON_CALL="2")

        self.assertEqual(result.returncode, 1)
        self.assertIn("cache pruning failed; service stopped", result.stderr)
        self.assertEqual(len(self.lines(self.jq_log)), 1)
        self.assertIn("pruneIntervalSeconds", self.lines(self.jq_log)[0][1])
        self.assertEqual(self.lines(self.helper_log), [["prune"], ["prune"]])
        self.assertEqual(self.lines(self.sleep_log), [["7"]])
        self.assertEqual(self.lines(self.forbidden_log), [])

    def test_invalid_catalog_stops_before_prune(self):
        self.write_catalog(0)

        result = self.run_service()

        self.assertEqual(result.returncode, 1)
        self.assertIn("device cache interval is invalid", result.stderr)
        self.assertEqual(len(self.lines(self.jq_log)), 1)
        self.assertEqual(self.lines(self.helper_log), [])
        self.assertEqual(self.lines(self.sleep_log), [])
        self.assertEqual(self.lines(self.forbidden_log), [])

    def test_procd_stop_signal_exits_during_foreground_sleep(self):
        self.write_catalog(11)

        result = self.run_service(SLEEP_MODE="interrupt")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.lines(self.helper_log), [["prune"]])
        self.assertEqual(self.lines(self.sleep_log), [["11"]])
        self.assertEqual(self.lines(self.forbidden_log), [])

    def test_init_tracks_one_foreground_instance_without_respawn(self):
        init = INIT_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("USE_PROCD=1", init)
        self.assertIn('procd_set_param command "$PROG"', init)
        self.assertNotIn("procd_set_param respawn", init)
        self.assertNotRegex(MAINTENANCE_SCRIPT.read_text(encoding="utf-8"), r"(?m)^\s*[^#\n]+&\s*$")


if __name__ == "__main__":
    unittest.main()
