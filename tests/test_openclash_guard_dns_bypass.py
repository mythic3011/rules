from __future__ import annotations

import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DNS_SH = ROOT / "shell" / "apps" / "openclash-guard" / "dns.sh"
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
                . {DNS_SH}
                guard_dns_detect_firewall_bypasses
                printf '%s\n' \\
                  "available=$_GUARD_DNS_BYPASS_AVAILABLE" \\
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
    ) -> subprocess.CompletedProcess[str]:
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
                    dns.clientBypass.count) printf '%s\\n' '{count}' ;;
                    dns.clientBypass.clients) printf '%s\\n' '{clients}' ;;
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
        self.assertEqual(values["count"], "0")
        self.assertEqual(values["port53"], "0")
        self.assertEqual(values["dot853"], "0")
        self.assertEqual(values["hijack53"], "0")

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
            "WARN:client DNS firewall bypass detected: clients=10.0.0.169 port53=1 dot853=1 hijack53=1",
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


if __name__ == "__main__":
    unittest.main()
