from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / "shell" / "apps" / "openclash-guard" / "rules.sh"
INSTALL = ROOT / "shell" / "apps" / "openclash-guard" / "install.sh"


class ResolverSyncLifecycleTests(unittest.TestCase):
    def test_existing_procd_watch_process_owns_resolver_sync_lifecycle(self) -> None:
        installer = INSTALL.read_text(encoding="utf-8")
        self.assertIn('procd_set_param command \\"\\$PROG\\" rules sync watch', installer)
        self.assertIn('procd_set_param env GUARD_RULES_ALLOW_WATCH=1', installer)
        self.assertEqual(installer.count("procd_open_instance rules-sync"), 1)
        self.assertNotIn("procd_open_instance resolver-sync", installer)

    def test_watch_uses_separate_remote_and_resolver_cadences(self) -> None:
        source = RULES.read_text(encoding="utf-8")
        start = source.index("guard_rules_sync_watch() {")
        end = source.index("\nguard_rules_purge() {", start)
        watch = source[start:end]
        self.assertIn("guard_rules_sync_interval", watch)
        self.assertIn("_guard_resolver_sync_interval", watch)
        self.assertIn("_guard_rules_sw_next_rules", watch)
        self.assertIn("guard_rules_sync_run", watch)
        self.assertIn("guard_resolver_sync_cycle", watch)
        self.assertLess(watch.index("_guard_lock_acquire"), watch.index("guard_resolver_sync_cycle"))
        self.assertLess(watch.index("guard_resolver_sync_cycle"), watch.index("_guard_lock_release"))
        self.assertIn('sleep "$_guard_rules_sw_resolver_interval"', watch)

    def test_watch_removes_health_state_on_exit(self) -> None:
        source = RULES.read_text(encoding="utf-8")
        start = source.index("guard_rules_sync_watch() {")
        end = source.index("\nguard_rules_purge() {", start)
        watch = source[start:end]
        self.assertIn("guard_resolver_sync_stop", watch)
        self.assertIn("INT TERM", watch)
        self.assertIn("EXIT", watch)


if __name__ == "__main__":
    unittest.main()
