from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps/luci-app-openclash-guard/root"
sys.path.insert(0, str(ROOT / "internal/python"))
from generate_router_observations import OUTPUT, SOURCE, render_catalog


class RouterObservationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="guard-rule-observations-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.catalog = json.loads(render_catalog())
        self.validator = Draft202012Validator(json.loads((ROOT /
            "internal/config/openclash-guard/router-observations.response.v1.schema.json").read_text()))
        self.policy = self.base / "policy.json"
        self.policy.write_text(json.dumps({"schemaVersion": 1, "revision": "a" * 64,
            "nft": {"family": "inet", "table": "openclash_guard", "commentPrefix": "openclash-guard"}}))
        self.catalog["runtimePolicyPath"] = str(self.policy)
        self.catalog_path = self.base / "catalog.json"
        self.raw = self.base / "ruleset.json"
        self.log = self.base / "argv.json"
        self.bin = self.base / "bin"
        self.bin.mkdir()
        stub = self.bin / "nft"
        stub.write_text(f'#!{sys.executable}\n' + '''import json, os, sys, time
from pathlib import Path
Path(os.environ["OBS_TEST_ARGV"]).write_text(json.dumps(sys.argv[1:]))
if sys.argv[1:] != ["-j", "list", "ruleset"]:
    raise SystemExit(99)
time.sleep(float(os.environ.get("OBS_TEST_DELAY", "0")))
sys.stdout.write(Path(os.environ["OBS_TEST_RAW"]).read_text())
raise SystemExit(int(os.environ.get("OBS_TEST_EXIT", "0")))
''')
        stub.chmod(0o755)
        self.helper = self.base / "helper"
        self.helper.write_text((APP / "usr/libexec/openclash-guard-observations").read_text().replace(
            "CATALOG_FILE='/usr/share/openclash-guard/router-observations.v1.json'",
            f"CATALOG_FILE='{self.catalog_path}'").replace(
            "FILTER_FILE='/usr/share/openclash-guard/router-observations.jq'",
            f"FILTER_FILE='{APP / 'usr/share/openclash-guard/router-observations.jq'}'"))
        self.env = {**os.environ, "PATH": f"{self.bin}:{os.environ.get('PATH', os.defpath)}",
            "OBS_TEST_RAW": str(self.raw), "OBS_TEST_ARGV": str(self.log)}

    def rule(self, **overrides: object) -> dict:
        return {"rule": {"family": "inet", "table": "openclash_guard", "chain": "forward",
            "handle": 7, "comment": "openclash-guard:protected-udp",
            "expr": [{"match": {"right": "198.51.100.77"}},
                {"counter": {"packets": 12, "bytes": 800}}, {"reject": {}}], **overrides}}

    def collect(self, entries: list | None = None, *, raw: str | None = None, **env: str) -> dict:
        self.catalog_path.write_text(json.dumps(self.catalog))
        self.raw.write_text(raw if raw is not None else json.dumps({"nftables": entries or []}))
        result = subprocess.run(["/bin/sh", str(self.helper), "snapshot"],
            env={**self.env, **env}, text=True, capture_output=True, timeout=10, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        document = json.loads(result.stdout)
        self.validator.validate(document)
        return document

    def test_invalid_catalog_fails_before_collecting(self) -> None:
        del self.catalog["limits"]["maxInputBytes"]
        self.assertEqual(self.collect()["error"], "catalog-invalid")
        self.assertFalse(self.log.exists())

    def test_generated_catalog_is_current_and_rule_references_exist(self) -> None:
        self.assertEqual(OUTPUT.read_text(), render_catalog())
        source = "\n".join((ROOT / "shell/apps/openclash-guard" / name).read_text()
            for name in ("killswitch.sh", "gaming.sh", "resolver-sync.sh"))
        for rule in self.catalog["ruleReasons"]:
            self.assertIn(rule["id"], source)

    def test_live_counter_snapshot_is_read_only_and_minimized(self) -> None:
        result = self.collect([{"table": {"family": "inet", "name": "openclash_guard"}}, self.rule()])
        self.assertTrue(result["ok"])
        self.assertEqual(json.loads(self.log.read_text()), ["-j", "list", "ruleset"])
        self.assertEqual(result["rules"][0]["packets"], 12)
        self.assertEqual(result["rules"][0]["decision"], "reject")
        self.assertEqual(result["policy"]["binding"], "unverified")
        self.assertIsNone(result["policy"]["appliedRevision"])
        self.assertFalse(result["coverage"]["ruleSemanticsVerified"])
        self.assertNotIn("198.51.100.77", json.dumps(result))
        self.assertNotIn("expr", json.dumps(result))

    def test_missing_counter_and_rule_shape_changes_are_not_reported_as_zero_hits(self) -> None:
        for expression, status in [([{"reject": {}}], "counter-unavailable"),
            ([{"accept": None}], "rule-shape-mismatch"),
            ([{"counter": {"packets": -1, "bytes": 1}}, {"reject": {}}], "counter-invalid"),
            ([{"counter": "named-counter"}, {"reject": {}}], "counter-invalid")]:
            with self.subTest(status=status):
                row = self.collect([self.rule(expr=expression)])["rules"][0]
                self.assertEqual(row["status"], status)
                self.assertIsNone(row["packets"])

    def test_offload_and_unknown_rule_coverage_stay_explicit(self) -> None:
        result = self.collect([self.rule(), self.rule(comment="openclash-guard:future-rule"),
            {"flowtable": {"family": "inet", "table": "fw4", "name": "ft", "flags": ["offload"]}}])
        coverage = result["coverage"]
        self.assertTrue(coverage["flowtablesPresent"])
        self.assertTrue(coverage["hardwareOffloadFlagPresent"])
        self.assertEqual(coverage["offloadCoverage"], "unverified")
        self.assertEqual(coverage["unknownRuleCount"], 1)
        self.assertEqual(coverage["status"], "partial")

    def test_foreign_tables_comments_and_chains_do_not_get_trusted_labels(self) -> None:
        result = self.collect([self.rule(table="fw4"), self.rule(comment="other:protected-udp"),
            self.rule(chain="foreign")])
        self.assertEqual(len(result["rules"]), 1)
        self.assertEqual(result["rules"][0]["status"], "rule-shape-mismatch")
        self.assertEqual(result["rules"][0]["decision"], "unknown")

    def test_failed_or_invalid_collection_cannot_become_empty_success(self) -> None:
        self.assertEqual(self.collect([self.rule()], OBS_TEST_EXIT="1")["error"], "collection-failed")
        for raw in ["", "{}", '{"nftables":[]} {"nftables":[]}', '{"nftables":[1]}']:
            with self.subTest(raw=raw):
                self.assertFalse(self.collect(raw=raw)["ok"])

    def test_byte_record_and_time_limits(self) -> None:
        self.catalog["limits"]["maxRecords"] = 1
        result = self.collect([self.rule(handle=1), self.rule(handle=2)])
        self.assertEqual(len(result["rules"]), 1)
        self.assertTrue(result["coverage"]["truncated"])
        self.catalog["limits"]["maxInputBytes"] = 512
        self.assertEqual(self.collect(raw=" " * 1024)["error"], "input-limit")
        self.catalog["limits"]["commandTimeoutSeconds"] = 1
        started = time.monotonic()
        self.assertEqual(self.collect([], OBS_TEST_DELAY="4")["error"], "collection-failed")
        self.assertLess(time.monotonic() - started, 4)

    def test_counter_precision_is_not_silently_rounded(self) -> None:
        row = self.collect([self.rule(expr=[{"counter": {"packets": 9007199254740992, "bytes": 1}},
            {"reject": {}}])])["rules"][0]
        self.assertEqual(row["status"], "counter-invalid")
        self.assertIsNone(row["packets"])
