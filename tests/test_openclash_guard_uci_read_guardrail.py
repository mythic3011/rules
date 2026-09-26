"""Structural guardrail for #124: no new scattered openclash_guard.* reads.

Runtime Guard modules must converge on the single normalized UCI overlay
(shell/apps/openclash-guard/uci-overlay.sh). This test scans runtime Guard
sources and fails when a direct UCI read of the openclash_guard package appears
outside an explicit, minimal allowlist.

Allowance rules (per #124):
  - The overlay reader itself (uci-overlay.sh) reads UCI by design.
  - Installer/template WRITE paths may keep writing UCI (and may read it back
    to assert their own writes); those are not runtime policy reads.
  - Observation of EXTERNAL config (network.*, openclash.*, dhcp.*, firewall.*)
    is out of scope for this guardrail because it is not Guard-local intent.

The allowlist is intentionally small and per-file; it must NOT become a whole
directory.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = ROOT / "shell" / "apps" / "openclash-guard"

# Direct UCI read of the Guard package (openclash_guard@section.option). This
# matches uci get/uci_get/uci_get_default/uci_get_bool/uci -q get/uci -d ...
# forms but NOT `firewall.openclash_guard` (external observation).
READ_RE = re.compile(
    r"""uci(?:_get(?:_default|_bool|_list|_fact)?|(?:\s+-[\w]|\s+-q|\s+-d)*)"""
    r"""\s+(?:["'])?openclash_guard[.@]""",
    re.VERBOSE,
)

# Files allowed to read openclash_guard.* directly, with a reason. Keep this
# MINIMAL. Each entry is (relative path, reason). Do not add directories.
ALLOWED_READS: dict[str, str] = {
    "uci-overlay.sh": "the single normalized overlay reader (by design)",
    # Below are PRE-#124 legacy reads scheduled for migration to the overlay
    # once the seq6 baseline lands. They are documented here so the guardrail
    # locks the CURRENT state while forbidding any NEW scattered reads.
    "killswitch.sh": "LEGACY (migrate): main.enabled/mode/kill_switch/dns_kill_switch",
    "gaming.sh": "LEGACY (migrate): udp.enabled / udp.src_ip",
    "environment.sh": "LEGACY (migrate): udp.src_ip / udp.blanket_udp_bypass",
    "dataplane.sh": "LEGACY (migrate): udp.direct_iface",
    "main.sh": "LEGACY (migrate): main.enabled",
    "preflight.sh": "LEGACY (migrate): main.enabled",
    "install.sh": "installer write/assert path; reads back its own writes",
    "template.sh": "template write path",
}

# Writes are allowed in installer/template; this guardrail only governs READS.


class ScatteredUciReadGuardrail(unittest.TestCase):
    def _runtime_files(self) -> list[Path]:
        return sorted(RUNTIME_DIR.glob("*.sh"))

    def test_no_new_scattered_openclash_guard_reads(self) -> None:
        violations: list[str] = []
        for path in self._runtime_files():
            rel = path.name
            text = path.read_text(encoding="utf-8")
            for line_no, line in enumerate(text.splitlines(), start=1):
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue
                if "firewall.openclash_guard" in line:
                    # External firewall observation, not a Guard-local read.
                    continue
                if READ_RE.search(line):
                    if rel not in ALLOWED_READS:
                        violations.append(f"{rel}:{line_no}: {stripped}")
        self.assertEqual(
            violations,
            [],
            "new scattered openclash_guard.* reads appeared (must go through the overlay):\n"
            + "\n".join(violations),
        )

    def test_allowlist_is_minimal_files_only(self) -> None:
        for rel in ALLOWED_READS:
            self.assertTrue(
                (RUNTIME_DIR / rel).is_file(),
                f"allowlist entry {rel} must be a concrete existing file, not a directory",
            )
        # The overlay reader is the only NEW allowance; everything else is a
        # documented legacy migration target.
        self.assertIn("uci-overlay.sh", ALLOWED_READS)

    def test_every_allowlisted_file_specializes_reason(self) -> None:
        for rel, reason in ALLOWED_READS.items():
            self.assertTrue(reason.strip(), f"{rel} needs an allowance reason")


if __name__ == "__main__":
    unittest.main()
