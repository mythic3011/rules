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
RESOLVER_DATA = ROOT / "internal" / "generated" / "ai-routing" / "openclash-guard-resolver-sync-data.sh"
RESOLVER_SYNC = ROOT / "shell" / "apps" / "openclash-guard" / "resolver-sync.sh"
DNS = ROOT / "shell" / "apps" / "openclash-guard" / "dns.sh"
SOURCE_REVISION = "d07cac190c33e7914ba7adaf7e7c14298fba7024"

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
    iface = "lan0" if mode == "wrong-direct-iface" else "wan"
    v4_set = "resolver_sync_v4_shadow" if mode == "suffix-v4-consumer" else "resolver_sync_v4"
    v6_set = "resolver_sync_v6_shadow" if mode == "suffix-v6-consumer" else "resolver_sync_v6"
    if mode != "missing-v4-consumer":
        if mode == "nonreject-log-prefix-v4":
            print(f'\t\toifname "{iface}" ip daddr @{v4_set} log prefix "reject" accept comment "openclash-guard:resolver-sync-v4" # handle 10')
        else:
            print(f'\t\toifname "{iface}" ip daddr @{v4_set} reject comment "openclash-guard:resolver-sync-v4" # handle 10')
    if mode != "missing-v6-consumer":
        print(f'\t\toifname "{iface}" ip6 daddr @{v6_set} reject comment "openclash-guard:resolver-sync-v6" # handle 11')
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
        self.cache = self.work / "resolver-sync.cache"
        self.cursor = self.work / "resolver-sync.cursor"
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
                "GUARD_RESOLVER_SYNC_CACHE_FILE": str(self.cache),
                "GUARD_RESOLVER_SYNC_CURSOR_FILE": str(self.cursor),
                "GUARD_RESOLVER_SYNC_NOW_EPOCH": str(now),
                "GUARD_RESOLVER_SYNC_MAX_AGE": "120",
                "GUARD_DIRECT_WAN_IFACE": "wan",
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
            "sourceRevision": SOURCE_REVISION,
            "nft": {
                "family": "inet",
                "table": "openclash_guard",
                "chain": "forward",
                "ipv4Set": "resolver_sync_v4",
                "ipv6Set": "resolver_sync_v6",
                "directInterface": "wan",
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
                f'. "{RESOLVER_DATA}"',
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

    def test_malformed_state_json_stays_unavailable_without_nft_access(self) -> None:
        self.state.write_text('{"schemaVersion":1,\n', encoding="utf-8")
        self.assertEqual(self.backend(), "unavailable")
        self.assertFalse(self.nft_log.exists(), "invalid state must be rejected before nft inspection")

    def test_valid_fresh_contract_is_promoted(self) -> None:
        self.write_state()
        state_before = self.state.read_bytes()
        self.assertEqual(self.backend(), "adguardhome-resolver-sync")
        self.assertEqual(
            self.nft_log.read_text(encoding="utf-8").splitlines(),
            [
                "list set inet openclash_guard resolver_sync_v4",
                "list set inet openclash_guard resolver_sync_v6",
                "-a list chain inet openclash_guard forward",
            ],
            "positive capability verification must only read nft state",
        )
        self.assertEqual(self.state.read_bytes(), state_before, "capability verification must not rewrite producer state")
        self.assertFalse(self.cache.exists(), "capability verification must not create producer cache")
        self.assertFalse(self.cursor.exists(), "capability verification must not create producer cursor")

    def test_degraded_state_is_rejected_before_nft_lookup(self) -> None:
        self.write_state(status="degraded")
        self.assertEqual(self.backend(), "unavailable")
        self.assertFalse(self.nft_log.exists())

    def test_selector_revision_mismatch_is_rejected_before_nft_lookup(self) -> None:
        self.write_state(sourceRevision="0" * 40)
        self.assertEqual(self.backend(), "unavailable")
        self.assertFalse(self.nft_log.exists())

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
                "directInterface": "wan",
            }
        )
        self.assertEqual(self.backend(), "unavailable")
        self.assertFalse(self.nft_log.exists())

    def test_state_cannot_redirect_direct_interface(self) -> None:
        self.write_state(
            nft={
                "family": "inet",
                "table": "openclash_guard",
                "chain": "forward",
                "ipv4Set": "resolver_sync_v4",
                "ipv6Set": "resolver_sync_v6",
                "directInterface": "lan0",
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
        self.assertEqual(self.backend(mode="wrong-direct-iface"), "unavailable")

    def test_consumer_set_names_must_match_complete_nft_tokens(self) -> None:
        self.write_state()
        self.assertEqual(self.backend(mode="suffix-v4-consumer"), "unavailable")
        self.assertEqual(self.backend(mode="suffix-v6-consumer"), "unavailable")

    def test_reject_text_inside_log_prefix_is_not_a_reject_verdict(self) -> None:
        self.write_state()
        self.assertEqual(self.backend(mode="nonreject-log-prefix-v4"), "unavailable")

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
