from __future__ import annotations

from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "sign-openclash-guard-release.yml"


class ReleaseSignerWorkflowTests(unittest.TestCase):
    def test_signing_key_is_environment_gated_and_candidate_code_is_not_checked_out(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        self.assertEqual(workflow["permissions"], {"contents": "read"})
        job = workflow["jobs"]["sign-release"]
        self.assertEqual(job["if"], "github.ref == 'refs/heads/main'")
        self.assertEqual(job["environment"], "openclash-guard-release")
        self.assertEqual(job["permissions"], {"contents": "write"})
        self.assertNotIn("USIGN_PRIVATE_KEY", job.get("env", {}))

        checkout = next(step for step in job["steps"] if step["name"] == "Checkout trusted signer code")
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")
        self.assertRegex(checkout["uses"], r"^actions/checkout@[0-9a-f]{40}$")

        resolve = next(step for step in job["steps"] if step["name"] == "Resolve immutable candidate head")
        self.assertIn("git check-ref-format --branch", resolve["run"])
        self.assertIn("git merge-base --is-ancestor \"$GITHUB_SHA\" \"$candidate_sha\"", resolve["run"])
        self.assertIn('main) echo "Refusing to write a release signature directly to main"', resolve["run"])

        verify = next(
            step for step in job["steps"]
            if step["name"] == "Verify candidate metadata and authenticated artifact bytes"
        )
        self.assertIn("verify_openclash_guard_release_candidate.py", verify["run"])
        self.assertIn('--candidate-sha "$CANDIDATE_SHA"', verify["run"])

        sign = next(step for step in job["steps"] if step["name"] == "Sign and verify detached metadata signature")
        self.assertEqual(
            sign["env"]["USIGN_PRIVATE_KEY"],
            "${{ secrets.OPENCLASH_GUARD_USIGN_PRIVATE_KEY }}",
        )
        self.assertEqual(
            sign["env"]["USIGN_PUBLIC_KEY"],
            "${{ secrets.OPENCLASH_GUARD_USIGN_PUBLIC_KEY }}",
        )
        self.assertIn("usign -S", sign["run"])
        self.assertIn("usign -V", sign["run"])
        self.assertIn("EXPECTED_SIGNER_FINGERPRINT", sign["run"])

    def test_usign_is_built_from_a_pinned_upstream_revision(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        job = workflow["jobs"]["sign-release"]
        self.assertEqual(job["env"]["USIGN_SOURCE_REPOSITORY"], "https://github.com/openwrt/usign.git")
        revision = job["env"]["USIGN_SOURCE_REVISION"]
        self.assertRegex(revision, r"^[0-9a-f]{40}$")

        build = next(step for step in job["steps"] if step["name"] == "Build pinned usign")
        run = build["run"]
        self.assertIn('git -C "$source_dir" fetch --depth=1 origin "$USIGN_SOURCE_REVISION"', run)
        self.assertIn('[ "$resolved_revision" = "$USIGN_SOURCE_REVISION" ]', run)
        self.assertIn('git -C "$source_dir" checkout --detach "$USIGN_SOURCE_REVISION"', run)
        self.assertIn('cmake -S "$source_dir" -B "$build_dir"', run)
        self.assertIn('install -m 0755 "$build_dir/usign" "$bin_dir/usign"', run)
        self.assertNotIn("apt-get install", run)
        self.assertNotIn("apt install", run)

    def test_publication_is_signature_only_race_checked_and_never_force_pushes(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        job = workflow["jobs"]["sign-release"]
        publish = next(
            step for step in job["steps"]
            if step["name"] == "Publish signature-only commit to unchanged candidate head"
        )
        run = publish["run"]
        self.assertGreaterEqual(run.count("git ls-remote --heads origin"), 2)
        self.assertIn('changed="$(git diff --cached --name-only)"', run)
        self.assertIn('[ "$changed" = "dist/openclash-guard.release.json.sig" ]', run)
        self.assertIn('git push origin "HEAD:refs/heads/${TARGET_BRANCH}"', run)
        self.assertNotIn("--force", run)

        full_text = WORKFLOW_PATH.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", full_text)
        self.assertNotIn("pull_request:", full_text)
        self.assertNotIn("\n  push:\n", full_text)


if __name__ == "__main__":
    unittest.main()
