from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "dependabot-auto-merge.yml"
METADATA_ACTION_SHA = "25dd0e34f4fe68f24cc83900b1fe3fe149efef98"
GITHUB_SCRIPT_SHA = "3a2844b7e9c422d3c10d287c895573f7108da1b3"

NODE_HARNESS = r"""
const source = process.argv[1];
const scenario = JSON.parse(process.argv[2]);
const calls = [];
let current = {
  id: "PR_node_id",
  headRefOid: scenario.currentHead,
  isDraft: scenario.isDraft,
  labels: { nodes: scenario.labels.map((name) => ({name})) },
  autoMergeRequest: scenario.autoMergeActor
    ? {enabledBy: {login: scenario.autoMergeActor}}
    : null,
};
let queryCount = 0;

const github = {
  async graphql(query, variables) {
    if (query.startsWith("query")) {
      queryCount += 1;
      if (queryCount > 1 && scenario.changeAfterEnable) {
        current.labels.nodes = current.labels.nodes.filter(({name}) => name !== "automerge");
      }
      return {repository: {pullRequest: JSON.parse(JSON.stringify(current))}};
    }
    if (query.includes("enablePullRequestAutoMerge")) {
      calls.push({kind: "enable", variables});
      if (current.headRefOid !== variables.expectedHeadOid) {
        throw new Error("expected head did not match");
      }
      if (current.autoMergeRequest) throw new Error("auto-merge already exists");
      current.autoMergeRequest = {enabledBy: {login: "github-actions[bot]"}};
      return {enablePullRequestAutoMerge: {pullRequest: {number: 17}}};
    }
    if (query.includes("disablePullRequestAutoMerge")) {
      calls.push({kind: "disable", variables});
      if (current.autoMergeRequest?.enabledBy?.login === "github-actions[bot]") {
        current.autoMergeRequest = null;
      }
      return {disablePullRequestAutoMerge: {pullRequest: {number: 17}}};
    }
    throw new Error("unexpected GraphQL operation");
  },
};

const context = {
  repo: {owner: "example", repo: "rules"},
  payload: {
    pull_request: {
      number: 17,
      head: {sha: process.env.EVENT_HEAD_SHA},
      user: {login: "dependabot[bot]"},
    },
  },
};
const core = {info() {}, warning() {}, setFailed(message) { throw new Error(message); }};
const run = new Function("github", "context", "core", `return (async () => {${source}\n})();`);
run(github, context, core)
  .then(() => process.stdout.write(JSON.stringify({calls, finalAutoMerge: current.autoMergeRequest})))
  .catch((error) => {
    process.stderr.write(String(error && error.stack || error));
    process.exitCode = 1;
  });
"""


class DependabotAutoMergeWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        workflow = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
        cls.workflow = workflow
        cls.jobs = workflow["jobs"]
        cls.script = next(
            step["with"]["script"]
            for step in cls.jobs["reconcile-automerge"]["steps"]
            if step["name"] == "Reconcile auto-merge eligibility"
        )

    def run_reconciliation(
        self,
        *,
        update_type: str = "version-update:semver-minor",
        metadata_result: str = "success",
        event_head: str = "head-1",
        current_head: str = "head-1",
        labels: list[str] | None = None,
        is_draft: bool = False,
        auto_merge_actor: str | None = None,
        change_after_enable: bool = False,
    ) -> dict[str, object]:
        environment = os.environ.copy()
        environment.update(
            {
                "DEPENDABOT_METADATA_RESULT": metadata_result,
                "DEPENDABOT_UPDATE_TYPE": update_type,
                "EVENT_HEAD_SHA": event_head,
            }
        )
        scenario = {
            "currentHead": current_head,
            "labels": labels if labels is not None else ["automerge"],
            "isDraft": is_draft,
            "autoMergeActor": auto_merge_actor,
            "changeAfterEnable": change_after_enable,
        }
        result = subprocess.run(
            ["node", "-e", NODE_HARNESS, self.script, json.dumps(scenario)],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_reconciliation_runs_for_unlabel_and_draft_transitions(self) -> None:
        events = self.workflow.get("on", self.workflow.get(True, {}))
        event_types = set(events["pull_request_target"]["types"])
        self.assertTrue({"unlabeled", "converted_to_draft", "ready_for_review", "edited"} <= event_types)

        classifier = self.jobs["dependabot-metadata"]
        self.assertIn("dependabot[bot]", classifier["if"])
        self.assertNotIn("automerge", classifier["if"])
        reconcile = self.jobs["reconcile-automerge"]
        self.assertIn("always()", reconcile["if"])
        self.assertEqual(reconcile["needs"], "dependabot-metadata")

    def test_metadata_action_is_sha_pinned_and_read_only(self) -> None:
        classifier = self.jobs["dependabot-metadata"]
        self.assertEqual(self.workflow["permissions"], {})
        self.assertEqual(classifier["permissions"], {"pull-requests": "read"})
        self.assertEqual(
            classifier["outputs"]["update_type"],
            "${{ steps.dependabot-metadata.outputs.update-type }}",
        )

        metadata_step = next(step for step in classifier["steps"] if step["id"] == "dependabot-metadata")
        self.assertRegex(
            metadata_step["uses"],
            re.compile(r"^dependabot/fetch-metadata@[0-9a-f]{40}(?:\s+# v[0-9.]+)?$"),
        )
        self.assertIn(METADATA_ACTION_SHA, metadata_step["uses"])
        self.assertEqual(metadata_step["with"]["github-token"], "${{ github.token }}")
        self.assertNotIn("actions/checkout", str(classifier["steps"]))

        reconcile = self.jobs["reconcile-automerge"]
        self.assertEqual(
            reconcile["permissions"],
            {"contents": "write", "pull-requests": "write"},
        )
        self.assertEqual(
            reconcile["env"]["DEPENDABOT_METADATA_RESULT"],
            "${{ needs.dependabot-metadata.result }}",
        )
        self.assertNotIn("actions/checkout", str(reconcile["steps"]))

    def test_all_external_actions_are_pinned_to_verified_releases(self) -> None:
        expected = {
            "dependabot/fetch-metadata": (METADATA_ACTION_SHA, "v3.1.0"),
            "actions/github-script": (GITHUB_SCRIPT_SHA, "v9.0.0"),
        }
        parsed_uses = [
            step["uses"]
            for job in self.jobs.values()
            for step in job["steps"]
            if "uses" in step
        ]
        for reference in parsed_uses:
            action, separator, sha = reference.partition("@")
            self.assertTrue(separator, reference)
            self.assertIn(action, expected)
            self.assertEqual(sha, expected[action][0])

        raw_references = re.findall(
            r"^\s*uses:\s*([^@\s]+)@([0-9a-f]{40})\s+#\s*(v[0-9.]+)\s*$",
            WORKFLOW_PATH.read_text(encoding="utf-8"),
            re.MULTILINE,
        )
        self.assertCountEqual(
            raw_references,
            [(action, sha, version) for action, (sha, version) in expected.items()],
        )

    def test_eligible_minor_binds_auto_merge_to_the_event_head(self) -> None:
        result = self.run_reconciliation(update_type="version-update:semver-patch")
        self.assertEqual([call["kind"] for call in result["calls"]], ["enable"])
        self.assertEqual(result["calls"][0]["variables"]["expectedHeadOid"], "head-1")
        self.assertEqual(result["finalAutoMerge"]["enabledBy"]["login"], "github-actions[bot]")

    def test_major_update_disables_an_existing_automation_request(self) -> None:
        result = self.run_reconciliation(
            update_type="version-update:semver-major",
            auto_merge_actor="github-actions[bot]",
        )
        self.assertEqual([call["kind"] for call in result["calls"]], ["disable"])
        self.assertIsNone(result["finalAutoMerge"])

    def test_metadata_failure_or_missing_metadata_disables_existing_automation(self) -> None:
        for update_type, metadata_result in (("", "failure"), ("", "success")):
            with self.subTest(update_type=update_type, metadata_result=metadata_result):
                result = self.run_reconciliation(
                    update_type=update_type,
                    metadata_result=metadata_result,
                    auto_merge_actor="github-actions[bot]",
                )
                self.assertEqual([call["kind"] for call in result["calls"]], ["disable"])
                self.assertIsNone(result["finalAutoMerge"])

    def test_stale_event_head_never_enables_current_head(self) -> None:
        result = self.run_reconciliation(
            event_head="old-head",
            current_head="new-head",
            auto_merge_actor="github-actions[bot]",
        )
        self.assertNotIn("enable", [call["kind"] for call in result["calls"]])
        self.assertEqual([call["kind"] for call in result["calls"]], ["disable"])
        self.assertIsNone(result["finalAutoMerge"])

    def test_unlabeled_or_draft_pr_disables_existing_automation(self) -> None:
        scenarios = (
            {"labels": []},
            {"is_draft": True},
        )
        for scenario in scenarios:
            with self.subTest(scenario=scenario):
                kwargs = {"auto_merge_actor": "github-actions[bot]"}
                if "labels" in scenario:
                    kwargs["labels"] = scenario["labels"]
                if "is_draft" in scenario:
                    kwargs["is_draft"] = scenario["is_draft"]
                result = self.run_reconciliation(**kwargs)
                self.assertEqual([call["kind"] for call in result["calls"]], ["disable"])
                self.assertIsNone(result["finalAutoMerge"])

    def test_human_auto_merge_is_preserved_when_workflow_eligibility_fails(self) -> None:
        result = self.run_reconciliation(
            update_type="version-update:semver-major",
            auto_merge_actor="maintainer",
        )
        self.assertEqual(result["calls"], [])
        self.assertEqual(result["finalAutoMerge"]["enabledBy"]["login"], "maintainer")

    def test_label_removed_during_enable_is_reconciled_immediately(self) -> None:
        result = self.run_reconciliation(change_after_enable=True)
        self.assertEqual([call["kind"] for call in result["calls"]], ["enable", "disable"])
        self.assertIsNone(result["finalAutoMerge"])


if __name__ == "__main__":
    unittest.main()
