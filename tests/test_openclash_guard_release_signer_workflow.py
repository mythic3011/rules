from __future__ import annotations

from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "sign-openclash-guard-release.yml"


class ReleaseSignerWorkflowTests(unittest.TestCase):
    def test_signing_key_is_environment_gated_and_candidate_code_is_not_checked_out(self) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        self.assertEqual(
            workflow["permissions"],
            {"actions": "read", "contents": "read"},
        )

        qualifier = workflow["jobs"]["qualify-release"]
        self.assertNotIn("environment", qualifier)
        qualify = next(
            step for step in qualifier["steps"]
            if step["name"] == "Qualify immutable release candidate"
        )
        qualify_run = qualify["run"]
        self.assertIn("git merge-base --is-ancestor \"$GITHUB_SHA\" \"$candidate_sha\"", qualify_run)
        self.assertIn("verify_openclash_guard_release_candidate.py", qualify_run)
        self.assertIn("expected_sequence=$((trusted_sequence + 1))", qualify_run)
        self.assertIn("candidate already contains a detached signature", qualify_run)
        self.assertIn("trusted_generator_blob", qualify_run)
        self.assertIn("candidate_generator_blob", qualify_run)
        self.assertIn("auto-generate-ai-profiles.yml/runs?head_sha=${candidate_sha}&event=push", qualify_run)
        self.assertIn("./rulesctl managed-paths", qualify_run)
        self.assertIn("Unexpected post-generator paths", qualify_run)

        job = workflow["jobs"]["sign-release"]
        self.assertEqual(
            job["if"],
            "needs.qualify-release.outputs.should_sign == 'true' && github.ref == 'refs/heads/main'",
        )
        self.assertEqual(job["environment"], "openclash-guard-release")
        self.assertEqual(job["permissions"], {"contents": "write"})
        self.assertNotIn("USIGN_PRIVATE_KEY", job.get("env", {}))

        checkout = next(step for step in job["steps"] if step["name"] == "Checkout trusted signer code")
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")
        self.assertRegex(checkout["uses"], r"^actions/checkout@[0-9a-f]{40}$")

        reconfirm = next(
            step for step in job["steps"]
            if step["name"] == "Reconfirm immutable candidate head"
        )
        self.assertIn('remote_sha="$(git ls-remote --heads origin', reconfirm["run"])
        self.assertIn('[ "$remote_sha" = "$CANDIDATE_SHA" ]', reconfirm["run"])
        self.assertIn("git merge-base --is-ancestor \"$GITHUB_SHA\" \"$CANDIDATE_SHA\"", reconfirm["run"])

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

    def test_auto_trigger_follows_successful_same_repo_generator_pushes(self) -> None:
        text = WORKFLOW_PATH.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertIn("workflow_run:", text)
        self.assertIn("- Auto generate AI profiles", text)
        self.assertNotIn("- CodeQL Advanced", text)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", text)
        self.assertIn("github.event.workflow_run.event == 'push'", text)
        self.assertIn("github.event.workflow_run.head_repository.full_name == github.repository", text)
        self.assertIn("AUTO_TRIGGER_SHA: ${{ github.event.workflow_run.head_sha || '' }}", text)
        self.assertIn("branch no longer descends from the completed generator run", text)
        self.assertNotIn("\n  pull_request:\n", text)
        self.assertNotIn("\n  push:\n", text)

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


if __name__ == "__main__":
    unittest.main()
