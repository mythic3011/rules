from __future__ import annotations

from ..catalog import load_catalog
from ..common import indent, yaml_string, zh_hk
from ..compiler import (
    compile_ai_routing_rules,
    compile_mihomo_profile,
    compile_rule_providers,
    compile_routing_entries,
    compile_service_routing,
    legacy_service_spec,
    service_auto_group_name,
    service_region_groups as compiled_service_region_groups,
)
from ..models import DnsPolicySpec, MihomoProfilePlan, RoutingComment, RoutingRule, RuleProviderPlan
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
    return "\n".join([f'- name: "{name}"', f"  type: {group_type}", *lines])


def _render_proxy_groups(plan: MihomoProfilePlan) -> str:
    catalog = load_catalog()
    blocks = [
        _group_block(catalog.group("manual"), "select", ["  proxies:", *yaml_proxy_list(plan.manual_group_proxies), f'  filter: "{catalog.ai_pool_filter}"', "  use:", "    - provider1"]),
        _group_block(catalog.group("auto"), "url-test", [f'  filter: "{catalog.ai_pool_filter}"', "  tolerance: 50", '  url: "https://cp.cloudflare.com/generate_204"', "  interval: 300", "  use:", "    - provider1"]),
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
        blocks.append(_group_block(service.service.group, "select", ["  proxies:", *yaml_proxy_list(service.ui_proxies)]))
        blocks.append(_group_block(service.auto_group, "fallback", ['  url: "https://cp.cloudflare.com/generate_204"', "  interval: 300", "  proxies:", *yaml_proxy_list(service.auto_proxies)]))
    blocks.append(_group_block(catalog.group("reject"), "select", ["  proxies:", "    - REJECT"]))
    blocks.append(_group_block(catalog.group("fallback"), "select", ["  proxies:", *(f'    - "{proxy}"' for proxy in plan.fallback_group_proxies)]))
    for region in plan.primary_regions:
        blocks.append(_group_block(region.group, "url-test", ['  url: "https://cp.cloudflare.com/generate_204"', "  interval: 300", "  tolerance: 50", f"  filter: '{region.filter_pattern}'", "  use:", "    - provider1"]))
    blocks.append(_group_block(plan.other_region_group, "url-test", ['  url: "https://cp.cloudflare.com/generate_204"', "  interval: 300", "  tolerance: 50", f"  filter: {yaml_string(catalog.ai_pool_filter)}", f"  exclude-filter: {yaml_string(catalog.known_region_exclude_pattern)}", "  use:", "    - provider1"]))
    blocks.append(_group_block(catalog.group("direct"), "select", ["  proxies:", "    - DIRECT"]))
    return "\n".join(blocks).rstrip()


def render_proxy_groups(strict: bool) -> str:
    return _render_proxy_groups(compile_mihomo_profile(strict=strict, include_process_rules=ENABLE_PROCESS_RULES))


def _render_routing_rule(rule: RoutingRule) -> str:
    if rule.kind == "MATCH":
        fields = [rule.kind, rule.target or ""]
    else:
        fields = [rule.kind, rule.value]
        if rule.target is not None:
            fields.append(rule.target)
        fields.extend(rule.options)
    return f'  - "{",".join(fields)}"'


def render_ai_yaml_rules() -> list[str]:
    return [_render_routing_rule(rule) for rule in compile_ai_routing_rules()]


def _render_routing_entries(entries: tuple[RoutingComment | RoutingRule, ...]) -> str:
    return "\n".join(
        entry.text if isinstance(entry, RoutingComment) else _render_routing_rule(entry)
        for entry in entries
    )


def render_yaml_rules(strict: bool, include_process_rules: bool) -> str:
    return _render_routing_entries(
        compile_routing_entries(strict=strict, include_process_rules=include_process_rules)
    )


def _render_provider(provider: RuleProviderPlan) -> str:
    return "\n".join([f"{provider.name}:", f"  behavior: {provider.behavior}", f"  interval: {provider.interval}", "  type: http", f'  url: "{provider.url}"', f"  format: {provider.format}"])


def _render_rule_provider_plans(providers: tuple[RuleProviderPlan, ...]) -> str:
    return "\n\n".join(_render_provider(provider) for provider in providers)


def render_rule_providers(include_process_rules: bool, strict: bool) -> str:
    return _render_rule_provider_plans(
        compile_rule_providers(strict=strict, include_process_rules=include_process_rules)
    )

def _render_dns_policies(policies: tuple[DnsPolicySpec, ...]) -> list[str]:
    lines: list[str] = []
    for policy in policies:
        lines.append(f"    {yaml_string(policy.selector)}:")
        lines.extend(f"      - {nameserver}" for nameserver in policy.nameservers)
    return lines


def render_secret_lines() -> list[str]:
    if OPENCLASH_SECRET:
        return [f"secret: {yaml_string(OPENCLASH_SECRET)}"]
    return [
        "# WARNING: Set OPENCLASH_SECRET before deploying. Do not commit real secrets.",
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


def render_yaml(strict: bool) -> str:
    catalog = load_catalog()
    plan = compile_mihomo_profile(strict=strict, include_process_rules=ENABLE_PROCESS_RULES, catalog=catalog)
    template = load_template(TEMPLATE_DIR / "Custom_Clash_AI.yaml.tpl")
    return render_template(
        template,
        {
            "TITLE": zh_hk("YAML 配置文件（AI 专用严格版）" if strict else "YAML 配置文件（AI 专用）"),
            "PROFILE_POLICY_NOTES": _profile_policy_notes(strict),
            "PROVIDER_NOISE_EXCLUDE_PATTERN": yaml_string(catalog.provider_noise_exclude_pattern),
            "SECRET_LINES": "\n".join(render_secret_lines()),
            "DNS_POLICIES": "\n".join(_render_dns_policies(plan.dns_policies)),
            "PROXY_GROUPS": indent(_render_proxy_groups(plan), 2),
            "RULES": indent(_render_routing_entries(plan.routing_entries), 2),
            "RULE_PROVIDERS": indent(_render_rule_provider_plans(plan.rule_providers), 2),
        },
    )
