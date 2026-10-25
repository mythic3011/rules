from pathlib import Path
import json
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
ROUTING = ROOT / "internal" / "config" / "ai-routing"


class TypeScriptReorgContractTests(unittest.TestCase):
    def test_core_fragments_are_namespaced_away_from_sibling_yaml_dialects(self):
        core = sorted(path.name for path in (ROUTING / "core").glob("[0-9][0-9]-*.yaml"))
        self.assertEqual(
            core,
            [
                "00-base.yaml",
                "10-route-targets.yaml",
                "20-protection-classes.yaml",
                "30-services.yaml",
                "40-access-profiles.yaml",
                "50-dns.yaml",
                "60-shared-backends.yaml",
            ],
        )
        for sibling in ("mihomo.yaml", "parity.yaml"):
            self.assertTrue((ROUTING / "projections" / sibling).is_file())
        self.assertTrue((ROUTING / "catalogs" / "process-rules.yaml").is_file())

        loader = (ROOT / "internal" / "typescript" / "routing" / "loader.ts").read_text()
        self.assertIn("CORE_FRAGMENT_FILE", loader)
        self.assertIn("CORE_FRAGMENT_FILE.test(entry.name)", loader)
        self.assertNotIn("entry.isFile() && /\\.ya?ml$/i.test(entry.name)", loader)

    def test_typescript_runtime_and_tests_do_not_reference_removed_reorg_paths(self):
        checked = [
            ROOT / "internal" / "typescript" / "routing" / "cli.ts",
            ROOT / "internal" / "typescript" / "routing" / "project" / "loader.ts",
            *sorted((ROOT / "tests" / "routing").glob("*.test.ts")),
        ]
        stale = (
            'join(ROOT, "data", "ai-routing")',
            'join(ROOT, "generated", "ai-routing")',
            'join(ROOT, "templates", "ai-routing")',
            'join(repositoryRoot, "generated", "ai-routing")',
            'join(repositoryRoot, "data", "ai-routing-parity.yaml")',
            'join(repositoryRoot, "templates", "ai-routing")',
        )
        for path in checked:
            text = path.read_text()
            for needle in stale:
                self.assertNotIn(needle, text, f"stale pre-reorg path in {path}: {needle}")

    def test_npm_routing_entrypoints_reference_existing_reorganized_paths(self):
        package = json.loads((ROOT / "package.json").read_text())
        scripts = package["scripts"]
        for name in (
            "routing",
            "routing:validate",
            "routing:generate",
            "routing:check",
        ):
            self.assertIn(name, scripts)
        self.assertTrue((ROUTING / "project.yaml").is_file())


if __name__ == "__main__":
    unittest.main()
