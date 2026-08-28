from __future__ import annotations

import importlib.util
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "internal" / "python" / "generate_game_cdn.py"
SPEC = importlib.util.spec_from_file_location("generate_game_cdn", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load module from {MODULE_PATH}")

generate_game_cdn = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generate_game_cdn)


class TestGenerateGameCdn(unittest.TestCase):
    def test_convert_line_full_domain(self) -> None:
        self.assertEqual(
            generate_game_cdn.convert_line("full:example.com"),
            "DOMAIN-SUFFIX,example.com",
        )

    def test_convert_line_full_domain_with_attributes(self) -> None:
        self.assertEqual(
            generate_game_cdn.convert_line("full:store.steampowered.com @cn @attr"),
            "DOMAIN-SUFFIX,store.steampowered.com",
        )

    def test_convert_line_comments_and_empty_lines(self) -> None:
        self.assertEqual(generate_game_cdn.convert_line("# comment line"), "# comment line")
        self.assertEqual(generate_game_cdn.convert_line("   "), "")
        self.assertEqual(generate_game_cdn.convert_line(""), "")

    def test_convert_line_unsupported_formats(self) -> None:
        self.assertEqual(
            generate_game_cdn.convert_line("regexp:^example.*"),
            "# [UNSUPPORTED] regexp:^example.*",
        )
        self.assertEqual(
            generate_game_cdn.convert_line("keyword:steam"),
            "# [UNSUPPORTED] keyword:steam",
        )

    def test_convert_line_plain_string(self) -> None:
        self.assertEqual(generate_game_cdn.convert_line("  example.com  "), "example.com")

    def test_generate_rules(self) -> None:
        upstream_content = (
            "# Header comment\n"
            "\n"
            "full:cdn1.example.com\n"
            "full:cdn2.example.com @cn\n"
            "regexp:.*download.*\n"
        )
        expected = [
            "# Header comment",
            "DOMAIN-SUFFIX,cdn1.example.com",
            "DOMAIN-SUFFIX,cdn2.example.com",
            "# [UNSUPPORTED] regexp:.*download.*",
        ]
        self.assertEqual(generate_game_cdn.generate_rules(upstream_content), expected)

    def test_read_header_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            test_file = Path(temp_dir) / "Game_Download_CDN.list"
            lines = [f"# Line {i}" for i in range(12)]
            test_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

            with patch.object(generate_game_cdn, "OUTPUT_FILE", test_file):
                header = generate_game_cdn.read_header()
                self.assertEqual(len(header), generate_game_cdn.HEADER_LINES)
                self.assertEqual(header, lines[:generate_game_cdn.HEADER_LINES])

    def test_read_header_missing_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            test_file = Path(temp_dir) / "non_existent.list"
            with patch.object(generate_game_cdn, "OUTPUT_FILE", test_file):
                header = generate_game_cdn.read_header()
                self.assertEqual(header, [])

    def test_write_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            test_file = Path(temp_dir) / "subfolder" / "Game_Download_CDN.list"
            header = ["# Header 1", "# Header 2"]
            rules = ["DOMAIN-SUFFIX,example.com", "# [UNSUPPORTED] regexp:test"]

            with patch.object(generate_game_cdn, "OUTPUT_FILE", test_file):
                generate_game_cdn.write_output(header, rules)

            self.assertTrue(test_file.exists())
            content = test_file.read_text(encoding="utf-8")
            expected_content = "# Header 1\n# Header 2\nDOMAIN-SUFFIX,example.com\n# [UNSUPPORTED] regexp:test\n"
            self.assertEqual(content, expected_content)

    def test_download_upstream(self) -> None:
        mock_response = BytesIO(b"full:steam.com\nfull:origin.com")
        mock_response.read = MagicMock(return_value=b"full:steam.com\nfull:origin.com")
        mock_response.__enter__ = MagicMock(return_value=mock_response)
        mock_response.__exit__ = MagicMock(return_value=None)

        with patch("urllib.request.urlopen", return_value=mock_response):
            content = generate_game_cdn.download_upstream()
            self.assertEqual(content, "full:steam.com\nfull:origin.com")

    def test_main(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            test_file = Path(temp_dir) / "Game_Download_CDN.list"
            test_file.write_text("# Header 1\n# Header 2\n", encoding="utf-8")

            mock_response = BytesIO(b"full:steam.com\nregexp:test")
            mock_response.read = MagicMock(return_value=b"full:steam.com\nregexp:test")
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=None)

            with patch("urllib.request.urlopen", return_value=mock_response), \
                 patch.object(generate_game_cdn, "OUTPUT_FILE", test_file):
                generate_game_cdn.main()

            self.assertTrue(test_file.exists())
            content = test_file.read_text(encoding="utf-8")
            self.assertIn("DOMAIN-SUFFIX,steam.com", content)
            self.assertIn("# [UNSUPPORTED] regexp:test", content)


if __name__ == "__main__":
    unittest.main()
