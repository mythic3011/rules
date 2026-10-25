from __future__ import annotations

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "internal" / "python"))

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_ai_routing_rules, compile_mihomo_profile, compile_subconverter_plan
from ai_profiles.plans.ini_mvp import load_ini_mvp_plan


class CoverageAggregateTest(unittest.TestCase):
    def test_broad_upstream_categories_route_to_aggregate_groups(self) -> None:
        rules = compile_ai_routing_rules()
        self.assertIn(("GEOSITE", "google-deepmind", "🤖 AI Other"), [(r.kind, r.value, r.target) for r in rules])
        self.assertIn(("GEOSITE", "category-ai-!cn", "🤖 AI Other"), [(r.kind, r.value, r.target) for r in rules])
        self.assertIn(("GEOSITE", "category-ai-cn", "🤖 AI CN Other"), [(r.kind, r.value, r.target) for r in rules])
        self.assertNotIn(("GEOSITE", "category-ai-!cn", "⛔ 拒絕"), [(r.kind, r.value, r.target) for r in rules])

    def test_aggregate_services_are_mihomo_only_to_avoid_ts_ini_duplication(self) -> None:
        catalog = load_catalog()
        for service_id in ("ai-other", "ai-cn-other"):
            service = next(item for item in catalog.services if item.id == service_id)
            self.assertEqual(service.projections, frozenset({"mihomo"}))

        mihomo = compile_mihomo_profile(strict=False, include_process_rules=False, catalog=catalog)
        self.assertIn("ai-other", {item.service.id for item in mihomo.services})
        self.assertIn("ai-cn-other", {item.service.id for item in mihomo.services})

        ini = compile_subconverter_plan(load_ini_mvp_plan(), include_process_rules=False, catalog=catalog)
        selector_names = {selector.group.name for selector in ini.service_selectors}
        self.assertNotIn("🤖 AI Other", selector_names)
        self.assertNotIn("🤖 AI CN Other", selector_names)


if __name__ == "__main__":
    unittest.main()
