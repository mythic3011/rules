from __future__ import annotations

import unittest
from dataclasses import replace

from internal.python.ai_profiles.catalog import load_catalog
from internal.python.ai_profiles.compiler import compile_mihomo_profile, compile_subconverter_plan
from internal.python.ai_profiles.models import (
    IniClustersSection,
    IniGroupsSection,
    IniRulesSection,
    IniSelectorsSection,
)
from internal.python.ai_profiles.plans.ini_mvp import load_ini_mvp_plan
from internal.python.ai_profiles.profile_spec import ProfileSpec, ProfileSpecError, _service_rule_owners
from internal.python.ai_profiles.render.subconverter import render_ini
from internal.python.ai_profiles.service_groups import (
    ResolvedServiceGroupSpec,
    ServiceGroupSpec,
    apply_service_groups_to_subconverter_plan,
    ini_service_group_entries,
    service_group_runtime_metadata,
)


class ServiceGroupsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.catalog = load_catalog()
        self.ini_mvp = load_ini_mvp_plan()
        self.plan = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
        )
        self.entries = ini_service_group_entries(self.catalog, self.plan, self.ini_mvp)

    def _layout(self) -> list[ServiceGroupSpec]:
        return [
            ServiceGroupSpec(
                id=str(entry["id"]),
                name=str(entry["name"]),
                service_ids=tuple(entry["serviceIds"]),
                routes=tuple(entry["defaultRoutes"]),
            )
            for entry in self.entries
        ]

    def _entry(self, service_id: str) -> dict[str, object]:
        return next(entry for entry in self.entries if entry["id"] == service_id)

    def _service_rules(self, plan, service_ids: set[str]):
        owners_by_ref = _service_rule_owners(self.catalog)
        rules = []
        for section in plan.sections:
            if not isinstance(section, IniClustersSection) or section.role != "service-rule-clusters":
                continue
            for cluster in section.clusters:
                for rule in cluster.rules:
                    value = rule.url if rule.url is not None else rule.value
                    if value is not None and owners_by_ref.get((rule.kind, value), set()) & service_ids:
                        rules.append(rule)
        return rules

    @staticmethod
    def _rule_ref(rule):
        value = rule.url if rule.url is not None else rule.value
        return (rule.kind, value) if value is not None else None

    def test_absent_service_groups_preserves_existing_profile_spec_output(self) -> None:
        self.assertEqual(
            render_ini(ProfileSpec()),
            render_ini(ProfileSpec(service_groups=None)),
        )

    def test_google_ai_can_add_hk_without_changing_global_region_groups(self) -> None:
        layout = self._layout()
        google = next(group for group in layout if group.id == "gemini")
        routes = [route for route in google.routes if route != "reject"]
        google = replace(google, name="Google AI HK", routes=tuple([*routes, "hk", "reject"]))
        layout[layout.index(next(group for group in layout if group.id == "gemini"))] = google

        edited = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
            profile_spec=ProfileSpec(service_groups=tuple(layout)),
        )
        service_selectors = edited.section("service-selectors")
        self.assertIsInstance(service_selectors, IniSelectorsSection)
        google_selector = next(item.group for item in service_selectors.selectors if item.group.name == "Google AI HK")
        self.assertIn(self.catalog.group("hk"), [candidate.value for candidate in google_selector.candidates])

        scoped_regions = edited.section("automatic-region-groups")
        self.assertIsInstance(scoped_regions, IniGroupsSection)
        hk_group = next(group for group in scoped_regions.groups if group.name == self.catalog.group("hk"))
        self.assertEqual(hk_group.filter_pattern, next(region.filter_pattern for region in self.catalog.regions if region.id == "hk"))

        base_auto = next(
            group
            for group in self.plan.section("shared-routing-groups").groups
            if group.name == self.catalog.group("auto")
        )
        edited_auto = next(
            group
            for group in edited.section("shared-routing-groups").groups
            if group.name == self.catalog.group("auto")
        )
        self.assertEqual(edited_auto, base_auto)
        self.assertTrue(self._service_rules(edited, set(google.service_ids)))
        self.assertTrue(all(rule.target == "Google AI HK" for rule in self._service_rules(edited, set(google.service_ids))))

    def test_global_disabled_region_is_excluded_from_synthesized_hk_group(self) -> None:
        layout = [
            replace(group, routes=tuple(route for route in group.routes if route != "jp"))
            for group in self._layout()
        ]
        google = next(group for group in layout if group.id == "gemini")
        routes = [route for route in google.routes if route not in {"reject", "jp"}]
        layout[layout.index(google)] = replace(google, routes=tuple([*routes, "hk", "reject"]))
        edited = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
            profile_spec=ProfileSpec(
                disabled_node_regions=("jp",),
                service_groups=tuple(layout),
            ),
        )
        scoped_regions = edited.section("automatic-region-groups")
        hk_group = next(group for group in scoped_regions.groups if group.name == self.catalog.group("hk"))
        self.assertIn("(?!.*", hk_group.filter_pattern)
        jp_terms = next(region.terms for region in self.catalog.regions if region.id == "jp")
        self.assertIn(jp_terms, hk_group.filter_pattern)

    def test_only_regions_rejects_conflicting_nonprimary_service_route(self) -> None:
        layout = [
            replace(group, routes=tuple(route for route in group.routes if route in {"us", "reject"}))
            for group in self._layout()
        ]
        google = next(group for group in layout if group.id == "gemini")
        routes = [route for route in google.routes if route != "reject"]
        layout[layout.index(google)] = replace(google, routes=tuple([*routes, "hk", "reject"]))
        with self.assertRaisesRegex(ProfileSpecError, "onlyNodeRegions"):
            render_ini(
                ProfileSpec(
                    only_node_regions=("us",),
                    service_groups=tuple(layout),
                )
            )

    def test_reserved_native_and_unsafe_group_names_are_rejected(self) -> None:
        layout = self._layout()
        chatgpt = next(group for group in layout if group.id == "chatgpt")
        layout[layout.index(chatgpt)] = replace(chatgpt, name="DIRECT")
        with self.assertRaisesRegex(ProfileSpecError, "reserved"):
            render_ini(ProfileSpec(service_groups=tuple(layout)))

        for unsafe_name in (
            "ChatGPT,Unsafe",
            "ChatGPT\u2028Unsafe",
            "ChatGPT\ud800Unsafe",
            "😀" * 41,
        ):
            unsafe_layout = self._layout()
            chatgpt = next(group for group in unsafe_layout if group.id == "chatgpt")
            unsafe_layout[unsafe_layout.index(chatgpt)] = replace(chatgpt, name=unsafe_name)
            with self.assertRaisesRegex(ProfileSpecError, "unsafe"):
                render_ini(ProfileSpec(service_groups=tuple(unsafe_layout)))

    def test_unassigned_service_rules_are_rejected(self) -> None:
        layout = [group for group in self._layout() if group.id != "chatgpt"]
        edited = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
            profile_spec=ProfileSpec(service_groups=tuple(layout)),
        )
        owners = _service_rule_owners(self.catalog)
        chatgpt_refs = {
            ref
            for ref, service_ids in owners.items()
            if "chatgpt" in service_ids
        }
        original_refs = {
            self._rule_ref(rule)
            for section in self.plan.sections
            if isinstance(section, IniRulesSection | IniClustersSection)
            for rule in (
                section.rules
                if isinstance(section, IniRulesSection)
                else tuple(rule for cluster in section.clusters for rule in cluster.rules)
            )
        }
        expected_refs = chatgpt_refs & original_refs
        self.assertTrue(expected_refs)
        before = edited.section("legacy-before")
        self.assertIsInstance(before, IniRulesSection)
        early_denies = before.rules[:len(expected_refs)]
        self.assertEqual({self._rule_ref(rule) for rule in early_denies}, expected_refs)
        self.assertTrue(all(rule.target == self.catalog.group("reject") for rule in early_denies))

        remaining_refs = [
            (section.role, self._rule_ref(rule))
            for section in edited.sections
            if isinstance(section, IniRulesSection | IniClustersSection)
            for rule in (
                section.rules
                if isinstance(section, IniRulesSection)
                else tuple(rule for cluster in section.clusters for rule in cluster.rules)
            )
            if self._rule_ref(rule) in expected_refs
        ]
        self.assertEqual(len(remaining_refs), len(expected_refs))
        self.assertEqual({role for role, _ in remaining_refs}, {"legacy-before"})
        selectors = edited.section("service-selectors")
        self.assertNotIn("🤖 ChatGPT", {selector.group.name for selector in selectors.selectors})

    def test_disabled_services_remain_independent_after_group_merge(self) -> None:
        layout = self._layout()
        chatgpt = next(group for group in layout if group.id == "chatgpt")
        copilot = next(group for group in layout if group.id == "copilot")
        combined = ServiceGroupSpec(
            id="combined",
            name="Combined AI",
            service_ids=(*chatgpt.service_ids, *copilot.service_ids),
            routes=("us", "reject"),
        )
        layout = [group for group in layout if group.id not in {"chatgpt", "copilot"}]
        layout.insert(0, combined)
        edited = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
            profile_spec=ProfileSpec(
                disabled_services=("chatgpt",),
                service_groups=tuple(layout),
            ),
        )
        chatgpt_rules = self._service_rules(edited, {"chatgpt"})
        copilot_rules = self._service_rules(edited, {"copilot"})
        self.assertTrue(chatgpt_rules and copilot_rules)
        self.assertTrue(all(rule.target == self.catalog.group("reject") for rule in chatgpt_rules))
        self.assertTrue(all(rule.target == "Combined AI" for rule in copilot_rules))

    def test_explicit_custom_group_order_overrides_preferred_services(self) -> None:
        layout = self._layout()
        edited = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
            profile_spec=ProfileSpec(
                preferred_services=("gemini",),
                service_groups=tuple(layout),
            ),
        )
        selectors = edited.section("service-selectors")
        expected_order = [group.name for group in layout if group.id != "claude"]
        self.assertEqual([selector.group.name for selector in selectors.selectors], expected_order)

    def test_empty_group_is_reject_only_and_protected_routes_stay_reject_first(self) -> None:
        layout = self._layout()
        chatgpt = next(group for group in layout if group.id == "chatgpt")
        layout[layout.index(chatgpt)] = replace(chatgpt, service_ids=(), routes=())
        edited = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
            profile_spec=ProfileSpec(service_groups=tuple(layout)),
        )
        selectors = edited.section("service-selectors")
        empty_group = next(selector.group for selector in selectors.selectors if selector.group.name == chatgpt.name)
        self.assertEqual([candidate.value for candidate in empty_group.candidates], [self.catalog.group("reject")])

        protected_index = next(index for index, group in enumerate(layout) if group.id == "claude")
        protected = layout[protected_index]
        layout[protected_index] = replace(protected, routes=("jp", "us"))
        edited_protected = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
            profile_spec=ProfileSpec(service_groups=tuple(layout)),
        )
        account = edited_protected.section("account-group")
        claude_group = next(group for group in account.groups if group.name == protected.name)
        self.assertEqual(
            [candidate.value for candidate in claude_group.candidates],
            [self.catalog.group("reject"), self.catalog.group("jp"), self.catalog.group("us")],
        )

    def test_fail_closed_forces_reject_first_even_when_supplied_last(self) -> None:
        layout = self._layout()
        google = next(group for group in layout if group.id == "gemini")
        routes = tuple(route for route in google.routes if route != "reject")
        layout[layout.index(google)] = replace(google, routes=(*routes, "reject"))
        edited = compile_subconverter_plan(
            self.ini_mvp,
            include_process_rules=False,
            catalog=self.catalog,
            profile_spec=ProfileSpec(fail_closed=True, service_groups=tuple(layout)),
        )
        selectors = edited.section("service-selectors")
        google_selector = next(selector.group for selector in selectors.selectors if selector.group.name == google.name)
        self.assertEqual(google_selector.candidates[0].value, self.catalog.group("reject"))

    def test_protected_route_subset_obeys_global_region_restrictions(self) -> None:
        layout = [
            replace(group, routes=tuple(route for route in group.routes if route in {"us", "reject"}))
            for group in self._layout()
        ]
        protected_index = next(index for index, group in enumerate(layout) if group.id == "claude")
        protected = layout[protected_index]
        layout[protected_index] = replace(protected, routes=("jp", "us"))
        with self.assertRaisesRegex(ProfileSpecError, "onlyNodeRegions"):
            render_ini(
                ProfileSpec(
                    only_node_regions=("us",),
                    service_groups=tuple(layout),
                )
            )

    def test_shared_rule_owners_cannot_be_split_across_groups(self) -> None:
        layout = self._layout()
        first = ResolvedServiceGroupSpec("left", "Left", ("chatgpt",), ("us", "reject"), None)
        second = ResolvedServiceGroupSpec("right", "Right", ("copilot",), ("us", "reject"), None)
        resolved_layout = tuple(
            ResolvedServiceGroupSpec(group.id, group.name, group.service_ids, group.routes, None)
            for group in layout
            if group.id not in {"chatgpt", "copilot"}
        )
        # The compiler normally validates owners from canonical rule references;
        # inject one shared exact ref to exercise the cross-group fail-closed guard.
        with self.assertRaisesRegex(ValueError, "shared service rule"):
            apply_service_groups_to_subconverter_plan(
                self.plan,
                (*resolved_layout, first, second),
                self.catalog,
                disabled_service_ids=(),
                fail_closed=False,
                blocked_terms=(),
                rule_owners={("geosite", "test-shared-rule"): {"chatgpt", "copilot"}},
                protected_service_id="claude",
            )

    def test_runtime_metadata_is_template_specific_and_exports_limits(self) -> None:
        metadata = service_group_runtime_metadata(
            self.catalog,
            self.plan,
            {
                "ai-balanced": compile_mihomo_profile(strict=False, include_process_rules=False, catalog=self.catalog),
                "ai-strict": compile_mihomo_profile(strict=True, include_process_rules=False, catalog=self.catalog),
            },
            self.ini_mvp,
        )
        balanced_copilot = next(
            entry for entry in metadata["serviceGroups"]
            if entry["outputFormat"] == "yaml" and entry["baseProfile"] == "ai-balanced" and entry["id"] == "copilot"
        )
        strict_copilot = next(
            entry for entry in metadata["serviceGroups"]
            if entry["outputFormat"] == "yaml" and entry["baseProfile"] == "ai-strict" and entry["id"] == "copilot"
        )
        self.assertIn("direct", balanced_copilot["defaultRoutes"])
        self.assertNotIn("direct", strict_copilot["defaultRoutes"])
        self.assertIsInstance(balanced_copilot["defaultRouteGroup"], str)
        self.assertIn("🇭🇰 香港節點", metadata["reservedGroupNames"])
        self.assertIn("DIRECT", metadata["reservedGroupNames"])
        self.assertIn("REJECT", metadata["reservedGroupNames"])
        self.assertEqual(metadata["serviceGroupRouteLabels"]["default"], self.catalog.group("auto"))
        balanced_chatgpt = next(
            entry for entry in metadata["serviceGroups"]
            if entry["outputFormat"] == "yaml" and entry["baseProfile"] == "ai-balanced" and entry["id"] == "chatgpt"
        )
        self.assertEqual(balanced_chatgpt["defaultRouteGroup"], self.catalog.group("auto"))
        self.assertTrue(balanced_chatgpt["defaultRouteCandidates"])
        self.assertEqual(metadata["serviceGroupLimits"]["maxGroups"], 32)
        self.assertEqual(metadata["serviceGroupLimits"]["maxNameLength"], 80)


if __name__ == "__main__":
    unittest.main()
