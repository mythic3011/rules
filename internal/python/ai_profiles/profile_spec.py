from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Iterable, Literal

from .models import (
    Catalog,
    GeositeRuleSource,
    IniCandidate,
    IniClustersSection,
    IniGroupsSection,
    IniProxyGroup,
    IniRuleCluster,
    IniRulesSection,
    IniSectionRole,
    IniSelectGroup,
    IniSelectorsSection,
    IniServiceSelector,
    RemoteRuleSource,
    RegionSpec,
    SubconverterPlan,
)
from .profile_templates import load_profile_template_registry
from .profile_languages import PROFILE_COMMENT_COPY
from .service_groups import (
    ServiceGroupError,
    ServiceGroupSpec,
    ResolvedServiceGroupSpec,
    apply_service_groups_to_subconverter_plan,
    ini_service_group_entries,
    normalize_service_group_layout,
)
from .settings import BASE_URL

ProfileLanguage = Literal["en", "zh-Hant", "zh-Hans"]


@dataclass(frozen=True, slots=True)
class ProfileSpec:
    """User-facing, backend-neutral profile preferences.

    HTTP and CLI callers share the same closed, backend-neutral option shape.
    Missing optional booleans preserve the source template's current behavior.
    """

    base_profile: str = "ai-balanced"
    disabled_node_regions: tuple[str, ...] = ()
    only_node_regions: tuple[str, ...] = ()
    preferred_node_regions: tuple[str, ...] = ()
    disabled_services: tuple[str, ...] = ()
    preferred_services: tuple[str, ...] = ()
    allow_direct: bool | None = None
    fail_closed: bool | None = None
    language: ProfileLanguage | None = None
    service_groups: tuple[ServiceGroupSpec, ...] | None = None


@dataclass(frozen=True, slots=True)
class ResolvedProfileSpec:
    base_profile: str
    disabled_region_ids: tuple[str, ...]
    active_region_ids: tuple[str, ...]
    preferred_region_ids: tuple[str, ...]
    disabled_service_ids: tuple[str, ...]
    preferred_service_ids: tuple[str, ...]
    allow_direct: bool | None
    fail_closed: bool | None
    language: ProfileLanguage | None
    service_groups: tuple[ResolvedServiceGroupSpec, ...] | None
    include_other_region: bool


class ProfileSpecError(ValueError):
    pass


def _dedupe(values: Iterable[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return tuple(result)


def _normalize_alias(value: str) -> str:
    return "".join(ch for ch in value.casefold().strip() if ch.isalnum())


def region_alias_map(catalog: Catalog) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for region in catalog.regions:
        candidates = (
            region.id,
            region.name,
            *region.country_codes,
            *region.aliases,
        )
        for candidate in candidates:
            key = _normalize_alias(candidate)
            if not key:
                continue
            existing = aliases.get(key)
            if existing is not None and existing != region.id:
                raise ProfileSpecError(
                    f"Ambiguous region alias {candidate!r}: {existing!r} / {region.id!r}"
                )
            aliases[key] = region.id
    return aliases


def canonicalize_region_id(value: str, catalog: Catalog) -> str:
    key = _normalize_alias(value)
    if not key:
        raise ProfileSpecError("Region value cannot be empty")
    region_id = region_alias_map(catalog).get(key)
    if region_id is None:
        raise ProfileSpecError(f"Unknown region: {value}")
    return region_id


def _canonicalize_many(values: Iterable[str], catalog: Catalog) -> tuple[str, ...]:
    return _dedupe(canonicalize_region_id(value, catalog) for value in values)


def _canonicalize_services(values: Iterable[str], catalog: Catalog) -> tuple[str, ...]:
    known = {
        service.id for service in catalog.services
        if "subconverter" in service.projections
    }
    result: list[str] = []
    for value in values:
        if not isinstance(value, str) or not value.strip():
            raise ProfileSpecError("Service IDs must be non-empty strings")
        service_id = value.strip()
        if service_id not in known:
            raise ProfileSpecError(f"Unknown service: {value}")
        result.append(service_id)
    return _dedupe(result)


def _service_ini_rule_refs(service) -> set[tuple[str, str]]:
    refs: set[tuple[str, str]] = set()
    if service.payload:
        refs.add(("remote-classical", f"{BASE_URL}/rule/{service.file}"))
    for source in service.upstream_rules:
        if isinstance(source, GeositeRuleSource):
            refs.add(("geosite", source.value))
        elif isinstance(source, RemoteRuleSource):
            kind = "remote-domain" if source.behavior == "domain" else "remote-classical"
            refs.add((kind, source.url))
    return refs


def _service_rule_owners(catalog: Catalog) -> dict[tuple[str, str], set[str]]:
    owners: dict[tuple[str, str], set[str]] = {}
    for service in catalog.services:
        if "subconverter" not in service.projections:
            continue
        for ref in _service_ini_rule_refs(service):
            owners.setdefault(ref, set()).add(service.id)
    return owners


def resolve_profile_spec(
    spec: ProfileSpec,
    catalog: Catalog,
    *,
    service_group_plan: SubconverterPlan | None = None,
    ini_mvp_plan=None,
) -> ResolvedProfileSpec:
    registry = load_profile_template_registry()
    try:
        template = registry.get("ini", spec.base_profile)
    except ValueError as exc:
        raise ProfileSpecError(str(exc)) from exc

    disabled = _canonicalize_many(spec.disabled_node_regions, catalog)
    only = _canonicalize_many(spec.only_node_regions, catalog)
    preferred = _canonicalize_many(spec.preferred_node_regions, catalog)
    disabled_services = _canonicalize_services(spec.disabled_services, catalog)
    preferred_services = _canonicalize_services(spec.preferred_services, catalog)

    if set(disabled_services) & set(preferred_services):
        raise ProfileSpecError("A disabled service cannot also be preferred")
    disabled_service_ids = set(disabled_services)
    for ref, owners in _service_rule_owners(catalog).items():
        if owners & disabled_service_ids and owners - disabled_service_ids:
            service_id = sorted(owners & disabled_service_ids)[0]
            raise ProfileSpecError(
                f"Cannot disable service {service_id}: its routing rule is shared with enabled services"
            )
    if spec.allow_direct is not None and not isinstance(spec.allow_direct, bool):
        raise ProfileSpecError("allowDirect must be a boolean")
    if spec.fail_closed is not None and not isinstance(spec.fail_closed, bool):
        raise ProfileSpecError("failClosed must be a boolean")
    if spec.language is not None and spec.language not in PROFILE_COMMENT_COPY:
        raise ProfileSpecError("language is not defined in the profile language catalog")

    has_dynamic_options = any(
        (
            disabled,
            only,
            preferred,
            disabled_services,
            preferred_services,
            spec.allow_direct is not None,
            spec.fail_closed is not None,
            spec.service_groups is not None,
        )
    )
    if not template.supports_profile_options and has_dynamic_options:
        raise ProfileSpecError(
            f"Profile options are not supported by the {spec.base_profile} INI template"
        )

    routable = tuple(region.id for region in catalog.primary_regions)
    routable_set = set(routable)

    unknown_only = set(only) - routable_set
    if unknown_only:
        raise ProfileSpecError(
            "onlyNodeRegions can contain routable regions only: "
            + ", ".join(sorted(unknown_only))
        )

    conflict = set(disabled) & set(only)
    if conflict:
        raise ProfileSpecError(
            "Region cannot be both disabled and required by onlyNodeRegions: "
            + ", ".join(sorted(conflict))
        )

    if only:
        active = tuple(region for region in routable if region in set(only))
        include_other = False
    else:
        active = tuple(region for region in routable if region not in set(disabled))
        include_other = True

    if not active:
        raise ProfileSpecError("Profile must keep at least one routable region")

    invalid_preferred = set(preferred) - set(active)
    if invalid_preferred:
        raise ProfileSpecError(
            "Preferred regions must remain active: "
            + ", ".join(sorted(invalid_preferred))
        )

    active_order = (*preferred, *(region for region in active if region not in set(preferred)))
    service_groups = None
    if spec.service_groups is not None:
        from .compiler import compile_subconverter_plan
        from .plans.ini_mvp import load_ini_mvp_plan

        if ini_mvp_plan is None:
            ini_mvp_plan = load_ini_mvp_plan()
        if service_group_plan is None:
            service_group_plan = compile_subconverter_plan(
                ini_mvp_plan,
                include_process_rules=False,
                catalog=catalog,
            )
        try:
            service_groups = normalize_service_group_layout(
                spec.service_groups,
                catalog=catalog,
                source_entries=ini_service_group_entries(
                    catalog,
                    service_group_plan,
                    ini_mvp_plan,
                    base_profile=template.id,
                ),
                base_profile=template.id,
                disabled_regions=disabled,
                only_regions=only,
                allow_direct=spec.allow_direct,
            )
        except ServiceGroupError as exc:
            raise ProfileSpecError(str(exc)) from exc
    return ResolvedProfileSpec(
        base_profile=spec.base_profile,
        disabled_region_ids=disabled,
        active_region_ids=tuple(active_order),
        preferred_region_ids=preferred,
        disabled_service_ids=disabled_services,
        preferred_service_ids=preferred_services,
        allow_direct=spec.allow_direct,
        fail_closed=spec.fail_closed,
        language=spec.language,
        service_groups=service_groups,
        include_other_region=include_other,
    )


def _negative_filter(existing: str | None, blocked_terms: tuple[str, ...]) -> str | None:
    if not blocked_terms:
        return existing
    blocked = "|".join(f"(?:{term})" for term in blocked_terms)
    if existing is None:
        return rf"(?i)^(?!.*(?:{blocked})).*$"

    body = existing
    if body.startswith("(?i)"):
        body = body[4:]
    if body.startswith("^"):
        body = body[1:]
    if body.endswith("$"):
        body = body[:-1]
    return rf"(?i)^(?!.*(?:{blocked}))(?:{body})$"


def _positive_filter(existing: str | None, allowed_terms: tuple[str, ...]) -> str | None:
    if not allowed_terms:
        return existing
    allowed = "|".join(f"(?:{term})" for term in allowed_terms)
    if existing is None:
        return rf"(?i)^(?=.*(?:{allowed})).*$"

    body = existing
    if body.startswith("(?i)"):
        body = body[4:]
    if body.startswith("^"):
        body = body[1:]
    if body.endswith("$"):
        body = body[:-1]
    return rf"(?i)^(?=.*(?:{allowed}))(?:{body})$"


def _region_for_stable_group(group: IniSelectGroup, catalog: Catalog) -> str | None:
    filters = [candidate.value for candidate in group.candidates if candidate.kind == "node-filter"]
    if len(filters) != 1:
        return None
    pattern = filters[0].casefold()
    scored: list[tuple[int, str]] = []
    for region in catalog.primary_regions:
        tokens = [
            *region.country_codes,
            *region.aliases,
            *region.keywords,
        ]
        score = sum(1 for token in tokens if len(token) >= 2 and token.casefold() in pattern)
        if score:
            scored.append((score, region.id))
    if not scored:
        return None
    scored.sort(reverse=True)
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        return None
    return scored[0][1]


def _region_group_map(catalog: Catalog) -> dict[str, str]:
    return {region.group: region.id for region in catalog.primary_regions}


def _ordered_candidates(
    candidates: tuple[IniCandidate, ...],
    *,
    region_group_to_id: dict[str, str],
    active_order: tuple[str, ...],
    removed_groups: set[str],
) -> tuple[IniCandidate, ...]:
    active_rank = {region_id: index for index, region_id in enumerate(active_order)}
    filtered = [
        candidate
        for candidate in candidates
        if not (candidate.kind == "group-ref" and candidate.value in removed_groups)
    ]

    # Reorder only region references while leaving DIRECT/AUTO/REJECT and other
    # semantic candidates in their original slots.
    region_candidates = [
        candidate
        for candidate in filtered
        if candidate.kind == "group-ref" and candidate.value in region_group_to_id
    ]
    region_candidates.sort(
        key=lambda candidate: active_rank.get(region_group_to_id[candidate.value], 10_000)
    )
    iterator = iter(region_candidates)
    result: list[IniCandidate] = []
    for candidate in filtered:
        if candidate.kind == "group-ref" and candidate.value in region_group_to_id:
            result.append(next(iterator))
        else:
            result.append(candidate)
    return tuple(result)


def _stable_region_groups(plan: SubconverterPlan, catalog: Catalog) -> dict[str, str]:
    stable_region_groups: dict[str, str] = {}
    stable_section = plan.section("stable-region-groups")
    if not isinstance(stable_section, IniGroupsSection):
        return stable_region_groups
    for group in stable_section.groups:
        if isinstance(group, IniSelectGroup):
            region_id = _region_for_stable_group(group, catalog)
            if region_id is not None:
                stable_region_groups[group.name] = region_id
    return stable_region_groups


def _removed_groups(
    resolved: ResolvedProfileSpec,
    catalog: Catalog,
    stable_region_groups: dict[str, str],
) -> set[str]:
    region_group_to_id = _region_group_map(catalog)
    active_ids = set(resolved.active_region_ids)
    removed = {
        group for group, region_id in region_group_to_id.items() if region_id not in active_ids
    }
    if not resolved.include_other_region:
        removed.add(catalog.group("other"))
    removed.update(
        group for group, region_id in stable_region_groups.items() if region_id not in active_ids
    )
    return removed


def _blocked_and_allowed_terms(
    resolved: ResolvedProfileSpec, catalog: Catalog
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    region_by_id = {region.id: region for region in catalog.regions}
    active_ids = set(resolved.active_region_ids)
    disabled_effective = set(resolved.disabled_region_ids) | {
        region.id for region in catalog.primary_regions if region.id not in active_ids
    }
    blocked_terms = tuple(
        region_by_id[region_id].terms
        for region_id in sorted(disabled_effective)
        if region_id in region_by_id
    )
    allowed_terms = tuple(
        region_by_id[region_id].terms
        for region_id in resolved.active_region_ids
        if region_id in region_by_id
    )
    return blocked_terms, allowed_terms


def _rewrite_proxy_group_filter(
    group: IniProxyGroup,
    *,
    catalog: Catalog,
    resolved: ResolvedProfileSpec,
    blocked_terms: tuple[str, ...],
    allowed_terms: tuple[str, ...],
) -> str | None:
    filter_pattern = group.filter_pattern
    # Never turn a group-reference-only selector into a raw-node selector.
    # Regional pools already have their own narrow membership filters.
    if filter_pattern is None or group.name in _region_group_map(catalog):
        return filter_pattern
    if group.kind == "select":
        if resolved.include_other_region:
            return _negative_filter(filter_pattern, blocked_terms)
        return _positive_filter(filter_pattern, allowed_terms)
    if group.name == catalog.group("other"):
        return _negative_filter(filter_pattern, blocked_terms)
    return filter_pattern


def _rewrite_section(
    section,
    *,
    catalog: Catalog,
    resolved: ResolvedProfileSpec,
    ordering_group_map: dict[str, str],
    removed_groups: set[str],
    service_group_map: dict[str, str],
    extra_disabled_groups: frozenset[str],
    blocked_terms: tuple[str, ...],
    allowed_terms: tuple[str, ...],
    deny_rules: tuple[IniRule, ...],
):
    group_members: dict[str, set[str]] = {}
    for service in catalog.services:
        if "subconverter" in service.projections:
            group_members.setdefault(service.group, set()).add(service.id)
    disabled_services = set(resolved.disabled_service_ids)
    disabled_groups = {
        group for group, members in group_members.items() if members and members <= disabled_services
    } | set(extra_disabled_groups)
    disabled_rule_refs = {
        ref for ref, owners in _service_rule_owners(catalog).items()
        if owners & disabled_services
    }
    preferred_groups = list(dict.fromkeys(
        service_group_map[service_id]
        for service_id in resolved.preferred_service_ids
        if service_id in service_group_map
    ))
    reject_group = catalog.group("reject")
    direct_names = {"DIRECT", catalog.group("direct")}

    def rewrite_rules(rules: tuple[IniRule, ...]) -> tuple[IniRule, ...]:
        rewritten = []
        for rule in rules:
            target = rule.target
            if target in disabled_groups:
                target = reject_group
            if resolved.allow_direct is False and target in direct_names:
                target = reject_group
            rewritten.append(replace(rule, target=target))
        return tuple(rewritten)

    def rewrite_candidates(candidates: tuple[IniCandidate, ...], group_name: str) -> tuple[IniCandidate, ...]:
        if group_name in disabled_groups:
            return (IniCandidate("group-ref", reject_group),)
        rewritten = tuple(
            IniCandidate("group-ref", reject_group)
            if resolved.allow_direct is False
            and candidate.kind == "group-ref"
            and candidate.value in direct_names
            else candidate
            for candidate in candidates
        )
        if group_name == catalog.group("direct") and resolved.allow_direct is False:
            rewritten = (IniCandidate("group-ref", reject_group),)
        if group_name == catalog.group("fallback") and resolved.fail_closed is True:
            rewritten = (IniCandidate("group-ref", reject_group),)
        return rewritten

    def reject_first(candidates: tuple[IniCandidate, ...]) -> tuple[IniCandidate, ...]:
        if resolved.fail_closed is not True:
            return candidates
        reject_candidate = IniCandidate("group-ref", reject_group)
        return (reject_candidate, *(item for item in candidates if item != reject_candidate))

    if isinstance(section, (IniRulesSection, IniClustersSection)):
        if isinstance(section, IniRulesSection):
            return replace(section, rules=rewrite_rules(section.rules))
        if section.role != "service-rule-clusters" or not resolved.disabled_service_ids:
            return replace(
                section,
                clusters=tuple(
                    replace(cluster, rules=rewrite_rules(cluster.rules))
                    for cluster in section.clusters
                ),
            )
        deny_cluster_rules = list(deny_rules)
        clusters = []
        for cluster in section.clusters:
            active_rules = []
            for rule in cluster.rules:
                rule_ref = (rule.kind, rule.url if rule.url is not None else rule.value)
                if rule_ref in disabled_rule_refs:
                    deny_cluster_rules.append(replace(rule, target=reject_group))
                else:
                    active_rules.append(rule)
            if active_rules:
                clusters.append(replace(cluster, rules=rewrite_rules(tuple(active_rules))))
        unique_deny_rules = tuple(dict.fromkeys(deny_cluster_rules))
        if unique_deny_rules:
            clusters.insert(0, IniRuleCluster(rules=unique_deny_rules, source="service"))
        return replace(section, clusters=tuple(clusters))
    if isinstance(section, IniSelectorsSection):
        selectors = []
        for selector in section.selectors:
            if selector.group.name in disabled_groups:
                selectors.append(
                    replace(
                        selector,
                        group=replace(
                            selector.group,
                            candidates=(IniCandidate("group-ref", reject_group),),
                        ),
                    )
                )
                continue
            candidates = _ordered_candidates(
                selector.group.candidates,
                region_group_to_id=ordering_group_map,
                active_order=resolved.active_region_ids,
                removed_groups=removed_groups,
            )
            selectors.append(
                replace(
                    selector,
                    group=replace(
                        selector.group,
                        candidates=reject_first(
                            rewrite_candidates(candidates, selector.group.name)
                        ),
                    ),
                )
            )
        if preferred_groups:
            by_group = {selector.group.name: selector for selector in selectors}
            positions = [
                index for index, selector in enumerate(selectors)
                if selector.group.name in service_group_map.values()
            ]
            names = list(dict.fromkeys(selectors[index].group.name for index in positions))
            ordered_names = [name for name in preferred_groups if name in by_group]
            ordered_names.extend(name for name in names if name not in ordered_names)
            ordered_values = [by_group[name] for name in ordered_names]
            for index, selector in zip(positions, ordered_values, strict=False):
                selectors[index] = selector
        return replace(section, selectors=tuple(selectors))

    assert isinstance(section, IniGroupsSection)
    groups = []
    for group in section.groups:
        if group.name in removed_groups:
            continue
        candidates = rewrite_candidates(group.candidates, group.name)
        candidates = _ordered_candidates(
            candidates,
            region_group_to_id=ordering_group_map,
            active_order=resolved.active_region_ids,
            removed_groups=removed_groups,
        )
        if group.name == catalog.group("direct") and resolved.allow_direct is False:
            candidates = (IniCandidate("group-ref", reject_group),)
        if group.name == catalog.group("fallback") and resolved.fail_closed is not None:
            fallback_target = reject_group if resolved.fail_closed else catalog.group("auto")
            candidates = (IniCandidate("group-ref", fallback_target),)
        if group.name in disabled_groups:
            candidates = (IniCandidate("group-ref", reject_group),)
        candidates = reject_first(candidates)
        if isinstance(group, IniSelectGroup):
            groups.append(replace(group, candidates=candidates))
            continue
        assert isinstance(group, IniProxyGroup)
        groups.append(
            replace(
                group,
                candidates=candidates,
                filter_pattern=_rewrite_proxy_group_filter(
                    group,
                    catalog=catalog,
                    resolved=resolved,
                    blocked_terms=blocked_terms,
                    allowed_terms=allowed_terms,
                ),
            )
        )
    return replace(section, groups=tuple(groups))


def _assert_no_dangling_group_refs(sections) -> None:
    # A removed stable region can be referenced by a legacy group. The generic
    # candidate pass above strips those refs, but keep a hard invariant here so
    # a renderer can never emit a dangling group reference.
    defined_groups = {
        group.name
        for section in sections
        if isinstance(section, IniGroupsSection)
        for group in section.groups
    } | {
        selector.group.name
        for section in sections
        if isinstance(section, IniSelectorsSection)
        for selector in section.selectors
    }
    foundation_names = {
        group.name
        for section in sections
        if isinstance(section, IniGroupsSection) and section.role == "foundation-groups"
        for group in section.groups
    }
    allowed_refs = defined_groups | foundation_names | {"DIRECT", "REJECT"}
    for section in sections:
        candidate_groups = []
        if isinstance(section, IniGroupsSection):
            candidate_groups.extend(section.groups)
        elif isinstance(section, IniSelectorsSection):
            candidate_groups.extend(selector.group for selector in section.selectors)
        for group in candidate_groups:
            for candidate in group.candidates:
                if candidate.kind == "group-ref" and candidate.value not in allowed_refs:
                    raise ProfileSpecError(
                        f"Profile solver produced dangling group reference: {candidate.value}"
                    )


def apply_profile_spec_to_subconverter_plan(
    plan: SubconverterPlan,
    resolved: ResolvedProfileSpec,
    catalog: Catalog,
    *,
    protected_service_id: str | None = None,
    protected_group_name: str | None = None,
) -> SubconverterPlan:
    if resolved.base_profile != "ai-balanced":
        raise ProfileSpecError(
            f"The Python policy solver only renders the ai-balanced INI profile: {resolved.base_profile}"
        )
    stable_region_groups = _stable_region_groups(plan, catalog)
    removed_groups = _removed_groups(resolved, catalog, stable_region_groups)
    blocked_terms, allowed_terms = _blocked_and_allowed_terms(resolved, catalog)
    ordering_group_map = {**_region_group_map(catalog), **stable_region_groups}
    service_group_map = {service.id: service.group for service in catalog.services}
    reject_group = catalog.group("reject")
    disabled_services = set(resolved.disabled_service_ids)
    extra_disabled_groups = frozenset(
        {protected_group_name}
        if protected_service_id in disabled_services and protected_group_name is not None
        else set()
    )
    rule_owners = _service_rule_owners(catalog)
    disabled_rule_refs = {
        ref for ref, owners in rule_owners.items() if owners & disabled_services
    }
    deny_rules: list[IniRule] = []
    if disabled_rule_refs:
        for section in plan.sections:
            if not isinstance(section, IniClustersSection) or section.role != "service-rule-clusters":
                continue
            deny_rules.extend(
                replace(rule, target=reject_group)
                for cluster in section.clusters
                for rule in cluster.rules
                if (rule.kind, rule.url if rule.url is not None else rule.value) in disabled_rule_refs
            )
    rewritten_sections = [
        _rewrite_section(
            section,
            catalog=catalog,
            resolved=resolved,
            ordering_group_map=ordering_group_map,
            removed_groups=removed_groups,
            service_group_map=service_group_map,
            extra_disabled_groups=extra_disabled_groups,
            blocked_terms=blocked_terms,
            allowed_terms=allowed_terms,
            deny_rules=tuple(dict.fromkeys(deny_rules)),
        )
        for section in plan.sections
    ]
    if resolved.service_groups is not None:
        protected_id = protected_service_id
        if protected_id is None:
            from .plans.ini_mvp import load_ini_mvp_plan

            protected_id = load_ini_mvp_plan()["accountProtection"]["serviceId"]
        try:
            rewritten_sections = list(
                apply_service_groups_to_subconverter_plan(
                    SubconverterPlan(tuple(rewritten_sections)),
                    resolved.service_groups,
                    catalog,
                    disabled_service_ids=resolved.disabled_service_ids,
                    fail_closed=resolved.fail_closed is True,
                    blocked_terms=blocked_terms,
                    rule_owners=_service_rule_owners(catalog),
                    protected_service_id=protected_id,
                ).sections
            )
        except ServiceGroupError as exc:
            raise ProfileSpecError(str(exc)) from exc
    _assert_no_dangling_group_refs(rewritten_sections)
    return SubconverterPlan(tuple(rewritten_sections))
