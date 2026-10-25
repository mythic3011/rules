from __future__ import annotations

import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DNS_SH = ROOT / "shell" / "apps" / "openclash-guard" / "dns.sh"
RESOLVER_SYNC = ROOT / "shell" / "apps" / "openclash-guard" / "resolver-sync.sh"
ENV_SH = ROOT / "shell" / "apps" / "openclash-guard" / "environment.sh"
MAIN_SH = ROOT / "shell" / "apps" / "openclash-guard" / "main.sh"


class DnsBypassDiagnosticsTests(unittest.TestCase):
    def _run_detector(self, forward: str, dstnat: str, *, fail_dstnat: bool = False) -> dict[str, str]:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            nft = tmp_path / "nft"
            nft.write_text(
                """#!/bin/sh
case "$*" in
  "-a list chain inet fw4 forward_lan")
    printf '%s\\n' "$NFT_TEST_FORWARD"
    ;;
  "-a list chain inet fw4 dstnat")
    [ "$NFT_TEST_FAIL_DSTNAT" = 1 ] && exit 1
    printf '%s\\n' "$NFT_TEST_DSTNAT"
    ;;
  *) exit 1 ;;
esac
""",
                encoding="utf-8",
            )
            nft.chmod(0o755)
            script = textwrap.dedent(
                f"""\
                set -eu
                PATH={tmp_path}:$PATH
                . {RESOLVER_SYNC}
                . {DNS_SH}
                guard_dns_detect_firewall_bypasses
                printf '%s\n' \\
                  "available=$_GUARD_DNS_BYPASS_AVAILABLE" \\
                  "detected=$_GUARD_DNS_BYPASS_DETECTED" \\
                  "rules=$_GUARD_DNS_BYPASS_RULES" \\
                  "port53rules=$_GUARD_DNS_BYPASS_PORT53_RULES" \\
                  "dot853rules=$_GUARD_DNS_BYPASS_DOT853_RULES" \\
                  "hijackrules=$_GUARD_DNS_HIJACK_BYPASS_RULES" \\
                  "unknown=$_GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES" \\
                  "unknownports=$_GUARD_DNS_BYPASS_UNKNOWN_DPORT_RULES" \\
                  "count=$_GUARD_DNS_BYPASS_CLIENT_COUNT" \\
                  "clients=$_GUARD_DNS_BYPASS_CLIENTS" \\
                  "port53=$_GUARD_DNS_BYPASS_PORT53" \\
                  "dot853=$_GUARD_DNS_BYPASS_DOT853" \\
                  "hijack53=$_GUARD_DNS_HIJACK_BYPASS"
                """
            )
            result = subprocess.run(
                ["sh", "-c", script],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=True,
                env={
                    **os.environ,
                    "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
                    "NFT_TEST_FORWARD": forward,
                    "NFT_TEST_DSTNAT": dstnat,
                    "NFT_TEST_FAIL_DSTNAT": "1" if fail_dstnat else "0",
                },
            )
        return dict(line.split("=", 1) for line in result.stdout.splitlines())

    def _run_doctor(
        self,
        *,
        available: str,
        count: str = "0",
        clients: str = "",
        port53: str = "0",
        dot853: str = "0",
        hijack53: str = "0",
        detected: str | None = None,
        rules: str | None = None,
        port53_rules: str | None = None,
        dot853_rules: str | None = None,
        hijack_rules: str | None = None,
        unknown_sources: str = "0",
        unknown_dports: str = "0",
    ) -> subprocess.CompletedProcess[str]:
        if detected is None:
            detected = "1" if count != "0" or port53 != "0" or dot853 != "0" or hijack53 != "0" else "0"
        if rules is None:
            rules = "1" if detected == "1" else "0"
        if port53_rules is None:
            port53_rules = port53
        if dot853_rules is None:
            dot853_rules = dot853
        if hijack_rules is None:
            hijack_rules = hijack53
        main_text = MAIN_SH.read_text(encoding="utf-8")
        start = main_text.index("guard_cmd_doctor() {")
        end = main_text.index("\nguard_cmd_geo() {", start)
        doctor_function = main_text[start:end]
        script = textwrap.dedent(
            f"""\
            set -eu
            _GUARD_JSON=0
            _GUARD_DNS_BACKEND=none
            _GUARD_DNS_DOMAIN_SET=dnsmasq-nftset

            guard_cmd_status() {{ :; }}
            guard_policy_needs_failclosed() {{ return 1; }}
            cli_section() {{ :; }}
            cli_kv() {{ :; }}
            cli_error() {{ printf 'ERROR:%s\\n' "$*"; }}
            cli_warn() {{ printf 'WARN:%s\\n' "$*"; }}
            cli_info() {{ printf 'INFO:%s\\n' "$*"; }}
            guard_env_get() {{
                case ${{1:-}} in
                    dns.dnsmasqEnabled|dns.dnsmasqRunning|dns.adguardhomeEnabled|dns.adguardhomeRunning)
                        printf '0\\n'
                        ;;
                    dns.clientBypass.available) printf '%s\\n' '{available}' ;;
                    dns.clientBypass.detected) printf '%s\\n' '{detected}' ;;
                    dns.clientBypass.rules) printf '%s\\n' '{rules}' ;;
                    dns.clientBypass.port53Rules) printf '%s\\n' '{port53_rules}' ;;
                    dns.clientBypass.dot853Rules) printf '%s\\n' '{dot853_rules}' ;;
                    dns.clientBypass.hijackBypassRules) printf '%s\\n' '{hijack_rules}' ;;
                    dns.clientBypass.unknownSourceRules) printf '%s\\n' '{unknown_sources}' ;;
                    dns.clientBypass.unknownDportRules) printf '%s\\n' '{unknown_dports}' ;;
                    dns.clientBypass.count) printf '%s\\n' '{count}' ;;
                    dns.clientBypass.clients.count) printf '%s\\n' '{count}' ;;
                    dns.clientBypass.clients) printf '%s\\n' '{clients}' ;;
                    dns.clientBypass.clients.items) printf '%s\\n' '{clients}' ;;
                    dns.clientBypass.port53) printf '%s\\n' '{port53}' ;;
                    dns.clientBypass.dot853) printf '%s\\n' '{dot853}' ;;
                    dns.clientBypass.hijack53) printf '%s\\n' '{hijack53}' ;;
                    *) printf '0\\n' ;;
                esac
            }}

            {doctor_function}

            guard_cmd_doctor
            """
        )
        return subprocess.run(
            ["sh", "-c", script],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_detects_explicit_client_dns_and_dot_bypass(self) -> None:
        values = self._run_detector(
            forward=textwrap.dedent(
                """\
                chain forward_lan {
                    ip saddr 10.0.0.169 udp dport { 53, 853 } jump accept_to_wan comment "phone-dns-out-bypass"
                    ip saddr 10.0.0.169 tcp dport { 53, 853 } jump accept_to_wan comment "phone-dns-out-bypass"
                    jump accept_to_wan comment "normal lan forwarding"
                }
                """
            ),
            dstnat=textwrap.dedent(
                """\
                chain dstnat {
                    ip saddr 10.0.0.169 meta l4proto { tcp, udp } th dport 53 return comment "phone-dns-hijack-bypass"
                }
                """
            ),
        )
        self.assertEqual(values["available"], "1")
        self.assertEqual(values["detected"], "1")
        self.assertEqual(values["rules"], "2")
        self.assertEqual(values["port53rules"], "2")
        self.assertEqual(values["dot853rules"], "2")
        self.assertEqual(values["hijackrules"], "1")
        self.assertEqual(values["unknown"], "0")
        self.assertEqual(values["unknownports"], "0")
        self.assertEqual(values["count"], "1")
        self.assertEqual(values["clients"], "10.0.0.169")
        self.assertEqual(values["port53"], "1")
        self.assertEqual(values["dot853"], "1")
        self.assertEqual(values["hijack53"], "1")

    def test_ignores_generic_lan_to_wan_accept(self) -> None:
        values = self._run_detector(
            forward='chain forward_lan {\n  jump accept_to_wan comment "normal lan forwarding"\n}',
            dstnat='chain dstnat {\n  iifname "br-lan" jump dstnat_lan\n}',
        )
        self.assertEqual(values["available"], "1")
        self.assertEqual(values["detected"], "0")
        self.assertEqual(values["rules"], "0")
        self.assertEqual(values["unknown"], "0")
        self.assertEqual(values["unknownports"], "0")
        self.assertEqual(values["count"], "0")
        self.assertEqual(values["clients"], "")
        self.assertEqual(values["port53"], "0")
        self.assertEqual(values["dot853"], "0")
        self.assertEqual(values["hijack53"], "0")

    def test_fails_closed_to_unavailable_when_fw4_chains_cannot_be_read(self) -> None:
        values = self._run_detector(
            forward="chain forward_lan {}",
            dstnat="",
            fail_dstnat=True,
        )
        self.assertEqual(values["available"], "0")
        self.assertEqual(values["detected"], "0")
        self.assertEqual(values["rules"], "0")
        self.assertEqual(values["unknownports"], "0")
        self.assertEqual(values["count"], "0")
        self.assertEqual(values["port53"], "0")
        self.assertEqual(values["dot853"], "0")
        self.assertEqual(values["hijack53"], "0")

    def test_set_sources_are_unknown_and_literal_ipv4_ipv6_cidrs_are_listed(self) -> None:
        values = self._run_detector(
            forward=textwrap.dedent(
                """\
                chain forward_lan {
                    ip saddr 10.0.0.169 udp dport 53 jump accept_to_wan
                    ip6 saddr 2001:db8::1 tcp dport 853 jump accept_to_wan
                    ip saddr 10.0.0.0/24 udp dport 53 jump accept_to_wan
                    ip saddr @dns_bypass_clients udp dport 53 jump accept_to_wan
                    ip6 saddr @dns_bypass_v6 tcp dport 853 jump accept_to_wan
                    udp dport 53 jump accept_to_wan comment "ip saddr 192.0.2.1"
                }
                """
            ),
            dstnat=textwrap.dedent(
                """\
                chain dstnat {
                    ip6 saddr 2001:db8::2 meta l4proto { tcp, udp } th dport 53 return
                    ip saddr @dns_bypass_clients meta l4proto { tcp, udp } th dport 53 return
                }
                """
            ),
        )
        self.assertEqual(values["available"], "1")
        self.assertEqual(values["detected"], "1")
        self.assertEqual(values["rules"], "6")
        self.assertEqual(values["port53rules"], "4")
        self.assertEqual(values["dot853rules"], "2")
        self.assertEqual(values["hijackrules"], "2")
        self.assertEqual(values["unknown"], "4")
        self.assertEqual(values["count"], "4")
        self.assertEqual(
            set(values["clients"].split()),
            {"10.0.0.169", "2001:db8::1", "10.0.0.0/24", "2001:db8::2"},
        )
        self.assertNotIn("@", values["clients"])

    def test_ipv6_cidr_prefix_bounds_include_109_119_and_128(self) -> None:
        script = f'''
. "{RESOLVER_SYNC}"
. "{DNS_SH}"
for prefix in 109 119 128; do
    _guard_dns_source_is_literal ipv6 "2001:db8::/$prefix" || exit 1
done
for prefix in 129 064; do
    if _guard_dns_source_is_literal ipv6 "2001:db8::/$prefix"; then
        exit 1
    fi
done
'''
        result = subprocess.run(
            ["/bin/sh", "-c", script],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_port_ranges_detect_53_and_853_and_ignore_excluding_ranges(self) -> None:
        values = self._run_detector(
            forward=textwrap.dedent(
                """\
                chain forward_lan {
                    ip saddr 10.0.0.1 udp dport 1-100 jump accept_to_wan
                    ip saddr 10.0.0.2 tcp dport 100-900 jump accept_to_wan
                    ip saddr 10.0.0.3 udp dport 54-852 jump accept_to_wan
                    ip saddr 10.0.0.4 udp dport 854-65535 jump accept_to_wan
                }
                """
            ),
            dstnat="chain dstnat {}",
        )
        self.assertEqual(values["rules"], "2")
        self.assertEqual(values["port53rules"], "1")
        self.assertEqual(values["dot853rules"], "1")
        self.assertEqual(values["unknownports"], "0")
        self.assertEqual(values["clients"], "10.0.0.1 10.0.0.2")

    def test_port_inequalities_classify_known_overlap(self) -> None:
        values = self._run_detector(
            forward=textwrap.dedent(
                """\
                chain forward_lan {
                    ip saddr 192.0.2.1 tcp dport > 52 jump accept_to_wan
                    ip saddr 192.0.2.2 udp dport != 53 jump accept_to_wan
                    ip saddr 192.0.2.3 tcp dport <= 53 jump accept_to_wan
                    ip saddr 192.0.2.4 udp dport < 53 jump accept_to_wan
                }
                """
            ),
            dstnat="chain dstnat {}",
        )
        self.assertEqual(values["rules"], "3")
        self.assertEqual(values["port53rules"], "2")
        self.assertEqual(values["dot853rules"], "2")
        self.assertEqual(values["unknownports"], "0")
        self.assertEqual(values["clients"], "192.0.2.1 192.0.2.2 192.0.2.3")

    def test_unsupported_port_selectors_are_reported_as_unknown(self) -> None:
        values = self._run_detector(
            forward=textwrap.dedent(
                """\
                chain forward_lan {
                    ip saddr 198.51.100.1 udp dport @dns_ports jump accept_to_wan
                    ip saddr 198.51.100.2 tcp dport domain jump accept_to_wan
                    ip saddr 198.51.100.3 udp dport 53 jump accept_to_wan
                }
                """
            ),
            dstnat="chain dstnat {}",
        )
        self.assertEqual(values["rules"], "1")
        self.assertEqual(values["port53rules"], "1")
        self.assertEqual(values["unknownports"], "2")
        self.assertEqual(values["clients"], "198.51.100.3")

    def test_doctor_warns_with_detected_client_and_observation_only_scope(self) -> None:
        result = self._run_doctor(
            available="1",
            count="1",
            clients="10.0.0.169",
            port53="1",
            dot853="1",
            hijack53="1",
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn(
            "WARN:client DNS firewall bypass detected: rules=1 clients=1 unknownSourceRules=0 unknownDportRules=0 port53Rules=1 dot853Rules=1 hijackBypassRules=1",
            result.stdout,
        )
        self.assertIn(
            "INFO:DNS bypass diagnostics are observation-only; firewall policy was not modified",
            result.stdout,
        )

    def test_doctor_warns_when_fw4_diagnostics_are_unavailable(self) -> None:
        result = self._run_doctor(available="0")
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn(
            "WARN:client DNS firewall bypass diagnostics unavailable; required fw4 chains could not be observed",
            result.stdout,
        )

    def test_doctor_is_quiet_when_fw4_is_readable_without_bypass(self) -> None:
        result = self._run_doctor(available="1", count="0")
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertNotIn("client DNS firewall bypass detected", result.stdout)
        self.assertNotIn("client DNS firewall bypass diagnostics unavailable", result.stdout)

    def test_doctor_warns_when_only_source_attribution_is_unknown(self) -> None:
        result = self._run_doctor(
            available="1",
            detected="1",
            rules="1",
            unknown_sources="1",
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("unknownSourceRules=1", result.stdout)
        self.assertIn("client DNS firewall bypass detected", result.stdout)

    def test_doctor_warns_when_destination_port_selector_is_unsupported(self) -> None:
        result = self._run_doctor(
            available="1",
            unknown_dports="2",
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn(
            "WARN:DNS bypass scan incomplete: unknownDportRules=2; unsupported destination-port selectors may include port 53 or 853",
            result.stdout,
        )

    def test_environment_exposes_diagnostics_through_getters_only(self) -> None:
        script = f'''
. "{ENV_SH}"
_GUARD_DNS_BYPASS_AVAILABLE=1
_GUARD_DNS_BYPASS_DETECTED=1
_GUARD_DNS_BYPASS_RULES=3
_GUARD_DNS_BYPASS_PORT53_RULES=2
_GUARD_DNS_BYPASS_DOT853_RULES=2
_GUARD_DNS_HIJACK_BYPASS_RULES=1
_GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES=1
_GUARD_DNS_BYPASS_UNKNOWN_DPORT_RULES=2
_GUARD_DNS_BYPASS_CLIENT_COUNT=1
_GUARD_DNS_BYPASS_CLIENTS="10.0.0.169"
printf '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s\\n' \\
  "$(guard_env_get dns.clientBypass.scanAvailable)" \\
  "$(guard_env_get dns.clientBypass.detected)" \\
  "$(guard_env_get dns.clientBypass.rules)" \\
  "$(guard_env_get dns.clientBypass.port53Rules)" \\
  "$(guard_env_get dns.clientBypass.dot853Rules)" \\
  "$(guard_env_get dns.clientBypass.hijackBypassRules)" \\
  "$(guard_env_get dns.clientBypass.unknownSourceRules)" \\
  "$(guard_env_get dns.clientBypass.unknownDportRules)" \\
  "$(guard_env_get dns.clientBypass.clients.count)" \\
  "$(guard_env_get dns.clientBypass.clients.items)"
guard_env_json
'''
        result = subprocess.run(
            ["/bin/sh", "-c", script],
            cwd=ROOT,
            env={**os.environ, "PATH": os.environ.get("PATH", "")},
            text=True,
            capture_output=True,
            check=True,
        )
        evidence, normalized = result.stdout.splitlines()
        self.assertEqual(evidence, "1|1|3|2|2|1|1|2|1|10.0.0.169")
        self.assertNotIn("unknownSourceRules", json.loads(normalized)["dns"]["clientBypass"])


if __name__ == "__main__":
    unittest.main()
