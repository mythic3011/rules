from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

_PACKAGE_ROOT = Path(__file__).resolve().parent
if str(_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PACKAGE_ROOT))

from ai_profiles.catalog import load_catalog
from ai_profiles.common import zh_hk
from ai_profiles.compiler import compile_subconverter_plan
from ai_profiles.models import (
    IniClustersSection,
    IniGroupsSection,
    IniProxyGroup,
    IniRulesSection,
    IniSelectGroup,
    IniSelectorsSection,
)
from ai_profiles.plans.ini_mvp import load_ini_mvp_plan
from ai_profiles.profile_spec import ProfileSpec, _region_for_stable_group
from ai_profiles.render.subconverter import _render_ini
from ai_profiles.settings import REPO_URL

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/profile-service/worker/generated/runtime-data.mjs"


def _candidate(value):
    return {"kind": value.kind, "value": value.value}


def _group(value):
    if isinstance(value, IniSelectGroup):
        return {
            "type": "select-group",
            "name": value.name,
            "candidates": [_candidate(item) for item in value.candidates],
        }
    assert isinstance(value, IniProxyGroup)
    return {
        "type": "proxy-group",
        "name": value.name,
        "kind": value.kind,
        "candidates": [_candidate(item) for item in value.candidates],
        "filterPattern": value.filter_pattern,
        "healthCheckUrl": value.health_check_url,
        "interval": value.interval,
        "tolerance": value.tolerance,
    }


def _rule(value):
    return {
        "kind": value.kind,
        "target": value.target,
        "url": value.url,
        "interval": value.interval,
        "value": value.value,
        "options": list(value.options),
    }


def _section(value):
    common = {"role": value.role}
    if isinstance(value, IniRulesSection):
        return {
            **common,
            "type": "rules",
            "rules": [_rule(item) for item in value.rules],
            "comments": list(value.comments),
            "leadingBlank": value.leading_blank,
            "emitIfEmpty": value.emit_if_empty,
        }
    if isinstance(value, IniClustersSection):
        return {
            **common,
            "type": "clusters",
            "clusters": [
                {"source": cluster.source, "rules": [_rule(item) for item in cluster.rules]}
                for cluster in value.clusters
            ],
            "leadingBlank": value.leading_blank,
            "blankBeforeFirst": value.blank_before_first,
            "blankBetween": value.blank_between,
        }
    if isinstance(value, IniGroupsSection):
        return {
            **common,
            "type": "groups",
            "groups": [_group(item) for item in value.groups],
            "title": value.title,
            "subtitle": value.subtitle,
            "blankBetweenGroups": value.blank_between_groups,
        }
    assert isinstance(value, IniSelectorsSection)
    return {
        **common,
        "type": "selectors",
        "selectors": [
            {
                "comments": list(selector.comments),
                "group": _group(selector.group),
            }
            for selector in value.selectors
        ],
        "title": value.title,
        "subtitle": value.subtitle,
        "blankBetweenSelectors": value.blank_between_selectors,
    }


def build_runtime_data() -> dict[str, object]:
    catalog = load_catalog()
    ini_mvp_plan = load_ini_mvp_plan()
    plan = compile_subconverter_plan(
        ini_mvp_plan,
        include_process_rules=False,
        catalog=catalog,
    )
    stable_section = plan.section("stable-region-groups")
    stable_region_groups = {}
    if isinstance(stable_section, IniGroupsSection):
        for group in stable_section.groups:
            if isinstance(group, IniSelectGroup):
                region_id = _region_for_stable_group(group, catalog)
                if region_id is not None:
                    stable_region_groups[group.name] = region_id

    parity_specs = {
        "disable-jp": ProfileSpec(disabled_node_regions=("jp",)),
        "only-us-sg-prefer-sg": ProfileSpec(
            only_node_regions=("us", "sg"),
            preferred_node_regions=("sg",),
        ),
        "disable-hk": ProfileSpec(disabled_node_regions=("hk",)),
    }
    parity_fixtures = {}
    for name, spec in parity_specs.items():
        rendered = _render_ini(
            compile_subconverter_plan(
                ini_mvp_plan,
                include_process_rules=False,
                catalog=catalog,
                profile_spec=spec,
            )
        )
        body = rendered.split("[custom]\n", 1)[1]
        parity_fixtures[name] = {
            "spec": {
                "schemaVersion": 1,
                "baseProfile": spec.base_profile,
                "disabledNodeRegions": list(spec.disabled_node_regions),
                "onlyNodeRegions": list(spec.only_node_regions),
                "preferredNodeRegions": list(spec.preferred_node_regions),
            },
            "customBodySha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        }

    return {
        "schemaVersion": 1,
        "baseProfiles": [
            {
                "id": "ai-balanced",
                "name": "AI Balanced",
                "description": "Relaxed AI routing with region-aware selectors.",
            }
        ],
        "groups": dict(catalog.groups),
        "regions": [
            {
                "id": region.id,
                "name": region.name,
                "group": region.group,
                "terms": region.terms,
                "filterPattern": region.filter_pattern,
                "countryCodes": list(region.country_codes),
                "aliases": list(region.aliases),
                "keywords": list(region.keywords),
                "routable": region.id in {item.id for item in catalog.primary_regions},
            }
            for region in catalog.regions
        ],
        "routableRegionOrder": [region.id for region in catalog.primary_regions],
        "regionGroups": {region.group: region.id for region in catalog.primary_regions},
        "stableRegionGroups": stable_region_groups,
        "otherRegionGroup": catalog.group("other"),
        "render": {
            "preamble": [
                ";Custom_OpenClash_Rules",
                f";{zh_hk('AI 专用订阅转换模板（YAML / INI 行为显式分离）')}",
                f";{zh_hk('作者')}：{REPO_URL}",
                f";{zh_hk('项目地址')}：{REPO_URL}",
                ";基於 Custom_Clash_AI.yaml 的寬鬆版路由策略，但維持 subconverter [custom] 方言。",
                ";YAML 使用 rule-providers；INI 只使用 ruleset= / custom_proxy_group=，不包含 YAML rule-providers 語法。",
                ";Provider-level exclude-filter only applies to YAML output. INI relies on group regex filtering and explicit comments.",
                ";Cloudflare generate_204 checks proxy reachability only. It does not validate SSH-to-VPS path quality.",
                ";GENERATED by profile resolver. Do not edit manually.",
                "",
                "[custom]",
                "",
                ";設定規則標誌位",
                ";以下規則按由上而下順序遍歷，優先命中上位規則，規則重複無影響",
                "",
            ],
            "suffix": [
                "",
                "",
                ";下方参数请勿修改",
                "enable_rule_generator=true",
                "overwrite_original_rules=true",
            ],
        },
        "plan": {"sections": [_section(section) for section in plan.sections]},
        "parityFixtures": parity_fixtures,
    }


def main() -> None:
    data = build_runtime_data()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False)
    OUT.write_text("// GENERATED. Do not edit.\nexport default " + body + ";\n", encoding="utf-8")
    print(OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
