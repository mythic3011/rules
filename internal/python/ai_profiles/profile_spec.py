from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Iterable

from .models import (
    Catalog,
    IniCandidate,
    IniClustersSection,
    IniGroupsSection,
    IniProxyGroup,
    IniRulesSection,
    IniSectionRole,
    IniSelectGroup,
    IniSelectorsSection,
    IniServiceSelector,
    RegionSpec,
    SubconverterPlan,
)


@dataclass(frozen=True, slots=True)
class ProfileSpec:
    """User-facing, backend-neutral profile preferences.

    v1 intentionally exposes only region constraints.  Service-specific policy
    knobs will be added as typed fields later instead of accepting arbitrary
    renderer directives from HTTP/query input.
    """

    base_profile: str = "ai-balanced"
    disabled_node_regions: tuple[str, ...] = ()
    only_node_regions: tuple[str, ...] = ()
    preferred_node_regions: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ResolvedProfileSpec:
    base_profile: str
    disabled_region_ids: tuple[str, ...]
    active_region_ids: tuple[str, ...]
    preferred_region_ids: tuple[str, ...]
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


def resolve_profile_spec(spec: ProfileSpec, catalog: Catalog) -> ResolvedProfileSpec:
    if spec.base_profile != "ai-balanced":
        raise ProfileSpecError(f"Unsupported base profile: {spec.base_profile}")

    disabled = _canonicalize_many(spec.disabled_node_regions, catalog)
    only = _canonicalize_many(spec.only_node_regions, catalog)
    preferred = _canonicalize_many(spec.preferred_node_regions, catalog)

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
    return ResolvedProfileSpec(
        base_profile=spec.base_profile,
        disabled_region_ids=disabled,
        active_region_ids=tuple(active_order),
        preferred_region_ids=preferred,
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
    # Do not rewrite the positive regex of a region-specific url-test;
    # those groups have already been removed/kept above. Generic select
    # and "other" groups must exclude disabled node regions.
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
    blocked_terms: tuple[str, ...],
    allowed_terms: tuple[str, ...],
):
    if isinstance(section, (IniRulesSection, IniClustersSection)):
        return section
    if isinstance(section, IniSelectorsSection):
        selectors = []
        for selector in section.selectors:
            candidates = _ordered_candidates(
                selector.group.candidates,
                region_group_to_id=ordering_group_map,
                active_order=resolved.active_region_ids,
                removed_groups=removed_groups,
            )
            selectors.append(replace(selector, group=replace(selector.group, candidates=candidates)))
        return replace(section, selectors=tuple(selectors))

    assert isinstance(section, IniGroupsSection)
    groups = []
    for group in section.groups:
        if group.name in removed_groups:
            continue
        candidates = _ordered_candidates(
            group.candidates,
            region_group_to_id=ordering_group_map,
            active_order=resolved.active_region_ids,
            removed_groups=removed_groups,
        )
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
) -> SubconverterPlan:
    stable_region_groups = _stable_region_groups(plan, catalog)
    removed_groups = _removed_groups(resolved, catalog, stable_region_groups)
    blocked_terms, allowed_terms = _blocked_and_allowed_terms(resolved, catalog)
    ordering_group_map = {**_region_group_map(catalog), **stable_region_groups}
    rewritten_sections = [
        _rewrite_section(
            section,
            catalog=catalog,
            resolved=resolved,
            ordering_group_map=ordering_group_map,
            removed_groups=removed_groups,
            blocked_terms=blocked_terms,
            allowed_terms=allowed_terms,
        )
        for section in plan.sections
    ]
    _assert_no_dangling_group_refs(rewritten_sections)
    return SubconverterPlan(tuple(rewritten_sections))
