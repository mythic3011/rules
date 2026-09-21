from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIB_JSON = ROOT / "shell" / "lib" / "json.sh"
DATA = ROOT / "internal" / "generated" / "ai-routing" / "openclash-guard-resolver-sync-data.sh"
RESOLVER = ROOT / "shell" / "apps" / "openclash-guard" / "resolver-sync.sh"
KILLSWITCH = ROOT / "shell" / "apps" / "openclash-guard" / "killswitch.sh"


class ResolverSyncRendererTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.work = Path(self.tmp.name)
        self.state = self.work / "resolver-sync.json"
        self.cache = self.work / "resolver-sync.cache"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def env(self, now: int = 1_000) -> dict[str, str]:
        env = os.environ.copy()
        env.update(
            {
                "GUARD_RESOLVER_SYNC_STATE_FILE": str(self.state),
                "GUARD_RESOLVER_SYNC_CACHE_FILE": str(self.cache),
                "GUARD_DIRECT_WAN_IFACE": "wan",
                "GUARD_RESOLVER_SYNC_NOW_EPOCH": str(now),
            }
        )
        return env

    def run_shell(self, body: str, *, now: int = 1_000) -> subprocess.CompletedProcess[str]:
        script = "\n".join(
            [
                "set -eu",
                f'. "{LIB_JSON}"',
                f'. "{DATA}"',
                f'. "{RESOLVER}"',
                f'. "{KILLSWITCH}"',
                '_GUARD_NFT_PREFIX="openclash-guard"',
                '_GUARD_NFT_FAMILY="inet"',
                '_GUARD_NFT_TABLE="openclash_guard"',
                '_GUARD_DNS_BACKEND="adguardhome"',
                body,
            ]
        )
        return subprocess.run(
            ["/bin/sh", "-c", script],
            text=True,
            capture_output=True,
            env=self.env(now),
            check=False,
        )

    def write_state(self, revision: str = "d07cac190c33e7914ba7adaf7e7c14298fba7024") -> None:
        self.state.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "helper": "openclash-guard-resolver-sync",
                    "backend": "adguardhome-resolver-sync",
                    "status": "ready",
                    "pid": os.getpid(),
                    "updatedAtEpoch": 990,
                    "sourceRevision": revision,
                    "nft": {
                        "family": "inet",
                        "table": "openclash_guard",
                        "chain": "forward",
                        "ipv4Set": "resolver_sync_v4",
                        "ipv6Set": "resolver_sync_v6",
                        "directInterface": "wan",
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )

    def test_renderer_emits_owned_timeout_sets_and_direct_wan_consumers(self) -> None:
        result = self.run_shell(
            "_guard_kill_render_resolver_sync_sets; _guard_kill_render_resolver_sync_rules"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        output = result.stdout
        self.assertIn(
            'add set inet openclash_guard resolver_sync_v4 { type ipv4_addr; flags timeout; comment "openclash-guard:resolver-sync-v4-set"; }',
            output,
        )
        self.assertIn(
            'add set inet openclash_guard resolver_sync_v6 { type ipv6_addr; flags timeout; comment "openclash-guard:resolver-sync-v6-set"; }',
            output,
        )
        self.assertIn(
            'oifname "wan" ip daddr @resolver_sync_v4 reject comment "openclash-guard:resolver-sync-v4"',
            output,
        )
        self.assertIn(
            'oifname "wan" ip6 daddr @resolver_sync_v6 reject comment "openclash-guard:resolver-sync-v6"',
            output,
        )

    def test_reconcile_restores_only_unexpired_cache_from_same_selector_revision(self) -> None:
        self.write_state()
        self.cache.write_text(
            "4 203.0.113.7 1090\n6 2001:db8::7 1010\n4 198.51.100.8 999\n",
            encoding="utf-8",
        )
        result = self.run_shell("_guard_kill_render_resolver_sync_cache", now=1_000)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = result.stdout
        self.assertIn("203.0.113.7 timeout 90s", output)
        self.assertIn("2001:db8::7 timeout 10s", output)
        self.assertNotIn("198.51.100.8", output)

    def test_cache_from_old_selector_revision_is_not_replayed(self) -> None:
        self.write_state("0" * 40)
        self.cache.write_text("4 203.0.113.7 1090\n", encoding="utf-8")
        result = self.run_shell("_guard_kill_render_resolver_sync_cache")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_malformed_or_overlong_cache_entry_fails_reconcile(self) -> None:
        self.write_state()
        for line in (
            "4 999.1.1.1 1090\n",
            "9 203.0.113.7 1090\n",
            "4 203.0.113.7 5000\n",
            "4 203.0.113.7 1090 extra\n",
        ):
            with self.subTest(line=line.strip()):
                self.cache.write_text(line, encoding="utf-8")
                result = self.run_shell("_guard_kill_render_resolver_sync_cache")
                self.assertNotEqual(result.returncode, 0)

    def test_non_adguard_backend_emits_no_resolver_objects(self) -> None:
        result = self.run_shell(
            '_GUARD_DNS_BACKEND="dnsmasq"; _guard_kill_render_resolver_sync_sets; _guard_kill_render_resolver_sync_rules; _guard_kill_render_resolver_sync_cache'
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
