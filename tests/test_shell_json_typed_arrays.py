from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JSON_SH = ROOT / "shell" / "lib" / "json.sh"


class JsonTypedArrayTests(unittest.TestCase):
    def _run_raw(
        self, document: str, expression: str
    ) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory(prefix="json-typed-array-") as temp:
            path = Path(temp) / "document.json"
            path.write_text(document, encoding="utf-8")
            script = f'''
set -eu
. "{JSON_SH}"
{expression}
'''
            return subprocess.run(
                ["/bin/sh", "-c", script, "sh", str(path)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
                env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "JSON_FORCE_AWK": "1"},
            )

    def test_typed_items_report_structural_type_and_raw_numbers(self) -> None:
        result = self._run_raw(
            '{"gaming":{"protectedUdpPorts":[443,4.43e2,"50000",true,null,{},[]]}}',
            'json_array_items_typed "$1" gaming.protectedUdpPorts',
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout,
            "0\tnumber\t443\n"
            "1\tnumber\t4.43e2\n"
            "2\tstring\t\n"
            "3\tboolean\t\n"
            "4\tnull\t\n"
            "5\tobject\t\n"
            "6\tarray\t\n",
        )

    def test_typed_items_do_not_follow_dotted_key_spoofs(self) -> None:
        result = self._run_raw(
            '{"gaming.protectedUdpPorts":[443]}',
            'json_array_items_typed "$1" gaming.protectedUdpPorts',
        )

        self.assertNotEqual(result.returncode, 0)

    def test_typed_items_reject_duplicate_or_escaped_object_keys(self) -> None:
        documents = (
            '{"gaming":{"protectedUdpPorts":[443]},"gaming":{}}',
            '{"gaming":{"protectedUdpPorts":[443],"protectedUdpPorts":[]}}',
            r'{"gaming":{"protectedUdpPorts":[443]},"gam\u0069ng":{}}',
            r'{"gaming":{"protectedUdpPorts":[443],"protectedUdp\u0050orts":[]}}',
        )
        for document in documents:
            with self.subTest(document=document):
                result = self._run_raw(
                    document,
                    'json_array_items_typed "$1" gaming.protectedUdpPorts',
                )
                self.assertNotEqual(result.returncode, 0)

    def test_default_flattened_list_output_is_unchanged(self) -> None:
        result = self._run_raw(
            '{"gaming":{"protectedUdpPorts":[443,"443"],"empty":[]}}',
            'json_list "$1" gaming.protectedUdpPorts',
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "443\n443\n")


if __name__ == "__main__":
    unittest.main()
