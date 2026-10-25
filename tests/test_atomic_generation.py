from __future__ import annotations

import contextlib
import io
import json
import stat
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
PYTHON_DIR = ROOT / "internal" / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from ai_profiles.models import AdGuardHomeSpec  # noqa: E402
from ai_profiles.upstream_hosts import refresh_upstream_host_snapshot  # noqa: E402
from ai_profiles.writer import atomic_write_text, write_text  # noqa: E402
from internal.python import generate_openclash_guard_release as release_generator  # noqa: E402
from internal.python.generate_openclash_guard_runtime import (  # noqa: E402
    dumps_runtime,
    write_runtime,
)


class AtomicGenerationTest(unittest.TestCase):
    def test_atomic_writer_normalizes_lf_and_preserves_existing_mode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "artifact.json"
            path.write_bytes(b"old\n")
            path.chmod(0o640)

            atomic_write_text(path, "one\r\ntwo\rthree\n")

            self.assertEqual(path.read_bytes(), b"one\ntwo\nthree\n")
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
            self.assertEqual(list(Path(directory).glob(".artifact.json.*.tmp")), [])

    def test_replace_failure_preserves_destination_and_removes_temporary_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "artifact.json"
            path.write_bytes(b"previous\n")

            with patch("ai_profiles.writer.os.replace", side_effect=OSError("replace failed")):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    atomic_write_text(path, "replacement\n")

            self.assertEqual(path.read_bytes(), b"previous\n")
            self.assertEqual(list(Path(directory).glob(".artifact.json.*.tmp")), [])

    def test_fsync_failure_preserves_destination_and_removes_temporary_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "artifact.json"
            path.write_bytes(b"previous\n")

            with patch("ai_profiles.writer.os.fsync", side_effect=OSError("sync failed")):
                with self.assertRaisesRegex(OSError, "sync failed"):
                    atomic_write_text(path, "replacement\n")

            self.assertEqual(path.read_bytes(), b"previous\n")
            self.assertEqual(list(Path(directory).glob(".artifact.json.*.tmp")), [])

    def test_rule_writer_keeps_trimming_behavior_while_publishing_atomically(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "rules.txt"

            write_text(path, "first\r\nsecond\r\n \t")

            self.assertEqual(path.read_bytes(), b"first\nsecond\n")

    def test_runtime_generator_uses_atomic_lf_text(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "runtime.json"
            document = {"label": "東京", "schemaVersion": 1}

            write_runtime(path, document)

            self.assertEqual(path.read_bytes(), dumps_runtime(document).encode("utf-8"))
            self.assertNotIn(b"\r", path.read_bytes())

    def test_release_generator_publishes_deterministic_utf8_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            roles = tuple(release_generator.ROLE_KEYS)
            artifacts = {}
            for role in roles:
                relative = f"artifacts/{role}.bin"
                artifact_path = root / relative
                artifact_path.parent.mkdir(parents=True, exist_ok=True)
                artifact_path.write_bytes(f"{role}\n".encode("ascii"))
                artifacts[role] = SimpleNamespace(path=relative)
            catalog = SimpleNamespace(
                release_sequence=7,
                repository="example/rules",
                release_metadata_path="generated/release.json",
                artifact=artifacts.__getitem__,
            )

            with (
                patch.object(release_generator, "ROOT", root),
                patch.object(release_generator, "load_distribution", return_value=catalog),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                release_generator.main()

            output = root / "generated/release.json"
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["sequence"], 7)
            self.assertNotIn(b"\r", output.read_bytes())

    def test_upstream_snapshot_refresh_uses_atomic_lf_json_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            catalog_dir = Path(directory) / "catalog"
            spec = AdGuardHomeSpec(
                output_file="hosts.txt",
                upstream_snapshot_file="snapshot.json",
                upstream_base_url="https://example.test/lists",
                upstream_lists=("root",),
            )

            path = refresh_upstream_host_snapshot(
                spec,
                catalog_dir=catalog_dir,
                fetch_text=lambda url: "example.test\n",
            )

            self.assertEqual(path, catalog_dir / "sources" / "snapshot.json")
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["rules"][0]["domain"], "example.test")
            self.assertNotIn(b"\r", path.read_bytes())


if __name__ == "__main__":
    unittest.main()
