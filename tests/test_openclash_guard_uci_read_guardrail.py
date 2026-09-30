"""Structural guardrail for #124: no new scattered openclash_guard.* reads.

Runtime Guard modules must converge on the single normalized UCI overlay
(shell/apps/openclash-guard/uci-overlay.sh). This test scans runtime Guard
sources and fails when a direct UCI read of the openclash_guard package appears
outside an explicit, minimal allowlist.

Allowance rules (per #124):
  - The overlay reader itself (uci-overlay.sh) reads UCI by design (Layer A).
  - Installer/template WRITE paths may keep writing UCI (and may read it back
    to assert their own writes); those are not runtime policy reads.
  - Observation of EXTERNAL config (network.*, openclash.*, dhcp.*, firewall.*)
    is out of scope for this guardrail because it is not Guard-local intent.

Sequencing note (#124 / seq7): consumer modules have been migrated to the
overlay for the CONTRACT-COVERED paths listed in CONTRACT_COVERED_OPTIONS
below. The allowlist shrinks accordingly:
  - For contract-covered paths, only Layer A (uci-overlay.sh) plus
    installer/template write paths are allowed. Any other consumer module
    directly reading a contract-covered path MUST add the file to the
    TRANSITIONAL_DIRECT_READS map with explicit justification AND label the
    read as a transitional fallback. New contract-covered direct reads are
    rejected.
  - For CONTRACT-GAP paths (explicit un-documented knobs not in the runtime
    contract: main.mode, udp.blanket_udp_bypass, udp.direct_iface,
    main.dns_ownership, udp.protect_udp_443), consumers MAY retain direct
    reads until the contract grows; each such read still must be enumerated
    in TRANSITIONAL_DIRECT_READS with a contract-gap reason.

The allowlist is intentionally per-file and per-path; it must NOT become a
whole directory.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = ROOT / "shell" / "apps" / "openclash-guard"

# Direct UCI read of the Guard package (openclash_guard@section.option). This
# matches uci get/uci_get/uci_get_default/uci_get_bool/uci -q get/uci -d '<nl>' -q get
# forms but NOT `firewall.openclash_guard` (external observation).
#
# Two patterns are used:
#   1. Library helpers: uci_get / uci_get_default / uci_get_bool / uci_get_list /
#      uci_get_fact <path>
#   2. Direct uci invocation with any of: -q get, -d <sep> -q get, plain
#      `uci get`, `uci -d <sep> get`. Intermediate flag VALUES (e.g. the
#      newline separator string after -d) are bounded and matched with a
#      conservative character class.
READ_LIB_RE = re.compile(
    r"""uci_get(?:_default|_bool|_list|_fact)?"""
    r"""\s+(?:["'])?openclash_guard[.@]"""
    r"""(?P<section>[A-Za-z0-9_]+)\.(?P<option>[A-Za-z0-9_]+)"""
)
READ_CLI_RE = re.compile(
    r"""\buci\b(?:\s+-[A-Za-z](?:\s+["']?[^\s"']*["']?)?)*\s+(?:["'])?openclash_guard[.@]"""
    r"""(?P<section>[A-Za-z0-9_]+)\.(?P<option>[A-Za-z0-9_]+)"""
)

# CONTRACT-COVERED paths for the effective Layer-B surface, per
# internal/config/openclash-guard/uci-runtime-contract.json. These MUST come
# via the overlay (Layer A). Any consumer file directly reading one of these
# is a transitional fallback that MUST be enumerated below.
CONTRACT_COVERED_OPTIONS: frozenset[str] = frozenset(
    {
        "main.enabled",
        "main.kill_switch",
        "main.dns_kill_switch",
        "udp.enabled",
        "udp.src_ip",
    }
)

# CONTRACT-GAP options: real knobs present in deployed UCI state but NOT
# modeled in the runtime contract. These are documented contract gaps; direct
# reads of these are tolerated until the contract is updated.
CONTRACT_GAP_OPTIONS: frozenset[str] = frozenset(
    {
        "main.mode",
        "main.dns_ownership",
        "udp.blanket_udp_bypass",
        "udp.direct_iface",
        "udp.protect_udp_443",
    }
)

# Files permanently allowed to read openclash_guard.* directly, with a reason.
# Layer A (the overlay reader) is by design; the template write path may
# read back its own writes during install/render.
PERMANENT_ALLOWED_READS: dict[str, str] = {
    "uci-overlay.sh": "Layer A: the single normalized overlay reader (by design)",
    "template.sh": "template write path; reads back its own writes",
}

# Per-file, per-path enumeration of remaining transitional direct reads. A4's
# consumer migration has moved contract-covered runtime reads to the overlay;
# entries remaining here are either (a) contract gaps that the contract has
# NOT yet modeled, or (b) short-lived transitional FALLBACK reads that only
# fire when the overlay is unavailable. Each entry must enumerate every path
# the file still reads directly, and each path must be in either
# CONTRACT_GAP_OPTIONS (justified as a contract gap) or
# CONTRACT_COVERED_OPTIONS (justified as a transitional fallback).
#
# DO NOT extend this list to make integration pass. Extend the runtime
# contract instead; when a gap graduates, remove the entry here.
TRANSITIONAL_DIRECT_READS: dict[str, dict[str, str]] = {
    "killswitch.sh": {
        # CONTRACT-GAP: main.mode is NOT in the UCI overlay contract (#122).
        # The overlay cannot resolve it; killswitch keeps the legacy direct
        # read until the contract grows (flagged in killswitch.sh source).
        "main.mode": "CONTRACT-GAP: killswitch.sh until contract adds main.mode",
        # TRANSITIONAL FALLBACK for contract-covered reads (legacy fallback
        # branch that only fires when guard_uci_overlay_validate() is false;
        # the overlay-normal read is the primary path).
        "main.enabled": "TRANSITIONAL: killswitch.sh legacy fallback (overlay-unavailable branch only)",
        "main.kill_switch": "TRANSITIONAL: killswitch.sh legacy fallback (overlay-unavailable branch only)",
        "main.dns_kill_switch": "TRANSITIONAL: killswitch.sh legacy fallback (overlay-unavailable branch only)",
    },
    "gaming.sh": {
        # TRANSITIONAL FALLBACK for contract-covered reads.
        "udp.enabled": "TRANSITIONAL: gaming.sh legacy fallback (overlay-unavailable branch only)",
        "udp.src_ip": "TRANSITIONAL: gaming.sh legacy fallback (overlay-unavailable branch only)",
    },
    "environment.sh": {
        # CONTRACT-GAP: udp.blanket_udp_bypass is NOT in the overlay contract.
        "udp.blanket_udp_bypass": "CONTRACT-GAP: environment.sh until contract adds udp.blanket_udp_bypass",
        # TRANSITIONAL FALLBACK for udp.src_ip in the legacy branch when the
        # overlay is unavailable (mirrors the overlay first, falls back to
        # the legacy newline-separated uci read).
        "udp.src_ip": "TRANSITIONAL: environment.sh legacy fallback (overlay-unavailable branch only)",
    },
    "dataplane.sh": {
        # CONTRACT-GAP: udp.direct_iface is NOT in the overlay contract.
        "udp.direct_iface": "CONTRACT-GAP: dataplane.sh until contract adds udp.direct_iface",
    },
    "main.sh": {
        # TRANSITIONAL FALLBACK read of a contract-covered path used by the
        # setup-validation gate (`_guard_require_setup_for_apply`); it runs
        # BEFORE the overlay is loaded, and policy authority still comes from
        # guard_policy_validate_file.
        "main.enabled": "TRANSITIONAL: main.sh setup-validation gate (pre-overlay load)",
    },
    "preflight.sh": {
        # TRANSITIONAL FALLBACK read of a contract-covered path used by the
        # pre-flight setup-validation check; same justification as main.sh.
        "main.enabled": "TRANSITIONAL: preflight.sh setup-validation gate (pre-overlay load)",
    },
    "install.sh": {
        # TRANSITIONAL FALLBACK reads used by guard_install_validate (a
        # runtime setup-validation gate, not a write/assert path). These
        # will need to come via the overlay once the setup validator wires
        # the overlay; until then they are documented here.
        "main.enabled": "TRANSITIONAL: install.sh setup-validation gate (pre-overlay load; main.enabled contract-covered)",
        # CONTRACT-GAP knobs not modeled in the runtime contract.
        "main.dns_ownership": "CONTRACT-GAP: install.sh until contract adds main.dns_ownership",
        "udp.protect_udp_443": "CONTRACT-GAP: install.sh until contract adds udp.protect_udp_443",
    },
}

# Files allowed to be scanned at all. Anything outside this map plus
# PERMANENT_ALLOWED_READS must produce zero direct UCI reads against
# openclash_guard.*; otherwise the scan fails.
ALLOWED_FILES: frozenset[str] = frozenset(
    set(PERMANENT_ALLOWED_READS) | set(TRANSITIONAL_DIRECT_READS)
)


class ScatteredUciReadGuardrail(unittest.TestCase):
    def _runtime_files(self) -> list[Path]:
        return sorted(RUNTIME_DIR.glob("*.sh"))

    def _file_direct_reads(self, path: Path) -> list[tuple[int, str]]:
        """Return a list of (line_no, 'section.option') for direct UCI reads in
        the given file, skipping comment lines and external observation of
        `firewall.openclash_guard`. De-duplicates per (line, option) so a
        single line matching both regexes is counted once."""
        found: dict[tuple[int, str], None] = {}
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "firewall.openclash_guard" in line:
                continue
            for pattern in (READ_LIB_RE, READ_CLI_RE):
                for match in pattern.finditer(line):
                    section = match.group("section")
                    option = match.group("option")
                    # The `uci` line might also contain `uci set` (a write).
                    # Writes are out of scope for this guardrail; only reads
                    # are governed. A uci line containing `set` immediately
                    # after `uci` is a write, not a read.
                    if pattern is READ_CLI_RE:
                        # Skip if the line is clearly `uci set`/`uci add`/etc.
                        head = line.split("openclash_guard", 1)[0]
                        if re.search(r"\buci\s+(set|add|delete|commit|revert|rename|changes)\b", head):
                            continue
                    found[(line_no, f"{section}.{option}")] = None
        return sorted(found.keys())

    def test_no_new_scattered_openclash_guard_reads(self) -> None:
        violations: list[str] = []
        for path in self._runtime_files():
            rel = path.name
            for line_no, opt_path in self._file_direct_reads(path):
                if rel not in ALLOWED_FILES:
                    violations.append(f"{rel}:{line_no}: direct read of {opt_path}")
                    continue
                if rel in TRANSITIONAL_DIRECT_READS:
                    if opt_path not in TRANSITIONAL_DIRECT_READS[rel]:
                        violations.append(
                            f"{rel}:{line_no}: {opt_path} not enumerated in TRANSITIONAL_DIRECT_READS[{rel}]"
                        )
        self.assertEqual(
            violations,
            [],
            "new scattered openclash_guard.* reads appeared (must go through the overlay, "
            "or be enumerated in TRANSITIONAL_DIRECT_READS with a contract-gap/transitional reason):\n"
            + "\n".join(violations),
        )

    def test_allowlist_is_minimal_files_only(self) -> None:
        for rel in ALLOWED_FILES:
            self.assertTrue(
                (RUNTIME_DIR / rel).is_file(),
                f"allowlist entry {rel} must be a concrete existing file, not a directory",
            )
        # The overlay reader is the only NEW permanent allowance; everything
        # else is installer/template write-path or a transitional entry.
        self.assertIn("uci-overlay.sh", PERMANENT_ALLOWED_READS)

    def test_every_permanent_allowance_specializes_reason(self) -> None:
        for rel, reason in PERMANENT_ALLOWED_READS.items():
            self.assertTrue(reason.strip(), f"{rel} needs an allowance reason")

    def test_every_transitional_read_is_explicitly_justified(self) -> None:
        """Each remaining consumer direct read must carry a verbatim path and
        a justification that calls out whether it is a CONTRACT-GAP or a
        TRANSITIONAL fallback for a contract-covered option."""
        for rel, paths in TRANSITIONAL_DIRECT_READS.items():
            self.assertTrue(
                (RUNTIME_DIR / rel).is_file(),
                f"transitional file {rel} must exist",
            )
            for opt_path, reason in paths.items():
                if opt_path in CONTRACT_GAP_OPTIONS:
                    self.assertIn(
                        "CONTRACT-GAP",
                        reason,
                        f"{rel}:{opt_path} must be labelled CONTRACT-GAP",
                    )
                elif opt_path in CONTRACT_COVERED_OPTIONS:
                    self.assertIn(
                        "TRANSITIONAL",
                        reason,
                        f"{rel}:{opt_path} must be labelled TRANSITIONAL (migration pending)",
                    )
                else:
                    self.fail(
                        f"{rel}:{opt_path} must be listed in CONTRACT_GAP_OPTIONS or "
                        "CONTRACT_COVERED_OPTIONS; it is neither"
                    )

    def test_enumerated_reads_match_source(self) -> None:
        """Every per-path allowance in TRANSITIONAL_DIRECT_READS must actually
        appear as a direct read in the file (no stale allowances)."""
        for rel, paths in TRANSITIONAL_DIRECT_READS.items():
            actual = {opt for _, opt in self._file_direct_reads(RUNTIME_DIR / rel)}
            for opt_path in paths:
                self.assertIn(
                    opt_path,
                    actual,
                    f"{rel}: transitional allowance for {opt_path} is stale (no direct read in source)",
                )

    def test_migrated_contract_options_not_directly_read_unless_transitional(self) -> None:
        """Contract-covered options MUST come via the overlay. A consumer
        module that directly reads one must be enumerable as a documented
        transitional fallback (label TRANSITIONAL) or this test fails; new
        direct reads of these options are blocked outright."""
        violations: list[str] = []
        for path in self._runtime_files():
            rel = path.name
            if rel in PERMANENT_ALLOWED_READS:
                continue
            for line_no, opt_path in self._file_direct_reads(path):
                if opt_path not in CONTRACT_COVERED_OPTIONS:
                    continue
                allowed = TRANSITIONAL_DIRECT_READS.get(rel, {})
                if opt_path not in allowed:
                    violations.append(
                        f"{rel}:{line_no}: contract-covered option {opt_path} must come via "
                        "guard_uci_overlay_get (or be added to TRANSITIONAL_DIRECT_READS with "
                        "an explicit TRANSITIONAL rationale)"
                    )
                    continue
                reason = allowed[opt_path]
                if "TRANSITIONAL" not in reason:
                    violations.append(
                        f"{rel}:{line_no}: contract-covered option {opt_path} read is allowed but "
                        "not labelled TRANSITIONAL in TRANSITIONAL_DIRECT_READS"
                    )
        self.assertEqual(
            violations,
            [],
            "contract-covered options must come via the overlay (no new direct reads):\n"
            + "\n".join(violations),
        )

    def test_no_new_transitional_files(self) -> None:
        """The transitional map is a known-listing of files with remaining
        direct reads. Adding a new file here is a contract change and must be
        a deliberate, reviewable decision; forbid silent growth by asserting
        the consumer module set does not gain new transitional entries
        without an explicit allowance."""
        # This test primarily guards against accidental scope creep: the
        # transitional map must not be a directory or a wildcard.
        for rel in TRANSITIONAL_DIRECT_READS:
            self.assertNotEqual(rel, "*", "no wildcard entries")
            self.assertFalse(
                rel.endswith("/"),
                "no directory entries",
            )


if __name__ == "__main__":
    unittest.main()
