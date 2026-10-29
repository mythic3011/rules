from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import yaml
from yaml.nodes import MappingNode, ScalarNode

_PACKAGE_ROOT = Path(__file__).resolve().parent
if str(_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PACKAGE_ROOT))

from ai_profiles.catalog import load_catalog
from ai_profiles.common import zh_hk
from ai_profiles.compiler import compile_mihomo_profile, compile_subconverter_plan
from ai_profiles.models import (
    GeositeRuleSource,
    IniClustersSection,
    IniGroupsSection,
    IniProxyGroup,
    IniRulesSection,
    IniSelectGroup,
    IniSelectorsSection,
    RoutingRule,
    RemoteRuleSource,
)
from ai_profiles.plans.ini_mvp import load_ini_mvp_plan
from ai_profiles.profile_spec import ProfileSpec, _stable_region_groups
from ai_profiles.profile_languages import PROFILE_COMMENT_COPY, PROFILE_DEFAULT_LANGUAGE
from ai_profiles.profile_templates import ProfileTemplateRegistry, load_profile_template_registry
from ai_profiles.service_groups import (
    ServiceGroupSpec,
    ini_service_group_entries,
    service_group_runtime_metadata,
)
from ai_profiles.render.subconverter import _render_ini
from ai_profiles.render.mihomo import render_yaml
from ai_profiles.routing_ir import INI_RULESET_INTERVAL
from ai_profiles.settings import BASE_URL, REPO_URL, RULE_DIR
from generate_adblock_outputs import load_categories as load_filter_categories

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/profile-service/worker/generated/runtime-data.mjs"

# Public profile formats are the worker API's values; keep the projection
# vocabulary out of the generated service metadata.
_OUTPUT_FORMAT_BY_PROJECTION = {
    "subconverter": "ini",
    "mihomo": "yaml",
}


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


def _parity_fixtures(ini_mvp_plan, catalog) -> dict[str, object]:
    parity_specs = {
        "disable-jp": ProfileSpec(disabled_node_regions=("jp",)),
        "only-us-sg-prefer-sg": ProfileSpec(
            only_node_regions=("us", "sg"),
            preferred_node_regions=("sg",),
        ),
        "disable-hk": ProfileSpec(disabled_node_regions=("hk",)),
        "disable-account-protected-service": ProfileSpec(
            disabled_services=(ini_mvp_plan["accountProtection"]["serviceId"],),
        ),
        "block-direct": ProfileSpec(allow_direct=False),
        "fail-closed": ProfileSpec(fail_closed=True),
    }
    base_plan = compile_subconverter_plan(
        ini_mvp_plan,
        include_process_rules=False,
        catalog=catalog,
    )
    service_groups: list[ServiceGroupSpec] = []
    for entry in ini_service_group_entries(catalog, base_plan, ini_mvp_plan):
        routes = list(entry["defaultRoutes"])
        name = str(entry["name"])
        if entry["id"] == "chatgpt":
            name = "ChatGPT Plus"
            routes = [route for route in routes if route != "reject"]
            routes.extend(("hk", "reject"))
        elif entry["protected"]:
            routes = ["jp", "us"]
        service_groups.append(
            ServiceGroupSpec(
                id=str(entry["id"]),
                name=name,
                service_ids=tuple(entry["serviceIds"]),
                routes=tuple(routes),
            )
        )
    if len(service_groups) > 1:
        service_groups[0], service_groups[1] = service_groups[1], service_groups[0]
    parity_specs["service-groups-hk-reordered"] = ProfileSpec(
        fail_closed=True,
        service_groups=tuple(service_groups),
    )
    parity_specs["service-groups-unassigned-chatgpt"] = ProfileSpec(
        preferred_services=("gemini",),
        service_groups=tuple(group for group in service_groups if group.id != "chatgpt"),
    )
    fixtures: dict[str, object] = {}
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
        spec_data = {
            "schemaVersion": 1,
            "baseProfile": spec.base_profile,
            "disabledNodeRegions": list(spec.disabled_node_regions),
            "onlyNodeRegions": list(spec.only_node_regions),
            "preferredNodeRegions": list(spec.preferred_node_regions),
        }
        if spec.disabled_services:
            spec_data["disabledServices"] = list(spec.disabled_services)
        if spec.preferred_services:
            spec_data["preferredServices"] = list(spec.preferred_services)
        if spec.allow_direct is not None:
            spec_data["allowDirect"] = spec.allow_direct
        if spec.fail_closed is not None:
            spec_data["failClosed"] = spec.fail_closed
        if spec.service_groups is not None:
            spec_data["serviceGroups"] = [
                {
                    "id": group.id,
                    "name": group.name,
                    "serviceIds": list(group.service_ids),
                    "routes": list(group.routes),
                }
                for group in spec.service_groups
            ]
        fixtures[name] = {
            "spec": spec_data,
            "customBodySha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        }
    return fixtures


def _runtime_regions(catalog) -> list[dict[str, object]]:
    primary_ids = {item.id for item in catalog.primary_regions}
    return [
        {
            "id": region.id,
            "name": region.name,
            "group": region.group,
            "terms": region.terms,
            "filterPattern": region.filter_pattern,
            "countryCodes": list(region.country_codes),
            "aliases": list(region.aliases),
            "keywords": list(region.keywords),
            "routable": region.id in primary_ids,
        }
        for region in catalog.regions
    ]


def _render_boilerplate() -> dict[str, object]:
    return {
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
        "localized": {
            language: {
                "header": list(copy["header"]),
                "footer": list(copy["footer"]),
                "sections": dict(copy["sections"]),
                "optionalProviderNotes": dict(copy["optionalProviderNotes"]),
                "yaml": {
                    "header": list(copy["yaml"]["header"]),
                    "titles": dict(copy["yaml"]["titles"]),
                    "policyNotes": {key: list(lines) for key, lines in copy["yaml"]["policyNotes"].items()},
                    "optionalProviderNotes": dict(copy["yaml"]["optionalProviderNotes"]),
                    "comments": {
                        "profileMarker": copy["yaml"]["comments"]["profileMarker"],
                        "description": list(copy["yaml"]["comments"]["description"]),
                        "generated": copy["yaml"]["comments"]["generated"],
                        "secretWarning": copy["yaml"]["comments"]["secretWarning"],
                        "sections": dict(copy["yaml"]["comments"]["sections"]),
                    },
                },
            }
            for language, copy in PROFILE_COMMENT_COPY.items()
        },
        "defaultLanguage": PROFILE_DEFAULT_LANGUAGE,
    }


def _provider_payload(document: object, provider: str) -> list[str]:
    if not isinstance(document, dict) or "payload" not in document:
        raise RuntimeError(f"Rule provider must declare a payload: {provider}")
    payload = document["payload"]
    # A bare `payload:` is the repository's explicit empty-provider template.
    if payload is None:
        return []
    if not isinstance(payload, list) or any(not isinstance(item, str) for item in payload):
        raise RuntimeError(f"Rule provider payload must be a string list: {provider}")
    return payload


def _mihomo_profile(catalog, *, strict: bool = False) -> dict[str, object]:
    """Reuse the Python policy profile and bundle its repository-owned rules."""
    profile = yaml.safe_load(render_yaml(strict=strict))
    if not isinstance(profile, dict):
        raise RuntimeError("Mihomo runtime profile must be a mapping")
    # Conversion output must never embed the generator operator's controller
    # secret or start an unauthenticated remote controller on imported devices.
    profile.pop("secret", None)
    profile.pop("external-controller", None)
    plan = compile_mihomo_profile(strict=strict, include_process_rules=False, catalog=catalog)
    payloads = {service.provider_key: service.payload for service in catalog.services if service.payload}
    payloads.update({
        rule.provider_key: (
            rule.payload if rule.render_mode == "classical"
            else _provider_payload(yaml.safe_load("\n".join(rule.comment_lines)), rule.provider_key)
        )
        for rule in catalog.companion_rulesets
    })
    providers = profile["rule-providers"]
    for route in plan.routing_entries:
        if not isinstance(route, RoutingRule) or route.provider_file is None:
            continue
        if route.value in payloads:
            payload = list(payloads[route.value])
        else:
            path = (RULE_DIR / route.provider_file).resolve()
            if not path.is_relative_to(RULE_DIR.resolve()):
                raise RuntimeError(f"Rule provider file is outside rule directory: {route.value}")
            payload = _provider_payload(yaml.safe_load(path.read_text(encoding="utf-8")), route.value)
        providers[route.value] = {
            "type": "inline",
            "behavior": route.provider_behavior,
            "payload": payload,
        }
    return profile


def _ensure_dns_proxy_group(groups: list[dict[str, object]], catalog, egress_group: str) -> None:
    by_name = {group.get("name"): group for group in groups if isinstance(group.get("name"), str)}
    if len(by_name) != len(groups):
        raise RuntimeError("YAML profile proxy group names must be unique and non-empty")
    egress = by_name.get(egress_group)
    if egress is None or egress.get("type") != "select":
        raise RuntimeError(f"YAML DNS egress group must be an existing select group: {egress_group}")
    if not egress.get("proxies") and not egress.get("use"):
        raise RuntimeError(f"YAML DNS egress group has no proxy choices: {egress_group}")

    direct_group = catalog.group("direct")
    by_name_group = {group["name"]: group for group in groups}

    def visit(name: str, active: set[str]) -> None:
        if name in active:
            raise RuntimeError("YAML DNS egress group graph must be acyclic")
        group = by_name_group.get(name)
        if group is None:
            return
        active.add(name)
        proxies = group.get("proxies", [])
        if not isinstance(proxies, list) or any(not isinstance(proxy, str) for proxy in proxies):
            raise RuntimeError(f"YAML DNS egress group has invalid choices: {name}")
        for proxy in proxies:
            if proxy in {"DIRECT", direct_group}:
                raise RuntimeError("YAML DNS egress group cannot reach DIRECT")
            visit(proxy, active)
        active.remove(name)

    visit(egress_group, set())

    reject_group = catalog.group("reject")
    reject = by_name.get(reject_group)
    if reject is None:
        reject = {"name": reject_group, "type": "select"}
        groups.append(reject)
    reject.update({"type": "select", "proxies": ["REJECT"]})
    for key in ("filter", "exclude-filter", "use", "url", "interval", "tolerance", "strategy"):
        reject.pop(key, None)

    dns_group_name = catalog.group("dns")
    dns_group = by_name.get(dns_group_name)
    if dns_group is None:
        dns_group = {"name": dns_group_name, "type": "select"}
        groups.insert(0, dns_group)
    dns_group.update({"type": "select", "proxies": [egress_group, reject_group]})
    for key in ("filter", "exclude-filter", "use", "url", "interval", "tolerance", "strategy"):
        dns_group.pop(key, None)


def _load_template_yaml(template) -> dict[str, object]:
    path = ROOT / template.path
    text = path.read_text(encoding="utf-8")
    document_node = yaml.compose(text)
    if not isinstance(document_node, MappingNode):
        raise RuntimeError(f"YAML profile template must be a mapping: {template.path}")
    provider_sections = [
        value_node
        for key_node, value_node in document_node.value
        if isinstance(key_node, ScalarNode) and key_node.value == "rule-providers"
    ]
    if len(provider_sections) != 1 or not isinstance(provider_sections[0], MappingNode):
        raise RuntimeError(f"YAML profile template must declare one rule-providers mapping: {template.path}")
    provider_names: set[str] = set()
    for key_node, _value_node in provider_sections[0].value:
        if not isinstance(key_node, ScalarNode) or not key_node.value:
            raise RuntimeError(f"YAML profile template has an invalid rule-provider name: {template.path}")
        if key_node.value in provider_names:
            raise RuntimeError(f"YAML profile template has a duplicate rule provider: {key_node.value}")
        provider_names.add(key_node.value)
    document = yaml.safe_load(text)
    if not isinstance(document, dict):
        raise RuntimeError(f"YAML profile template must be a mapping: {template.path}")
    return document


def _validate_yaml_rule_references(profile: dict[str, object], template_path: str) -> None:
    groups = profile.get("proxy-groups")
    providers = profile.get("rule-providers")
    rules = profile.get("rules")
    if not isinstance(groups, list) or not isinstance(providers, dict) or not isinstance(rules, list):
        raise RuntimeError(f"YAML profile template requires groups, providers, and rules: {template_path}")
    group_names = {
        group.get("name")
        for group in groups
        if isinstance(group, dict) and isinstance(group.get("name"), str)
    }
    if len(group_names) != len(groups):
        raise RuntimeError(f"YAML profile template has invalid or duplicate proxy groups: {template_path}")
    builtin_targets = {"DIRECT", "REJECT", "PASS", "COMPATIBLE"}
    for index, rule in enumerate(rules):
        if not isinstance(rule, str):
            raise RuntimeError(f"YAML profile rule must be a string: {template_path}[{index}]")
        fields = [field.strip() for field in rule.split(",")]
        kind = fields[0].upper() if fields else ""
        target_index = 1 if kind == "MATCH" else 2
        if len(fields) <= target_index or not fields[target_index]:
            raise RuntimeError(f"YAML profile rule has no target: {template_path}[{index}]")
        target = fields[target_index]
        if target not in group_names and target not in builtin_targets:
            raise RuntimeError(f"YAML profile rule targets an unknown group: {template_path}[{index}] {target}")
        if kind == "RULE-SET" and (len(fields) < 3 or fields[1] not in providers):
            provider = fields[1] if len(fields) > 1 else ""
            raise RuntimeError(f"YAML profile rule references an unknown provider: {template_path}[{index}] {provider}")


def _template_yaml(template, catalog) -> dict[str, object]:
    if template.id == "ai-balanced":
        return _mihomo_profile(catalog, strict=False)
    if template.id == "ai-strict":
        return _mihomo_profile(catalog, strict=True)
    document = _load_template_yaml(template)
    profile = dict(document)
    profile.pop("secret", None)
    profile.pop("external-controller", None)
    providers = profile.get("proxy-providers")
    if not isinstance(providers, dict) or not isinstance(providers.get("provider1"), dict):
        raise RuntimeError(f"YAML profile template requires proxy-providers.provider1: {template.path}")
    if set(providers) != {"provider1"}:
        raise RuntimeError(f"YAML profile template has unsupported remote providers: {template.path}")
    canonical = _mihomo_profile(catalog, strict=False)
    for key in ("dns", "tun", "ipv6"):
        profile[key] = canonical[key]
    groups = profile.get("proxy-groups")
    if not isinstance(groups, list):
        raise RuntimeError(f"YAML profile template requires proxy-groups: {template.path}")
    for group in groups:
        if not isinstance(group, dict):
            raise RuntimeError(f"YAML profile contains an invalid proxy group: {template.path}")
        if group.get("type") in {"url-test", "fallback", "load-balance"}:
            group["type"] = "select"
            group.pop("url", None)
            group.pop("interval", None)
            group.pop("tolerance", None)
            group.pop("strategy", None)
    if not template.dns_egress_group:
        raise RuntimeError(f"YAML profile template must declare its DNS egress group: {template.path}")
    _ensure_dns_proxy_group(groups, catalog, template.dns_egress_group)
    rule_providers = profile.get("rule-providers")
    canonical_rule_providers = canonical.get("rule-providers")
    if not isinstance(rule_providers, dict) or not isinstance(canonical_rule_providers, dict):
        raise RuntimeError(f"YAML profile requires rule providers: {template.path}")
    privacy_provider = "Privacy_Guard_Classical"
    if privacy_provider not in canonical_rule_providers:
        raise RuntimeError("Canonical privacy guard rule provider is missing")
    rule_providers[privacy_provider] = canonical_rule_providers[privacy_provider]
    rules = profile.get("rules")
    if not isinstance(rules, list) or any(not isinstance(rule, str) for rule in rules):
        raise RuntimeError(f"YAML profile requires a string rules list: {template.path}")
    privacy_rule = f"RULE-SET,{privacy_provider},REJECT,no-resolve"
    rules = [rule for rule in rules if not rule.startswith(f"RULE-SET,{privacy_provider},")]
    rules.insert(0, privacy_rule)
    profile["rules"] = rules
    _validate_yaml_rule_references(profile, template.path)
    return profile


def _normalize_ini_template(text: str, template) -> str:
    lines = text.splitlines()
    privacy_rule = (
        "ruleset=REJECT,clash-classic:"
        f"{BASE_URL}/rule/Privacy_Guard_Classical.yaml,28800"
    )
    if not any("Privacy_Guard_Classical" in line for line in lines):
        custom_index = next(
            (index for index, line in enumerate(lines) if line.strip() == "[custom]"),
            None,
        )
        if custom_index is None:
            raise RuntimeError(f"INI profile template is missing [custom]: {template.path}")
        lines.insert(custom_index + 1, privacy_rule)

    normalized: list[str] = []
    for line in lines:
        if not line.startswith("custom_proxy_group="):
            normalized.append(line)
            continue
        fields = line.split("`")
        if len(fields) < 3 or fields[1] not in {"url-test", "fallback", "load-balance"}:
            normalized.append(line)
            continue
        # Health-test groups are emitted as explicit selectors so imported
        # subscriptions do not choose a different node/IP on each probe.
        kept = fields[2:-2] if fields[1] == "url-test" and len(fields) >= 5 else fields[2:]
        normalized.append("`".join((fields[0], "select", *kept)))
    return "\n".join(normalized) + "\n"


def _profile_templates(registry: ProfileTemplateRegistry) -> list[dict[str, object]]:
    return [
        {
            "id": template.id,
            "outputFormat": template.output_format,
            "name": template.name,
            "description": template.description,
            "supportsProfileOptions": template.supports_profile_options,
            "dnsEgressGroup": template.dns_egress_group,
        }
        for template in registry.templates
    ]


def _adblock_rule_provider() -> dict[str, str]:
    categories = load_filter_categories()
    adblock = categories.get("adblock")
    if not isinstance(adblock, dict):
        raise RuntimeError("Adblock category metadata is unavailable")
    provider_name = adblock.get("clash_name")
    output_value = adblock.get("clash_output")
    if not isinstance(provider_name, str) or not provider_name or not isinstance(output_value, str):
        raise RuntimeError("Adblock Clash output metadata is invalid")
    output_path = Path(output_value)
    if output_path.is_absolute() or not output_path.parts or output_path.parts[0] != "rule" or ".." in output_path.parts:
        raise RuntimeError("Adblock Clash output must stay under the rule directory")
    if not provider_name.isascii() or not provider_name[0].isalnum() or any(not (character.isalnum() or character in "_-") for character in provider_name):
        raise RuntimeError("Adblock Clash provider name is invalid")
    return {"name": provider_name, "behavior": "domain", "url": f"{BASE_URL.rstrip('/')}/{output_path.as_posix()}"}


def _rule_provider_intervals() -> dict[str, int]:
    yaml_interval = RemoteRuleSource.__dataclass_fields__["interval"].default
    if not isinstance(yaml_interval, int) or yaml_interval < 1 or INI_RULESET_INTERVAL < 1:
        raise RuntimeError("Canonical custom rule provider intervals are invalid")
    return {"yaml": yaml_interval, "ini": INI_RULESET_INTERVAL}


def _profile_services(catalog) -> list[dict[str, object]]:
    services: list[dict[str, object]] = []
    for service in catalog.services:
        unknown_projections = service.projections - _OUTPUT_FORMAT_BY_PROJECTION.keys()
        if unknown_projections:
            raise RuntimeError(
                f"Unsupported service projections for {service.id}: "
                f"{', '.join(sorted(unknown_projections))}"
            )
        references: list[dict[str, str]] = []
        if service.payload:
            references.append({
                "yamlKind": "RULE-SET",
                "yamlValue": service.provider_key,
                "iniKind": "remote-classical",
                "iniValue": f"{BASE_URL}/rule/{service.file}",
            })
        for source in service.upstream_rules:
            if isinstance(source, GeositeRuleSource):
                references.append({
                    "yamlKind": "GEOSITE",
                    "yamlValue": source.value,
                    "iniKind": "geosite",
                    "iniValue": source.value,
                })
            elif isinstance(source, RemoteRuleSource):
                references.append({
                    "yamlKind": "RULE-SET",
                    "yamlValue": source.provider_key,
                    "iniKind": "remote-domain" if source.behavior == "domain" else "remote-classical",
                    "iniValue": source.url,
                })
        services.append({
            "id": service.id,
            "name": service.group,
            "group": service.group,
            "outputFormats": sorted(
                _OUTPUT_FORMAT_BY_PROJECTION[projection]
                for projection in service.projections
            ),
            "ruleRefs": references,
        })
    return services


def build_runtime_data() -> dict[str, object]:
    catalog = load_catalog()
    template_registry = load_profile_template_registry()
    ini_mvp_plan = load_ini_mvp_plan()
    account_protection = ini_mvp_plan["accountProtection"]
    if account_protection["rejectGroup"] != catalog.group("reject"):
        raise RuntimeError("INI MVP account reject group does not match the canonical group registry")
    plan = compile_subconverter_plan(
        ini_mvp_plan,
        include_process_rules=False,
        catalog=catalog,
    )
    yaml_group_plans = {
        template.id: compile_mihomo_profile(
            strict=template.id == "ai-strict",
            include_process_rules=False,
            catalog=catalog,
        )
        for template in template_registry.for_format("yaml")
        if template.supports_profile_options
    }
    service_group_data = service_group_runtime_metadata(
        catalog,
        plan,
        yaml_group_plans,
        ini_mvp_plan,
    )
    return {
        "schemaVersion": 1,
        "templates": _profile_templates(template_registry),
        "defaultProfiles": dict(template_registry.default_by_format),
        "accountProtection": dict(account_protection),
        "adblockRuleProvider": _adblock_rule_provider(),
        "ruleProviderIntervals": _rule_provider_intervals(),
        "baseProfiles": [
            {
                "id": "ai-balanced",
                "name": "AI Balanced",
                "description": "Relaxed AI routing with region-aware selectors.",
            }
        ],
        "groups": dict(catalog.groups),
        "regions": _runtime_regions(catalog),
        "services": _profile_services(catalog),
        **service_group_data,
        "routableRegionOrder": [region.id for region in catalog.primary_regions],
        "regionGroups": {region.group: region.id for region in catalog.primary_regions},
        "stableRegionGroups": _stable_region_groups(plan, catalog),
        "otherRegionGroup": catalog.group("other"),
        "render": _render_boilerplate(),
        "plan": {"sections": [_section(section) for section in plan.sections]},
        "mihomoProfile": _mihomo_profile(catalog),
        "outputProfiles": {
            "yaml": {
                template.id: _template_yaml(template, catalog)
                for template in template_registry.for_format("yaml")
            },
        },
        "iniTemplates": {
            template.id: _normalize_ini_template(
                (ROOT / template.path).read_text(encoding="utf-8"),
                template,
            )
            for template in template_registry.for_format("ini")
        },
        "parityFixtures": _parity_fixtures(ini_mvp_plan, catalog),
    }


def main() -> None:
    data = build_runtime_data()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False)
    OUT.write_text("// GENERATED. Do not edit.\nexport default " + body + ";\n", encoding="utf-8")
    print(OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
