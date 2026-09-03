from __future__ import annotations

from collections.abc import Iterable
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from ai_profiles_test_support import load_generator
from ai_profiles.catalog import load_catalog
from ai_profiles.models import IniClustersSection, IniRulesSection
from ai_profiles.render.rule_provider import render_rule_file


MODULE = load_generator("generate_ai_profiles")
CATALOG = load_catalog()


def load_plan() -> dict[str, object]:
    value = json.loads(MODULE.INI_MVP_PLAN_PATH.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AssertionError("INI MVP plan must be a JSON object")
    return value


def rule_fragment(rule: object) -> str:
    kind = getattr(rule, "kind", None)
    if kind in {"remote-classical", "remote-domain"}:
        return str(getattr(rule, "url"))
    if kind == "geosite":
        return f"[]GEOSITE,{getattr(rule, 'value')}"
    if kind == "geoip":
        return f"[]GEOIP,{getattr(rule, 'value')}"
    if kind == "final":
        return "[]FINAL"
    raise AssertionError(f"Unsupported INI rule kind in test: {kind}")


def rule_fragments(rules: Iterable[object]) -> list[str]:
    return [rule_fragment(rule) for rule in rules]


def fragment_positions(rendered: str, fragments: Iterable[str]) -> list[int]:
    positions: list[int] = []
    offset = 0
    for fragment in fragments:
        position = rendered.index(fragment, offset)
        positions.append(position)
        offset = position + len(fragment)
    return positions


def candidate_fragment(candidate: dict[str, object]) -> str:
    if candidate["kind"] == "group-ref":
        return f"[]{candidate['value']}"
    if candidate["kind"] == "node-filter":
        return str(candidate["value"])
    raise AssertionError(f"Unsupported INI candidate kind in test: {candidate['kind']}")


class GenerateAiProfilesTest(unittest.TestCase):
    def test_should_render_rule_metadata_without_dynamic_imports(self) -> None:
        rendered = render_rule_file("provider", "AI", ["example.com"])

        self.assertRegex(
            rendered,
            r"(?m)^# GENERATED-AT: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+00:00$",
            msg=rendered,
        )
        self.assertRegex(rendered, r"(?m)^# VERSION: (?:[0-9a-f]{40}|unknown)$")

    @patch("ai_profiles.render.rule_provider.subprocess.run")
    def test_should_fall_back_when_git_metadata_is_unavailable(self, run: MagicMock) -> None:
        from subprocess import CalledProcessError

        run.side_effect = CalledProcessError(128, "git")

        rendered = render_rule_file("provider", "AI", ["example.com"])

        self.assertIn("# VERSION: unknown", rendered)

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

    def extract_ini_group_lines(self, rendered_ini: str, name: str) -> list[str]:
        prefix = f"custom_proxy_group={name}`"
        return [line for line in rendered_ini.splitlines() if line.startswith(prefix)]

    def test_should_use_classical_provider_keys_for_ai_rules(self) -> None:
        provider_keys = [item["provider_key"] for item in MODULE.AI_RULESETS]
        payload_services = [service for service in CATALOG.services if service.payload]

        self.assertTrue(provider_keys)
        self.assertEqual(
            provider_keys,
            [service.provider_key for service in payload_services],
        )
        self.assertTrue(all(key == service.file.rsplit(".", 1)[0] for key, service in zip(provider_keys, payload_services)))

    def test_should_generate_rule_sets_only_for_services_with_local_payloads(self) -> None:
        service_ids = [item["id"] for item in MODULE.AI_SERVICES]
        ruleset_provider_keys = [item["provider_key"] for item in MODULE.AI_RULESETS]
        services = [service for service in CATALOG.services if "subconverter" in service.projections]

        self.assertEqual(len(service_ids), len(set(service_ids)))
        self.assertEqual(service_ids, [service.id for service in services])
        self.assertEqual(
            ruleset_provider_keys,
            [service.provider_key for service in services if service.payload],
        )
        self.assertEqual(
            {item["group"] for item in MODULE.AI_RULESETS},
            {service.group for service in services if service.payload},
        )

    def test_should_render_service_identity_and_aggregate_rules_before_relaxed_rules(self) -> None:
        rules = MODULE.render_yaml_rules(strict=False, include_process_rules=False).splitlines()
        identity_rules = [
            f'"RULE-SET,{service.provider_key},{service.group}"'
            for service in CATALOG.services
            if "mihomo" in service.projections and service.payload
        ]
        identity_rules.extend(
            f'"GEOSITE,{geosite},{service.group}"'
            for service in CATALOG.services
            if "mihomo" in service.projections
            for geosite in service.geosites
        )
        aggregate_rules = [
            f'"GEOSITE,{geosite},{service.group}"'
            for service in CATALOG.services
            if service.projections == {"mihomo"}
            for geosite in service.geosites
        ]
        aggregate_indices = [
            i
            for i, line in enumerate(rules)
            if any(expected in line for expected in aggregate_rules)
        ]
        ssh_provider = next(
            rule.provider_key
            for rule in CATALOG.companion_rulesets
            if rule.category == "ssh" and rule.mihomo
        )
        geoip_route = next(route for route in CATALOG.external_routes if route.kind == "GEOIP")
        match_route = next(route for route in CATALOG.external_routes if route.kind == "MATCH")
        ssh_index = next(i for i, line in enumerate(rules) if ssh_provider in line)
        geoip_index = next(
            i for i, line in enumerate(rules) if f"{geoip_route.kind},{geoip_route.value}" in line
        )
        match_index = next(
            i for i, line in enumerate(rules) if f"{match_route.kind}," in line
        )

        for expected in identity_rules:
            self.assertTrue(any(expected in line for line in rules), expected)
        self.assertEqual(len(aggregate_indices), len(aggregate_rules))
        self.assertLess(max(aggregate_indices), ssh_index)
        self.assertLess(ssh_index, geoip_index)
        self.assertLess(geoip_index, match_index)

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

        self.assertNotIn(MODULE.GROUP["direct"], manual_group)
        self.assertIn('  use:', manual_group)
        self.assertIn('    - provider1', manual_group)
        for service in CATALOG.services:
            if "mihomo" not in service.projections:
                continue
            group = self.extract_yaml_group_block(rendered_yaml, service.group)
            auto_group = self.extract_yaml_group_block(
                rendered_yaml,
                MODULE.service_auto_group_name(service.group),
            )
            self.assertNotIn(MODULE.GROUP["direct"], group)
            self.assertNotIn(MODULE.GROUP["direct"], auto_group)

    def test_should_separate_service_ui_from_automatic_fallback_chain(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)
        profile = MODULE.compile_mihomo_profile(
            strict=False,
            include_process_rules=False,
            catalog=CATALOG,
        )

        for service_plan in profile.services:
            group = self.extract_yaml_group_block(rendered_yaml, service_plan.service.group)
            auto_name = MODULE.service_auto_group_name(service_plan.service.group)
            auto_group = self.extract_yaml_group_block(rendered_yaml, auto_name)

            self.assertIn("    type: select", group)
            self.assertIn(f'      - "{auto_name}"', group)
            for proxy in service_plan.ui_proxies:
                self.assertIn(f'      - "{proxy}"', group)

            self.assertIn("    type: fallback", auto_group)
            self.assertNotIn(MODULE.GROUP["manual"], auto_group)
            self.assertNotIn(f'      - "{MODULE.GROUP["auto"]}"', auto_group)
            for proxy in service_plan.auto_proxies:
                self.assertIn(f'      - "{proxy}"', auto_group)
            self.assertTrue(auto_group.rstrip().endswith(f'- "{MODULE.GROUP["reject"]}"'))

    def test_should_keep_global_region_groups_provider_only(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)

        for group_name in CATALOG.all_region_groups:
            block = self.extract_yaml_group_block(rendered_yaml, group_name)
            self.assertIn("    use:", block)
            self.assertIn("      - provider1", block)
            self.assertNotIn("    proxies:", block)

    def test_should_fix_taiwan_group_label_and_filters(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)
        rendered_ini = MODULE.render_ini()

        for region in CATALOG.primary_regions:
            self.assertIn(region.group, rendered_yaml)
            self.assertIn(region.group, rendered_ini)

    def test_should_keep_manual_ini_group_open_to_filtered_provider_nodes(self) -> None:
        rendered_ini = MODULE.render_ini()
        manual_group = self.extract_ini_group_lines(rendered_ini, MODULE.GROUP["manual"])[0]

        self.assertIn(f"[]{MODULE.GROUP['direct']}", manual_group)
        self.assertIn(MODULE.AI_POOL_FILTER, manual_group)

    def test_should_render_ini_mvp_before_legacy_and_keep_claude_reject_only(self) -> None:
        rendered_ini = MODULE.render_ini()
        plan = load_plan()
        compiled = MODULE.compile_subconverter_plan(
            MODULE.load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=CATALOG,
        )
        before = compiled.section("legacy-before")
        services = compiled.section("service-rule-clusters")
        after_head = compiled.section("legacy-after-head")
        after_tail = compiled.section("legacy-after-tail")

        self.assertIsInstance(before, IniRulesSection)
        self.assertIsInstance(services, IniClustersSection)
        self.assertIsInstance(after_head, IniRulesSection)
        self.assertIsInstance(after_tail, IniRulesSection)
        service_rules = [rule for cluster in services.clusters for rule in cluster.rules]
        after_rules = [*after_head.rules, *after_tail.rules]

        before_positions = fragment_positions(rendered_ini, rule_fragments(before.rules))
        service_positions = fragment_positions(rendered_ini, rule_fragments(service_rules))
        after_positions = fragment_positions(rendered_ini, rule_fragments(after_rules))

        self.assertLess(max(before_positions), min(service_positions))
        self.assertLess(max(service_positions), min(after_positions))
        self.assertEqual(
            len(after_positions),
            len(after_rules),
        )

        groups = plan.get("groups")
        self.assertIsInstance(groups, list)
        for group in groups:
            self.assertIsInstance(group, dict)
            name = group["name"]
            candidates = group["candidates"]
            prefix = f"custom_proxy_group={name}`select`"
            expected = prefix + "`".join(
                candidate_fragment(candidate) for candidate in candidates
            )
            lines = self.extract_ini_group_lines(rendered_ini, name)
            self.assertTrue(lines, name)
            self.assertIn(expected, lines)

        migration = plan.get("migration")
        self.assertIsInstance(migration, dict)
        replacement_ids = set(migration["legacyReplacementIds"])
        for service in CATALOG.services:
            if service.id not in replacement_ids:
                continue
            self.assertNotIn(f"custom_proxy_group={service.group}`", rendered_ini)
            for geosite in service.geosites:
                self.assertNotIn(
                    f"ruleset={service.group},[]GEOSITE,{geosite}",
                    rendered_ini,
                )

    def test_should_reject_malformed_ini_mvp_plan_before_rendering(self) -> None:
        plan = load_plan()
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
        tampered_protected_rule["rules"]["beforeLegacy"][0]["target"] = MODULE.BUILTIN_DIRECT
        invalid_plans.append(tampered_protected_rule)

        mismatched_protected_terminal = json.loads(json.dumps(plan))
        mismatched_protected_terminal["rules"]["beforeLegacy"][1]["url"] = "https://example.invalid/invalid-rule.yaml"
        invalid_plans.append(mismatched_protected_terminal)

        missing_protected_group = json.loads(json.dumps(plan))
        missing_protected_group["accountProtection"]["protectedGroup"] = "Missing Protected Group"
        invalid_plans.append(missing_protected_group)

        extra_protected_direct = json.loads(json.dumps(plan))
        extra_protected_direct["rules"]["afterLegacy"].append(
            {
                **extra_protected_direct["rules"]["beforeLegacy"][0],
                "target": CATALOG.group("direct"),
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
        group_with_reference = next(
            group
            for group in unresolved_group_reference["groups"]
            if any(candidate["kind"] == "group-ref" for candidate in group["candidates"])
        )
        group_with_reference["candidates"][0]["value"] = "Missing Group"
        invalid_plans.append(unresolved_group_reference)

        cyclic_groups = json.loads(json.dumps(plan))
        cycle_left, cycle_right = [
            group
            for group in cyclic_groups["groups"]
            if any(candidate["kind"] == "group-ref" for candidate in group["candidates"])
        ][:2]
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
            plan_path = Path(temporary) / MODULE.INI_MVP_PLAN_PATH.name
            with patch.object(MODULE, "INI_MVP_PLAN_PATH", plan_path):
                for invalid in invalid_plans:
                    plan_path.write_text(json.dumps(invalid), encoding="utf-8")
                    with self.assertRaises(RuntimeError):
                        MODULE.load_ini_mvp_plan()

    def test_should_not_reference_process_rules_when_disabled(self) -> None:
        rendered_yaml = MODULE.render_yaml(strict=False)
        rendered_ini = MODULE.render_ini()

        self.assertFalse(MODULE.ENABLE_PROCESS_RULES)
        for rule in CATALOG.process_rulesets:
            self.assertNotIn(rule.provider_key, rendered_yaml)
            self.assertNotIn(rule.provider_key, rendered_ini)
        self.assertNotIn("PROCESS-NAME,", rendered_yaml)

    def test_should_render_yaml_rule_providers_with_new_custom_provider_names(self) -> None:
        rendered_providers = MODULE.render_rule_providers(include_process_rules=False, strict=False)
        expected_names = [
            provider.name
            for provider in MODULE.compile_rule_providers(
                include_process_rules=False,
                strict=False,
                catalog=CATALOG,
            )
        ]
        rendered_names = [
            line[:-1]
            for line in rendered_providers.splitlines()
            if line and not line.startswith(" ") and line.endswith(":")
        ]

        self.assertEqual(rendered_names, expected_names)

    def test_should_omit_relaxed_only_providers_from_strict_profile(self) -> None:
        relaxed_names = {
            provider.name
            for provider in MODULE.compile_rule_providers(
                include_process_rules=False,
                strict=False,
                catalog=CATALOG,
            )
        }
        strict_names = {
            provider.name
            for provider in MODULE.compile_rule_providers(
                include_process_rules=False,
                strict=True,
                catalog=CATALOG,
            )
        }
        strict_providers = MODULE.render_rule_providers(include_process_rules=False, strict=True)

        for name in strict_names:
            self.assertIn(f"{name}:", strict_providers)
        for name in relaxed_names - strict_names:
            self.assertNotIn(f"{name}:", strict_providers)


if __name__ == "__main__":
    unittest.main()
