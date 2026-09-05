from __future__ import annotations

from ..common import zh_hk
from ..compiler import compile_subconverter_plan
from ..models import (
    IniCandidate,
    IniProxyGroup,
    IniRule,
    IniRulesSection,
    IniClustersSection,
    IniGroupsSection,
    IniSelectorsSection,
    IniSelectGroup,
    IniServiceSelector,
    SubconverterPlan,
)
from ..plans.ini_mvp import load_ini_mvp_plan
from ..settings import ENABLE_PROCESS_RULES, REPO_URL


def ini_banner(title: str, subtitle: str | None = None) -> list[str]:
    """Section banner: rule line, title, optional subtitle, rule, then one blank."""
    bar = ";" + "=" * 58
    banner = [bar, f"; {title}"]
    if subtitle:
        banner.append(f"; {subtitle}")
    banner.append(bar)
    banner.append("")
    return banner


def _render_ini_rule(rule: IniRule) -> str:
    if rule.kind == "remote-classical":
        return f"ruleset={rule.target},clash-classic:{rule.url},{rule.interval}"
    if rule.kind == "remote-domain":
        return f"ruleset={rule.target},clash-domain:{rule.url},{rule.interval}"
    if rule.kind == "geosite":
        return f"ruleset={rule.target},[]GEOSITE,{rule.value}"
    if rule.kind == "geoip":
        suffix = "," + ",".join(rule.options) if rule.options else ""
        return f"ruleset={rule.target},[]GEOIP,{rule.value}{suffix}"
    if rule.kind == "final":
        return f"ruleset={rule.target},[]FINAL"
    raise RuntimeError(f"Unsupported INI rule kind: {rule.kind}")


def _render_candidate(candidate: IniCandidate) -> str:
    if candidate.kind == "group-ref":
        return f"[]{candidate.value}"
    return candidate.value


def _render_select_group(group: IniSelectGroup) -> str:
    return f"custom_proxy_group={group.name}`select`" + "`".join(
        _render_candidate(candidate) for candidate in group.candidates
    )


def _render_proxy_group(group: IniSelectGroup | IniProxyGroup) -> str:
    if isinstance(group, IniSelectGroup):
        return _render_select_group(group)

    candidates = "`".join(_render_candidate(candidate) for candidate in group.candidates)
    prefix = f"custom_proxy_group={group.name}`{group.kind}`"

    if group.kind == "select":
        fields: list[str] = []
        if candidates:
            fields.append(candidates)
        if group.filter_pattern is not None:
            fields.append(group.filter_pattern)
        return prefix + "`".join(fields)

    if group.kind == "url-test":
        if (
            group.filter_pattern is None
            or group.health_check_url is None
            or group.interval is None
            or group.tolerance is None
        ):
            raise RuntimeError("INI url-test group is missing filter/health-check metadata")
        return (
            prefix
            + group.filter_pattern
            + f"`{group.health_check_url}`{group.interval},,{group.tolerance}"
        )

    if group.kind == "fallback":
        if (
            group.health_check_url is None
            or group.interval is None
            or group.tolerance is None
        ):
            raise RuntimeError("INI fallback group is missing health-check metadata")
        return (
            prefix
            + candidates
            + f"`{group.health_check_url}`{group.interval},,{group.tolerance}"
        )

    raise RuntimeError(f"Unsupported INI proxy group kind: {group.kind}")


def _render_service_selector(selector: IniServiceSelector) -> list[str]:
    return [*selector.comments, _render_select_group(selector.group)]


def _append_blank_separated(lines: list[str], items: list[str]) -> None:
    for index, item in enumerate(items):
        if index:
            lines.append("")
        lines.append(item)


def _emit_ini_section(
    lines: list[str],
    section: IniRulesSection | IniClustersSection | IniGroupsSection | IniSelectorsSection,
) -> None:
    if isinstance(section, IniRulesSection):
        if not section.rules and not section.emit_if_empty:
            return
        if section.leading_blank:
            lines.append("")
        lines.extend(section.comments)
        lines.extend(_render_ini_rule(rule) for rule in section.rules)
        return

    if isinstance(section, IniClustersSection):
        if section.leading_blank:
            lines.append("")
        for index, cluster in enumerate(section.clusters):
            if (index == 0 and section.blank_before_first) or (index > 0 and section.blank_between):
                lines.append("")
            lines.extend(_render_ini_rule(rule) for rule in cluster.rules)
        return

    if isinstance(section, IniGroupsSection):
        lines.extend(["", ""])
        lines.extend(ini_banner(section.title, section.subtitle))
        rendered = [_render_proxy_group(group) for group in section.groups]
        if section.blank_between_groups:
            _append_blank_separated(lines, rendered)
        else:
            lines.extend(rendered)
        return

    if isinstance(section, IniSelectorsSection):
        lines.extend(["", ""])
        lines.extend(ini_banner(section.title, section.subtitle))
        for index, selector in enumerate(section.selectors):
            if index and section.blank_between_selectors:
                lines.append("")
            lines.extend(_render_service_selector(selector))
        return

    raise RuntimeError(f"Unsupported subconverter section variant: {type(section).__name__}")


def _render_ini(plan: SubconverterPlan) -> str:
    lines = [
        ";Custom_OpenClash_Rules",
        f";{zh_hk('AI 专用订阅转换模板（YAML / INI 行为显式分离）')}",
        f";{zh_hk('作者')}：{REPO_URL}",
        f";{zh_hk('项目地址')}：{REPO_URL}",
        ";基於 Custom_Clash_AI.yaml 的寬鬆版路由策略，但維持 subconverter [custom] 方言。",
        ";YAML 使用 rule-providers；INI 只使用 ruleset= / custom_proxy_group=，不包含 YAML rule-providers 語法。",
        ";Provider-level exclude-filter only applies to YAML output. INI relies on group regex filtering and explicit comments.",
        ";Cloudflare generate_204 checks proxy reachability only. It does not validate SSH-to-VPS path quality.",
        ";GENERATED by internal/python/generate_ai_profiles.py. Do not edit manually.",
        "",
        "[custom]",
        "",
        ";設定規則標誌位",
        ";以下規則按由上而下順序遍歷，優先命中上位規則，規則重複無影響",
        "",
    ]

    for section in plan.sections:
        _emit_ini_section(lines, section)

    lines.extend(
        [
            "",
            "",
            ";下方参数请勿修改",
            "enable_rule_generator=true",
            "overwrite_original_rules=true",
        ]
    )
    return "\n".join(lines) + "\n"


def render_ini(profile_spec=None) -> str:
    return _render_ini(
        compile_subconverter_plan(
            load_ini_mvp_plan(),
            include_process_rules=ENABLE_PROCESS_RULES,
            profile_spec=profile_spec,
        )
    )
