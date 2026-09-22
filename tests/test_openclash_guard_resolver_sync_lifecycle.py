from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / "shell" / "apps" / "openclash-guard" / "rules.sh"
INSTALL = ROOT / "shell" / "apps" / "openclash-guard" / "install.sh"


class ResolverSyncLifecycleTests(unittest.TestCase):
    def _watch_source(self) -> str:
        source = RULES.read_text(encoding="utf-8")
        start = source.index("guard_rules_sync_watch() {")
        end = source.index("\nguard_rules_purge() {", start)
        return source[start:end]

    def test_existing_procd_watch_process_owns_resolver_sync_lifecycle(self) -> None:
        installer = INSTALL.read_text(encoding="utf-8")
        self.assertIn('procd_set_param command \\"\\$PROG\\" rules sync watch', installer)
        self.assertIn('procd_set_param env GUARD_RULES_ALLOW_WATCH=1', installer)
        self.assertEqual(installer.count("procd_open_instance rules-sync"), 1)
        self.assertNotIn("procd_open_instance resolver-sync", installer)

    def test_watch_uses_separate_remote_and_resolver_cadences(self) -> None:
        watch = self._watch_source()
        loop = watch[watch.index("while :; do") :]
        self.assertIn("guard_rules_sync_interval", watch)
        self.assertIn("_guard_resolver_sync_interval", watch)
        self.assertIn("_guard_rules_sw_next_rules", watch)
        self.assertIn("guard_rules_sync_run", loop)
        self.assertIn("guard_resolver_sync_cycle", loop)
        self.assertLess(loop.index("_guard_lock_acquire"), loop.index("guard_resolver_sync_cycle"))
        self.assertLess(loop.index("guard_resolver_sync_cycle"), loop.index("_guard_lock_release"))
        self.assertIn('sleep "$_guard_rules_sw_resolver_interval"', loop)

    def test_consumer_mismatch_reconciles_and_retries_inside_same_guard_lock(self) -> None:
        watch = self._watch_source()
        loop = watch[watch.index("while :; do") :]
        lock_index = loop.index("_guard_lock_acquire")
        mismatch_index = loop.index('"$_guard_rules_sw_reason" = nft-consumer-unavailable')
        reconcile_index = loop.index("guard_cmd_reconcile", mismatch_index)
        retry_index = loop.index("guard_resolver_sync_cycle", reconcile_index)
        release_index = loop.index("_guard_lock_release", retry_index)

        self.assertLess(lock_index, mismatch_index)
        self.assertLess(mismatch_index, reconcile_index)
        self.assertLess(reconcile_index, retry_index)
        self.assertLess(retry_index, release_index)

    def test_capability_transition_reconciles_fail_closed_policy(self) -> None:
        watch = self._watch_source()
        loop = watch[watch.index("while :; do") :]
        before_index = loop.index("_guard_rules_sw_before=$(guard_resolver_sync_backend")
        cycle_index = loop.index("guard_resolver_sync_cycle", before_index)
        after_index = loop.index("_guard_rules_sw_after=$(guard_resolver_sync_backend", cycle_index)
        transition_index = loop.index('"$_guard_rules_sw_before" != "$_guard_rules_sw_after"', after_index)
        reconcile_index = loop.index("guard_cmd_reconcile", transition_index)
        release_index = loop.index("_guard_lock_release", reconcile_index)

        self.assertLess(before_index, cycle_index)
        self.assertLess(cycle_index, after_index)
        self.assertLess(after_index, transition_index)
        self.assertLess(transition_index, reconcile_index)
        self.assertLess(reconcile_index, release_index)

    def test_watch_withdraws_resolver_readiness_on_exit(self) -> None:
        watch = self._watch_source()
        self.assertIn("guard_resolver_sync_stop", watch)
        self.assertIn("INT TERM", watch)
        self.assertIn("EXIT", watch)


if __name__ == "__main__":
    unittest.main()
