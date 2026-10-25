from __future__ import annotations

from typing import get_args

from ..common import (
    https_url,
    ini_comment_line,
    ini_string,
    nonnegative_integer,
    positive_integer,
    zh_hk,
)
from ..compiler import compile_subconverter_plan
from ..models import (
    IniCandidate,
    IniProxyGroup,
    IniRule,
    IniRulesSection,
    IniClustersSection,
    IniGroupsSection,
    IniProxyGroupKind,
    IniSelectorsSection,
    IniSelectGroup,
    IniServiceSelector,
    SubconverterPlan,
)
from ..plans.ini_mvp import load_ini_mvp_plan
from ..profile_languages import PROFILE_COMMENT_COPY
from ..settings import ENABLE_PROCESS_RULES, REPO_URL


def ini_banner(title: str, subtitle: str | None = None) -> list[str]:
    """Section banner: rule line, title, optional subtitle, rule, then one blank."""
    bar = ";" + "=" * 58
    banner = [bar, ini_comment_line(title)]
    if subtitle:
        banner.append(ini_comment_line(subtitle))
    banner.append(bar)
    banner.append("")
    return banner


def _render_ini_rule(rule: IniRule) -> str:
    if rule.kind == "remote-classical":
        target = ini_string(rule.target, delimiters=",")
        url = ini_string(https_url(rule.url or "", field="INI rule-provider URL"), delimiters=",")
        interval = positive_integer(rule.interval, field="INI rule-provider interval")
        return f"ruleset={target},clash-classic:{url},{interval}"
    if rule.kind == "remote-domain":
        target = ini_string(rule.target, delimiters=",")
        url = ini_string(https_url(rule.url or "", field="INI rule-provider URL"), delimiters=",")
        interval = positive_integer(rule.interval, field="INI rule-provider interval")
        return f"ruleset={target},clash-domain:{url},{interval}"
    if rule.kind == "geosite":
        target = ini_string(rule.target, delimiters=",")
        value = ini_string(rule.value or "", delimiters=",")
        return f"ruleset={target},[]GEOSITE,{value}"
    if rule.kind == "geoip":
        target = ini_string(rule.target, delimiters=",")
        value = ini_string(rule.value or "", delimiters=",")
        options = tuple(ini_string(option, delimiters=",") for option in rule.options)
        suffix = "," + ",".join(options) if options else ""
        return f"ruleset={target},[]GEOIP,{value}{suffix}"
    if rule.kind == "final":
        target = ini_string(rule.target, delimiters=",")
        return f"ruleset={target},[]FINAL"
    raise RuntimeError(f"Unsupported INI rule kind: {rule.kind}")


def _render_candidate(candidate: IniCandidate) -> str:
    value = ini_string(candidate.value, delimiters="`")
    if candidate.kind == "group-ref":
        return f"[]{value}"
    if candidate.kind == "node-filter":
        return value
    raise RuntimeError(f"Unsupported INI candidate kind: {candidate.kind}")


def _render_select_group(group: IniSelectGroup) -> str:
    name = ini_string(group.name, delimiters="`")
    return f"custom_proxy_group={name}`select`" + "`".join(
        _render_candidate(candidate) for candidate in group.candidates
    )


def _render_proxy_group(group: IniSelectGroup | IniProxyGroup) -> str:
    if isinstance(group, IniSelectGroup):
        return _render_select_group(group)

    if group.kind not in get_args(IniProxyGroupKind):
        raise RuntimeError(f"Unsupported INI proxy group kind: {group.kind}")
    name = ini_string(group.name, delimiters="`")
    candidates = "`".join(_render_candidate(candidate) for candidate in group.candidates)
    prefix = f"custom_proxy_group={name}`{group.kind}`"

    if group.kind == "select":
        fields: list[str] = []
        if candidates:
            fields.append(candidates)
        if group.filter_pattern is not None:
            fields.append(ini_string(group.filter_pattern, delimiters="`"))
        return prefix + "`".join(fields)

    if group.kind == "url-test":
        if (
            group.filter_pattern is None
            or group.health_check_url is None
            or group.interval is None
            or group.tolerance is None
        ):
            raise RuntimeError("INI url-test group is missing filter/health-check metadata")
        health_check_url = ini_string(
            https_url(group.health_check_url, field="INI health-check URL"),
            delimiters="`",
        )
        interval = positive_integer(group.interval, field="INI health-check interval")
        tolerance = nonnegative_integer(group.tolerance, field="INI health-check tolerance")
        filter_pattern = ini_string(group.filter_pattern, delimiters="`")
        return (
            prefix
            + (candidates + "`" if candidates else "")
            + filter_pattern
            + f"`{health_check_url}`{interval},,{tolerance}"
        )

    if group.kind == "fallback":
        if (
            group.health_check_url is None
            or group.interval is None
            or group.tolerance is None
        ):
            raise RuntimeError("INI fallback group is missing health-check metadata")
        health_check_url = ini_string(
            https_url(group.health_check_url, field="INI health-check URL"),
            delimiters="`",
        )
        interval = positive_integer(group.interval, field="INI health-check interval")
        tolerance = nonnegative_integer(group.tolerance, field="INI health-check tolerance")
        return (
            prefix
            + candidates
            + f"`{health_check_url}`{interval},,{tolerance}"
        )

    raise RuntimeError(f"Unsupported INI proxy group kind: {group.kind}")


def _render_service_selector(selector: IniServiceSelector) -> list[str]:
    return [*(ini_comment_line(comment) for comment in selector.comments), _render_select_group(selector.group)]


def _append_blank_separated(lines: list[str], items: list[str]) -> None:
    for index, item in enumerate(items):
        if index:
            lines.append("")
        lines.append(item)


def _emit_ini_section(
    lines: list[str],
    section: IniRulesSection | IniClustersSection | IniGroupsSection | IniSelectorsSection,
    localized_copy: dict[str, object] | None = None,
) -> None:
    if isinstance(section, IniRulesSection):
        if not section.rules and not section.emit_if_empty:
            return
        if section.leading_blank:
            lines.append("")
        if localized_copy and section.comments:
            sections = localized_copy["sections"]
            lines.append(ini_comment_line(sections.get(section.role, "Routing rules")))
        else:
            lines.extend(ini_comment_line(comment) for comment in section.comments)
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
        title = localized_copy["sections"].get(section.role, section.title) if localized_copy else section.title
        lines.extend(ini_banner(title, None if localized_copy else section.subtitle))
        rendered = [_render_proxy_group(group) for group in section.groups]
        if section.blank_between_groups:
            _append_blank_separated(lines, rendered)
        else:
            lines.extend(rendered)
        return

    if isinstance(section, IniSelectorsSection):
        lines.extend(["", ""])
        title = localized_copy["sections"].get(section.role, section.title) if localized_copy else section.title
        lines.extend(ini_banner(title, None if localized_copy else section.subtitle))
        for index, selector in enumerate(section.selectors):
            if index and section.blank_between_selectors:
                lines.append("")
            if localized_copy and selector.comments:
                lines.append(ini_comment_line(localized_copy["sections"].get(section.role, "Service choices")))
            else:
                lines.extend(ini_comment_line(comment) for comment in selector.comments)
            lines.append(_render_select_group(selector.group))
        return

    raise RuntimeError(f"Unsupported subconverter section variant: {type(section).__name__}")


def _render_ini(plan: SubconverterPlan, language: str | None = None) -> str:
    localized_copy = PROFILE_COMMENT_COPY.get(language) if language is not None else None
    if language is not None and localized_copy is None:
        raise ValueError(f"Unsupported profile language: {language}")
    if localized_copy:
        lines = [*(ini_comment_line(line) for line in localized_copy["header"]), "", "[custom]", ""]
    else:
        lines = [
        ini_comment_line(";Custom_OpenClash_Rules"),
        ini_comment_line(f";{zh_hk('AI 专用订阅转换模板（YAML / INI 行为显式分离）')}"),
        ini_comment_line(f";{zh_hk('作者')}：{REPO_URL}"),
        ini_comment_line(f";{zh_hk('项目地址')}：{REPO_URL}"),
        ini_comment_line(";基於 Custom_Clash_AI.yaml 的寬鬆版路由策略，但維持 subconverter [custom] 方言。"),
        ini_comment_line(";YAML 使用 rule-providers；INI 只使用 ruleset= / custom_proxy_group=，不包含 YAML rule-providers 語法。"),
        ini_comment_line(";Provider-level exclude-filter only applies to YAML output. INI relies on group regex filtering and explicit comments."),
        ini_comment_line(";Cloudflare generate_204 checks proxy reachability only. It does not validate SSH-to-VPS path quality."),
        ini_comment_line(";GENERATED by internal/python/generate_ai_profiles.py. Do not edit manually."),
        "",
        "[custom]",
        "",
        ";設定規則標誌位",
        ";以下規則按由上而下順序遍歷，優先命中上位規則，規則重複無影響",
        "",
        ]

    for section in plan.sections:
        _emit_ini_section(lines, section, localized_copy)

    if localized_copy:
        lines.extend(["", "", *(ini_comment_line(line) for line in localized_copy["footer"])])
    else:
        lines.extend(["", "", ini_comment_line(";下方参数请勿修改")])
    lines.extend(["enable_rule_generator=true", "overwrite_original_rules=true"])
    return "\n".join(lines) + "\n"


def render_ini(profile_spec=None, language: str | None = None) -> str:
    selected_language = language or getattr(profile_spec, "language", None)
    return _render_ini(
        compile_subconverter_plan(
            load_ini_mvp_plan(),
            include_process_rules=ENABLE_PROCESS_RULES,
            profile_spec=profile_spec,
        ),
        selected_language,
    )
