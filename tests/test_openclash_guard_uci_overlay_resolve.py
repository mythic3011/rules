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
    if [ "$1" = "-q" ] && [ "$2" = "show" ]; then
        awk -F '\\t' '{{ print "openclash_guard." $1 "=" $2 }}' "$state"; return 0
    fi
    if [ "$1" = "-q" ] && [ "$2" = "get" ]; then
        opt="${{3#openclash_guard.}}"
        awk -F '\\t' -v o="$opt" '$1==o {{ print $2; exit }}' "$state"; return 0
    fi
    if [ "$1" = "-d" ]; then
        opt="${{5#openclash_guard.}}"
        awk -F '\\t' -v o="$opt" '$1==o {{ print $2 }}' "$state"; return 0
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
        + "guard_uci_overlay_load || true\n"
        + "guard_uci_overlay_resolve\n"
        + script_body
        + "\n"
    )
    return subprocess.run([shell, "-c", full], capture_output=True, text=True, timeout=60)


def effective(policy: dict, uci_state: dict, dns_backend: str, path: str) -> str:
    proc = run_resolve(policy, uci_state, dns_backend, f'guard_uci_overlay_effective "{path}"\n')
    if proc.returncode != 0:
        raise AssertionError(f"shell failed: {proc.stdout}\n{proc.stderr}")
    return proc.stdout.strip()


# Policy builders -----------------------------------------------------------

def base_policy(protection: dict[str, dict]) -> dict:
    """protection maps service name -> svc() dict with a "class" key."""
    services = {}
    classes = {}
    for name, spec in protection.items():
        cls = spec["class"]
        services[name] = {"protectionClass": cls, "regions": spec.get("regions", [])}
        classes[cls] = {
            "directAllowed": spec.get("directAllowed", True),
            "directRequiresSupportedRegion": spec.get("directRequiresSupportedRegion", False),
            "firewallKillSwitch": spec.get("firewallKillSwitch", False),
            "failMode": spec.get("failMode", "reject"),
        }
    return {
        "schemaVersion": 1,
        "services": services,
        "protectionClasses": classes,
    }


def svc(cls: str, **kw) -> dict:
    out = {"class": cls}
    out.update(kw)
    return out


class ServiceRouteCeilingTests(unittest.TestCase):
    def test_direct_allowed_preserved(self) -> None:
        policy = base_policy({"chatgpt": svc("open", directAllowed=True)})
        eff = effective(policy, {"routing.chatgpt": "direct"}, "unavailable", "routing.chatgpt")
        self.assertEqual(eff, "direct")

    def test_direct_forbidden_by_signed_policy_falls_back_to_proxy(self) -> None:
        policy = base_policy({"chatgpt": svc("closed", directAllowed=False)})
        eff = effective(policy, {"routing.chatgpt": "direct"}, "unavailable", "routing.chatgpt")
        self.assertEqual(eff, "proxy")

    def test_proxy_request_unaffected_by_ceiling(self) -> None:
        policy = base_policy({"claude": svc("closed", directAllowed=False)})
        eff = effective(policy, {"routing.claude": "proxy"}, "unavailable", "routing.claude")
        self.assertEqual(eff, "proxy")

    def test_block_request_unaffected(self) -> None:
        policy = base_policy({"grok": svc("open", directAllowed=True)})
        eff = effective(policy, {"routing.grok": "block"}, "unavailable", "routing.grok")
        self.assertEqual(eff, "block")

    def test_direct_requires_supported_region_gated(self) -> None:
        # directRequiresSupportedRegion true, requested direct_region not in service regions
        policy = base_policy({
            "chatgpt": svc("regional", directAllowed=True, directRequiresSupportedRegion=True, regions=["us", "jp"]),
        })
        # direct_region=hk (valid registry) but hk not in service's signed regions
        eff = effective(policy, {"routing.chatgpt": "direct", "routing.direct_region": "hk"}, "unavailable", "routing.chatgpt")
        self.assertEqual(eff, "proxy")

    def test_direct_requires_supported_region_satisfied(self) -> None:
        policy = base_policy({
            "chatgpt": svc("regional", directAllowed=True, directRequiresSupportedRegion=True, regions=["us", "jp"]),
        })
        eff = effective(policy, {"routing.chatgpt": "direct", "routing.direct_region": "us"}, "unavailable", "routing.chatgpt")
        self.assertEqual(eff, "direct")

    def test_uci_direct_never_widens_signed_policy(self) -> None:
        # signed policy forbids direct -> operator direct request must not win
        policy = base_policy({"claude": svc("closed", directAllowed=False)})
        eff = effective(policy, {"routing.claude": "direct"}, "unavailable", "routing.claude")
        self.assertNotEqual(eff, "direct")


class FailClosedFloorTests(unittest.TestCase):
    def test_floor_forced_on_when_kill_switch_required(self) -> None:
        policy = base_policy({"chatgpt": svc("ks", firewallKillSwitch=True)})
        eff = effective(policy, {"dns.fail_closed": "0"}, "unavailable", "dns.fail_closed")
        self.assertEqual(eff, "1")

    def test_floor_forced_on_when_direct_disallowed(self) -> None:
        policy = base_policy({"chatgpt": svc("closed", directAllowed=False)})
        eff = effective(policy, {"dns.fail_closed": "0"}, "unavailable", "dns.fail_closed")
        self.assertEqual(eff, "1")

    def test_floor_not_imposed_allows_operator_off(self) -> None:
        policy = base_policy({"chatgpt": svc("open", directAllowed=True, firewallKillSwitch=False)})
        eff = effective(policy, {"dns.fail_closed": "0"}, "unavailable", "dns.fail_closed")
        self.assertEqual(eff, "0")

    def test_operator_on_honoured(self) -> None:
        policy = base_policy({"chatgpt": svc("open", directAllowed=True, firewallKillSwitch=False)})
        eff = effective(policy, {"dns.fail_closed": "1"}, "unavailable", "dns.fail_closed")
        self.assertEqual(eff, "1")


class DnsCapabilityGatingTests(unittest.TestCase):
    def _policy(self) -> dict:
        return base_policy({"chatgpt": svc("open", directAllowed=True)})

    def test_auto_with_adguardhome_detected(self) -> None:
        eff = effective(self._policy(), {"dns.backend": "auto"}, "adguardhome", "dns.backend")
        self.assertEqual(eff, "adguardhome")

    def test_auto_with_dnsmasq_detected(self) -> None:
        eff = effective(self._policy(), {"dns.backend": "auto"}, "dnsmasq", "dns.backend")
        self.assertEqual(eff, "dnsmasq")

    def test_auto_with_nothing_detected_is_unavailable(self) -> None:
        eff = effective(self._policy(), {"dns.backend": "auto"}, "unavailable", "dns.backend")
        self.assertEqual(eff, "unavailable")

    def test_explicit_adguardhome_detected_honoured(self) -> None:
        eff = effective(self._policy(), {"dns.backend": "adguardhome"}, "adguardhome", "dns.backend")
        self.assertEqual(eff, "adguardhome")

    def test_explicit_adguardhome_not_live_is_unavailable(self) -> None:
        # requested backend present in UCI but not live -> unavailable, never honoured
        eff = effective(self._policy(), {"dns.backend": "adguardhome"}, "dnsmasq", "dns.backend")
        self.assertEqual(eff, "unavailable")

    def test_explicit_dnsmasq_family_match(self) -> None:
        eff = effective(self._policy(), {"dns.backend": "dnsmasq"}, "dnsmasq-nftset", "dns.backend")
        self.assertEqual(eff, "dnsmasq")

    def test_resolver_sync_honoured_when_capable(self) -> None:
        eff = effective(self._policy(), {"dns.resolver_sync": "1"}, "adguardhome", "dns.resolver_sync")
        self.assertEqual(eff, "1")

    def test_resolver_sync_forced_off_when_no_capable_backend(self) -> None:
        eff = effective(self._policy(), {"dns.resolver_sync": "1"}, "unavailable", "dns.resolver_sync")
        self.assertEqual(eff, "0")


class ResolutionContractTests(unittest.TestCase):
    def test_resolution_contract_is_versioned_and_closed(self) -> None:
        doc = json.loads(RESOLUTION_CONTRACT.read_text(encoding="utf-8"))
        self.assertEqual(doc["schemaVersion"], 1)
        self.assertEqual(
            set(doc["authorities"]),
            {"signed-policy-gated", "signed-policy-floor", "live-capability-gated"},
        )

    def test_resolution_reasons_are_redacted_in_notes(self) -> None:
        # A direct-forbidden resolution must produce a reason with no secrets.
        policy = base_policy({"chatgpt": svc("closed", directAllowed=False)})
        proc = run_resolve(
            policy,
            {"routing.chatgpt": "direct", "main.profile_url": "https://u:p@example.com/secret.ini"},
            "unavailable",
            "guard_uci_overlay_resolve_notes\n",
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        notes = proc.stdout
        self.assertNotIn("example.com", notes)
        self.assertNotIn("secret.ini", notes)
        self.assertIn("direct not permitted by signed policy", notes)


if __name__ == "__main__":
    unittest.main()
