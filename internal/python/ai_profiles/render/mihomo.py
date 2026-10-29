from __future__ import annotations

from ..catalog import load_catalog
from typing import get_args

from ..common import (
    https_url,
    indent,
    positive_integer,
    rule_field,
    yaml_comment_line,
    yaml_plain_key,
    yaml_plain_string,
    yaml_single_string,
    yaml_string,
    zh_hk,
)
from ..dns import render_dns_config
from ..compiler import (
    compile_mihomo_profile,
    compile_rule_providers,
    compile_routing_entries,
    compile_service_routing,
    legacy_service_spec,
    service_auto_group_name,
    service_region_groups as compiled_service_region_groups,
)
from ..models import Catalog, MihomoProfilePlan, ProviderBehavior, RoutingComment, RoutingRule, RuleProviderPlan
from ..profile_languages import PROFILE_COMMENT_COPY
from ..plans.ini_mvp import (
    IniMvpPlan,
    account_protection_group_candidates,
    load_ini_mvp_plan,
)
from ..settings import ENABLE_PROCESS_RULES, OPENCLASH_SECRET, TEMPLATE_DIR
from .template import load_template, render_template


def service_region_groups(service: dict[str, object]) -> list[str]:
    return list(compiled_service_region_groups(legacy_service_spec(service)))


def all_region_groups() -> list[str]:
    return list(load_catalog().all_region_groups)


def manual_group_proxies(strict: bool) -> list[str]:
    return list(compile_mihomo_profile(strict=strict, include_process_rules=False).manual_group_proxies)


def service_auto_proxies(service: dict[str, object], strict: bool) -> list[str]:
    return list(compile_service_routing(legacy_service_spec(service), strict=strict).auto_proxies)


def service_ui_proxies(service: dict[str, object], strict: bool) -> list[str]:
    return list(compile_service_routing(legacy_service_spec(service), strict=strict).ui_proxies)


def yaml_proxy_list(groups: list[str] | tuple[str, ...], indent_level: int = 4) -> list[str]:
    prefix = " " * indent_level
    return [f"{prefix}- {yaml_string(group)}" for group in groups]


def _group_block(name: str, group_type: str, lines: list[str]) -> str:
    safe_name = yaml_string(name)
    safe_type = yaml_plain_string(group_type)
    return "\n".join([f"- name: {safe_name}", f"  type: {safe_type}", *lines])


def _render_proxy_groups(
    plan: MihomoProfilePlan,
    catalog: Catalog | None = None,
    account_plan: IniMvpPlan | None = None,
) -> str:
    catalog = catalog or load_catalog()
    account_plan = account_plan or load_ini_mvp_plan()
    account_protection = account_plan["accountProtection"]
    protected_service = next(
        (
            service
            for service in plan.services
            if service.service.id == account_protection["serviceId"]
        ),
        None,
    )
    if protected_service is None:
        raise RuntimeError("Mihomo profile is missing its account-protected service")
    if protected_service.service.group != account_protection["protectedGroup"]:
        raise RuntimeError("Mihomo account-protected group does not match the INI MVP plan")
    protected_candidates = account_protection_group_candidates(account_plan)
    blocks = [
        _group_block(catalog.group("manual"), "select", ["  proxies:", *yaml_proxy_list(plan.manual_group_proxies), f"  filter: {yaml_single_string(catalog.ai_pool_filter)}", "  use:", "    - provider1"]),
        _group_block(catalog.group("auto"), "select", ["  proxies:", *yaml_proxy_list((catalog.group("reject"), *catalog.all_region_groups))]),
    ]
    for policy_group in plan.policy_groups:
        lines = [
            "  proxies:",
            *yaml_proxy_list(tuple(candidate.value for candidate in policy_group.candidates)),
        ]
        if policy_group.default_selected is not None:
            lines.append(f"  default-selected: {yaml_string(policy_group.default_selected)}")
        if policy_group.include_provider_nodes:
            lines.extend(["  use:", "    - provider1"])
        blocks.append(_group_block(policy_group.name, policy_group.kind, lines))
    for service in plan.services:
        proxies = (
            protected_candidates
            if service.service.id == account_protection["serviceId"]
            else service.ui_proxies
        )
        blocks.append(_group_block(service.service.group, "select", ["  proxies:", *yaml_proxy_list(proxies)]))
        if service.auto_group != catalog.group("auto"):
            blocks.append(_group_block(service.auto_group, "select", ["  proxies:", *yaml_proxy_list((catalog.group("reject"), *service.region_groups))]))
    blocks.append(_group_block(catalog.group("reject"), "select", ["  proxies:", "    - REJECT"]))
    blocks.append(_group_block(catalog.group("fallback"), "select", ["  proxies:", *(f"    - {yaml_string(proxy)}" for proxy in plan.fallback_group_proxies)]))
    for region in plan.primary_regions:
        blocks.append(_group_block(region.group, "select", [f"  filter: {yaml_single_string(region.filter_pattern)}", "  proxies:", "    - REJECT", "  use:", "    - provider1"]))
    blocks.append(_group_block(plan.other_region_group, "select", [f"  filter: {yaml_string(catalog.ai_pool_filter)}", f"  exclude-filter: {yaml_string(catalog.known_region_exclude_pattern)}", "  proxies:", "    - REJECT", "  use:", "    - provider1"]))
    blocks.append(_group_block(catalog.group("direct"), "select", ["  proxies:", "    - DIRECT"]))
    return "\n".join(blocks).rstrip()


def render_proxy_groups(strict: bool) -> str:
    return _render_proxy_groups(
        compile_mihomo_profile(strict=strict, include_process_rules=ENABLE_PROCESS_RULES),
        account_plan=load_ini_mvp_plan(),
    )


def _render_routing_rule(rule: RoutingRule) -> str:
    if rule.kind == "MATCH":
        fields = [rule.kind, rule.target or ""]
    else:
        fields = [rule.kind, rule.value]
        if rule.target is not None:
            fields.append(rule.target)
        fields.extend(rule.options)
    encoded = ",".join(rule_field(field) for field in fields)
    return f"  - {yaml_string(encoded)}"


def _render_routing_entries(entries: tuple[RoutingComment | RoutingRule, ...]) -> str:
    return "\n".join(
        yaml_comment_line(entry.text) if isinstance(entry, RoutingComment) else _render_routing_rule(entry)
        for entry in entries
    )


def render_yaml_rules(strict: bool, include_process_rules: bool) -> str:
    return _render_routing_entries(
        compile_routing_entries(strict=strict, include_process_rules=include_process_rules)
    )


def _render_provider(provider: RuleProviderPlan) -> str:
    if provider.behavior not in get_args(ProviderBehavior):
        raise ValueError("Mihomo rule-provider behavior is unsupported")
    if provider.format != "yaml":
        raise ValueError("Mihomo rule-provider format must be yaml")
    name = yaml_plain_key(provider.name)
    behavior = yaml_plain_string(provider.behavior)
    interval = positive_integer(provider.interval, field="Mihomo rule-provider interval")
    url = yaml_string(https_url(provider.url, field="Mihomo rule-provider URL"))
    format_value = yaml_plain_string(provider.format)
    return "\n".join(
        [
            f"{name}:",
            f"  behavior: {behavior}",
            f"  interval: {interval}",
            "  type: http",
            f"  url: {url}",
            f"  format: {format_value}",
        ]
    )


def _render_rule_provider_plans(providers: tuple[RuleProviderPlan, ...]) -> str:
    names: set[str] = set()
    for provider in providers:
        name = yaml_plain_key(provider.name)
        if name in names:
            raise ValueError("Mihomo rule-provider names must be unique")
        names.add(name)
    return "\n\n".join(_render_provider(provider) for provider in providers)


def render_rule_providers(include_process_rules: bool, strict: bool) -> str:
    return _render_rule_provider_plans(
        compile_rule_providers(strict=strict, include_process_rules=include_process_rules)
    )

def render_secret_lines(language: str | None = None) -> list[str]:
    if OPENCLASH_SECRET:
        return [f"secret: {yaml_string(OPENCLASH_SECRET)}"]
    warning = ("# WARNING: Set OPENCLASH_SECRET before deploying. Do not commit real secrets." if language is None else PROFILE_COMMENT_COPY[language]["yaml"]["comments"]["secretWarning"])
    return [
        warning,
        'secret: ""',
    ]

def _profile_policy_notes(strict: bool) -> str:
    if strict:
        return "\n".join(
            [
                "# 嚴格版 AI kill-switch：",
                "# 1. 指定 AI 規則走對應服務組",
                "# 2. 上游 AI guard GEOSITE 命中後直落 ⛔ 拒絕",
                "# 3. 最終 MATCH 仍然直落 ⛔ 拒絕",
            ]
        )
    return "# 寬鬆版最終 MATCH 會落到 🐟 漏網之魚，並以 ⛔ 拒絕作最後兜底。"


def render_yaml(strict: bool, language: str | None = None) -> str:
    catalog = load_catalog()
    account_plan = load_ini_mvp_plan()
    plan = compile_mihomo_profile(strict=strict, include_process_rules=ENABLE_PROCESS_RULES, catalog=catalog)
    template = load_template(TEMPLATE_DIR / "Custom_Clash_AI.yaml.tpl")
    yaml_header = ""
    if language is None:
        title = zh_hk("YAML 配置文件（AI 专用严格版）" if strict else "YAML 配置文件（AI 专用）")
        policy_notes = _profile_policy_notes(strict)
        comments = {"profileMarker": "# Custom_OpenClash_Rules", "description": "# 適用於需要 AI 分流與 DNS 洩漏保護的 OpenWrt / OpenClash 場景\n# 基於 Custom_Clash.yaml 精簡：僅保留 AI 分流與基礎網路配置", "generated": "# GENERATED by internal/python/generate_ai_profiles.py. Do not edit manually.", "sections": {"ports": "# ==================== 端口配置 Port Configuration ====================", "proxyProviders": "# ==================== 代理提供者 Proxy Provider ====================", "geodata": "# ==================== 地理数据库配置 GeoData Configuration ====================", "logging": "# ==================== 日志与控制 ====================", "profile": "# ==================== 配置文件存储 Profile ====================", "tun": "# ==================== TUN 虚拟网卡配置 ====================", "proxyGroups": "# ==================== 代理策略组 Proxy Groups ====================", "rules": "# ==================== 分流规则 Rules ====================", "ruleProviders": "# ==================== 规则提供者 Rule Providers ===================="}}
    else:
        localized = PROFILE_COMMENT_COPY.get(language)
        if localized is None: raise ValueError(f"Unsupported profile language: {language}")
        yaml_copy = localized["yaml"]
        policy_key = "strict" if strict else "balanced"
        title = yaml_copy["titles"][policy_key]
        policy_notes = "\n".join(yaml_copy["policyNotes"][policy_key])
        comments = yaml_copy["comments"]
        yaml_header = "\n".join(yaml_copy["header"]) + "\n"
    rendered = render_template(
        template,
        {
            "PROFILE_MARKER": comments["profileMarker"],
            "TITLE": title,
            "PROFILE_DESCRIPTION": "\n".join(comments["description"]) if language is not None else comments["description"],
            "PROFILE_POLICY_NOTES": policy_notes,
            "GENERATOR_NOTE": comments["generated"],
            **{f"{slot}_SECTION": comments["sections"][key] for slot, key in (("PORTS", "ports"), ("PROXY_PROVIDERS", "proxyProviders"), ("GEODATA", "geodata"), ("LOGGING", "logging"), ("PROFILE", "profile"), ("TUN", "tun"), ("PROXY_GROUPS", "proxyGroups"), ("RULES", "rules"), ("RULE_PROVIDERS", "ruleProviders"))},
            "PROVIDER_NOISE_EXCLUDE_PATTERN": yaml_string(catalog.provider_noise_exclude_pattern),
            "SECRET_LINES": "\n".join(render_secret_lines(language)),
            "DNS_CONFIG": render_dns_config(catalog, plan.dns_policies),
            "PROXY_GROUPS": indent(_render_proxy_groups(plan, catalog, account_plan), 2),
            "RULES": indent(_render_routing_entries(plan.routing_entries), 2),
            "RULE_PROVIDERS": indent(_render_rule_provider_plans(plan.rule_providers), 2),
        },
    )
    return f"{yaml_header}{rendered}"
