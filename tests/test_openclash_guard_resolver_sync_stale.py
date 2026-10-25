from __future__ import annotations

import unittest

from test_openclash_guard_resolver_sync_daemon import ResolverSyncDaemonTests, entry


class ResolverSyncStaleAnswerTests(unittest.TestCase):
    def setUp(self) -> None:
        # Reuse the daemon harness without inheriting its test methods; this keeps
        # the stale-answer acceptance case focused while exercising the real cycle.
        self.harness = ResolverSyncDaemonTests("test_first_poll_is_warming_and_does_not_replay_log_history")
        self.harness.setUp()

    def tearDown(self) -> None:
        self.harness.tearDown()

    def test_answer_older_than_dns_ttl_is_not_published(self) -> None:
        old = entry("example.invalid", [])
        self.harness.write_querylog([old])
        baseline = self.harness.run_cycle(6_000)
        self.assertEqual(baseline.returncode, 0, baseline.stderr)

        stale = entry(
            "api.openai.com",
            [{"type": "A", "value": "203.0.113.77", "ttl": 30}],
        )
        self.harness.write_querylog([stale, old])
        result = self.harness.run_cycle(6_060)
        self.assertEqual(result.returncode, 0, result.stderr)

        state = self.harness.state_json()
        self.assertEqual(state["status"], "ready")
        self.assertEqual(state["reason"], "ok")
        self.assertNotIn(
            "203.0.113.77",
            self.harness.cache.read_text(encoding="utf-8"),
        )
        self.assertNotIn(
            "203.0.113.77",
            self.harness.batch_log.read_text(encoding="utf-8"),
        )


if __name__ == "__main__":
    unittest.main()
