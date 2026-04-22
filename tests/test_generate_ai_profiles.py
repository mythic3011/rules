from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "py" / "generate_ai_profiles.py"
SPEC = importlib.util.spec_from_file_location("generate_ai_profiles", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load module from {MODULE_PATH}")

MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GenerateAiProfilesTest(unittest.TestCase):
    def extract_yaml_group_block(self, rendered_yaml: str, name: str) -> str:
        lines = rendered_yaml.splitlines()
        block: list[str] = []
        in_block = False

        for line in lines:
            if line.startswith('  - name: "'):
                if in_block:
                    break
                if line == f'  - name: "{name}"':
                    in_block = True
            if in_block:
                block.append(line)

        return "\n".join(block)

    def extract_ini_group_line(self, rendered_ini: str, name: str) -> str:
        prefix = f"custom_proxy_group={name}`"
        return next((line for line in rendered_ini.splitlines() if line.startswith(prefix)), "")

    def test_should_define_notebooklm_ruleset(self) -> None:
        notebooklm_ruleset = next(
            (item for item in MODULE.AI_RULESETS if item["id"] == "AI_NotebookLM"),
            None,
        )

        self.assertIsNotNone(notebooklm_ruleset)
        self.assertEqual(notebooklm_ruleset["group"], "🤖 NotebookLM")
        self.assertIn("DOMAIN-SUFFIX,notebooklm.google.com", notebooklm_ruleset["payload"])
        self.assertIn("DOMAIN-SUFFIX,notebooklm.google", notebooklm_ruleset["payload"])

    def test_should_render_notebooklm_group_in_generated_outputs(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)
        rendered_ini = MODULE.render_ini()
        notebooklm_group_line = self.extract_ini_group_line(rendered_ini, "🤖 NotebookLM")

        self.assertIn('- name: "🤖 NotebookLM"', rendered_yaml)
        self.assertIn('  - "RULE-SET,AI_NotebookLM,🤖 NotebookLM"', rendered_yaml)
        self.assertIn("ruleset=🤖 NotebookLM,clash-classic:", rendered_ini)
        self.assertIn("custom_proxy_group=🤖 NotebookLM`fallback`", notebooklm_group_line)
        self.assertIn("[]🎯 全球直連", notebooklm_group_line)

    def test_should_render_hk_first_templates_with_cn_dns_policy_only(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)
        rendered_ini = MODULE.render_ini()

        self.assertIn('  - "GEOIP,HK,🎯 全球直連,no-resolve"', rendered_yaml)
        self.assertIn("ruleset=🎯 全球直連,[]GEOIP,HK,no-resolve", rendered_ini)

        self.assertNotIn("    - geosite:cn", rendered_yaml)
        self.assertNotIn('  - "GEOSITE,cn,🎯 全球直連"', rendered_yaml)
        self.assertNotIn('  - "GEOSITE,google-cn,🎯 全球直連"', rendered_yaml)
        self.assertNotIn("ruleset=🎯 全球直連,[]GEOSITE,cn", rendered_ini)
        self.assertNotIn("ruleset=🎯 全球直連,[]GEOSITE,google-cn", rendered_ini)
        self.assertIn('    "geosite:cn":', rendered_yaml)
        self.assertIn("      - https://127.0.0.1:5053/dns-query", rendered_yaml)

    def test_should_keep_auto_only_in_normal_fallback_group(self) -> None:
        normal_fallback = self.extract_yaml_group_block(MODULE.render_yaml(strict=False), "🐟 漏網之魚")
        strict_fallback = self.extract_yaml_group_block(MODULE.render_yaml(strict=True), "🐟 漏網之魚")

        self.assertIn('      - "♻️ 自動選擇"', normal_fallback)
        self.assertNotIn('      - "♻️ 自動選擇"', strict_fallback)
        self.assertIn('      - "🎯 全球直連"', strict_fallback)
        self.assertIn('      - "🚀 手動選擇"', strict_fallback)
