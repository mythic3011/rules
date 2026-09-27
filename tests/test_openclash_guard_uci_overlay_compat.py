"""Compatibility + regression suite for the #124 UCI overlay + resolver.

Task A6: locks in the API CONTRACT of the Layer-A overlay reader
(shell/apps/openclash-guard/uci-overlay.sh) and the Layer-B resolver
(shell/apps/openclash-guard/uci-overlay-resolve.sh) so that:

  * the suite PASSES against the landed modules today (where the landed code
    already matches the contract), AND
  * the suite stays valid once A4's consumer migration is complete (A4
    preserves behaviour, it does not change the contract), AND
  * tests that target a contract edit whose shell-module change is still in
    flight EXPECT THE POST-EDIT contract (see ``UdpAuthorityTargetTests``),
    fail until that edit lands, and call out the dependency explicitly.

The fake-uci + policy-JSON fixture harness is the same style as
tests/test_openclash_guard_uci_overlay.py and
tests/test_openclash_guard_uci_overlay_resolve.py. No real uci, no real
router, no pty; everything runs on a bare POSIX shell.

Coverage (per the #124 acceptance list):

  1. Legacy valid-config equivalence: main.enabled / kill_switch /
     dns_kill_switch / udp.enabled / udp.src_ip produce exactly the values a
     permissive uci_get_bool / list reader would produce, normalized to
     canonical 0/1 and dedup'd (Layer-A passthrough.
  2. Invalid inputs reject: invalid boolean / enum / proxy region / URL /
     IPv4 list still hard-reject (not permissive-typo).
  3. Unknown option ignored + reported, never gains authority.
  4. Enforcement boundaries: UCI cannot widen signed policy (direct-policy
     ceiling), the fail-closed floor cannot be lowered by UCI, and the
     live-capability gate (dns.backend) is honoured.
  5. Invalid overlay => zero nft mutation: the sentinel probe is that the
     guard path that would call nft (guard_kill_apply_batch) sits behind
     main.sh:_guard_require_atomic_overlay_for_apply; we exercise the
     overlay-side invariant (load+resolve fails for invalid overlay, the
     resolved state is NOT valid, effective() refuses for resolved-gated
     options, and resolve_state_valid() is false), which is the exact
     condition under which main.sh's atomicity gate refuses before
     guard_kill_apply_batch. If a guard_cmd_reconcile-level test exists
     (added by a sibling), the overlay-side invariant still holds without
     any main.sh dependency.
  6. Layer-A coherence regression: ABA-stable vs unstable before/after
     fingerprints (no eval, no home-grown parser, no `|| true` hiding).
  7. Resolved-state lifecycle: reload invalidates old resolved state; failed
     resolution leaves no usable effective; effective() refuses resolved-
     gated options before resolution.
  8. Status / doctor redaction semantics: guard_uci_overlay_json and
     resolve_diagnostics never echo URL / credential / token material.
  9. Zero new failures vs the focused baseline (must run clean together
     with tests/test_openclash_guard_uci_overlay.py,
     tests/test_openclash_guard_uci_overlay_resolve.py,
     tests/test_openclash_guard_uci_read_guardrail.py).

POST-A1 contract target
----------------------
The runtime contract (internal/config/openclash-guard/uci-runtime-contract.json
+ uci-overlay-resolution.json) was reclassified by A1: ``udp.enabled`` and
``udp.src_ip`` are authoritative at the ``uci-runtime`` layer (Layer A only;
no Layer-B gate). The landed shell modules have NOT yet been edited:

  * shell/apps/openclash-guard/uci-overlay.sh spec table still tags
    ``udp.enabled|boolean|1|signed-policy-gated`` (and the matching
    ``udp.src_ip|ipv4-list||signed-policy-gated``).

  * shell/apps/openclash-guard/uci-overlay-resolve.sh still keeps
    ``udp.enabled udp.src_ip`` in _GUARD_UCOR_DEFERRED_OPTIONS.

The ``UdpAuthorityTargetTests`` class therefore EXPECTS the post-A1 contract
(udp.* resolve via Layer A only, NOT listed by guard_uci_overlay_deferred_options,
NOT deferred at effective()). These tests will fail until A1's shell edit
lands; that is intentional and documented per the task. Every other class in
this file passes against the currently-landed modules.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OVERLAY = ROOT / "shell" / "apps" / "openclash-guard" / "uci-overlay.sh"
RESOLVE = ROOT / "shell" / "apps" / "openclash-guard" / "uci-overlay-resolve.sh"
JSONLIB = ROOT / "shell" / "lib" / "json.sh"
REGIONS = ROOT / "internal" / "config" / "ai-routing" / "catalogs" / "regions.json"
RUNTIME_CONTRACT = ROOT / "internal" / "config" / "openclash-guard" / "uci-runtime-contract.json"
RESOLUTION_CONTRACT = ROOT / "internal" / "config" / "openclash-guard" / "uci-overlay-resolution.json"


def sh_available() -> str | None:
    return shutil.which("bash") or shutil.which("sh")


# --------------------------------------------------------------------------
# Fake-uci harness: same fixture style as the existing overlay suite, but
# expressed once here so the load-only and load+resolve tests can share it.
# --------------------------------------------------------------------------


def _render_show(state: dict[str, object]) -> str:
    """Byte-faithful `uci show openclash_guard` rendering."""
    def esc(value: str) -> str:
        return "'" + value.replace("'", "'\\''") + "'"

    sections = sorted({str(path).split(".")[0] for path in state})
    out: list[str] = [f"openclash_guard.{s}=openclash_guard" for s in sections]
    for path, value in state.items():
        if isinstance(value, list):
            out.append(f"openclash_guard.{path}=" + " ".join(esc(v) for v in value))
        else:
            out.append(f"openclash_guard.{path}={esc(value)}")
    return "\n".join(out) + ("\n" if out else "")


def make_fake_uci(state: dict[str, object], state_file: Path, show_file: Path) -> str:
    """Compose a fake `uci()` shell function bound to the given state.

    Mirrors the harness in test_openclash_guard_uci_overlay.py exactly: one
    state file holds `path\tvalue` rows (one row per list element), a second
    file holds the byte-faithful `uci show` rendering. Show exits non-zero
    on empty state ("Entry not found"), matching upstream uci behaviour for
    an absent/empty package.
    """
    lines: list[str] = []
    for path, value in state.items():
        if isinstance(value, list):
            for item in value:
                lines.append(f"{path}\t{item}")
        else:
            lines.append(f"{path}\t{value}")
    state_file.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    show_file.write_text(_render_show(state), encoding="utf-8")
    sf = state_file.as_posix()
    hf = show_file.as_posix()
    return f"""
uci() {{
    state="{sf}"
    showfile="{hf}"
    if [ "$2" = "show" ] || [ "$1" = "show" ]; then
        if [ ! -s "$state" ]; then
            echo "uci: Entry not found" >&2
            return 1
        fi
        cat "$showfile"
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


def run_overlay_only(script_body: str, uci_state: dict[str, object] | None = None) -> subprocess.CompletedProcess:
    """Source only the Layer-A overlay module + a fake uci, run script_body."""
    shell = sh_available()
    if shell is None:
        raise unittest.SkipTest("no POSIX shell available on this host")
    tmp = Path(tempfile.mkdtemp(prefix="uco-compat-"))
    state_file = tmp / "state.txt"
    show_file = tmp / "show.txt"
    fake_uci = make_fake_uci(uci_state or {}, state_file, show_file)
    full_script = (
        "set -eu\n"
        + fake_uci
        + f'. "{OVERLAY.as_posix()}"\n'
        + script_body
        + "\n"
    )
    return subprocess.run(
        [shell, "-c", full_script],
        capture_output=True,
        text=True,
        timeout=60,
    )


def run_overlay_and_resolve(
    policy: dict | None,
    uci_state: dict[str, object] | None,
    dns_backend: str,
    script_body: str,
    policy_text: str | None = None,
) -> subprocess.CompletedProcess:
    """Source json.sh + Layer-A overlay + Layer-B resolver, run script_body.

    Caller supplies an in-memory signed-policy dict (or a raw policy_text for
    malformed-JSON tests) and a live DNS observation string. Mirrors the
    harness in test_openclash_guard_uci_overlay_resolve.py.
    """
    shell = sh_available()
    if shell is None:
        raise unittest.SkipTest("no POSIX shell available on this host")
    tmp = Path(tempfile.mkdtemp(prefix="ucor-compat-"))
    policy_file = tmp / "policy.json"
    if policy_text is not None:
        policy_file.write_text(policy_text, encoding="utf-8")
    else:
        policy_file.write_text(json.dumps(policy or {}), encoding="utf-8")
    state_file = tmp / "state.txt"
    show_file = tmp / "show.txt"
    fake_uci = make_fake_uci(uci_state or {}, state_file, show_file)
    full = (
        "set -eu\n"
        + fake_uci
        + f'. "{JSONLIB.as_posix()}"\n'
        + f'. "{OVERLAY.as_posix()}"\n'
        + f'. "{RESOLVE.as_posix()}"\n'
        + f'_GUARD_UCOR_POLICY_FILE="{policy_file.as_posix()}"\n'
        + f'_GUARD_UCOR_DNS_BACKEND="{dns_backend}"\n'
        + script_body
        + "\n"
    )
    return subprocess.run([shell, "-c", full], capture_output=True, text=True, timeout=60)


# Policy builders (identical convention as the resolver suite). -------------


def base_policy(protection: dict[str, dict]) -> dict:
    services: dict[str, dict] = {}
    classes: dict[str, dict] = {}
    for name, spec in protection.items():
        cls = spec["class"]
        services[name] = {"protectionClass": cls, "allowedRegions": spec.get("allowedRegions", [])}
        classes[cls] = {
            "directAllowed": spec.get("directAllowed", True),
            "firewallKillSwitch": spec.get("firewallKillSwitch", False),
            "failMode": spec.get("failMode", "reject"),
        }
    return {"schemaVersion": 1, "services": services, "protectionClasses": classes}


def svc(cls: str, **kw) -> dict:
    out = {"class": cls}
    out.update(kw)
    return out


def open_policy() -> dict:
    return base_policy({
        "chatgpt": svc("open", directAllowed=True, firewallKillSwitch=False),
        "claude": svc("open", directAllowed=True, firewallKillSwitch=False),
        "grok": svc("open", directAllowed=True, firewallKillSwitch=False),
    })


def error_paths(doc: dict) -> list[str]:
    return [entry["option"] for entry in doc.get("errors", [])]


def unknown_paths(doc: dict) -> list[str]:
    return [entry["option"] for entry in doc.get("unknownOptions", [])]


# ==========================================================================
# 1. Legacy valid-config equivalence (permissive -> canonical normalization)
# ==========================================================================


class LegacyValidConfigEquivalenceTests(unittest.TestCase):
    """All the legacy operator knobs a permissive pre-#124 reader would have
    honoured must still surface the same effective values via the overlay,
    normalized to the canonical 0/1 form (and dedup'd for the src_ip list).

    Pre-#124 readers used uci_get_bool (truthy variants) and a direct list
    read for udp.src_ip; the contract preserves that surface while making
    the normal form canonical.
    """

    def _run_get(self, state: dict[str, object], path: str) -> str:
        body = (
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            f'guard_uci_overlay_get "{path}"\n'
        )
        proc = run_overlay_only(body, state)
        if proc.returncode != 0:
            raise AssertionError(f"shell failed: {proc.stdout}\n{proc.stderr}")
        return proc.stdout.strip()

    def test_main_enabled_canonical_variants(self) -> None:
        # Permissive 0/1 truthy and falsy variants all normalize to "1"/"0".
        # NB: a truly empty option value cannot be round-tripped through the
        # real `uci get` (the CLI returns "Entry not found" for empty values);
        # the fallback would be the option default, so the empty case is not
        # a meaningful "permissive 0/1 variant" to lock here.
        for raw, expected in (("1", "1"), ("true", "1"), ("TRUE", "1"),
                              ("yes", "1"), ("on", "1"), ("enabled", "1"),
                              ("0", "0"), ("false", "0"), ("FALSE", "0"),
                              ("no", "0"), ("off", "0"), ("disabled", "0")):
            got = self._run_get({"main.enabled": raw}, "main.enabled")
            self.assertEqual(got, expected, f"raw={raw!r}")

    def test_main_kill_switch_variants(self) -> None:
        for raw, expected in (("1", "1"), ("on", "1"), ("true", "1"),
                              ("0", "0"), ("off", "0"), ("false", "0")):
            got = self._run_get({"main.kill_switch": raw}, "main.kill_switch")
            self.assertEqual(got, expected, f"raw={raw!r}")

    def test_main_dns_kill_switch_variants(self) -> None:
        for raw, expected in (("1", "1"), ("true", "1"), ("yes", "1"),
                              ("0", "0"), ("no", "0"), ("off", "0")):
                got = self._run_get({"main.dns_kill_switch": raw}, "main.dns_kill_switch")
                self.assertEqual(got, expected, f"raw={raw!r}")

    def test_upd_enabled_variants(self) -> None:
        for raw, expected in (("1", "1"), ("on", "1"), ("0", "0"), ("off", "0")):
            got = self._run_get({"udp.enabled": raw}, "udp.enabled")
            self.assertEqual(got, expected, f"raw={raw!r}")

    def test_udp_src_ip_list_preserved_through_normalization(self) -> None:
        state = {"udp.src_ip": ["192.168.10.5", "10.20.30.40", "192.168.10.5"]}
        got = self._run_get(state, "udp.src_ip")
        # Canonical space-separated, dedup'd, order preserved.
        self.assertEqual(got, "192.168.10.5 10.20.30.40")

    def test_udp_src_ip_empty_list_is_empty(self) -> None:
        got = self._run_get({}, "udp.src_ip")
        self.assertEqual(got, "")

    def test_full_legacy_valid_pack_loads_clean(self) -> None:
        state = {
            "main.enabled": "true",
            "main.kill_switch": "1",
            "main.dns_kill_switch": "off",
            "udp.enabled": "on",
            "udp.src_ip": ["10.0.0.5", "10.0.0.7"],
        }
        body = "guard_uci_overlay_load && echo LOAD_OK\nguard_uci_overlay_json\n"
        proc = run_overlay_only(body, state)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("LOAD_OK", proc.stdout)
        # The json line is the second non-empty line.
        for line in proc.stdout.splitlines():
            line = line.strip()
            if not line or line == "LOAD_OK":
                continue
            doc = json.loads(line)["uciOverlay"]
            self.assertTrue(doc["valid"])
            self.assertEqual(doc["errors"], [])
            self.assertEqual(doc["unknownOptions"], [])
            break
        else:
            self.fail("no JSON emitted by guard_uci_overlay_json for a valid pack")


# ==========================================================================
# 2. Invalid inputs still reject (no permissive-typo failure mode)
# ==========================================================================


class InvalidInputsRejectTests(unittest.TestCase):
    """The strict post-#124 validator must reject malformed values for every
    contract-covered option; a permissive typo must NEVER silently widen
    to the operator's intent."""

    def _doc(self, state: dict[str, object]) -> dict:
        body = "guard_uci_overlay_load >/dev/null 2>&1 || true\nguard_uci_overlay_json\n"
        proc = run_overlay_only(body, state)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return json.loads(proc.stdout.strip().splitlines()[-1])["uciOverlay"]

    def test_invalid_boolean_for_runtime_boolean_options(self) -> None:
        for path in ("main.enabled", "main.kill_switch", "main.dns_kill_switch",
                     "udp.enabled", "dns.fail_closed", "dns.resolver_sync"):
            doc = self._doc({path: "banana"})
            self.assertFalse(doc["valid"], path)
            self.assertIn(path, error_paths(doc), path)

    def test_invalid_enum_rejected(self) -> None:
        for path, bad in (
            ("dns.backend", "openwrt-dns"),
            ("main.profile_mode", "local_and_remote"),
            ("main.distribution_source", "cdn"),
            ("monitoring.interval", "120"),
        ):
            doc = self._doc({path: bad})
            self.assertFalse(doc["valid"], path)
            self.assertIn(path, error_paths(doc), path)

    def test_invalid_proxy_region_for_primary_order_only(self) -> None:
        # routing.proxy_region is constrained to primaryOrder regions.
        doc = self._doc({"routing.proxy_region": "hk"})
        self.assertFalse(doc["valid"])
        self.assertIn("routing.proxy_region", error_paths(doc))

        doc_unknown = self._doc({"routing.proxy_region": "narnia"})
        self.assertFalse(doc_unknown["valid"])
        self.assertIn("routing.proxy_region", error_paths(doc_unknown))

    def test_invalid_direct_region_unknown_to_registry(self) -> None:
        doc = self._doc({"routing.direct_region": "narnia"})
        self.assertFalse(doc["valid"])
        self.assertIn("routing.direct_region", error_paths(doc))

    def test_non_https_url_rejected(self) -> None:
        for bad in ("http://example.com/t.ini", "ftp://example.com/x.ini",
                    "example.com/x.ini", "//example.com/x.ini"):
            doc = self._doc({"main.profile_url": bad})
            self.assertFalse(doc["valid"], bad)
            self.assertIn("main.profile_url", error_paths(doc), bad)

    def test_invalid_ipv4_in_udp_src_ip_rejects_whole_option(self) -> None:
        for bad_list in (["10.0.0.1", "not-an-ip", "10.0.0.2"],
                         ["10.0.0.256"],
                         ["10.0.0"],
                         ["-1.0.0.1"]):
            doc = self._doc({"udp.src_ip": bad_list})
            self.assertFalse(doc["valid"], bad_list)
            self.assertIn("udp.src_ip", error_paths(doc), bad_list)

    def test_invalid_service_route_mode_rejected(self) -> None:
        for path in ("routing.chatgpt", "routing.claude", "routing.grok"):
            doc = self._doc({path: "haiku"})
            self.assertFalse(doc["valid"], path)
            self.assertIn(path, error_paths(doc), path)


# ==========================================================================
# 3. Unknown option: ignored and reported, never gains authority
# ==========================================================================


class UnknownOptionHandlingTests(unittest.TestCase):
    """Unknown section.option lines must be ignored-and-reported. They never
    invalidate an otherwise-valid config AND never gain runtime authority
    (the overlay keeps no per-option var for them, so no caller can read
    them)."""

    def test_unknown_option_does_not_invalidate(self) -> None:
        state = {"main.enabled": "1", "main.brand_new_knob": "abcd"}
        proc = run_overlay_only(
            "if guard_uci_overlay_load; then echo LOAD_OK; else echo LOAD_FAIL; fi\n"
            "echo valid=$(guard_uci_overlay_valid)\n"
            "guard_uci_overlay_unknown_options\n",
            state,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("LOAD_OK", proc.stdout)
        self.assertIn("valid=1", proc.stdout)
        self.assertIn("main.brand_new_knob", proc.stdout)

    def test_unknown_option_never_readable_via_get(self) -> None:
        """guard_uci_overlay_get for an unknown path returns empty (no
        authority). Even if uci stored `main.brand_new_knob=zzz`, the overlay
        didn't model it, so `get` for that path must yield an empty
        (unset) per-option variable."""
        state = {"main.enabled": "1", "main.brand_new_knob": "zzz"}
        proc = run_overlay_only(
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            'echo val=[$(guard_uci_overlay_get main.brand_new_knob)]\n'
            'echo raw=[$(guard_uci_overlay_get_raw main.brand_new_knob)]\n',
            state,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("val=[]", proc.stdout)
        self.assertIn("raw=[]", proc.stdout)
        self.assertNotIn("=zzz", proc.stdout)

    def test_unknown_option_coexists_with_known_unknown_option_set(self) -> None:
        state = {
            "main.enabled": "1",
            "main.unknown_a": "x",
            "udp.unknown_b": "y",
            "routing.unknown_c": "z",
        }
        proc = run_overlay_only(
            "guard_uci_overlay_load && echo LOAD_OK\n"
            "guard_uci_overlay_unknown_options\n",
            state,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("LOAD_OK", proc.stdout)
        for opt in ("main.unknown_a", "udp.unknown_b", "routing.unknown_c"):
            self.assertIn(opt, proc.stdout, opt)


# ==========================================================================
# 4. Enforcement boundaries
# ==========================================================================


class EnforcementBoundaryTests(unittest.TestCase):
    """Signed policy and live capability are the authorities; UCI may only
    NARROW, never widen. These regression tests pin the ceilings, floor,
    and live-capability gate. They are the API contract A4 must preserve
    across the consumer migration."""

    def _eff(self, policy: dict, state: dict, dns: str, path: str) -> str:
        body = (
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            f'guard_uci_overlay_effective "{path}"\n'
        )
        proc = run_overlay_and_resolve(policy, state, dns, body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return proc.stdout.strip()

    # --- direct-widening ceiling -------------------------------------

    def test_uci_direct_of_signed_forbidden_service_becomes_proxy(self) -> None:
        policy = base_policy({
            "chatgpt": svc("closed", directAllowed=False),
            "claude": svc("open", directAllowed=True),
            "grok": svc("open", directAllowed=True),
        })
        eff = self._eff(policy, {"routing.chatgpt": "direct"}, "none", "routing.chatgpt")
        self.assertEqual(eff, "proxy")

    def test_uci_block_of_signed_forbidden_service_stays_block(self) -> None:
        # "block" is already narrower than the signed ceiling; UCI can narrow.
        policy = base_policy({
            "chatgpt": svc("closed", directAllowed=False),
            "claude": svc("open", directAllowed=True),
            "grok": svc("open", directAllowed=True),
        })
        eff = self._eff(policy, {"routing.chatgpt": "block"}, "none", "routing.chatgpt")
        self.assertEqual(eff, "block")

    def test_uci_auto_of_signed_forbidden_service_stays_auto(self) -> None:
        policy = base_policy({
            "chatgpt": svc("closed", directAllowed=False),
            "claude": svc("open", directAllowed=True),
            "grok": svc("open", directAllowed=True),
        })
        eff = self._eff(policy, {"routing.chatgpt": "auto"}, "none", "routing.chatgpt")
        # auto is not a direct widening; the gate only demotes "direct".
        self.assertEqual(eff, "auto")

    def test_uci_direct_of_signed_allowed_service_stays_direct(self) -> None:
        eff = self._eff(open_policy(), {"routing.chatgpt": "direct"}, "none", "routing.chatgpt")
        self.assertEqual(eff, "direct")

    # --- fail-closed floor --------------------------------------------

    def test_fail_closed_floor_holds_across_mixed_classes(self) -> None:
        """If ANY class has firewallKillSwitch=true OR directAllowed=false,
        dns.fail_closed resolves to 1 even when the operator asks for 0."""
        cases = (
            {"chatgpt": svc("ks", directAllowed=True, firewallKillSwitch=True)},
            {"chatgpt": svc("nodirect", directAllowed=False, firewallKillSwitch=False)},
            {"chatgpt": svc("both", directAllowed=False, firewallKillSwitch=True)},
        )
        for prot in cases:
            for service in ("claude", "grok"):
                prot.setdefault(service, svc("open", directAllowed=True, firewallKillSwitch=False))
            policy = base_policy(prot)
            eff = self._eff(policy, {"dns.fail_closed": "0"}, "none", "dns.fail_closed")
            self.assertEqual(eff, "1", prot)

    def test_fail_closed_passthrough_when_no_class_forces_it(self) -> None:
        """Open policy: operator value is honoured (floor not imposed)."""
        eff = self._eff(open_policy(), {"dns.fail_closed": "0"}, "none", "dns.fail_closed")
        self.assertEqual(eff, "0")

    # --- live-capability gate (dns.backend) ----------------------------

    def test_dns_backend_auto_to_live(self) -> None:
        eff = self._eff(open_policy(), {"dns.backend": "auto"}, "dnsmasq", "dns.backend")
        self.assertEqual(eff, "dnsmasq")

    def test_dns_backend_explicit_mismatch_is_none(self) -> None:
        # Cannot install capability via UCI preference: none detected -> none.
        eff = self._eff(open_policy(), {"dns.backend": "adguardhome"}, "dnsmasq", "dns.backend")
        self.assertEqual(eff, "none")

    def test_dns_backend_explicit_match_honoured(self) -> None:
        eff = self._eff(open_policy(), {"dns.backend": "adguardhome"}, "adguardhome", "dns.backend")
        self.assertEqual(eff, "adguardhome")

    def test_dns_backend_auto_with_nothing_live_is_none(self) -> None:
        eff = self._eff(open_policy(), {"dns.backend": "auto"}, "none", "dns.backend")
        self.assertEqual(eff, "none")


# ==========================================================================
# 5. Invalid overlay => zero nft mutation (overlay-side sentinel)
# ==========================================================================


class InvalidOverlayZeroNftMutationTests(unittest.TestCase):
    """The atomicity gate in main.sh (`_guard_require_atomic_overlay_for_apply`)
    refuses BEFORE any nft mutation (in particular, before
    `guard_kill_apply_batch`) when the Layer-A overlay is invalid OR when a
    current Layer-B resolution does not exist.

    Because main.sh's wiring is in flight (A3), these tests pin the
    OVERLAY-SIDE invariant that gate depends on:

      guard_cmd_reconcile -> _guard_require_atomic_overlay_for_apply
        requires:
          guard_uci_overlay_validate() succeeds (Layer A)
        AND
          guard_uci_overlay_resolve_state_valid() becomes true via a
          fresh guard_uci_overlay_resolve (Layer B commit)

    Test strategy: load an invalid overlay + valid authority inputs and
    assert the exact gate conditions under which main.sh returns non-zero
    before reaching `guard_kill_apply_batch`. The sentinel is:

      - guard_uci_overlay_valid() prints "0"
      - guard_uci_overlay_validate() returns non-zero
      - guard_uci_overlay_resolve() returns non-zero
      - guard_uci_overlay_resolve_state_valid() returns non-zero
      - guard_uci_overlay_effective() refuses to return a resolved-gated
        value (rc != 0)

    Any one of these failing is an immediate regression: the runtime would
    reach nft with operator-invalid input. We do not import main.sh
    directly here (it depends on many other guard modules); we rely on
    the overlay-side contract, which is the only surface under test here.
    A3's integrate-time test of guard_cmd_reconcile lives separately and
    can depend on this invariant without repeating it.
    """

    def _gate_probe_body(self) -> str:
        return (
            # Simulate exactly what _guard_require_atomic_overlay_for_apply
            # does, without depending on main.sh.
            "if guard_uci_overlay_load >/dev/null 2>&1; then\n"
            "  echo LOAD_OK\n"
            "else\n"
            "  echo LOAD_FAIL\n"
            "fi\n"
            "echo valid=$(guard_uci_overlay_valid)\n"
            "if guard_uci_overlay_validate >/dev/null 2>&1; then\n"
            "  echo VALIDATE_OK\n"
            "else\n"
            "  echo VALIDATE_FAIL\n"
            "fi\n"
            "if guard_uci_overlay_resolve >/dev/null 2>&1; then\n"
            "  echo RESOLVE_OK\n"
            "else\n"
            "  echo RESOLVE_FAIL\n"
            "fi\n"
            "if guard_uci_overlay_resolve_state_valid >/dev/null 2>&1; then\n"
            "  echo STATE_VALID\n"
            "else\n"
            "  echo STATE_INVALID\n"
            "fi\n"
            "if v=$(guard_uci_overlay_effective routing.chatgpt 2>/dev/null); then\n"
            "  echo EFFECTIVE_BYPASSED=$v\n"
            "else\n"
            "  echo EFFECTIVE_REFUSED\n"
            "fi\n"
            "if v=$(guard_uci_overlay_effective dns.fail_closed 2>/dev/null); then\n"
            "  echo FC_BYPASSED=$v\n"
            "else\n"
            "  echo FC_REFUSED\n"
            "fi\n"
            "if v=$(guard_uci_overlay_effective dns.backend 2>/dev/null); then\n"
            "  echo DB_BYPASSED=$v\n"
            "else\n"
            "  echo DB_REFUSED\n"
            "fi\n"
        )

    def test_invalid_overlay_gate_refuses_every_resolved_gated_option(self) -> None:
        proc = run_overlay_and_resolve(
            open_policy(),
            {"main.enabled": "wat"},
            "none",
            self._gate_probe_body(),
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        out = proc.stdout
        # The conditions under which main.sh:_guard_require_atomic_overlay_for_apply
        # returns non-zero BEFORE guard_kill_apply_batch is invoked:
        self.assertIn("LOAD_FAIL", out)
        self.assertIn("valid=0", out)
        self.assertIn("VALIDATE_FAIL", out)
        self.assertIn("RESOLVE_FAIL", out)
        self.assertIn("STATE_INVALID", out)
        # No resolved-gated effective value may bypass the resolution gate:
        for sentinel in ("EFFECTIVE_BYPASSED", "FC_BYPASSED", "DB_BYPASSED"):
            self.assertNotIn(sentinel, out, sentinel)
        for sentinel in ("EFFECTIVE_REFUSED", "FC_REFUSED", "DB_REFUSED"):
            self.assertIn(sentinel, out, sentinel)

    def test_unavailable_policy_blocks_resolution(self) -> None:
        # Valid overlay + a policy file that fails schema sanity -> resolve
        # must refuse (candidate permissive default is exactly the failure
        # mode the gate exists to prevent).
        body = (
            "guard_uci_overlay_load\n"
            "if guard_uci_overlay_resolve >/dev/null 2>&1; then echo RESOLVE_OK; else echo RESOLVE_FAIL; fi\n"
            "echo valid=$(guard_uci_overlay_valid)\n"
            "if guard_uci_overlay_resolve_state_valid >/dev/null 2>&1; then echo STATE_VALID; else echo STATE_INVALID; fi\n"
        )
        proc = run_overlay_and_resolve(
            None,  # policy file is empty / malformed JSON for the resolver
            {"main.enabled": "1"},
            "none",
            body,
            policy_text="",  # empty file
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("RESOLVE_FAIL", proc.stdout)
        self.assertIn("STATE_INVALID", proc.stdout)
        self.assertIn("valid=1", proc.stdout)

    def test_state_becomes_valid_after_load_and_resolve(self) -> None:
        # Sanity: when inputs are valid, the gate's precondition is met.
        body = (
            "guard_uci_overlay_load\n"
            "if guard_uci_overlay_resolve; then echo RESOLVE_OK; else echo RESOLVE_FAIL; fi\n"
            "if guard_uci_overlay_resolve_state_valid; then echo STATE_VALID; else echo STATE_INVALID; fi\n"
        )
        proc = run_overlay_and_resolve(
            open_policy(), {"main.enabled": "1"}, "none", body
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("RESOLVE_OK", proc.stdout)
        self.assertIn("STATE_VALID", proc.stdout)


# ==========================================================================
# 6. Layer-A coherence regression
# ==========================================================================


def _capsule_resolve_with_uci(uci_func_text: str, body: str) -> subprocess.CompletedProcess:
    """Run body with overlay+resolve sourced, but the caller supplies the
    fake uci function verbatim. Used to re-create the ABA flip scenario."""
    shell = sh_available()
    if shell is None:
        raise unittest.SkipTest("no POSIX shell available on this host")
    full = (
        "set -eu\n"
        + uci_func_text
        + f'. "{JSONLIB.as_posix()}"\n'
        + f'. "{OVERLAY.as_posix()}"\n'
        + f'. "{RESOLVE.as_posix()}"\n'
        + body
        + "\n"
    )
    return subprocess.run([shell, "-c", full], capture_output=True, text=True, timeout=60)


class LayerACoherenceRegressionTests(unittest.TestCase):
    """Snapshot coherence: the before/after `uci show` fingerprint pair must
    agree, otherwise the load is rejected. ABA-stable (A->B->A) is the
    known limitation; ABA-stable means the FINAL fingerprint matches the
    INITIAL fingerprint, so the load accepts (no drift observed)."""

    _FLIP_AB_FUNC = (
        "countfile=/tmp/uco-compat-coh.$$; [ -f \"$countfile\" ] || echo 0 > \"$countfile\"\n"
        "trap 'rm -f \"$countfile\"' EXIT\n"
        "uci() {\n"
        "  case \"$1 $2\" in\n"
        "    \"show\"*|\"-q show\")\n"
        "      # Increment ONLY for show-style calls. The populate step between\n"
        "      # the before/after fingerprint captures uses `uci -q get` which\n"
        "      # MUST NOT advance the parity (otherwise before==after lands on\n"
        "      # the same letter and the drift is masked).\n"
        "      c=$(cat \"$countfile\"); c=$((c+1)); echo \"$c\" > \"$countfile\"\n"
        "      if [ $((c % 2)) -eq 1 ]; then\n"
        "        printf 'openclash_guard.main=openclash_guard\\nopenclash_guard.main.enabled=\\x271\\x27\\n'\n"
        "      else\n"
        "        printf 'openclash_guard.main=openclash_guard\\nopenclash_guard.main.enabled=\\x270\\x27\\n'\n"
        "      fi\n"
        "      return 0\n"
        "      ;;\n"
        "    \"-q get\")\n"
        "      if [ \"$3\" = \"openclash_guard.main.enabled\" ]; then echo 1; return 0; fi\n"
        "      echo 'uci: Entry not found' >&2; return 1\n"
        "      ;;\n"
        "  esac\n"
        "  return 1\n"
        "}\n"
    )

    _STABLE_FUNC = (
        "uci() {\n"
        "  case \"$1 $2\" in\n"
        "    \"show\"*|\"-q show\")\n"
        "      printf 'openclash_guard.main=openclash_guard\\nopenclash_guard.main.enabled=\\x271\\x27\\n'\n"
        "      return 0\n"
        "      ;;\n"
        "    \"-q get\")\n"
        "      if [ \"$3\" = \"openclash_guard.main.enabled\" ]; then echo 1; return 0; fi\n"
        "      echo 'uci: Entry not found' >&2; return 1\n"
        "      ;;\n"
        "  esac\n"
        "  return 1\n"
        "}\n"
    )

    _BOTH_SHOW_FAIL_FUNC = (
        "uci() {\n"
        "  case \"$1 $2\" in\n"
        "    \"-q show\")\n"
        "      # Probe (pre-flight availability) succeeds so the module reaches\n"
        "      # the coherence fingerprint step.\n"
        "      printf 'openclash_guard.main=openclash_guard\\nopenclash_guard.main.enabled=\\x271\\x27\\n'\n"
        "      return 0\n"
        "      ;;\n"
        "    \"show\"*)\n"
        "      # BOTH before and after captures fail; `|| true` would have made\n"
        "      # them empty-and-equal and wrongly succeeded.\n"
        "      echo 'uci: I/O error' >&2\n"
        "      return 1\n"
        "      ;;\n"
        "  esac\n"
        "  return 1\n"
        "}\n"
    )

    def test_unstable_generation_rejects_load(self) -> None:
        # A->B across attempts: fingerprint before != fingerprint after on
        # every attempt -> load refuses after bounded retries.
        body = (
            "if guard_uci_overlay_load; then echo LOAD_OK; else echo LOAD_FAIL; fi\n"
            "echo available=$(guard_uci_overlay_available)\n"
        )
        proc = _capsule_resolve_with_uci(self._FLIP_AB_FUNC, body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("LOAD_FAIL", proc.stdout)
        self.assertIn("available=0", proc.stdout)

    def test_stable_generation_accepts_load(self) -> None:
        body = (
            "guard_uci_overlay_load && echo LOAD_OK || echo LOAD_FAIL\n"
            "echo enabled=$(guard_uci_overlay_get main.enabled)\n"
        )
        proc = _capsule_resolve_with_uci(self._STABLE_FUNC, body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("LOAD_OK", proc.stdout)
        self.assertIn("enabled=1", proc.stdout)

    def test_failed_fingerprint_captures_do_not_equal_and_succeed(self) -> None:
        # A `|| true` on the fingerprint capture would have made
        # before=="" and after=="" and wrongly succeeded. The landed code
        # uses explicit exit-status checks (no `|| true`), so this MUST
        # reject the load.
        body = (
            "if guard_uci_overlay_load; then echo LOAD_OK; else echo LOAD_FAIL; fi\n"
            "echo available=$(guard_uci_overlay_available)\n"
        )
        proc = _capsule_resolve_with_uci(self._BOTH_SHOW_FAIL_FUNC, body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("LOAD_FAIL", proc.stdout)
        self.assertIn("available=0", proc.stdout)


# ==========================================================================
# 7. Resolved-state lifecycle
# ==========================================================================


class ResolvedStateLifecycleCompatTests(unittest.TestCase):
    """The resolver maintains an explicit resolved-state flag that is
    invalidated by every Layer-A re-load. Effective() for resolved-gated
    options must NEVER return a stale value. Reload invalidates; failed
    resolution leaves NO usable effective state; effective() refuses to
    answer for resolved-gated options until resolution completes for THIS
    snapshot."""

    def test_reload_invalidates_old_resolved_state(self) -> None:
        policy = base_policy({
            "chatgpt": svc("closed", directAllowed=False),
            "claude": svc("open", directAllowed=True),
            "grok": svc("open", directAllowed=True),
        })
        body = (
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            "echo first=$(guard_uci_overlay_effective routing.chatgpt)\n"
            "guard_uci_overlay_load || true\n"
            "if guard_uci_overlay_resolve_state_valid; then echo STILL_VALID; else echo INVALIDATED; fi\n"
            "if v=$(guard_uci_overlay_effective routing.chatgpt 2>/dev/null); then echo LEAK=$v; else echo REFUSED_AFTER_RELOAD; fi\n"
        )
        proc = run_overlay_and_resolve(
            policy, {"routing.chatgpt": "direct"}, "none", body
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("first=proxy", proc.stdout)
        self.assertIn("INVALIDATED", proc.stdout)
        self.assertIn("REFUSED_AFTER_RELOAD", proc.stdout)
        self.assertNotIn("LEAK=", proc.stdout)
        self.assertNotIn("STILL_VALID", proc.stdout)

    def test_resolution_failure_leaves_no_usable_effective(self) -> None:
        """A failed resolution (e.g. policy unavailable) MUST NOT leave any
        resolved-gated option readable. The contract explicitly requires the
        atomic commit: no partial state, no permissive default."""
        body = (
            '_GUARD_UCOR_POLICY_FILE="/definitely/not/a/policy.json"\n'
            "guard_uci_overlay_load || true\n"
            "if guard_uci_overlay_resolve; then echo RESOLVE_OK; else echo RESOLVE_FAIL; fi\n"
            "if guard_uci_overlay_resolve_state_valid; then echo STATE_VALID; else echo STATE_INVALID; fi\n"
            "for opt in routing.chatgpt routing.claude routing.grok dns.fail_closed dns.backend; do\n"
            "  if v=$(guard_uci_overlay_effective $opt 2>/dev/null); then\n"
            "    echo \"LEAK_$opt=$v\"\n"
            "  else\n"
            "    echo \"REFUSED_$opt\"\n"
            "  fi\n"
            "done\n"
        )
        proc = run_overlay_and_resolve(
            None, {"routing.chatgpt": "direct", "dns.fail_closed": "0"}, "none", body
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("RESOLVE_FAIL", proc.stdout)
        self.assertIn("STATE_INVALID", proc.stdout)
        for opt in ("routing.chatgpt", "routing.claude", "routing.grok",
                    "dns.fail_closed", "dns.backend"):
            self.assertIn(f"REFUSED_{opt}", proc.stdout, opt)
            self.assertNotIn(f"LEAK_{opt}", proc.stdout, opt)

    def test_effective_refuses_resolved_gated_before_resolution(self) -> None:
        """Load-only (no resolve) => resolved-gated options refuse. The
        refusal is hard: rc!=0 AND no value is emitted."""
        body = (
            "guard_uci_overlay_load || true\n"
            "for opt in routing.chatgpt routing.claude routing.grok dns.fail_closed dns.backend; do\n"
            "  if v=$(guard_uci_overlay_effective $opt 2>/dev/null); then\n"
            "    echo \"BYPASSED_$opt=$v\"\n"
            "  else\n"
            "    echo \"REFUSED_$opt\"\n"
            "  fi\n"
            "done\n"
        )
        proc = run_overlay_and_resolve(
            open_policy(),
            {"routing.chatgpt": "proxy", "dns.fail_closed": "0"},
            "none",
            body,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        for opt in ("routing.chatgpt", "routing.claude", "routing.grok",
                    "dns.fail_closed", "dns.backend"):
            self.assertIn(f"REFUSED_{opt}", proc.stdout, opt)
            self.assertNotIn(f"BYPASSED_{opt}", proc.stdout, opt)

    def test_effective_of_resolved_gated_emits_no_value_on_refusal(self) -> None:
        """Refusal must be COMPLETE: no partial value, no fallback to the
        normalized UCI value."""
        policy = base_policy({
            "chatgpt": svc("closed", directAllowed=False),
            "claude": svc("open", directAllowed=True),
            "grok": svc("open", directAllowed=True),
        })
        body = (
            "guard_uci_overlay_load || true\n"
            # Try to read effective BEFORE resolution: must be empty.
            "v=$(guard_uci_overlay_effective routing.chatgpt 2>/dev/null) || v=''\n"
            'echo before=[${v}]\n'
            # Resolve and read after: must equal the signed-policy ceiling result.
            "guard_uci_overlay_resolve\n"
            "echo after=$(guard_uci_overlay_effective routing.chatgpt)\n"
        )
        proc = run_overlay_and_resolve(
            policy, {"routing.chatgpt": "direct"}, "none", body
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("before=[]", proc.stdout)
        self.assertIn("after=proxy", proc.stdout)


# ==========================================================================
# 8. Redaction semantics at overlay + resolve-diagnostics level
# ==========================================================================


class RedactionSemanticsTests(unittest.TestCase):
    """Diagnostics (overlay JSON + resolve diagnostics + resolve notes) must
    NEVER echo URL credentials, tokens, or hostnames that appear in the
    operator's profile_url. Only the constraint NAME and option PATH appear
    in errors/reasons."""

    SECRET_URL = "https://user:supersecrettoken@api.example.com/private/distro.ini"

    def test_overlay_json_redacts_url_value_and_credentials(self) -> None:
        proc = run_overlay_only(
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            "guard_uci_overlay_json\n",
            {"main.profile_url": self.SECRET_URL, "main.enabled": "1"},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        out = proc.stdout
        for fragment in ("user:", "supersecrettoken", "api.example.com",
                         "private/distro.ini", self.SECRET_URL):
            self.assertNotIn(fragment, out, fragment)

    def test_overlay_json_reports_url_error_by_path_only(self) -> None:
        proc = run_overlay_only(
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            "guard_uci_overlay_json\n",
            {"main.profile_url": "http://example.com/x.ini"},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        doc = json.loads(proc.stdout.strip())["uciOverlay"]
        self.assertFalse(doc["valid"])
        self.assertIn("main.profile_url", error_paths(doc))
        # Reason names the constraint, not the URL.
        blob = json.dumps(doc)
        self.assertNotIn("example.com", blob)
        self.assertNotIn("http://", blob)

    def test_resolve_diagnostics_redacts_credentials_in_any_field(self) -> None:
        proc = run_overlay_and_resolve(
            open_policy(),
            {
                "main.profile_url": self.SECRET_URL,
                "main.enabled": "1",
                "routing.chatgpt": "proxy",
            },
            "none",
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve_diagnostics\n",
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        out = proc.stdout
        for fragment in ("user:", "supersecrettoken", "api.example.com",
                         "private/distro.ini", self.SECRET_URL):
            self.assertNotIn(fragment, out, fragment)

    def test_resolve_notes_redact_url_value(self) -> None:
        # Construct a valid, resolved config that still contains a sensitive
        # profile_url (url itself is fine here); ensure notes don't echo it.
        proc = run_overlay_and_resolve(
            open_policy(),
            {
                "main.profile_url": "https://distribution.example.internal/private/feed.ini",
                "routing.chatgpt": "direct",
            },
            "none",
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            "guard_uci_overlay_resolve_notes\n",
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        out = proc.stdout
        # Notes name the constraint and option NAME only.
        self.assertNotIn("distribution.example.internal", out)
        self.assertNotIn("https://", out)
        # The reason line should exist (direct is honoured with an open policy).
        self.assertIn("routing.chatgpt|direct|direct|honoured", out)


# ==========================================================================
# POST-A1 contract target: udp.enabled / udp.src_ip are Layer-A authoritative
# ==========================================================================


class UdpAuthorityTargetTests(unittest.TestCase):
    """udp.enabled / udp.src_ip authority: signed-policy-gated + deferred.

    Review blocker 2 reverted the unapproved A1 ``uci-runtime`` reclass.
    With no defined signed-policy gate, Layer B must NOT invent semantics:
    both options stay ``signed-policy-gated`` in the Layer-A spec table,
    remain in ``_GUARD_UCOR_DEFERRED_OPTIONS``, and ``guard_uci_overlay_effective``
    surfaces them as ``DEFERRED:<normalized>`` (contract gap, never a
    runtime authority).
    """

    def test_udp_options_listed_in_deferred_options(self) -> None:
        body = (
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            "guard_uci_overlay_deferred_options\n"
        )
        proc = run_overlay_and_resolve(open_policy(), {}, "none", body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        deferred = proc.stdout.split()
        self.assertIn("udp.enabled", deferred,
                      "udp.enabled stays signed-policy-gated/deferred (blocker 2)")
        self.assertIn("udp.src_ip", deferred,
                      "udp.src_ip stays signed-policy-gated/deferred (blocker 2)")

    def test_udp_enabled_effective_is_deferred_marker(self) -> None:
        body = (
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            "guard_uci_overlay_effective udp.enabled\n"
        )
        proc = run_overlay_and_resolve(
            open_policy(), {"udp.enabled": "0"}, "none", body
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        # Contract gap: effective surfaces as DEFERRED:<normalized>, never the
        # raw runtime value and never an invented authority.
        self.assertEqual(proc.stdout.strip(), "DEFERRED:0")

    def test_udp_src_ip_effective_is_deferred_marker(self) -> None:
        body = (
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            "guard_uci_overlay_effective udp.src_ip\n"
        )
        proc = run_overlay_and_resolve(
            open_policy(), {"udp.src_ip": ["10.0.0.1", "10.0.0.2", "10.0.0.1"]}, "none", body
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(proc.stdout.strip(), "DEFERRED:10.0.0.1 10.0.0.2")

    def test_overlay_spec_authority_for_udp_is_signed_policy_gated(self) -> None:
        """Layer-A spec table tags udp.* as signed-policy-gated (blocker 2)."""
        body = (
            '_guard_up_enable_auth=$(_guard_uci_overlay_authority "udp.enabled")\n'
            '_guard_up_src_auth=$(_guard_uci_overlay_authority "udp.src_ip")\n'
            'echo udp_enabled_auth=${_guard_up_enable_auth}\n'
            'echo udp_src_ip_auth=${_guard_up_src_auth}\n'
        )
        proc = run_overlay_only(body, {})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("udp_enabled_auth=signed-policy-gated", proc.stdout)
        self.assertIn("udp_src_ip_auth=signed-policy-gated", proc.stdout)


# ==========================================================================
# 9. Cohesion: contract files themselves agree with the post-A1 target.
# ==========================================================================


class ContractParityTargetTests(unittest.TestCase):
    """The runtime contract JSON and the resolution contract JSON were both
    edited by A1 to reflect the post-A1 authority for udp.enabled /
    udp.src_ip. This anchors the docs side so the resolver side has a
    documented target to track."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.runtime = json.loads(RUNTIME_CONTRACT.read_text(encoding="utf-8"))
        cls.resolution = json.loads(RESOLUTION_CONTRACT.read_text(encoding="utf-8"))

    def test_runtime_contract_udp_authority_is_signed_policy_gated(self) -> None:
        udp = self.runtime["sections"]["udp"]["options"]
        self.assertEqual(udp["enabled"]["authority"], "signed-policy-gated")
        self.assertEqual(udp["src_ip"]["authority"], "signed-policy-gated")

    def test_resolution_contract_defers_udp_options(self) -> None:
        gaps = self.resolution["gaps"]["deferred"]
        deferred_paths = {entry["option"] for entry in gaps}
        self.assertIn("udp.enabled", deferred_paths)
        self.assertIn("udp.src_ip", deferred_paths)

    def test_resolution_contract_other_defers_remain(self) -> None:
        gaps = self.resolution["gaps"]["deferred"]
        deferred_paths = {entry["option"] for entry in gaps}
        # Per the contract, these remain deferred (contract gaps un-edited).
        self.assertIn("dns.resolver_sync", deferred_paths)
        self.assertIn("routing.direct_region", deferred_paths)
        self.assertIn("routing.proxy_region", deferred_paths)


if __name__ == "__main__":
    unittest.main()
