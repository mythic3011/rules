from __future__ import annotations

import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RULESCTL_PATH = ROOT / "internal" / "python" / "rulesctl.py"
CONFIG_PATH = ROOT / "internal" / "config" / "rulesctl.json"

SPEC = importlib.util.spec_from_file_location("rulesctl", RULESCTL_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load module from {RULESCTL_PATH}")
rulesctl = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rulesctl)


def _argv_files(step: dict[str, Any]) -> list[str]:
    files: list[str] = []
    if "argv" in step:
        for item in step["argv"]:
            if isinstance(item, str) and "/" in item and not item.startswith("-"):
                files.append(item)
    for child in step.get("steps") or []:
        files.extend(_argv_files(child))
    return files


class RulesctlConfigTest(unittest.TestCase):
    def test_runner_does_not_hardcode_generator_or_bundle_paths(self) -> None:
        text = RULESCTL_PATH.read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"generate_\w+\.py", text))
        self.assertNotIn("tools/shbundle.py", text)
        self.assertNotIn("generate_adblock_outputs.py", text)
        self.assertNotIn("export:", text)

    def test_pipeline_config_is_valid_and_paths_exist(self) -> None:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        loaded = rulesctl.load_rulesctl_config(CONFIG_PATH)
        self.assertEqual(loaded["schemaVersion"], 1)
        self.assertEqual(set(config["pipelines"]), {"check", "checkNode", "generate", "refresh"})
        for name, pipeline in config["pipelines"].items():
            self.assertTrue(pipeline, name)
            for step in pipeline:
                for rel in _argv_files(step):
                    path = ROOT / rel
                    self.assertTrue(path.exists(), f"{name}: missing {rel}")
        for rel in config["compilePaths"] + config["doctor"]["paths"]:
            self.assertTrue((ROOT / rel).exists(), rel)

    def test_optional_group_skips_when_requirement_missing(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            ran: list[list[str]] = []

            def fake_run(command: list[str]) -> None:
                ran.append(command)

            original = rulesctl.run
            rulesctl.run = fake_run  # type: ignore[method-assign]
            try:
                notes = rulesctl.run_pipeline(
                    {
                        "schemaVersion": 1,
                        "pipelines": {
                            "generate": [
                                {
                                    "when": {
                                        "which": "definitely-not-a-binary-xyz",
                                        "exists": "missing.bin",
                                    },
                                    "otherwise": "skip",
                                    "skipMessage": "skipped optional tools",
                                    "steps": [{"argv": ["npm", "run", "never"]}],
                                },
                                {"argv": ["{python}", "-c", "pass"]},
                            ]
                        },
                    },
                    "generate",
                    root=base,
                )
            finally:
                rulesctl.run = original  # type: ignore[method-assign]
            self.assertEqual(len(ran), 1)
            self.assertEqual(ran[0][1:], ["-c", "pass"])
            self.assertEqual(notes, ["skipped optional tools"])
