from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


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

    def test_should_use_classical_provider_keys_for_ai_rules(self) -> None:
        provider_keys = [item["provider_key"] for item in MODULE.AI_RULESETS]

        self.assertEqual(
            provider_keys,
            [
                "AI_Copilot_Classical",
                "AI_Gemini_Classical",
                "AI_NotebookLM_Classical",
            ],
        )

    def test_should_generate_rule_sets_only_for_services_with_local_payloads(self) -> None:
        service_ids = [item["id"] for item in MODULE.AI_SERVICES]
        ruleset_provider_keys = [item["provider_key"] for item in MODULE.AI_RULESETS]

        self.assertEqual(len(service_ids), len(set(service_ids)))
        self.assertEqual(
            ruleset_provider_keys,
            [service["provider_key"] for service in MODULE.AI_SERVICES if service["payload"]],
        )
        self.assertEqual(
            {item["group"] for item in MODULE.AI_RULESETS},
            {service["group"] for service in MODULE.AI_SERVICES if service["payload"]},
        )

    def test_should_render_service_identity_and_guard_rules_before_relaxed_rules(self) -> None:
        rules = MODULE.render_yaml_rules(strict=False, include_process_rules=False).splitlines()
        identity_rules = [
            f'"RULE-SET,{service["provider_key"]},{service["group"]}"'
            for service in MODULE.AI_SERVICES
            if service["payload"]
        ]
        identity_rules.extend(
            f'"GEOSITE,{geosite},{service["group"]}"'
            for service in MODULE.AI_SERVICES
            for geosite in service["geosites"]
        )
        guard_indices = [
            next(i for i, line in enumerate(rules) if f'"GEOSITE,{geosite},{MODULE.GROUP["reject"]}"' in line)
            for geosite in MODULE.AI_GUARD_GEOSITES
        ]
        ssh_index = next(i for i, line in enumerate(rules) if "SSH_Direct_Classical" in line)
        geoip_hk_index = next(i for i, line in enumerate(rules) if "GEOIP,HK" in line)
        match_index = next(i for i, line in enumerate(rules) if "MATCH," in line)

        for expected in identity_rules:
            self.assertTrue(any(expected in line for line in rules), expected)
        self.assertNotIn("AI_All_Classical", "\n".join(rules))
        self.assertLess(max(guard_indices), ssh_index)
        self.assertLess(ssh_index, geoip_hk_index)
        self.assertLess(geoip_hk_index, match_index)

    def test_should_render_strict_match_to_reject(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=True)

        self.assertIn(f'"MATCH,{MODULE.GROUP["reject"]}"', rendered_yaml)
        self.assertNotIn('"MATCH,DIRECT"', rendered_yaml)

    def test_should_render_relaxed_fallback_with_reject_last(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)
        fallback_group = self.extract_yaml_group_block(rendered_yaml, MODULE.GROUP["fallback"])

        self.assertIn(f'      - "{MODULE.GROUP["direct"]}"', fallback_group)
        self.assertIn(f'      - "{MODULE.GROUP["manual"]}"', fallback_group)
        self.assertIn(f'      - "{MODULE.GROUP["auto"]}"', fallback_group)
        self.assertTrue(fallback_group.rstrip().endswith(f'- "{MODULE.GROUP["reject"]}"'))

    def test_should_keep_direct_out_of_strict_manual_and_service_groups(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=True)
        manual_group = self.extract_yaml_group_block(rendered_yaml, MODULE.GROUP["manual"])
        claude_group = self.extract_yaml_group_block(rendered_yaml, MODULE.GROUP["claude"])
        copilot_group = self.extract_yaml_group_block(rendered_yaml, MODULE.GROUP["copilot"])
        copilot_auto_group = self.extract_yaml_group_block(
            rendered_yaml,
            MODULE.service_auto_group_name(MODULE.GROUP["copilot"]),
        )

        self.assertNotIn(MODULE.GROUP["direct"], manual_group)
        self.assertIn('  use:', manual_group)
        self.assertIn('    - provider1', manual_group)
        self.assertNotIn(MODULE.GROUP["direct"], claude_group)
        self.assertNotIn(MODULE.GROUP["direct"], copilot_group)
        self.assertNotIn(MODULE.GROUP["direct"], copilot_auto_group)

    def test_should_separate_service_ui_from_automatic_fallback_chain(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)
        claude_group = self.extract_yaml_group_block(rendered_yaml, MODULE.GROUP["claude"])
        claude_auto_name = MODULE.service_auto_group_name(MODULE.GROUP["claude"])
        claude_auto_group = self.extract_yaml_group_block(rendered_yaml, claude_auto_name)

        self.assertIn("    type: select", claude_group)
        self.assertIn(f'      - "{claude_auto_name}"', claude_group)
        self.assertIn(f'      - "{MODULE.GROUP["manual"]}"', claude_group)
        self.assertIn(f'      - "{MODULE.GROUP["auto"]}"', claude_group)

        self.assertIn("    type: fallback", claude_auto_group)
        self.assertNotIn(MODULE.GROUP["manual"], claude_auto_group)
        self.assertNotIn(f'      - "{MODULE.GROUP["auto"]}"', claude_auto_group)
        self.assertIn(f'      - "{MODULE.GROUP["sg"]}"', claude_auto_group)
        self.assertIn(f'      - "{MODULE.GROUP["us"]}"', claude_auto_group)
        self.assertTrue(claude_auto_group.rstrip().endswith(f'- "{MODULE.GROUP["reject"]}"'))

    def test_should_keep_global_region_groups_provider_only(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)

        for region in MODULE.ALL_REGION_ORDER:
            block = self.extract_yaml_group_block(rendered_yaml, MODULE.GROUP[region])
            self.assertIn("    use:", block)
            self.assertIn("      - provider1", block)
            self.assertNotIn("    proxies:", block)

    def test_should_fix_taiwan_group_label_and_filters(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)
        rendered_ini = MODULE.render_ini()

        self.assertIn(MODULE.GROUP["tw"], rendered_yaml)
        self.assertIn(MODULE.GROUP["tw"], rendered_ini)
        self.assertNotIn("🇼🇸 台灣節點", rendered_yaml)
        self.assertNotIn("🇼🇸 台灣節點", rendered_ini)

    def test_should_keep_manual_ini_group_open_to_filtered_provider_nodes(self) -> None:
        rendered_ini = MODULE.render_ini()
        manual_group = self.extract_ini_group_line(rendered_ini, MODULE.GROUP["manual"])

        self.assertIn(f"[]{MODULE.GROUP['direct']}", manual_group)
        self.assertIn(MODULE.AI_POOL_FILTER, manual_group)

    def test_should_render_ini_mvp_before_legacy_and_keep_claude_reject_only(self) -> None:
        rendered_ini = MODULE.render_ini()
        claude_provider = "rules/clash/anthropic.yaml"
        claude_rule = rendered_ini.index(claude_provider)
        claude_reject = rendered_ini.index(
            f"ruleset={MODULE.GROUP['reject']},clash-classic:",
            claude_rule,
        )
        chatgpt = rendered_ini.index("ruleset=🤖 ChatGPT,[]GEOSITE,openai")
        windsurf = rendered_ini.index("rules/clash/windsurf.yaml")
        huggingface = rendered_ini.index("rules/clash/huggingface.yaml")
        ai_all = rendered_ini.index("rules/clash/all.yaml")
        category_guard = rendered_ini.index("[]GEOSITE,category-ai-!cn")

        self.assertLess(claude_rule, claude_reject)
        self.assertLess(claude_reject, chatgpt)
        self.assertLess(chatgpt, windsurf)
        self.assertLess(windsurf, huggingface)
        self.assertLess(huggingface, ai_all)
        self.assertLess(ai_all, category_guard)
        self.assertEqual(
            self.extract_ini_group_line(rendered_ini, "🔐 Claude Account Guard"),
            "custom_proxy_group=🔐 Claude Account Guard`select`[]⛔ 拒絕",
        )
        self.assertEqual(
            self.extract_ini_group_line(rendered_ini, "🌊 Windsurf"),
            "custom_proxy_group=🌊 Windsurf`select`[]🇺🇸 US Stable`[]🇸🇬 SG Stable`[]🇯🇵 JP Stable`[]⛔ 拒絕",
        )
        plan = json.loads(MODULE.INI_MVP_PLAN_PATH.read_text(encoding="utf-8"))
        us_stable = next(group for group in plan["groups"] if group["name"] == "🇺🇸 US Stable")
        self.assertEqual(
            self.extract_ini_group_line(rendered_ini, "🇺🇸 US Stable"),
            f"custom_proxy_group=🇺🇸 US Stable`select`[]{MODULE.GROUP['reject']}`{us_stable['candidates'][1]['value']}",
        )
        self.assertNotIn("custom_proxy_group=🤖 Claude`", rendered_ini)
        self.assertNotIn("ruleset=🤖 Claude,[]GEOSITE,anthropic", rendered_ini)

    def test_should_reject_malformed_ini_mvp_plan_before_rendering(self) -> None:
        plan = json.loads(MODULE.INI_MVP_PLAN_PATH.read_text(encoding="utf-8"))
        invalid_plans = []

        bad_version = dict(plan)
        bad_version["schemaVersion"] = 2
        invalid_plans.append(bad_version)

        boolean_version = json.loads(json.dumps(plan))
        boolean_version["schemaVersion"] = True
        invalid_plans.append(boolean_version)

        unknown_field = json.loads(json.dumps(plan))
        unknown_field["unexpected"] = True
        invalid_plans.append(unknown_field)

        tampered_protected_rule = json.loads(json.dumps(plan))
        tampered_protected_rule["rules"]["beforeLegacy"][0]["target"] = "DIRECT"
        invalid_plans.append(tampered_protected_rule)

        mismatched_protected_terminal = json.loads(json.dumps(plan))
        mismatched_protected_terminal["rules"]["beforeLegacy"][1]["url"] = "https://example.invalid/anthropic.yaml"
        invalid_plans.append(mismatched_protected_terminal)

        missing_protected_group = json.loads(json.dumps(plan))
        missing_protected_group["accountProtection"]["protectedGroup"] = "Missing Claude Guard"
        invalid_plans.append(missing_protected_group)

        extra_protected_direct = json.loads(json.dumps(plan))
        extra_protected_direct["rules"]["afterLegacy"].append(
            {
                **extra_protected_direct["rules"]["beforeLegacy"][0],
                "target": "🎯 全球直連",
            }
        )
        invalid_plans.append(extra_protected_direct)

        unsafe_url = json.loads(json.dumps(plan))
        unsafe_url["rules"]["afterLegacy"][0]["url"] = "https://token@example.invalid/rules.yaml"
        invalid_plans.append(unsafe_url)

        duplicate_rule = json.loads(json.dumps(plan))
        duplicate_rule["rules"]["afterLegacy"].append(dict(duplicate_rule["rules"]["afterLegacy"][0]))
        invalid_plans.append(duplicate_rule)

        duplicate_candidate = json.loads(json.dumps(plan))
        duplicate_candidate["groups"][0]["candidates"].append(dict(duplicate_candidate["groups"][0]["candidates"][0]))
        invalid_plans.append(duplicate_candidate)

        duplicate_group = json.loads(json.dumps(plan))
        duplicate_group["groups"].append(dict(duplicate_group["groups"][0]))
        invalid_plans.append(duplicate_group)

        filtered_group_not_reject_first = json.loads(json.dumps(plan))
        stable_group = next(group for group in filtered_group_not_reject_first["groups"] if any(candidate["kind"] == "node-filter" for candidate in group["candidates"]))
        stable_group["candidates"].reverse()
        invalid_plans.append(filtered_group_not_reject_first)

        unresolved_rule_target = json.loads(json.dumps(plan))
        unresolved_rule_target["rules"]["afterLegacy"][0]["target"] = "Missing Target"
        invalid_plans.append(unresolved_rule_target)

        unresolved_group_reference = json.loads(json.dumps(plan))
        windsurf_group = next(group for group in unresolved_group_reference["groups"] if group["name"] == "🌊 Windsurf")
        windsurf_group["candidates"][0]["value"] = "Missing Group"
        invalid_plans.append(unresolved_group_reference)

        cyclic_groups = json.loads(json.dumps(plan))
        cycle_left = next(group for group in cyclic_groups["groups"] if group["name"] == "🌊 Windsurf")
        cycle_right = next(group for group in cyclic_groups["groups"] if group["name"] == "🤗 Hugging Face")
        cycle_left["candidates"] = [{"kind": "group-ref", "value": cycle_right["name"]}]
        cycle_right["candidates"] = [{"kind": "group-ref", "value": cycle_left["name"]}]
        invalid_plans.append(cyclic_groups)

        replacement_not_migrated = json.loads(json.dumps(plan))
        replacement_not_migrated["migration"]["legacyReplacementIds"] = ["not-migrated"]
        invalid_plans.append(replacement_not_migrated)

        boolean_interval = json.loads(json.dumps(plan))
        boolean_interval["rules"]["beforeLegacy"][0]["interval"] = True
        invalid_plans.append(boolean_interval)

        with tempfile.TemporaryDirectory() as temporary:
            plan_path = Path(temporary) / "hk.ini-mvp-plan.json"
            with patch.object(MODULE, "INI_MVP_PLAN_PATH", plan_path):
                for invalid in invalid_plans:
                    plan_path.write_text(json.dumps(invalid), encoding="utf-8")
                    with self.assertRaises(RuntimeError):
                        MODULE.load_ini_mvp_plan()

    def test_should_not_reference_process_rules_when_disabled(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)
        rendered_ini = MODULE.render_ini()

        self.assertFalse(MODULE.ENABLE_PROCESS_RULES)
        self.assertNotIn("Process_P2P_Classical", rendered_yaml)
        self.assertNotIn("Process_Download_Classical", rendered_yaml)
        self.assertNotIn("Process_ProxyTools_Classical", rendered_yaml)
        self.assertNotIn("Process_Gaming_Classical", rendered_yaml)
        self.assertNotIn("Process_P2P_Classical", rendered_ini)
        self.assertNotIn("Process_Download_Classical", rendered_ini)
        self.assertNotIn("Process_ProxyTools_Classical", rendered_ini)
        self.assertNotIn("Process_Gaming_Classical", rendered_ini)
        self.assertNotIn("PROCESS-NAME,", rendered_yaml)

    def test_should_render_yaml_rule_providers_with_new_custom_provider_names(self) -> None:
        rendered_providers = MODULE.render_rule_providers(include_process_rules=False, strict=False)

        self.assertIn("Custom_Direct_Classical_IP:", rendered_providers)
        self.assertIn("Custom_Proxy_Classical_IP:", rendered_providers)
        self.assertNotIn("Custom_Direct_IP:", rendered_providers)
        self.assertNotIn("Custom_Proxy_IP:", rendered_providers)

    def test_should_omit_relaxed_only_providers_from_strict_profile(self) -> None:
        strict_providers = MODULE.render_rule_providers(include_process_rules=False, strict=True)

        for item in MODULE.AI_RULESETS:
            self.assertIn(f'{item["provider_key"]}:', strict_providers)
        for name in (
            "Custom_Direct_Domain",
            "Custom_Direct_Classical_IP",
            "Custom_Proxy_Domain",
            "Custom_Proxy_Classical_IP",
            "SSH_Direct_Classical",
            "SSH_Proxy_Classical",
            "Gaming_Direct_Classical",
        ):
            self.assertNotIn(f"{name}:", strict_providers)


if __name__ == "__main__":
    unittest.main()
