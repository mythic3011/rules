from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "internal" / "python" / "generate_openclash_guard_resolver_sync_data.py"
GENERATED = ROOT / "internal" / "generated" / "ai-routing" / "openclash-guard-resolver-sync-data.sh"

spec = importlib.util.spec_from_file_location("resolver_sync_data_generator", GENERATOR)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ResolverSyncDataGeneratorTests(unittest.TestCase):
    def test_committed_generated_module_matches_source(self) -> None:
        self.assertEqual(GENERATED.read_text(encoding="utf-8"), module.render())

    def test_duplicate_selector_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rules"
            path.write_text(
                "\n".join(
                    [
                        module.HEADER,
                        "source sample owner/repo " + "a" * 40,
                        "selector chatgpt suffix openai.com",
                        "selector chatgpt suffix openai.com",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "duplicate selector"):
                module.parse_source(path)

    def test_selected_and_excluded_service_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rules"
            path.write_text(
                "\n".join(
                    [
                        module.HEADER,
                        "source sample owner/repo " + "b" * 40,
                        "selector chatgpt suffix openai.com",
                        "exclude chatgpt path-scope-expansion",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "both selected and excluded"):
                module.parse_source(path)

    def test_supported_services_must_be_selected_or_explicitly_excluded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rules"
            path.write_text(
                "\n".join(
                    [
                        module.HEADER,
                        "source sample owner/repo " + "c" * 40,
                        "selector chatgpt suffix openai.com",
                        "selector claude suffix claude.ai",
                        "selector poe suffix poe.com",
                        "selector windsurf suffix windsurf.com",
                        "selector huggingface suffix huggingface.co",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "coverage is incomplete: flow-music"):
                module.parse_source(path)

    def test_generated_multiline_literal_never_contains_unescaped_single_quote(self) -> None:
        rendered = module.render()
        self.assertIn("_GUARD_RESOLVER_SYNC_DATA_SELECTORS='chatgpt suffix ai.com", rendered)
        self.assertIn("huggingface suffix huggingface.co'", rendered)
        self.assertNotIn("eval ", rendered)


if __name__ == "__main__":
    unittest.main()
