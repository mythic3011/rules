from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "shell" / "apps" / "openclash-guard" / "uci-overlay.sh"
CONTRACT = ROOT / "internal" / "config" / "openclash-guard" / "uci-runtime-contract.json"
REGIONS = ROOT / "internal" / "config" / "ai-routing" / "catalogs" / "regions.json"

# The module is unwired and external-command-free (uses uci only when present,
# sed/sort/cut/tr from coreutils). We supply a fake `uci` on PATH that serves
# fixture state so the whole suite runs on a bare POSIX shell with no router.


def sh_available() -> str | None:
    return shutil.which("bash") or shutil.which("sh")


def run_module(
    script_body: str,
    uci_state: dict[str, object] | None = None,
    front_fake_uci: bool = True,
) -> subprocess.CompletedProcess:
    """Source the module, optionally front a fake `uci`, run script_body.

    uci_state maps option path (e.g. "main.enabled") to either a scalar string
    or a list of strings (rendered as a UCI list). A fake `uci` shell function
    answers `show`, `get`, and `-d <nl> get` against that state. Pass
    front_fake_uci=False to test the uci-unavailable path (no uci function and
    no system uci on this host, so `command -v uci` fails).
    """
    shell = sh_available()
    if shell is None:
        raise unittest.SkipTest("no POSIX shell available on this host")

    tmp = tempfile.mkdtemp(prefix="uco-test-")
    state_file = Path(tmp) / "state.txt"
    lines: list[str] = []
    for path, value in (uci_state or {}).items():
        if isinstance(value, list):
            for item in value:
                lines.append(f"{path}\t{item}")
        else:
            lines.append(f"{path}\t{value}")
    state_file.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

    fake_uci = f"""
uci() {{
    state="{state_file.as_posix()}"
    if [ "$2" = "show" ] || [ "$1" = "show" ]; then
        # Realistic `uci show openclash_guard`: emits section declarations
        # (openclash_guard.<section>=<type>) AND option lines
        # (openclash_guard.<section>.<option>='<value>'). Exits non-zero with
        # "Entry not found" when the package has no content.
        if [ ! -s "$state" ]; then
            echo "uci: Entry not found" >&2
            return 1
        fi
        # Section declarations (one per distinct section).
        awk -F '\\t' '{{ split($1,a,"."); print "openclash_guard." a[1] "=openclash_guard" }}' "$state" | sort -u
        # Option lines with single-quoted values.
        awk -F '\\t' '{{ print "openclash_guard." $1 "=\\x27" $2 "\\x27" }}' "$state"
        return 0
    fi
    if [ "$1" = "-q" ] && [ "$2" = "get" ]; then
        opt="${{3#openclash_guard.}}"
        out=$(awk -F '\\t' -v o="$opt" '$1==o {{ print $2; exit }}' "$state")
        if [ -z "$out" ]; then
            echo "uci: Entry not found" >&2
            return 1
        fi
        printf '%s\\n' "$out"
        return 0
    fi
    if [ "$1" = "-d" ]; then
        # -d <nl> -q get <path>  (list form)
        opt="${{5#openclash_guard.}}"
        out=$(awk -F '\\t' -v o="$opt" '$1==o {{ print $2 }}' "$state")
        if [ -z "$out" ]; then
            echo "uci: Entry not found" >&2
            return 1
        fi
        printf '%s\\n' "$out"
        return 0
    fi
    return 0
}}
"""
    full_script = (
        "set -eu\n"
        + (fake_uci if front_fake_uci else "")
        + f'. "{MODULE.as_posix()}"\n'
        + script_body
        + "\n"
    )
    return subprocess.run(
        [shell, "-c", full_script],
        capture_output=True,
        text=True,
        timeout=60,
    )


def load_and(script_body: str, uci_state: dict[str, object] | None = None) -> subprocess.CompletedProcess:
    return run_module("guard_uci_overlay_load || true\n" + script_body, uci_state)


def overlay_json(uci_state: dict[str, object] | None = None) -> dict:
    proc = load_and("guard_uci_overlay_json\n", uci_state)
    if proc.returncode != 0:
        raise AssertionError(f"shell failed: rc={proc.returncode}\nstdout={proc.stdout}\nstderr={proc.stderr}")
    return json.loads(proc.stdout.strip())


class OverlayContractParityTests(unittest.TestCase):
    """The shell spec table must not drift from the JSON contract."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
        cls.regions = json.loads(REGIONS.read_text(encoding="utf-8"))
        # Enumerate option paths from the contract, then read each spec field
        # via the module's own field helper (robust to empty defaults).
        paths = sorted(
            f"{section}.{option}"
            for section, sec in cls.contract["sections"].items()
            if section != "rules"
            for option in sec["options"]
        )
        lines = []
        for path in paths:
            lines.append(
                f'printf "%s|%s|%s|%s\\n" "{path}" '
                f'"$(_guard_uci_overlay_type "{path}")" '
                f'"$(_guard_uci_overlay_default "{path}")" '
                f'"$(_guard_uci_overlay_authority "{path}")"'
            )
        lines.append('printf "REGIONS=%s\\n" "$_GUARD_UCI_OVERLAY_REGIONS"')
        lines.append('printf "PRIMARY=%s\\n" "$_GUARD_UCI_OVERLAY_PRIMARY_ORDER"')
        body = "\n".join(lines) + "\n"
        proc = run_module(body)
        if proc.returncode != 0:
            raise AssertionError(f"shell failed: {proc.stderr}")
        cls.shell_rows = {}
        for raw in proc.stdout.splitlines():
            if raw.startswith("REGIONS="):
                cls.shell_regions = raw[len("REGIONS="):].split()
            elif raw.startswith("PRIMARY="):
                cls.shell_primary = raw[len("PRIMARY="):].split()
            elif "|" in raw:
                path, otype, default, auth = raw.split("|")
                cls.shell_rows[path] = (otype, default, auth)

    def test_covers_exactly_contract_options(self) -> None:
        contract_paths = {
            f"{section}.{option}"
            for section, sec in self.contract["sections"].items()
            for option in sec["options"]
            if not section == "rules"  # rules.* deliberately not modeled (contract gap)
        }
        self.assertEqual(set(self.shell_rows), contract_paths)

    def _matches(self, contract_default: str, shell_default: str) -> bool:
        return contract_default == shell_default

    def test_types_and_defaults_match_contract(self) -> None:
        for section, sec in self.contract["sections"].items():
            if section == "rules":
                continue
            for option, spec in sec["options"].items():
                path = f"{section}.{option}"
                self.assertIn(path, self.shell_rows, path)
                otype, default, _auth = self.shell_rows[path]
                self.assertEqual(otype, spec["type"], path)
                self.assertTrue(self._matches(spec.get("default", ""), default), f"{path} default")

    def test_region_catalog_twin_matches_registry(self) -> None:
        registry_ids = sorted(item["id"] for item in self.regions["regions"])
        self.assertEqual(sorted(self.shell_regions), registry_ids)
        self.assertEqual(sorted(self.shell_primary), sorted(self.regions["primaryOrder"]))


class OverlayValidationTests(unittest.TestCase):
    def test_valid_packaged_defaults_parse_clean(self) -> None:
        state = {
            "main.enabled": "1",
            "main.kill_switch": "1",
            "main.dns_kill_switch": "0",
            "udp.enabled": "1",
            "udp.src_ip": ["192.168.1.10", "192.168.1.11"],
        }
        doc = overlay_json(state)["uciOverlay"]
        self.assertTrue(doc["valid"], doc)
        self.assertEqual(doc["errors"], [])
        self.assertEqual(doc["unknownOptions"], [])

    def test_invalid_boolean_rejects(self) -> None:
        for bad in ("wat", "banana", "2", "maybe", "-1"):
            doc = overlay_json({"main.enabled": bad})["uciOverlay"]
            self.assertFalse(doc["valid"], bad)
            self.assertIn("main.enabled", proc_paths(doc), bad)

    def test_invalid_legacy_controls_are_strict(self) -> None:
        # The five effective legacy controls must reject malformed values.
        cases = {
            "main.enabled": "wat",
            "main.kill_switch": "yesno",
            "main.dns_kill_switch": "banana",
            "udp.enabled": "notabool",
        }
        for path, bad in cases.items():
            doc = overlay_json({path: bad})["uciOverlay"]
            self.assertFalse(doc["valid"], path)
            self.assertIn(path, proc_paths(doc), path)

    def test_invalid_udp_src_ip_rejects_whole_option(self) -> None:
        doc = overlay_json({"udp.src_ip": ["192.168.1.10", "not-an-ip", "10.0.0.1"]})["uciOverlay"]
        self.assertFalse(doc["valid"])
        self.assertIn("udp.src_ip", proc_paths(doc))

    def test_udp_src_ip_duplicate_normalization(self) -> None:
        proc = load_and(
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            "guard_uci_overlay_get udp.src_ip\n",
            {"udp.src_ip": ["10.0.0.1", "10.0.0.2", "10.0.0.1"]},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(proc.stdout.strip(), "10.0.0.1 10.0.0.2")

    def test_invalid_enum_rejects(self) -> None:
        doc = overlay_json({"dns.backend": "cloudflare"})["uciOverlay"]
        self.assertFalse(doc["valid"])
        self.assertIn("dns.backend", proc_paths(doc))

    def test_invalid_service_route_mode_rejects(self) -> None:
        doc = overlay_json({"routing.chatgpt": "banana"})["uciOverlay"]
        self.assertFalse(doc["valid"])
        self.assertIn("routing.chatgpt", proc_paths(doc))

    def test_direct_region_full_registry_allowed(self) -> None:
        # hk is a valid registry region but NOT a primaryOrder member; it is a
        # legitimate direct_region and must be accepted.
        doc = overlay_json({"routing.direct_region": "hk"})["uciOverlay"]
        self.assertTrue(doc["valid"], doc)

    def test_proxy_region_restricted_to_primary_order(self) -> None:
        # hk is not in primaryOrder -> proxy_region=hk must reject.
        doc = overlay_json({"routing.proxy_region": "hk"})["uciOverlay"]
        self.assertFalse(doc["valid"])
        self.assertIn("routing.proxy_region", proc_paths(doc))

    def test_proxy_region_valid_primary_member(self) -> None:
        doc = overlay_json({"routing.proxy_region": "us"})["uciOverlay"]
        self.assertTrue(doc["valid"], doc)

    def test_invalid_https_url_rejected_without_echo(self) -> None:
        doc = overlay_json({"main.profile_url": "http://example.com/x.ini"})["uciOverlay"]
        self.assertFalse(doc["valid"])
        self.assertIn("main.profile_url", proc_paths(doc))
        self.assertNotIn("example.com", json.dumps(doc))

    def test_credentials_in_https_url_rejected_and_redacted(self) -> None:
        secret = "https://user:pass@example.com/token.ini"
        doc = overlay_json({"main.profile_url": secret})["uciOverlay"]
        self.assertFalse(doc["valid"])
        blob = json.dumps(doc)
        self.assertNotIn("user:pass", blob)
        self.assertNotIn("example.com", blob)
        self.assertNotIn(secret, blob)

    def test_https_url_with_whitespace_rejected(self) -> None:
        doc = overlay_json({"main.profile_url": "https://example.com/a b.ini"})["uciOverlay"]
        self.assertFalse(doc["valid"])

    def test_unknown_option_ignored_and_reported(self) -> None:
        state = {"main.enabled": "1", "main.totally_unknown_opt": "zzz"}
        doc = overlay_json(state)["uciOverlay"]
        self.assertTrue(doc["valid"], doc)
        unknowns = [entry["option"] for entry in doc["unknownOptions"]]
        self.assertIn("main.totally_unknown_opt", unknowns)

    def test_section_declarations_not_reported_unknown(self) -> None:
        # Realistic `uci show` output includes section declarations
        # (openclash_guard.main=openclash_guard, openclash_guard.routing=routing).
        # These must NOT appear in unknownOptions; only genuine unknown
        # section.option lines must be ignored-and-reported.
        state = {
            "main": "openclash_guard",  # a section declaration line
            "routing": "routing",
            "main.enabled": "1",
            "routing.proxy_region": "us",
            "main.real_unknown": "x",
        }
        doc = overlay_json(state)["uciOverlay"]
        self.assertTrue(doc["valid"], doc)
        unknowns = [entry["option"] for entry in doc["unknownOptions"]]
        self.assertIn("main.real_unknown", unknowns)
        # Section headers themselves must not surface as unknown options.
        self.assertNotIn("main", unknowns)
        self.assertNotIn("routing", unknowns)


class OverlayAvailabilityTests(unittest.TestCase):
    def test_uci_unavailable_is_unavailable_and_invalid(self) -> None:
        # No fake uci (and no system uci on this host): command -v uci fails.
        # The overlay must NOT silently default; it is unavailable+invalid and
        # load returns non-zero. This requires that no real `uci` exists in
        # PATH; skip if one does.
        import shutil as _sh
        if _sh.which("uci") is not None:
            self.skipTest("a real uci is present on PATH")
        proc = run_module(
            "if guard_uci_overlay_load; then echo LOAD_OK; else echo \"LOAD_FAIL rc=$?\"; fi\n"
            "echo valid=$(guard_uci_overlay_valid)\n"
            "echo available=$(guard_uci_overlay_available)\n",
            None,
            front_fake_uci=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("LOAD_FAIL", proc.stdout)
        self.assertIn("valid=0", proc.stdout)
        self.assertIn("available=0", proc.stdout)

    def test_package_absent_is_valid_defaults(self) -> None:
        # Empty package read (no openclash_guard config) is a valid empty
        # config: defaults apply, overlay is valid and available.
        proc = run_module(
            "guard_uci_overlay_load && echo LOAD_OK || echo LOAD_FAIL\n"
            "echo valid=$(guard_uci_overlay_valid)\n"
            "echo available=$(guard_uci_overlay_available)\n"
            "echo enabled=$(guard_uci_overlay_get main.enabled)\n",
            {},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("LOAD_OK", proc.stdout)
        self.assertIn("valid=1", proc.stdout)
        self.assertIn("available=1", proc.stdout)
        self.assertIn("enabled=1", proc.stdout)

    def test_load_fails_and_valid_zero_on_invalid(self) -> None:
        proc = run_module(
            "if guard_uci_overlay_load; then printf 'LOAD_OK\\n'; else printf 'LOAD_FAIL\\n'; fi\n"
            "printf 'VALID=%s\\n' \"$(guard_uci_overlay_valid)\"\n",
            {"main.enabled": "wat"},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("LOAD_FAIL", proc.stdout)
        self.assertIn("VALID=0", proc.stdout)

    def test_defaults_applied_when_absent(self) -> None:
        proc = load_and(
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            "printf 'enabled=%s\\n' \"$(guard_uci_overlay_get main.enabled)\"\n"
            "printf 'proxy=%s\\n' \"$(guard_uci_overlay_get routing.proxy_region)\"\n"
            "printf 'direct=%s\\n' \"$(guard_uci_overlay_get routing.direct_region)\"\n",
            {},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("enabled=1", proc.stdout)
        self.assertIn("proxy=us", proc.stdout)
        self.assertIn("direct=hk", proc.stdout)


def proc_paths(doc: dict) -> list[str]:
    return [entry["option"] for entry in doc["errors"]]


class OverlayLegacyBehaviorTests(unittest.TestCase):
    """Valid legacy configurations must map to the same effective values the
    current scattered readers produce (normalize to canonical 0/1, preserve
    src_ip list)."""

    def test_legacy_main_enabled_variants(self) -> None:
        for raw, expect in (("1", "1"), ("true", "1"), ("yes", "1"), ("0", "0"), ("false", "0")):
            proc = load_and(
                "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
                "guard_uci_overlay_get main.enabled\n",
                {"main.enabled": raw},
            )
            self.assertEqual(proc.returncode, 0, (raw, proc.stderr))
            self.assertEqual(proc.stdout.strip(), expect, raw)

    def test_legacy_kill_switch_default_on(self) -> None:
        proc = load_and(
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            "guard_uci_overlay_get main.kill_switch\n",
            {},
        )
        self.assertEqual(proc.stdout.strip(), "1")

    def test_legacy_dns_kill_switch_default_off(self) -> None:
        proc = load_and(
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            "guard_uci_overlay_get main.dns_kill_switch\n",
            {},
        )
        self.assertEqual(proc.stdout.strip(), "0")

    def test_legacy_udp_enabled_variants(self) -> None:
        for raw, expect in (("1", "1"), ("0", "0"), ("on", "1"), ("off", "0")):
            proc = load_and(
                "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
                "guard_uci_overlay_get udp.enabled\n",
                {"udp.enabled": raw},
            )
            self.assertEqual(proc.returncode, 0, (raw, proc.stderr))
            self.assertEqual(proc.stdout.strip(), expect, raw)


if __name__ == "__main__":
    unittest.main()
