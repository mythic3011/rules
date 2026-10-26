from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "apps/luci-app-openclash-guard/root"
HELPER = APP_ROOT / "usr/libexec/openclash-guard-devices"
CATALOG = APP_ROOT / "usr/share/openclash-guard/device-profiles.json"
sys.path.insert(0, str(ROOT / "internal/python"))

from endpoint_device_profiles import build_device_catalog, render_device_catalog  # noqa: E402


class DeviceProfileBackendTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="device-profile-backend-", dir="/tmp")
        self.temp_root = Path(self.temp.name)
        self.cache_dir = self.temp_root / "observations"
        self.bin_dir = self.temp_root / "bin"
        self.bin_dir.mkdir()

        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        catalog["cache"]["root"] = str(self.cache_dir)
        catalog_path = self.temp_root / "share/openclash-guard/device-profiles.json"
        catalog_path.parent.mkdir(parents=True)
        catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
        self.catalog_path = catalog_path

        helper_text = HELPER.read_text(encoding="utf-8")
        helper_text = helper_text.replace(
            "CATALOG_FILE='/usr/share/openclash-guard/device-profiles.json'",
            f"CATALOG_FILE='{catalog_path}'",
            1,
        )
        self.helper = self.temp_root / "openclash-guard-devices"
        self.helper.write_text(helper_text, encoding="utf-8")
        self.helper.chmod(0o755)

        uci = self.bin_dir / "uci"
        uci.write_text(
            "#!/bin/sh\n"
            "case \"$*\" in\n"
            "  *'get openclash_guard_devices.device_1') printf 'device\\n' ;;\n"
            "  *'show openclash_guard_devices') printf 'openclash_guard_devices.device_1=device\\n' ;;\n"
            "  *) exit 1 ;;\n"
            "esac\n",
            encoding="utf-8",
        )
        uci.chmod(0o755)
        self.env = os.environ.copy()
        self.env["PATH"] = f"{self.bin_dir}:{os.environ.get('PATH', os.defpath)}"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def report(self, **overrides: Any) -> dict[str, Any]:
        report: dict[str, Any] = {
            "schema_version": 1,
            "role_catalog_version": 1,
            "platform": "linux",
            "observed_at_ms": int(time.time() * 1000),
            "ttl_ms": 60000,
            "window": {"bucket_ms": 10000, "bucket_count": 6, "freshness": "fresh"},
            "collection_status": "partial",
            "reason_code": "linux_namespace_permission_limited_snapshot",
            "role_suggestions": [
                {"role": "browser", "active_bucket_count": 2, "confidence": "heuristic_low"}
            ],
            "authority": "ADVISORY_ONLY_NO_ROUTING_AUTHORITY",
        }
        report.update(overrides)
        return report

    @staticmethod
    def payload(report: Any) -> bytes:
        return json.dumps(report, separators=(",", ":")).encode("utf-8") + b"\n"

    def run_helper(
        self,
        *arguments: str,
        input_bytes: bytes = b"",
        extra_env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[bytes]:
        env = self.env.copy()
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            [str(self.helper), *arguments],
            input=input_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            check=False,
        )

    def ingest(self, report: Any, *, command: str = "ingest") -> subprocess.CompletedProcess[bytes]:
        return self.run_helper(command, "device_1", input_bytes=self.payload(report))

    def test_packaged_catalog_matches_deterministic_projection(self) -> None:
        self.assertEqual(CATALOG.read_text(encoding="utf-8"), render_device_catalog())

    def test_generator_resolves_profile_catalog_from_an_alternate_root(self) -> None:
        alternate_root = self.temp_root / "fixture-repo"
        for relative in (
            "internal/config/openclash-guard/device-profiles.json",
            "internal/config/openclash-guard/device-role-observation.v1.json",
            "internal/config/ai-routing/catalogs/profile-templates.json",
        ):
            destination = alternate_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)

        self.assertEqual(build_device_catalog(root=alternate_root), build_device_catalog())

    def test_read_only_list_does_not_create_cache_and_shows_missing_observation(self) -> None:
        result = self.run_helper("list")
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertFalse(self.cache_dir.exists())
        document = json.loads(result.stdout)
        self.assertEqual(document, {"version": 1, "devices": [{"id": "device_1", "fresh": False, "observation": None}]})

    def test_ingest_and_list_expose_fresh_advisory_metadata(self) -> None:
        result = self.ingest(self.report())
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        cache_file = self.cache_dir / "device_1.json"
        self.assertEqual(cache_file.stat().st_mode & 0o777, 0o600)

        listed = self.run_helper("list")
        self.assertEqual(listed.returncode, 0, listed.stderr.decode())
        device = json.loads(listed.stdout)["devices"][0]
        self.assertEqual(device["id"], "device_1")
        self.assertIs(device["fresh"], True)
        self.assertEqual(device["observation"]["platform"], "linux")
        self.assertEqual(device["observation"]["collection"], {
            "status": "partial",
            "reason": "linux_namespace_permission_limited_snapshot",
        })
        self.assertEqual(device["observation"]["role_suggestions"][0]["role"], "browser")

    def test_ssh_receiver_requires_the_fixed_original_command(self) -> None:
        report = self.report()
        rejected = self.run_helper(
            "receive",
            "device_1",
            input_bytes=self.payload(report),
            extra_env={"SSH_ORIGINAL_COMMAND": "openclash-guard-role-report-v1 extra"},
        )
        self.assertNotEqual(rejected.returncode, 0)
        self.assertFalse(self.cache_dir.exists())

        accepted = self.run_helper(
            "receive",
            "device_1",
            input_bytes=self.payload(report),
            extra_env={"SSH_ORIGINAL_COMMAND": "openclash-guard-role-report-v1"},
        )
        self.assertEqual(accepted.returncode, 0, accepted.stderr.decode())
        self.assertTrue((self.cache_dir / "device_1.json").is_file())

    def test_ingest_read_timeout_comes_from_projected_receive_policy(self) -> None:
        catalog = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        catalog["reportPolicy"]["receiveTimeoutSeconds"] = 1
        self.catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
        process = subprocess.Popen(
            [str(self.helper), "ingest", "device_1"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self.env,
        )
        assert process.stdin is not None
        process.stdin.write(b"{")
        process.stdin.flush()
        started = time.monotonic()
        try:
            process.wait(timeout=4)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
        elapsed = time.monotonic() - started
        stdout, stderr = process.communicate(timeout=1)
        self.assertNotEqual(process.returncode, 0, stderr.decode() + stdout.decode())
        self.assertGreaterEqual(elapsed, 0.8)
        self.assertLess(elapsed, 3)
        self.assertFalse((self.cache_dir / "device_1.json").exists())

    def test_writable_cache_parent_is_rejected(self) -> None:
        self.temp_root.chmod(0o777)
        try:
            result = self.ingest(self.report())
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(self.cache_dir.exists())
        finally:
            self.temp_root.chmod(0o700)

    def test_real_json_parser_rejects_multiple_roots_scalars_arrays_and_forged_fields(self) -> None:
        good = self.payload(self.report())
        first = self.report()
        forged: list[tuple[str, Any]] = [
            ("forged authority", {**first, "authority": "ROUTING_AUTHORITY"}),
            ("device ID field", {**first, "device_id": "other_device"}),
            ("profile field", {**first, "profile_id": "ini:ai-balanced"}),
            ("apply field", {**first, "apply": True}),
            (
                "active bucket count above window",
                {
                    **first,
                    "role_suggestions": [
                        {"role": "browser", "active_bucket_count": 7, "confidence": "heuristic_low"}
                    ],
                },
            ),
        ]
        self.assertEqual(self.ingest(first).returncode, 0)
        cache_file = self.cache_dir / "device_1.json"
        last_good = cache_file.read_bytes()

        invalid_inputs = [
            ("concatenated objects", good + good),
            ("NDJSON objects", good.rstrip(b"\n") + b"\n" + good),
            ("scalar root", b"true\n"),
            ("array root", b"[]\n"),
            ("expired incoming report", self.payload(self.report(observed_at_ms=int(time.time() * 1000) - 65000))),
            ("older report replay", self.payload(self.report(observed_at_ms=first["observed_at_ms"] - 1))),
            ("same timestamp replay", self.payload(first)),
            *[(label, self.payload(value)) for label, value in forged],
            ("oversize report", b" " * 16385),
        ]
        for label, payload in invalid_inputs:
            with self.subTest(label=label):
                result = self.run_helper("ingest", "device_1", input_bytes=payload)
                self.assertNotEqual(result.returncode, 0, result.stderr.decode())
                self.assertEqual(cache_file.read_bytes(), last_good)

    def test_stale_window_keeps_metadata_but_drops_role_hints(self) -> None:
        stale = self.report(window={"bucket_ms": 10000, "bucket_count": 6, "freshness": "stale"})
        result = self.ingest(stale)
        self.assertEqual(result.returncode, 0, result.stderr.decode())

        listed = self.run_helper("list")
        self.assertEqual(listed.returncode, 0, listed.stderr.decode())
        device = json.loads(listed.stdout)["devices"][0]
        self.assertIs(device["fresh"], False)
        self.assertEqual(device["observation"]["platform"], "linux")
        self.assertEqual(device["observation"]["role_suggestions"], [])

    def test_expired_observation_is_omitted_and_pruned(self) -> None:
        result = self.ingest(self.report())
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        cache_file = self.cache_dir / "device_1.json"
        expired = json.loads(cache_file.read_text(encoding="utf-8"))
        expired["observed_at_ms"] = int(time.time() * 1000) - 65000
        cache_file.write_text(json.dumps(expired), encoding="utf-8")

        listed = self.run_helper("list")
        self.assertEqual(listed.returncode, 0, listed.stderr.decode())
        device = json.loads(listed.stdout)["devices"][0]
        self.assertIs(device["fresh"], False)
        self.assertIsNone(device["observation"])

        pruned = self.run_helper("prune")
        self.assertEqual(pruned.returncode, 0, pruned.stderr.decode())
        self.assertIn(b"pruned 1 expired", pruned.stdout)
        self.assertFalse(cache_file.exists())

    def test_interleaved_ingests_publish_monotonically_under_per_device_lock(self) -> None:
        self.cache_dir.mkdir(mode=0o700)
        blocker = self.cache_dir / ".lock.device_1"
        blocker.mkdir(mode=0o700)
        observed = int(time.time() * 1000)
        older = self.report(observed_at_ms=observed + 4000)
        newer = self.report(observed_at_ms=observed + 5000)

        older_process = subprocess.Popen(
            [str(self.helper), "ingest", "device_1"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self.env,
        )
        newer_process = subprocess.Popen(
            [str(self.helper), "ingest", "device_1"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=self.env,
        )
        assert older_process.stdin is not None and newer_process.stdin is not None
        older_process.stdin.write(self.payload(older))
        older_process.stdin.close()
        newer_process.stdin.write(self.payload(newer))
        newer_process.stdin.close()
        time.sleep(0.25)
        blocker.rmdir()

        older_process.communicate(timeout=5)
        _, newer_stderr = newer_process.communicate(timeout=5)
        self.assertEqual(newer_process.returncode, 0, newer_stderr.decode())
        published = json.loads((self.cache_dir / "device_1.json").read_text(encoding="utf-8"))
        self.assertEqual(published["observed_at_ms"], newer["observed_at_ms"])


if __name__ == "__main__":
    unittest.main()
