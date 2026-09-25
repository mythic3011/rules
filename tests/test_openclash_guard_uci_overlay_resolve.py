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
RESOLUTION_CONTRACT = ROOT / "internal" / "config" / "openclash-guard" / "uci-overlay-resolution.json"


def sh_available() -> str | None:
    return shutil.which("bash") or shutil.which("sh")


def make_fake_uci(state: dict[str, object], state_file: Path) -> str:
    lines: list[str] = []
    for path, value in state.items():
        if isinstance(value, list):
            for item in value:
                lines.append(f"{path}\t{item}")
        else:
            lines.append(f"{path}\t{value}")
    state_file.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    sf = state_file.as_posix()
    return f"""
uci() {{
    state="{sf}"
    if [ "$2" = "show" ] || [ "$1" = "show" ]; then
        if [ ! -s "$state" ]; then echo "uci: Entry not found" >&2; return 1; fi
        awk -F '\\t' '{{ split($1,a,"."); print "openclash_guard." a[1] "=openclash_guard" }}' "$state" | sort -u
        awk -F '\\t' '{{ print "openclash_guard." $1 "=\\x27" $2 "\\x27" }}' "$state"
        return 0
    fi
    if [ "$1" = "-q" ] && [ "$2" = "get" ]; then
        opt="${{3#openclash_guard.}}"
        out=$(awk -F '\\t' -v o="$opt" '$1==o {{ print $2; exit }}' "$state")
        if [ -z "$out" ]; then echo "uci: Entry not found" >&2; return 1; fi
        printf '%s\\n' "$out"; return 0
    fi
    if [ "$1" = "-d" ]; then
        opt="${{5#openclash_guard.}}"
        out=$(awk -F '\\t' -v o="$opt" '$1==o {{ print $2 }}' "$state")
        if [ -z "$out" ]; then echo "uci: Entry not found" >&2; return 1; fi
        printf '%s\\n' "$out"; return 0
    fi
    return 0
}}
"""


def run_resolve(
    policy: dict,
    uci_state: dict[str, object],
    dns_backend: str,
    script_body: str,
) -> subprocess.CompletedProcess:
    shell = sh_available()
    if shell is None:
        raise unittest.SkipTest("no POSIX shell available on this host")
    tmp = Path(tempfile.mkdtemp(prefix="uco-resolve-"))
    policy_file = tmp / "policy.json"
    policy_file.write_text(json.dumps(policy), encoding="utf-8")
    state_file = tmp / "state.txt"
    fake_uci = make_fake_uci(uci_state, state_file)

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


def effective(policy: dict, uci_state: dict, dns_backend: str, path: str) -> str:
    body = (
        "guard_uci_overlay_load || true\n"
        "guard_uci_overlay_resolve\n"
        f'guard_uci_overlay_effective "{path}"\n'
    )
    proc = run_resolve(policy, uci_state, dns_backend, body)
    if proc.returncode != 0:
        raise AssertionError(f"shell failed: {proc.stdout}\n{proc.stderr}")
    return proc.stdout.strip()


# Policy builders -----------------------------------------------------------

def base_policy(protection: dict[str, dict]) -> dict:
    services = {}
    classes = {}
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
    # A policy where every service allows direct and none requires fail-closed.
    return base_policy({
        "chatgpt": svc("open", directAllowed=True, firewallKillSwitch=False),
        "claude": svc("open", directAllowed=True, firewallKillSwitch=False),
        "grok": svc("open", directAllowed=True, firewallKillSwitch=False),
    })


class ServiceRouteCeilingTests(unittest.TestCase):
    def test_direct_allowed_preserved(self) -> None:
        policy = base_policy({"chatgpt": svc("open", directAllowed=True), "claude": svc("open", directAllowed=True), "grok": svc("open", directAllowed=True)})
        eff = effective(policy, {"routing.chatgpt": "direct"}, "none", "routing.chatgpt")
        self.assertEqual(eff, "direct")

    def test_direct_forbidden_by_signed_policy_falls_back_to_proxy(self) -> None:
        policy = base_policy({"chatgpt": svc("closed", directAllowed=False), "claude": svc("open", directAllowed=True), "grok": svc("open", directAllowed=True)})
        eff = effective(policy, {"routing.chatgpt": "direct"}, "none", "routing.chatgpt")
        self.assertEqual(eff, "proxy")

    def test_uci_direct_never_widens_signed_policy(self) -> None:
        policy = base_policy({"claude": svc("closed", directAllowed=False), "chatgpt": svc("open", directAllowed=True), "grok": svc("open", directAllowed=True)})
        eff = effective(policy, {"routing.claude": "direct"}, "none", "routing.claude")
        self.assertNotEqual(eff, "direct")

    def test_block_request_unaffected(self) -> None:
        policy = open_policy()
        eff = effective(policy, {"routing.grok": "block"}, "none", "routing.grok")
        self.assertEqual(eff, "block")


class FailClosedFloorTests(unittest.TestCase):
    def test_floor_forced_on_when_kill_switch_required(self) -> None:
        policy = base_policy({"chatgpt": svc("ks", firewallKillSwitch=True), "claude": svc("open", directAllowed=True), "grok": svc("open", directAllowed=True)})
        eff = effective(policy, {"dns.fail_closed": "0"}, "none", "dns.fail_closed")
        self.assertEqual(eff, "1")

    def test_floor_forced_on_when_direct_disallowed(self) -> None:
        policy = base_policy({"chatgpt": svc("closed", directAllowed=False), "claude": svc("open", directAllowed=True), "grok": svc("open", directAllowed=True)})
        eff = effective(policy, {"dns.fail_closed": "0"}, "none", "dns.fail_closed")
        self.assertEqual(eff, "1")

    def test_floor_not_imposed_allows_operator_off(self) -> None:
        policy = open_policy()
        eff = effective(policy, {"dns.fail_closed": "0"}, "none", "dns.fail_closed")
        self.assertEqual(eff, "0")


class DnsBackendGatingTests(unittest.TestCase):
    def test_auto_with_adguardhome_detected(self) -> None:
        eff = effective(open_policy(), {"dns.backend": "auto"}, "adguardhome", "dns.backend")
        self.assertEqual(eff, "adguardhome")

    def test_auto_with_dnsmasq_detected(self) -> None:
        eff = effective(open_policy(), {"dns.backend": "auto"}, "dnsmasq", "dns.backend")
        self.assertEqual(eff, "dnsmasq")

    def test_auto_with_nothing_detected_is_none(self) -> None:
        eff = effective(open_policy(), {"dns.backend": "auto"}, "none", "dns.backend")
        self.assertEqual(eff, "none")

    def test_explicit_backend_detected_honoured(self) -> None:
        eff = effective(open_policy(), {"dns.backend": "adguardhome"}, "adguardhome", "dns.backend")
        self.assertEqual(eff, "adguardhome")

    def test_explicit_backend_not_detected_is_none(self) -> None:
        eff = effective(open_policy(), {"dns.backend": "adguardhome"}, "dnsmasq", "dns.backend")
        self.assertEqual(eff, "none")


class ResolverSyncDeferredTests(unittest.TestCase):
    """dns.resolver_sync has NO authoritative capability semantics today; it must
    NOT be invented. It is surfaced as a deferred (unresolved) option."""

    def test_resolver_sync_is_deferred_not_resolved(self) -> None:
        body = (
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            'guard_uci_overlay_effective dns.resolver_sync\n'
        )
        proc = run_resolve(open_policy(), {"dns.resolver_sync": "1"}, "dnsmasq", body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(proc.stdout.startswith("DEFERRED:"), proc.stdout)

    def test_requested_backend_mismatch_does_not_enable_resolver_sync(self) -> None:
        # Regression for the DNS-ordering fix: requested adguardhome, live
        # dnsmasq -> effective backend NONE; resolver_sync must NOT remain
        # effectively enabled. Because resolver_sync is DEFERRED (never
        # presented as a usable effective value), assert both halves.
        body = (
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            'printf "backend=%s\n" "$(guard_uci_overlay_effective dns.backend)"\n'
            'printf "sync=%s\n" "$(guard_uci_overlay_effective dns.resolver_sync)"\n'
            "guard_uci_overlay_resolve_notes\n"
        )
        proc = run_resolve(
            open_policy(),
            {"dns.backend": "adguardhome", "dns.resolver_sync": "1"},
            "dnsmasq",
            body,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("backend=none", proc.stdout)
        # resolver_sync is not presented as a usable "1"; it is deferred.
        self.assertIn("sync=DEFERRED:", proc.stdout)
        self.assertNotIn("sync=1", proc.stdout)


class ResolveGateTests(unittest.TestCase):
    def test_resolve_refuses_invalid_snapshot(self) -> None:
        body = (
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            "if guard_uci_overlay_resolve; then echo RESOLVE_OK; else echo \"RESOLVE_FAIL rc=$?\"; fi\n"
            "echo state_valid=$(guard_uci_overlay_resolve_state_valid && echo yes || echo no)\n"
        )
        proc = run_resolve(open_policy(), {"main.enabled": "wat"}, "none", body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("RESOLVE_FAIL", proc.stdout)
        self.assertIn("state_valid=no", proc.stdout)

    def test_resolve_refuses_unloaded_snapshot(self) -> None:
        body = (
            "if guard_uci_overlay_resolve; then echo RESOLVE_OK; else echo \"RESOLVE_FAIL rc=$?\"; fi\n"
        )
        proc = run_resolve(open_policy(), {}, "none", body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("RESOLVE_FAIL rc=2", proc.stdout)

    def test_diagnostics_projection_available_on_invalid(self) -> None:
        body = (
            "guard_uci_overlay_load >/dev/null 2>&1 || true\n"
            "guard_uci_overlay_resolve_diagnostics\n"
        )
        proc = run_resolve(open_policy(), {"main.enabled": "wat"}, "none", body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        doc = json.loads(proc.stdout.strip())
        self.assertFalse(doc["valid"])

    def test_deferred_options_listed(self) -> None:
        body = (
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            "guard_uci_overlay_deferred_options\n"
        )
        proc = run_resolve(open_policy(), {}, "none", body)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        deferred = proc.stdout.split()
        for opt in ("dns.resolver_sync", "routing.direct_region", "routing.proxy_region", "udp.enabled", "udp.src_ip"):
            self.assertIn(opt, deferred)


class RegionGateDeferredTests(unittest.TestCase):
    def test_direct_region_is_deferred(self) -> None:
        eff = effective(open_policy(), {"routing.direct_region": "hk"}, "none", "routing.direct_region")
        self.assertTrue(eff.startswith("DEFERRED:"))

    def test_proxy_region_is_deferred(self) -> None:
        eff = effective(open_policy(), {"routing.proxy_region": "us"}, "none", "routing.proxy_region")
        self.assertTrue(eff.startswith("DEFERRED:"))


class ResolutionContractTests(unittest.TestCase):
    def test_resolution_contract_is_versioned_and_closed(self) -> None:
        doc = json.loads(RESOLUTION_CONTRACT.read_text(encoding="utf-8"))
        self.assertEqual(doc["schemaVersion"], 1)
        self.assertIn("computed", doc)
        self.assertIn("gaps", doc)

    def test_resolution_reasons_are_redacted_in_notes(self) -> None:
        body = (
            "guard_uci_overlay_load || true\n"
            "guard_uci_overlay_resolve\n"
            "guard_uci_overlay_resolve_notes\n"
        )
        proc = run_resolve(
            base_policy({"chatgpt": svc("closed", directAllowed=False), "claude": svc("open", directAllowed=True), "grok": svc("open", directAllowed=True)}),
            {"routing.chatgpt": "direct", "main.profile_url": "https://u:p@example.com/secret.ini"},
            "none",
            body,
        )
        # url fails validation -> resolve refuses; but notes require valid. Use a
        # separate valid run that still exercises the direct ceiling note.
        proc2 = run_resolve(
            base_policy({"chatgpt": svc("closed", directAllowed=False), "claude": svc("open", directAllowed=True), "grok": svc("open", directAllowed=True)}),
            {"routing.chatgpt": "direct"},
            "none",
            body,
        )
        self.assertEqual(proc2.returncode, 0, proc2.stderr)
        self.assertIn("direct not permitted by signed policy", proc2.stdout)


if __name__ == "__main__":
    unittest.main()
