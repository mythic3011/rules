from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "shell" / "apps" / "openclash-guard" / "policy.sh"


class OpenClashGuardPolicyScopeTests(unittest.TestCase):
    def run_refresh(self, *, openclash_healthy: bool, kill_switch: bool = True) -> dict[str, str]:
        script = f'''\\
set -eu
. "{POLICY}"

guard_policy_needs_failclosed() {{ return 0; }}
_GUARD_UCI_ENABLED=1
_GUARD_UCI_KILL_SWITCH={1 if kill_switch else 0}
_GUARD_DNS_DOMAIN_SET=unavailable
_GUARD_OC_HEALTHY={1 if openclash_healthy else 0}

guard_policy_refresh_state
printf 'state=%s\n' "$_GUARD_POLICY_STATE"
printf 'enforcement=%s\n' "$_GUARD_POLICY_ENFORCEMENT"
printf 'global=%s\n' "$_GUARD_POLICY_GLOBAL_FAILCLOSED"
printf 'reason=%s\n' "$_GUARD_POLICY_STATE_REASON"
'''
        result = subprocess.run(
            ["/bin/sh", "-c", script],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        return dict(line.split("=", 1) for line in result.stdout.splitlines())

    def test_domain_set_degradation_is_service_scoped(self) -> None:
        values = self.run_refresh(openclash_healthy=True)
        self.assertEqual(values["state"], "degraded")
        self.assertEqual(values["enforcement"], "reject")
        self.assertEqual(values["global"], "0")
        self.assertEqual(values["reason"], "domain-set-backend-unavailable")

    def test_openclash_failure_enables_global_failclosed(self) -> None:
        values = self.run_refresh(openclash_healthy=False)
        self.assertEqual(values["state"], "degraded")
        self.assertEqual(values["enforcement"], "reject")
        self.assertEqual(values["global"], "1")
        self.assertEqual(values["reason"], "multiple-degraded-components")

    def test_disabled_global_kill_switch_stays_service_scoped(self) -> None:
        values = self.run_refresh(openclash_healthy=False, kill_switch=False)
        self.assertEqual(values["state"], "degraded")
        self.assertEqual(values["enforcement"], "reject")
        self.assertEqual(values["global"], "0")
        self.assertEqual(values["reason"], "multiple-degraded-components")


if __name__ == "__main__":
    unittest.main()
