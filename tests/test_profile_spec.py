from __future__ import annotations

import unittest

from internal.python.ai_profiles.catalog import load_catalog
from internal.python.ai_profiles.profile_spec import (
    ProfileSpec,
    ProfileSpecError,
    canonicalize_region_id,
    resolve_profile_spec,
)
from internal.python.ai_profiles.render.subconverter import render_ini


class ProfileSpecTest(unittest.TestCase):
    def setUp(self) -> None:
        self.catalog = load_catalog()

    def test_aliases_canonicalize(self) -> None:
        self.assertEqual(canonicalize_region_id("Hong Kong", self.catalog), "hk")
        self.assertEqual(canonicalize_region_id("日本", self.catalog), "jp")
        self.assertEqual(canonicalize_region_id("USA", self.catalog), "us")

    def test_disable_region_removes_all_region_paths(self) -> None:
        text = render_ini(ProfileSpec(disabled_node_regions=("jp",)))
        self.assertNotIn("custom_proxy_group=🇯🇵 日本節點", text)
        self.assertNotIn("custom_proxy_group=🇯🇵 JP Stable", text)
        self.assertNotIn("[]🇯🇵 日本節點", text)
        self.assertNotIn("[]🇯🇵 JP Stable", text)
        manual = next(
            line for line in text.splitlines() if line.startswith("custom_proxy_group=🚀 手動選擇")
        )
        self.assertIn("Japan", manual)
        self.assertIn("(?!.*", manual)

    def test_observation_only_region_can_be_disabled(self) -> None:
        resolved = resolve_profile_spec(
            ProfileSpec(disabled_node_regions=("Hong Kong",)), self.catalog
        )
        self.assertEqual(resolved.disabled_region_ids, ("hk",))
        self.assertEqual(
            resolved.active_region_ids,
            tuple(region.id for region in self.catalog.primary_regions),
        )

    def test_only_regions_is_closed_world(self) -> None:
        text = render_ini(
            ProfileSpec(
                only_node_regions=("us", "sg"),
                preferred_node_regions=("sg",),
            )
        )
        auto = next(
            line for line in text.splitlines() if line.startswith("custom_proxy_group=♻️ 自動選擇")
        )
        self.assertIn("[]🇸🇬 新加坡節點`[]🇺🇸 美國節點", auto)
        self.assertNotIn("🌐 其他／未識別節點", auto)
        self.assertNotIn("🇯🇵 日本節點", text)
        self.assertNotIn("🇹🇼 台灣節點", text)
        self.assertNotIn("🇰🇷 韓國節點", text)
        manual = next(
            line for line in text.splitlines() if line.startswith("custom_proxy_group=🚀 手動選擇")
        )
        self.assertIn("(?=.*", manual)
        self.assertIn("Singapore", manual)
        self.assertIn("United States", manual)

    def test_prefer_reorders_without_removing(self) -> None:
        text = render_ini(ProfileSpec(preferred_node_regions=("sg", "jp")))
        auto = next(
            line for line in text.splitlines() if line.startswith("custom_proxy_group=♻️ 自動選擇")
        )
        self.assertLess(auto.index("🇸🇬 新加坡節點"), auto.index("🇯🇵 日本節點"))
        self.assertLess(auto.index("🇯🇵 日本節點"), auto.index("🇺🇸 美國節點"))

    def test_preferred_region_must_be_active(self) -> None:
        with self.assertRaises(ProfileSpecError):
            resolve_profile_spec(
                ProfileSpec(
                    disabled_node_regions=("jp",),
                    preferred_node_regions=("jp",),
                ),
                self.catalog,
            )

    def test_only_rejects_observation_only_region(self) -> None:
        with self.assertRaises(ProfileSpecError):
            resolve_profile_spec(ProfileSpec(only_node_regions=("hk",)), self.catalog)

    def test_unknown_region_rejected(self) -> None:
        with self.assertRaises(ProfileSpecError):
            resolve_profile_spec(ProfileSpec(disabled_node_regions=("moon",)), self.catalog)


if __name__ == "__main__":
    unittest.main()
