from __future__ import annotations

import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DNS_SH = ROOT / "shell" / "apps" / "openclash-guard" / "dns.sh"


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


if __name__ == "__main__":
    unittest.main()
