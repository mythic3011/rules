from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = ROOT / "shell" / "apps" / "openclash-guard"
OVERLAY_FILE = "uci-overlay.sh"
INSTALL_MARKER_READS = (
    "uci_get_default openclash_guard.main.dns_ownership",
    "uci_get_default openclash_guard.udp.protect_udp_443",
)
READ_FORMS = (
    "uci_get ",
    "uci_get_default ",
    "uci_get_bool ",
    "uci_get_fact ",
    "uci_get_list ",
    "uci -q get ",
    "uci -d ",
    "uci get ",
    "uci show ",
    "uci -q show ",
)


def _is_guard_package_read(line: str) -> bool:
    if "firewall.openclash_guard" in line:
        return False
    has_guard_path = "openclash_guard." in line or "openclash_guard@" in line
    package_show = "uci show openclash_guard" in line or "uci -q show openclash_guard" in line
    return (has_guard_path and any(form in line for form in READ_FORMS)) or package_show


def _is_setup_marker_read(line: str) -> bool:
    return any(marker in line for marker in INSTALL_MARKER_READS)


class ScatteredUciReadGuardrail(unittest.TestCase):
    def test_runtime_reads_use_the_normalized_overlay(self) -> None:
        violations: list[str] = []
        marker_reads: list[str] = []
        for path in sorted(RUNTIME_DIR.glob("*.sh")):
            for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                code = line.strip()
                if not code or code.startswith("#") or not _is_guard_package_read(code):
                    continue
                if path.name == OVERLAY_FILE:
                    continue
                if path.name == "install.sh" and _is_setup_marker_read(code):
                    marker_reads.extend(marker for marker in INSTALL_MARKER_READS if marker in code)
                    continue
                violations.append(f"{path.name}:{line_number}: {code}")

        self.assertEqual(
            violations,
            [],
            "Guard-local UCI policy reads must use the normalized overlay; only the two Setup markers may remain direct reads:\n"
            + "\n".join(violations),
        )
        self.assertCountEqual(
            marker_reads,
            list(INSTALL_MARKER_READS),
        )

    def test_read_detection_uses_bounded_literal_forms(self) -> None:
        self.assertTrue(_is_guard_package_read('value=$(uci_get_default openclash_guard.main.enabled 1)'))
        self.assertTrue(_is_guard_package_read('value=$(uci -q get "openclash_guard.main.enabled")'))
        self.assertTrue(_is_guard_package_read('value=$(uci show openclash_guard)'))
        self.assertFalse(_is_guard_package_read('value=$(uci_get_default firewall.openclash_guard.path "")'))
        self.assertFalse(_is_guard_package_read('uci_set openclash_guard.main.enabled 1'))


if __name__ == "__main__":
    unittest.main()
