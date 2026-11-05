from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JSON_SH = ROOT / "shell" / "lib" / "json.sh"


class JsonTypedArrayTests(unittest.TestCase):
    def _run(self, document: object, expression: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory(prefix="json-typed-array-") as temp:
            path = Path(temp) / "document.json"
            path.write_text(json.dumps(document), encoding="utf-8")
            return subprocess.run(
                [
                    "/bin/sh",
                    "-c",
                    f'. "{JSON_SH}"; {expression}',
                    "sh",
                    str(path),
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )

    def test_typed_items_preserve_array_and_primitive_types(self) -> None:
        document = {"gaming": {"protectedUdpPorts": [443, 443.0, 4.43e2, "443", True]}}
        result = self._run(
            document,
            'json_array_items_typed "$1" gaming.protectedUdpPorts',
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.splitlines(),
            [
                "0\tnumber\t443",
                "1\tnumber\t443.0",
                "2\tnumber\t443.0",
                "3\tstring\t",
                "4\tboolean\t",
            ],
        )

    def test_typed_items_reject_missing_and_non_array_values(self) -> None:
        cases = [
            {"gaming": {}},
            {"gaming": {"protectedUdpPorts": 443}},
            {"gaming": {"protectedUdpPorts": {"port": 443}}},
            {"gaming": {"protectedUdpPorts": {"0": 443}}},
            {"gaming.protectedUdpPorts": [443]},
            {"gaming": {}, "gaming.protectedUdpPorts": [443]},
        ]

        for document in cases:
            with self.subTest(document=document):
                result = self._run(
                    document,
                    'json_array_items_typed "$1" gaming.protectedUdpPorts',
                )
                self.assertNotEqual(result.returncode, 0)

    def test_typed_items_accept_empty_array_without_claiming_schema_validity(self) -> None:
        result = self._run(
            {"gaming": {"protectedUdpPorts": []}},
            'json_array_items_typed "$1" gaming.protectedUdpPorts',
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_default_flattened_output_is_unchanged(self) -> None:
        document = {"gaming": {"protectedUdpPorts": [443, "443"], "empty": []}}
        result = self._run(
            document,
            'json_load "$1"; printf "%s\\n" "$_JSON_FLAT_DATA"',
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.splitlines(),
            [
                "gaming.protectedUdpPorts.0\t443",
                "gaming.protectedUdpPorts.1\t443",
                "gaming.empty\t[]",
            ],
        )


if __name__ == "__main__":
    unittest.main()
