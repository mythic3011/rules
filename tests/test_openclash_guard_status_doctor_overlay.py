from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from test_openclash_guard_atomic_reconcile import GuardRuntimeHarness  # noqa: E402


class StatusDoctorOverlayTests(GuardRuntimeHarness):
    def test_status_and_doctor_report_redacted_overlay_without_mutating_runtime(self) -> None:
        self.write_uci(
            {
                "main.enabled": "1",
                "main.profile_url": "http://URL_SENTINEL.invalid/private",
                "udp.enabled": "1",
                "udp.src_ip": ["192.0.2.44"],
                "future.token": "TOKEN_SENTINEL",
            }
        )
        self.write_nft({"inet openclash_guard": "last-good-state"})
        nft_before = self.nft_state.read_bytes()

        status = self.run_cli("status", "--json")
        self.assertEqual(status.returncode, 0, status.stdout + status.stderr)
        payload = json.loads(status.stdout)
        overlay = payload["uciOverlay"]
        self.assertEqual(set(overlay), {"available", "valid", "errors", "unknownOptions"})
        self.assertTrue(overlay["available"])
        self.assertFalse(overlay["valid"])
        self.assertTrue(any(error["option"] == "main.profile_url" for error in overlay["errors"]))
        self.assertEqual(overlay["unknownOptions"], [{"option": "future.token"}])
        deferred = {item["option"]: item["reason"] for item in payload["uciDeferredOptions"]}
        self.assertIn("udp.enabled", deferred)
        self.assertIn("udp.src_ip", deferred)
        self.assertIn("disabled", deferred["udp.enabled"])

        doctor = self.run_cli("doctor")
        self.assertEqual(doctor.returncode, 0, doctor.stdout + doctor.stderr)
        doctor_output = doctor.stdout + doctor.stderr
        self.assertIn("main.profile_url:", doctor_output)
        self.assertIn("unknown option ignored: future.token", doctor_output)
        self.assertIn("udp.src_ip is deferred:", doctor_output)

        for projection in (status.stdout, doctor.stdout, doctor.stderr):
            for raw_value in ("URL_SENTINEL", "TOKEN_SENTINEL", "192.0.2.44"):
                self.assertNotIn(raw_value, projection)
        self.assertEqual(self.mutations(), [])
        self.assertEqual(self.nft_state.read_bytes(), nft_before)
        self.assertFalse(
            any(self._uci_command(call) in {"set", "add_list", "delete", "commit", "revert"} for call in self.uci_calls()),
            "status and doctor must not write UCI",
        )

    @staticmethod
    def _uci_command(args: list[str]) -> str:
        args = list(args)
        while args and args[0] in ("-q", "-d"):
            if args[0] == "-q":
                args.pop(0)
            else:
                del args[:2]
        return args[0] if args else ""


if __name__ == "__main__":
    unittest.main()
