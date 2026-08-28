from __future__ import annotations

import json
import unittest
from pathlib import Path

from internal.python.generate_profile_service_runtime import build_runtime_data

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_PATH = ROOT / "apps/profile-service/worker/generated/runtime-data.mjs"


class GenerateProfileServiceRuntimeTest(unittest.TestCase):
    def test_build_runtime_data_matches_checked_in_worker_artifact(self) -> None:
        data = build_runtime_data()
        self.assertEqual(data["schemaVersion"], 1)
        self.assertIn("ai-balanced", {profile["id"] for profile in data["baseProfiles"]})
        for key in ("groups", "regions", "stableRegionGroups", "plan", "parityFixtures", "render"):
            self.assertIn(key, data)
        self.assertEqual(
            set(data["parityFixtures"]),
            {"disable-jp", "only-us-sg-prefer-sg", "disable-hk"},
        )
        for fixture in data["parityFixtures"].values():
            self.assertEqual(len(fixture["customBodySha256"]), 64)

        artifact = RUNTIME_PATH.read_text(encoding="utf-8")
        self.assertTrue(artifact.startswith("// GENERATED. Do not edit.\nexport default "))
        body = artifact.removeprefix("// GENERATED. Do not edit.\nexport default ").removesuffix(";\n")
        self.assertEqual(json.loads(body), data)


if __name__ == "__main__":
    unittest.main()
