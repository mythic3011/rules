from __future__ import annotations

import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIB_JSON = ROOT / "shell" / "lib" / "json.sh"
LIB_NFT = ROOT / "shell" / "lib" / "nft.sh"
RESOLVER_SYNC = ROOT / "shell" / "apps" / "openclash-guard" / "resolver-sync.sh"
DNS = ROOT / "shell" / "apps" / "openclash-guard" / "dns.sh"

FAKE_NFT = r'''#!/usr/bin/env python3
import os
import sys
from pathlib import Path

mode = os.environ.get("RESOLVER_SYNC_NFT_MODE", "ready")
log = os.environ.get("RESOLVER_SYNC_NFT_LOG")
if log:
    with Path(log).open("a", encoding="utf-8") as handle:
        handle.write(" ".join(sys.argv[1:]) + "\n")

args = sys.argv[1:]
if args[:2] == ["list", "set"] and len(args) == 5:
    _, _, family, table, name = args
    if family != "inet" or table != "openclash_guard":
        sys.exit(1)
    if mode == "missing-v4" and name == "resolver_sync_v4":
        sys.exit(1)
    if mode == "missing-v6" and name == "resolver_sync_v6":
        sys.exit(1)
    if name == "resolver_sync_v4":
        set_type = "ipv4_addr"
        comment = "openclash-guard:resolver-sync-v4-set"
    elif name == "resolver_sync_v6":
        set_type = "ipv6_addr"
        comment = "openclash-guard:resolver-sync-v6-set"
    else:
        sys.exit(1)
    if mode == "wrong-type" and name == "resolver_sync_v4":
        set_type = "ipv6_addr"
    flags = "interval" if mode == "no-timeout" else "timeout"
    if mode == "wrong-comment" and name == "resolver_sync_v4":
        comment = "someone-else"
    print(f"table {family} {table} {{")
    print(f"\tset {name} {{")
    print(f"\t\ttype {set_type}")
    print(f"\t\tflags {flags}")
    print(f'\t\tcomment "{comment}"')
    print("\t}")
    print("}")
    sys.exit(0)

if args[:3] == ["-a", "list", "chain"] and len(args) == 6:
    _, _, _, family, table, chain = args
    if (family, table, chain) != ("inet", "openclash_guard", "forward"):
        sys.exit(1)
    print("table inet openclash_guard {")
    print("\tchain forward {")
    if mode != "missing-v4-consumer":
        print('\t\tip daddr @resolver_sync_v4 reject comment "openclash-guard:resolver-sync-v4" # handle 10')
    if mode != "missing-v6-consumer":
        print('\t\tip6 daddr @resolver_sync_v6 reject comment "openclash-guard:resolver-sync-v6" # handle 11')
    print("\t}")
    print("}")
    sys.exit(0)

sys.exit(1)
'''


class ResolverSyncCapabilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.work = Path(self.tmp.name)
        self.bin = self.work / "bin"
        self.bin.mkdir()
        self.state = self.work / "resolver-sync.json"
        self.nft_log = self.work / "nft.log"
        nft = self.bin / "nft"
        nft.write_text(FAKE_NFT, encoding="utf-8")
        nft.chmod(nft.stat().st_mode | stat.S_IXUSR)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def env(self, *, mode: str = "ready", now: int = 1_000) -> dict[str, str]:
        env = os.environ.copy()
        env.update(
            {
                "PATH": f"{self.bin}{os.pathsep}{env.get('PATH', '')}",
                "GUARD_RESOLVER_SYNC_STATE_FILE": str(self.state),
                "GUARD_RESOLVER_SYNC_NOW_EPOCH": str(now),
                "GUARD_RESOLVER_SYNC_MAX_AGE": "120",
                "RESOLVER_SYNC_NFT_MODE": mode,
                "RESOLVER_SYNC_NFT_LOG": str(self.nft_log),
            }
        )
        return env

    def write_state(self, **overrides: object) -> None:
        payload: dict[str, object] = {
            "schemaVersion": 1,
            "helper": "openclash-guard-resolver-sync",
            "backend": "adguardhome-resolver-sync",
            "status": "ready",
            "pid": os.getpid(),
            "updatedAtEpoch": 950,
            "nft": {
                "family": "inet",
                "table": "openclash_guard",
                "chain": "forward",
                "ipv4Set": "resolver_sync_v4",
                "ipv6Set": "resolver_sync_v6",
            },
        }
        for key, value in overrides.items():
            payload[key] = value
        self.state.write_text(json.dumps(payload) + "\n", encoding="utf-8")

    def run_shell(self, body: str, *, mode: str = "ready", now: int = 1_000) -> subprocess.CompletedProcess[str]:
        script = "\n".join(
            [
                "set -eu",
                f'. "{LIB_JSON}"',
                f'. "{LIB_NFT}"',
                f'. "{RESOLVER_SYNC}"',
                f'. "{DNS}"',
                body,
            ]
        )
        return subprocess.run(
            ["/bin/sh", "-c", script],
            text=True,
            capture_output=True,
            env=self.env(mode=mode, now=now),
            check=False,
        )

    def backend(self, *, mode: str = "ready", now: int = 1_000) -> str:
        result = self.run_shell("guard_resolver_sync_backend", mode=mode, now=now)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def test_missing_state_stays_unavailable(self) -> None:
        self.assertEqual(self.backend(), "unavailable")

    def test_valid_fresh_contract_is_promoted(self) -> None:
        self.write_state()
        self.assertEqual(self.backend(), "adguardhome-resolver-sync")

    def test_wrong_backend_is_rejected_before_nft_lookup(self) -> None:
        self.write_state(backend="evil-backend")
        self.assertEqual(self.backend(), "unavailable")
        self.assertFalse(self.nft_log.exists())

    def test_arbitrary_nft_identifiers_are_not_trusted(self) -> None:
        self.write_state(
            nft={
                "family": "inet",
                "table": "openclash_guard;delete table inet fw4",
                "chain": "forward",
                "ipv4Set": "resolver_sync_v4",
                "ipv6Set": "resolver_sync_v6",
            }
        )
        self.assertEqual(self.backend(), "unavailable")
        self.assertFalse(self.nft_log.exists())

    def test_dead_helper_pid_is_rejected(self) -> None:
        self.write_state(pid=999_999_999)
        self.assertEqual(self.backend(), "unavailable")

    def test_stale_and_future_health_are_rejected(self) -> None:
        self.write_state(updatedAtEpoch=800)
        self.assertEqual(self.backend(), "unavailable")
        self.write_state(updatedAtEpoch=1_001)
        self.assertEqual(self.backend(), "unavailable")

    def test_sets_require_expected_type_timeout_and_owner_comment(self) -> None:
        self.write_state()
        for mode in ("missing-v4", "missing-v6", "wrong-type", "no-timeout", "wrong-comment"):
            with self.subTest(mode=mode):
                self.assertEqual(self.backend(mode=mode), "unavailable")

    def test_consumer_rules_are_part_of_capability_evidence(self) -> None:
        self.write_state()
        self.assertEqual(self.backend(mode="missing-v4-consumer"), "unavailable")
        self.assertEqual(self.backend(mode="missing-v6-consumer"), "unavailable")

    def test_dns_backend_keeps_dnsmasq_contract_and_gates_adguardhome(self) -> None:
        dnsmasq = self.run_shell("guard_dns_domain_set_backend dnsmasq")
        self.assertEqual(dnsmasq.returncode, 0, dnsmasq.stderr)
        self.assertEqual(dnsmasq.stdout.strip(), "dnsmasq-nftset")

        missing = self.run_shell("guard_dns_domain_set_backend adguardhome")
        self.assertEqual(missing.returncode, 0, missing.stderr)
        self.assertEqual(missing.stdout.strip(), "unavailable")

        self.write_state()
        ready = self.run_shell("guard_dns_domain_set_backend adguardhome")
        self.assertEqual(ready.returncode, 0, ready.stderr)
        self.assertEqual(ready.stdout.strip(), "adguardhome-resolver-sync")


if __name__ == "__main__":
    unittest.main()
