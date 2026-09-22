from __future__ import annotations

import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DNS_SH = ROOT / "shell" / "apps" / "openclash-guard" / "dns.sh"
ENV_SH = ROOT / "shell" / "apps" / "openclash-guard" / "environment.sh"

FAKE_NFT = r'''#!/bin/sh
set -eu
if [ "${NFT_FAIL:-0}" = 1 ]; then
    exit 1
fi
if [ "$#" -eq 6 ] && [ "$1" = -a ] && [ "$2" = list ] && [ "$3" = chain ] && [ "$4" = inet ] && [ "$5" = fw4 ]; then
    case "$6" in
        forward_lan) cat "$NFT_FORWARD_FILE" ;;
        dstnat) cat "$NFT_DSTNAT_FILE" ;;
        *) exit 1 ;;
    esac
    exit 0
fi
exit 1
'''


class OpenClashGuardDnsBypassTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        nft = self.bin_dir / "nft"
        nft.write_text(FAKE_NFT, encoding="utf-8")
        nft.chmod(nft.stat().st_mode | stat.S_IXUSR)
        self.forward = self.root / "forward.txt"
        self.dstnat = self.root / "dstnat.txt"
        self.forward.write_text("chain forward_lan {\n}\n", encoding="utf-8")
        self.dstnat.write_text("chain dstnat {\n}\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def env(self, **extra: str) -> dict[str, str]:
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{self.bin_dir}:{env.get('PATH', '')}",
                "NFT_FORWARD_FILE": str(self.forward),
                "NFT_DSTNAT_FILE": str(self.dstnat),
            }
        )
        env.update(extra)
        return env

    def run_detect(self, **extra_env: str) -> dict[str, object]:
        script = f'''
. "{DNS_SH}"
guard_dns_detect_client_bypass
printf '{{"scan":%s,"detected":%s,"rules":%s,"port53":%s,"dot853":%s,"hijack":%s,"unknown":%s,"clients":%s,"sources":"%s"}}\\n' \
  "$_GUARD_DNS_BYPASS_SCAN_AVAILABLE" \
  "$_GUARD_DNS_BYPASS_DETECTED" \
  "$_GUARD_DNS_BYPASS_RULES" \
  "$_GUARD_DNS_BYPASS_PORT53" \
  "$_GUARD_DNS_BYPASS_DOT853" \
  "$_GUARD_DNS_HIJACK_BYPASS" \
  "$_GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES" \
  "$_GUARD_DNS_BYPASS_CLIENTS" \
  "$_GUARD_DNS_BYPASS_SOURCES"
'''
        result = subprocess.run(
            ["/bin/sh", "-c", script],
            cwd=ROOT,
            env=self.env(**extra_env),
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout)

    def test_detects_pixel_port53_dot_and_hijack_bypass(self) -> None:
        self.forward.write_text(
            '''chain forward_lan {
    ip saddr 10.0.0.169 udp dport { 53, 853 } jump accept_to_wan comment "Pixel-8-Pro-DNS-out-bypass" # handle 20905
    ip saddr 10.0.0.169 tcp dport { 53, 853 } jump accept_to_wan comment "Pixel-8-Pro-DNS-out-bypass" # handle 20903
    tcp dport 853 jump reject_to_wan comment "Block-LAN-DoT"
}
''',
            encoding="utf-8",
        )
        self.dstnat.write_text(
            '''chain dstnat {
    ip saddr 10.0.0.169 meta l4proto { tcp, udp } th dport 53 return comment "Pixel-8-Pro-DNS-hijack-bypass" # handle 20907
    iifname "br-lan" jump dstnat_lan
}
''',
            encoding="utf-8",
        )

        report = self.run_detect()

        self.assertEqual(report["scan"], 1)
        self.assertEqual(report["detected"], 1)
        self.assertEqual(report["rules"], 2)
        self.assertEqual(report["port53"], 2)
        self.assertEqual(report["dot853"], 2)
        self.assertEqual(report["hijack"], 1)
        self.assertEqual(report["unknown"], 0)
        self.assertEqual(report["clients"], 1)
        self.assertEqual(report["sources"], "10.0.0.169")

    def test_clean_fw4_reports_no_bypass(self) -> None:
        self.forward.write_text(
            '''chain forward_lan {
    tcp dport 853 jump reject_to_wan
    udp dport 853 jump reject_to_wan
    jump accept_to_wan
}
''',
            encoding="utf-8",
        )
        self.dstnat.write_text(
            '''chain dstnat {
    iifname "br-lan" jump dstnat_lan
}
''',
            encoding="utf-8",
        )

        report = self.run_detect()

        self.assertEqual(report["scan"], 1)
        self.assertEqual(report["detected"], 0)
        self.assertEqual(report["rules"], 0)
        self.assertEqual(report["hijack"], 0)
        self.assertEqual(report["clients"], 0)
        self.assertEqual(report["sources"], "")

    def test_complex_source_is_counted_without_guessing_client(self) -> None:
        self.forward.write_text(
            '''chain forward_lan {
    ip saddr @dns_bypass_clients udp dport 53 jump accept_to_wan
}
''',
            encoding="utf-8",
        )
        self.dstnat.write_text(
            '''chain dstnat {
    ip saddr @dns_bypass_clients meta l4proto { tcp, udp } th dport 53 return
}
''',
            encoding="utf-8",
        )

        report = self.run_detect()

        self.assertEqual(report["detected"], 1)
        self.assertEqual(report["unknown"], 2)
        self.assertEqual(report["clients"], 0)
        self.assertEqual(report["sources"], "")

    def test_unreadable_fw4_is_unknown_not_clean(self) -> None:
        report = self.run_detect(NFT_FAIL="1")

        self.assertEqual(report["scan"], 0)
        self.assertEqual(report["detected"], 0)

    def test_environment_getters_expose_bypass_evidence_without_changing_normalized_json(self) -> None:
        script = f'''
. "{ENV_SH}"
_GUARD_DNS_BYPASS_SCAN_AVAILABLE=1
_GUARD_DNS_BYPASS_DETECTED=1
_GUARD_DNS_BYPASS_RULES=2
_GUARD_DNS_BYPASS_PORT53=2
_GUARD_DNS_BYPASS_DOT853=2
_GUARD_DNS_HIJACK_BYPASS=1
_GUARD_DNS_BYPASS_UNKNOWN_SOURCE_RULES=0
_GUARD_DNS_BYPASS_CLIENTS=1
_GUARD_DNS_BYPASS_SOURCES="10.0.0.169"
printf '%s|%s|%s|%s|%s|%s|%s|%s|%s\\n' \
  "$(guard_env_get dns.clientBypass.scanAvailable)" \
  "$(guard_env_get dns.clientBypass.detected)" \
  "$(guard_env_get dns.clientBypass.rules)" \
  "$(guard_env_get dns.clientBypass.port53Rules)" \
  "$(guard_env_get dns.clientBypass.dot853Rules)" \
  "$(guard_env_get dns.clientBypass.hijackBypassRules)" \
  "$(guard_env_get dns.clientBypass.unknownSourceRules)" \
  "$(guard_env_get dns.clientBypass.clients.count)" \
  "$(guard_env_get dns.clientBypass.clients.items)"
guard_env_json
'''
        result = subprocess.run(
            ["/bin/sh", "-c", script],
            cwd=ROOT,
            env=self.env(),
            text=True,
            capture_output=True,
            check=True,
        )
        evidence, normalized = result.stdout.splitlines()
        self.assertEqual(evidence, "1|1|2|2|2|1|0|1|10.0.0.169")
        self.assertNotIn("clientBypass", json.loads(normalized)["dns"])


if __name__ == "__main__":
    unittest.main()
