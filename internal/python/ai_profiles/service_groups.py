from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, replace
from typing import Iterable, Mapping

from .models import (
    Catalog,
    IniCandidate,
    IniClustersSection,
    IniGroupsSection,
    IniProxyGroup,
    IniRule,
    IniRulesSection,
    IniSelectGroup,
    IniSelectorsSection,
    IniServiceSelector,
    MihomoProfilePlan,
    SubconverterPlan,
)
from .plans.ini_mvp import (
    IniMvpPlan,
    account_protection_group_candidates,
)

SERVICE_GROUP_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
SERVICE_GROUP_MAX_GROUPS = 32
SERVICE_GROUP_MAX_NAME_LENGTH = 80
SERVICE_GROUP_MAX_ID_LENGTH = 63
SPECIAL_SERVICE_ROUTE_TOKENS = ("reject", "direct", "default", "other", "manual")


@dataclass(frozen=True, slots=True)
class ServiceGroupSpec:
    """A user-edited selector group in one output format's profile spec."""

    id: str
    name: str
    service_ids: tuple[str, ...]
    routes: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ResolvedServiceGroupSpec:
    id: str
    name: str
    service_ids: tuple[str, ...]
    routes: tuple[str, ...]
    default_route_group: str | None


class ServiceGroupError(ValueError):
    pass


def _unique(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def _utf16_length(value: str) -> int:
    try:
        return len(value.encode("utf-16-le")) // 2
    except UnicodeEncodeError:
        return SERVICE_GROUP_MAX_NAME_LENGTH + 1


def _group_name_is_safe(value: str) -> bool:
    if not value or value != value.strip() or _utf16_length(value) > SERVICE_GROUP_MAX_NAME_LENGTH:
        return False
    if any(char in value for char in (",", "`", "[", "]", "\\")):
        return False
    return not any(unicodedata.category(char) in {"Cc", "Zl", "Zp"} for char in value)


def _service_group_names(catalog: Catalog) -> set[str]:
    return {
        service.group
        for service in catalog.services
        if "subconverter" in service.projections or "mihomo" in service.projections
    }


def reserved_service_group_names(catalog: Catalog) -> tuple[str, ...]:
    """Return names occupied by non-service groups across generated formats."""
    service_names = _service_group_names(catalog)
    reserved = {name for name in catalog.groups.values() if name not in service_names}
    reserved.update(region.group for region in catalog.regions)
    from .compiler import service_auto_group_name

    reserved.update(
        service_auto_group_name(service.group)
        for service in catalog.services
        if "mihomo" in service.projections
    )
    reserved.update(group.name for group in catalog.profile_policy_groups)
    reserved.update(group.name for group in catalog.subconverter_foundation_groups)
    reserved.add(catalog.subconverter_final_group.name)
    reserved.update({"DIRECT", "REJECT"})
    return tuple(sorted(reserved))


def _route_group_names(catalog: Catalog) -> dict[str, str]:
    return {
        "reject": catalog.group("reject"),
        "direct": catalog.group("direct"),
        "default": catalog.group("auto"),
        "other": catalog.group("other"),
        "manual": catalog.group("manual"),
    }


def _route_token_for_group_name(value: str, catalog: Catalog) -> str | None:
    for token, group_name in _route_group_names(catalog).items():
        if value == group_name:
            return token
    if value == "REJECT":
        return "reject"
    if value == "DIRECT":
        return "direct"
    for region in catalog.regions:
        if value == region.group:
            return region.id
    for key in catalog.stable_group_keys():
        region_id = key.removesuffix("-stable")
        if value == catalog.group(key) and any(region.id == region_id for region in catalog.regions):
            return region_id
    from .compiler import service_auto_group_name

    if any(
        value == service_auto_group_name(service.group)
        for service in catalog.services
        if "mihomo" in service.projections
    ):
        return "default"
    return None


def _candidate_tokens(candidates, catalog: Catalog) -> tuple[str, ...]:
    tokens: list[str] = []
    for candidate in candidates:
        if candidate.kind != "group-ref":
            raise ServiceGroupError("Service group selectors may contain group references only")
        token = _route_token_for_group_name(candidate.value, catalog)
        if token is None:
            raise ServiceGroupError(
                f"Service group selector references an unsupported route: {candidate.value}"
            )
        tokens.append(token)
    return _unique(tokens)


def _service_group_members(catalog: Catalog, output_format: str) -> dict[str, tuple[str, ...]]:
    projection = {"ini": "subconverter", "yaml": "mihomo"}.get(output_format)
    if projection is None:
        raise ServiceGroupError(f"Unsupported service group output format: {output_format}")
    members: dict[str, list[str]] = {}
    for service in catalog.services:
        if projection in service.projections:
            members.setdefault(service.group, []).append(service.id)
    return {name: tuple(ids) for name, ids in members.items()}


def _ini_actual_selector_candidates(plan: SubconverterPlan, catalog: Catalog) -> dict[str, tuple[IniCandidate, ...]]:
    candidates: dict[str, tuple[IniCandidate, ...]] = {}
    selector_section = plan.section("service-selectors")
    if isinstance(selector_section, IniSelectorsSection):
        candidates.update(
            (selector.group.name, selector.group.candidates)
            for selector in selector_section.selectors
        )
    session_section = plan.section("stable-session-groups")
    if isinstance(session_section, IniGroupsSection):
        candidates.update(
            (group.name, group.candidates)
            for group in session_section.groups
            if isinstance(group, IniSelectGroup)
        )
    account_section = plan.section("account-group")
    if isinstance(account_section, IniGroupsSection):
        candidates.update(
            (group.name, group.candidates)
            for group in account_section.groups
            if isinstance(group, IniSelectGroup)
        )
    expected = set(_service_group_members(catalog, "ini"))
    missing = expected - candidates.keys()
    if missing:
        raise ServiceGroupError(
            "The compiled INI plan is missing service selectors: " + ", ".join(sorted(missing))
        )
    return {name: candidates[name] for name in expected}


def _ordinary_allowed_routes(default_routes: tuple[str, ...], catalog: Catalog) -> tuple[str, ...]:
    return _unique((*default_routes, *(region.id for region in catalog.regions), "reject"))


def _entry(
    *,
    output_format: str,
    base_profile: str,
    group_name: str,
    service_ids: tuple[str, ...],
    candidates,
    default_route_group: str | None,
    default_route_candidates: tuple[str, ...] | None,
    catalog: Catalog,
    protected: bool,
) -> dict[str, object]:
    default_routes = _candidate_tokens(candidates, catalog)
    if protected and (not default_routes or default_routes[0] != "reject"):
        raise ServiceGroupError("The protected service selector must remain REJECT-first")
    allowed_routes = default_routes if protected else _ordinary_allowed_routes(default_routes, catalog)
    entry = {
        "id": service_ids[0],
        "name": group_name,
        "outputFormat": output_format,
        "baseProfile": base_profile,
        "serviceIds": list(service_ids),
        "defaultRoutes": list(default_routes),
        "allowedRoutes": list(allowed_routes),
        "protected": protected,
        "defaultRouteGroup": default_route_group,
    }
    if default_route_candidates is not None:
        entry["defaultRouteCandidates"] = list(default_route_candidates)
    return entry


def _ini_default_route_candidates(
    plan: SubconverterPlan,
    candidates: tuple[IniCandidate, ...],
    catalog: Catalog,
) -> tuple[str, ...] | None:
    default_values = [
        candidate.value
        for candidate in candidates
        if candidate.kind == "group-ref"
        and _route_token_for_group_name(candidate.value, catalog) == "default"
    ]
    if not default_values:
        return None
    groups = {
        group.name: group
        for section in plan.sections
        if isinstance(section, IniGroupsSection)
        for group in section.groups
    }
    route_candidates: list[str] = []
    for value in default_values:
        group = groups.get(value)
        if group is None:
            raise ServiceGroupError(f"Default service route group is not defined: {value}")
        route_candidates.extend(_candidate_tokens(group.candidates, catalog))
    return _unique(route_candidates)


def _ini_default_route_group(
    candidates: tuple[IniCandidate, ...],
    catalog: Catalog,
) -> str | None:
    return next(
        (
            candidate.value
            for candidate in candidates
            if candidate.kind == "group-ref"
            and _route_token_for_group_name(candidate.value, catalog) == "default"
        ),
        None,
    )


def _ini_service_group_entries(
    catalog: Catalog,
    plan: SubconverterPlan,
    ini_mvp_plan: IniMvpPlan,
    *,
    base_profile: str = "ai-balanced",
) -> list[dict[str, object]]:
    members = _service_group_members(catalog, "ini")
    actual = _ini_actual_selector_candidates(plan, catalog)
    protection = ini_mvp_plan["accountProtection"]
    protected_service = protection["serviceId"]
    entries: list[dict[str, object]] = []
    for group_name, service_ids in members.items():
        protected = protected_service in service_ids
        candidates = actual[group_name]
        if protected:
            canonical = account_protection_group_candidates(ini_mvp_plan)
            candidates = tuple(IniCandidate("group-ref", value) for value in canonical)
            if service_ids != (protected_service,):
                raise ServiceGroupError("The protected account service must have its own group")
        entries.append(
            _entry(
                output_format="ini",
                base_profile=base_profile,
                group_name=group_name,
                service_ids=service_ids,
                candidates=candidates,
                default_route_group=(
                    None if protected else _ini_default_route_group(candidates, catalog)
                ),
                default_route_candidates=_ini_default_route_candidates(plan, candidates, catalog),
                catalog=catalog,
                protected=protected,
            )
        )
    return entries


def ini_service_group_entries(
    catalog: Catalog,
    plan: SubconverterPlan,
    ini_mvp_plan: IniMvpPlan,
    *,
    base_profile: str = "ai-balanced",
) -> list[dict[str, object]]:
    """Return selector metadata for the Python-rendered INI profile."""
    return _ini_service_group_entries(
        catalog,
        plan,
        ini_mvp_plan,
        base_profile=base_profile,
    )


def _yaml_service_group_entries(
    catalog: Catalog,
    plan: MihomoProfilePlan,
    ini_mvp_plan: IniMvpPlan,
    *,
    base_profile: str,
) -> list[dict[str, object]]:
    members = _service_group_members(catalog, "yaml")
    actual = {item.service.group: item for item in plan.services}
    protection = ini_mvp_plan["accountProtection"]
    protected_service = protection["serviceId"]
    protected_candidates = tuple(account_protection_group_candidates(ini_mvp_plan))
    entries: list[dict[str, object]] = []
    for group_name, service_ids in members.items():
        if group_name not in actual:
            raise ServiceGroupError(f"The compiled YAML plan is missing service selector: {group_name}")
        protected = protected_service in service_ids
        if protected:
            if service_ids != (protected_service,):
                raise ServiceGroupError("The protected account service must have its own group")
            candidates = tuple(IniCandidate("group-ref", value) for value in protected_candidates)
        else:
            candidates = tuple(IniCandidate("group-ref", value) for value in actual[group_name].ui_proxies)
        entries.append(
            _entry(
                output_format="yaml",
                base_profile=base_profile,
                group_name=group_name,
                service_ids=service_ids,
                candidates=candidates,
                default_route_group=(
                    None
                    if protected or "default" not in _candidate_tokens(candidates, catalog)
                    else actual[group_name].auto_group
                ),
                default_route_candidates=(
                    None
                    if protected
                    else _candidate_tokens(
                        tuple(IniCandidate("group-ref", value) for value in actual[group_name].auto_proxies),
                        catalog,
                    )
                ),
                catalog=catalog,
                protected=protected,
            )
        )
    return entries


def service_group_runtime_metadata(
    catalog: Catalog,
    ini_plan: SubconverterPlan,
    yaml_plans: Mapping[str, MihomoProfilePlan],
    ini_mvp_plan: IniMvpPlan,
) -> dict[str, object]:
    """Build worker metadata and operation limits from compiled selector plans."""
    entries = _ini_service_group_entries(catalog, ini_plan, ini_mvp_plan)
    for base_profile, plan in yaml_plans.items():
        entries.extend(
            _yaml_service_group_entries(
                catalog,
                plan,
                ini_mvp_plan,
                base_profile=base_profile,
            )
        )
    return {
        "serviceGroups": entries,
        "reservedGroupNames": list(reserved_service_group_names(catalog)),
        "serviceGroupRouteLabels": _route_group_names(catalog),
        "serviceGroupLimits": {
            "maxGroups": SERVICE_GROUP_MAX_GROUPS,
            "maxNameLength": SERVICE_GROUP_MAX_NAME_LENGTH,
            "maxIdLength": SERVICE_GROUP_MAX_ID_LENGTH,
            "maxRoutesPerGroup": len(catalog.regions) + len(SPECIAL_SERVICE_ROUTE_TOKENS),
        },
    }


def normalize_service_group_layout(
    value: tuple[ServiceGroupSpec, ...] | None,
    *,
    catalog: Catalog,
    source_entries: Iterable[Mapping[str, object]],
    base_profile: str,
    disabled_regions: tuple[str, ...],
    only_regions: tuple[str, ...],
    allow_direct: bool | None,
) -> tuple[ResolvedServiceGroupSpec, ...] | None:
    if value is None:
        return None
    if not isinstance(value, tuple) or any(not isinstance(item, ServiceGroupSpec) for item in value):
        raise ServiceGroupError("serviceGroups must be a tuple of typed service group entries")
    if len(value) > SERVICE_GROUP_MAX_GROUPS:
        raise ServiceGroupError(f"serviceGroups may contain at most {SERVICE_GROUP_MAX_GROUPS} groups")

    entries = {
        str(entry["id"]): entry
        for entry in source_entries
        if entry.get("outputFormat") == "ini" and entry.get("baseProfile") == base_profile
    }
    if not entries:
        raise ServiceGroupError(f"Service group metadata is unavailable for INI/{base_profile}")
    service_source: dict[str, Mapping[str, object]] = {}
    protected_entries: list[Mapping[str, object]] = []
    for entry in entries.values():
        ids = entry.get("serviceIds")
        if not isinstance(ids, list) or not ids:
            raise ServiceGroupError("Service group metadata has invalid service membership")
        if entry.get("protected") is True:
            protected_entries.append(entry)
        for service_id in ids:
            if not isinstance(service_id, str) or service_id in service_source:
                raise ServiceGroupError("Service group metadata has duplicate or invalid service membership")
            service_source[service_id] = entry
    if len(protected_entries) != 1:
        raise ServiceGroupError("Service group metadata must define exactly one protected group")
    protected = protected_entries[0]
    protected_id = protected.get("id")
    protected_name = protected.get("name")
    protected_service_ids = protected.get("serviceIds")
    protected_routes = protected.get("defaultRoutes")
    if (
        not isinstance(protected_id, str)
        or not isinstance(protected_name, str)
        or protected_service_ids != [protected_id]
        or not isinstance(protected_routes, list)
        or not protected_routes
        or protected_routes[0] != "reject"
    ):
        raise ServiceGroupError("Protected service metadata is invalid or not REJECT-first")

    reserved = set(reserved_service_group_names(catalog))
    group_ids: set[str] = set()
    group_names: set[str] = set()
    assigned: set[str] = set()
    normalized: list[ResolvedServiceGroupSpec] = []
    all_ordinary_routes = _unique(
        route
        for entry in entries.values()
        if entry.get("protected") is not True
        for route in entry.get("allowedRoutes", [])
        if isinstance(route, str)
    )
    disabled = set(disabled_regions)
    only = set(only_regions)

    for index, item in enumerate(value):
        if (
            not isinstance(item.id, str)
            or not item.id
            or len(item.id) > SERVICE_GROUP_MAX_ID_LENGTH
            or not SERVICE_GROUP_ID_PATTERN.fullmatch(item.id)
        ):
            raise ServiceGroupError(f"serviceGroups[{index}].id must be a lowercase slug")
        if item.id in group_ids:
            raise ServiceGroupError(f"Duplicate service group ID: {item.id}")
        group_ids.add(item.id)
        if not isinstance(item.name, str) or not _group_name_is_safe(item.name):
            raise ServiceGroupError(f"serviceGroups[{index}].name is unsafe or too long")
        if item.name in reserved:
            raise ServiceGroupError(f"Service group name is reserved: {item.name}")
        if item.name in group_names:
            raise ServiceGroupError(f"Duplicate service group name: {item.name}")
        group_names.add(item.name)
        if not isinstance(item.service_ids, tuple) or not isinstance(item.routes, tuple):
            raise ServiceGroupError(f"serviceGroups[{index}] serviceIds and routes must be tuples")
        if any(not isinstance(service_id, str) for service_id in item.service_ids):
            raise ServiceGroupError(f"serviceGroups[{index}].serviceIds must contain strings")
        if any(not isinstance(route, str) for route in item.routes):
            raise ServiceGroupError(f"serviceGroups[{index}].routes must contain strings")
        if len(item.routes) > len(catalog.regions) + len(SPECIAL_SERVICE_ROUTE_TOKENS):
            raise ServiceGroupError(f"serviceGroups[{index}].routes has too many entries")
        if len(set(item.service_ids)) != len(item.service_ids):
            raise ServiceGroupError(f"serviceGroups[{index}] contains duplicate service IDs")
        if len(set(item.routes)) != len(item.routes):
            raise ServiceGroupError(f"serviceGroups[{index}].routes contains a duplicate route")

        member_entries: list[Mapping[str, object]] = []
        for service_id in item.service_ids:
            source = service_source.get(service_id)
            if source is None:
                raise ServiceGroupError(f"Unknown INI service group member: {service_id}")
            if service_id in assigned:
                raise ServiceGroupError(f"Service is assigned more than once: {service_id}")
            assigned.add(service_id)
            member_entries.append(source)

        is_protected = any(source is protected for source in member_entries) or item.id == protected_id
        if is_protected:
            if (
                item.id != protected_id
                or item.name != protected_name
                or item.service_ids != tuple(protected_service_ids)
            ):
                raise ServiceGroupError("The protected service group cannot be renamed, moved, or edited")
            approved = set(protected_routes)
            if any(route not in approved for route in item.routes):
                raise ServiceGroupError("The protected service group contains an unapproved route")
            for route in item.routes:
                if route in disabled:
                    raise ServiceGroupError(f"Route {route!r} conflicts with disabledNodeRegions")
                if only and route in {region.id for region in catalog.regions} and route not in only:
                    raise ServiceGroupError(f"Route {route!r} conflicts with onlyNodeRegions")
            selected_routes = ("reject", *(route for route in item.routes if route != "reject"))
            normalized.append(
                ResolvedServiceGroupSpec(
                    id=item.id,
                    name=item.name,
                    service_ids=item.service_ids,
                    routes=selected_routes,
                    default_route_group=None,
                )
            )
            continue

        if member_entries:
            allowed_sets = [set(source.get("allowedRoutes", [])) for source in member_entries]
            allowed = set.intersection(*allowed_sets) if allowed_sets else {"reject"}
        else:
            allowed = set(all_ordinary_routes)
        allowed.add("reject")
        default_route_group = None
        if "default" in item.routes and member_entries:
            default_groups = {source.get("defaultRouteGroup") for source in member_entries}
            if len(default_groups) != 1 or None in default_groups:
                raise ServiceGroupError(
                    f"The default route is not shared by every member of {item.name!r}"
                )
            default_route_group = next(iter(default_groups))
        elif "default" in item.routes:
            default_route_group = _route_group_names(catalog)["default"]
        seen_routes: set[str] = set()
        routes: list[str] = []
        for route in item.routes:
            if not isinstance(route, str) or route in seen_routes:
                raise ServiceGroupError(f"serviceGroups[{index}].routes contains an invalid or duplicate route")
            seen_routes.add(route)
            if route not in allowed:
                raise ServiceGroupError(f"Route {route!r} is not allowed for service group {item.name!r}")
            if route == "direct" and allow_direct is False:
                raise ServiceGroupError("A service group cannot include DIRECT when allowDirect is false")
            if route in disabled:
                raise ServiceGroupError(f"Route {route!r} conflicts with disabledNodeRegions")
            if only and route in {region.id for region in catalog.regions} and route not in only:
                raise ServiceGroupError(f"Route {route!r} conflicts with onlyNodeRegions")
            if route == "other" and only:
                raise ServiceGroupError("The other-region route conflicts with onlyNodeRegions")
            routes.append(route)
        normalized.append(
            ResolvedServiceGroupSpec(
                id=item.id,
                name=item.name,
                service_ids=item.service_ids,
                routes=tuple(routes) if routes else ("reject",),
                default_route_group=default_route_group,
            )
        )

    for entry in entries.values():
        if entry.get("protected") is True:
            if protected_id not in assigned:
                raise ServiceGroupError("The protected service group cannot be deleted or unassigned")
    return tuple(normalized)


def _service_rule_reference(rule: IniRule) -> tuple[str, str] | None:
    value = rule.url if rule.url is not None else rule.value
    if value is None:
        return None
    return rule.kind, value


def _route_candidate(
    token: str,
    catalog: Catalog,
    *,
    default_route_group: str | None,
) -> IniCandidate:
    if token == "default":
        if default_route_group is None:
            raise ServiceGroupError("The default route has no canonical source group")
        return IniCandidate("group-ref", default_route_group)
    group_name = _route_group_names(catalog).get(token)
    if group_name is None:
        region = next((item for item in catalog.regions if item.id == token), None)
        if region is None:
            raise ServiceGroupError(f"Unknown service group route: {token}")
        group_name = region.group
    return IniCandidate("group-ref", group_name)


def _custom_selector_candidates(
    group: ResolvedServiceGroupSpec,
    catalog: Catalog,
    *,
    fail_closed: bool,
    disabled_service_ids: set[str],
) -> tuple[IniCandidate, ...]:
    reject = IniCandidate("group-ref", catalog.group("reject"))
    if group.service_ids and set(group.service_ids) <= disabled_service_ids:
        return (reject,)
    routes = group.routes or ("reject",)
    if fail_closed:
        routes = ("reject", *(route for route in routes if route != "reject"))
    candidates = tuple(
        _route_candidate(route, catalog, default_route_group=group.default_route_group)
        for route in routes
    )
    if not candidates:
        return (reject,)
    return candidates


def apply_service_groups_to_subconverter_plan(
    plan: SubconverterPlan,
    groups: tuple[ResolvedServiceGroupSpec, ...],
    catalog: Catalog,
    *,
    disabled_service_ids: tuple[str, ...],
    fail_closed: bool,
    blocked_terms: tuple[str, ...],
    rule_owners: Mapping[tuple[str, str], set[str]],
    protected_service_id: str,
) -> SubconverterPlan:
    """Rebuild selectors, early-deny unassigned services, and rewrite exact refs."""
    reject = catalog.group("reject")
    service_group_names = {
        service.group
        for service in catalog.services
        if "subconverter" in service.projections
    }
    assigned: dict[str, ResolvedServiceGroupSpec] = {
        service_id: group
        for group in groups
        for service_id in group.service_ids
    }
    unassigned_refs = {
        rule_ref
        for rule_ref, owners in rule_owners.items()
        if any(service_id not in assigned for service_id in owners)
    }
    protected_group_spec = next(
        (group for group in groups if protected_service_id in group.service_ids),
        None,
    )
    if protected_group_spec is None:
        raise ServiceGroupError("The protected service group cannot be deleted or unassigned")
    by_ref_target: dict[tuple[str, str], str] = {}
    for rule_ref, owners in rule_owners.items():
        destinations = {
            (
                reject
                if service_id not in assigned or service_id in disabled_service_ids
                else assigned[service_id].name
            )
            for service_id in owners
        }
        if len(destinations) > 1:
            owner_list = ", ".join(sorted(owners))
            raise ServiceGroupError(
                "A shared service rule cannot be assigned to multiple service groups: "
                + owner_list
            )
        if destinations:
            by_ref_target[rule_ref] = next(iter(destinations))

    def rewrite_rule(rule: IniRule, *, service_cluster: bool) -> IniRule:
        ref = _service_rule_reference(rule)
        if ref is None or ref not in by_ref_target:
            return rule
        if not service_cluster and rule.target not in service_group_names:
            return rule
        return replace(rule, target=by_ref_target[ref])

    early_deny_rules: dict[tuple[str, str], IniRule] = {}

    def is_unassigned_rule(rule: IniRule) -> bool:
        ref = _service_rule_reference(rule)
        if ref is None or ref not in unassigned_refs:
            return False
        # Keep one deny per exact service reference, matching the Worker map.
        # Assignment later in the scan replaces the rule but preserves its
        # original insertion order.
        early_deny_rules[ref] = replace(rule, target=reject)
        return True

    existing_group_names = {
        group.name
        for section in plan.sections
        if isinstance(section, IniGroupsSection)
        for group in section.groups
    } | {
        selector.group.name
        for section in plan.sections
        if isinstance(section, IniSelectorsSection)
        for selector in section.selectors
    }
    region_tokens = {
        route
        for group in groups
        for route in group.routes
        if route not in SPECIAL_SERVICE_ROUTE_TOKENS
    }
    new_region_groups = [
        IniProxyGroup(
            name=region.group,
            kind="select",
            candidates=(IniCandidate("group-ref", reject),),
            filter_pattern=_negative_filter(region.filter_pattern, blocked_terms),
        )
        for region in catalog.regions
        if region.id in region_tokens and region.group not in existing_group_names
    ]
    new_group_names = {group.name for group in new_region_groups}

    sections = []
    for section in plan.sections:
        if isinstance(section, (IniRulesSection, IniClustersSection)):
            if isinstance(section, IniRulesSection):
                rules = tuple(
                    rewrite_rule(rule, service_cluster=False)
                    for rule in section.rules
                    if not is_unassigned_rule(rule)
                )
                sections.append(replace(section, rules=rules))
            else:
                clusters = tuple(
                    replace(
                        cluster,
                        rules=tuple(
                            rewrite_rule(rule, service_cluster=cluster.source == "service")
                            for rule in cluster.rules
                            if not is_unassigned_rule(rule)
                        ),
                    )
                    for cluster in section.clusters
                )
                if section.role == "service-rule-clusters" and unassigned_refs:
                    clusters = tuple(cluster for cluster in clusters if cluster.rules)
                sections.append(replace(section, clusters=clusters))
            continue

        if not isinstance(section, IniGroupsSection):
            sections.append(section)
            continue

        if section.role == "automatic-region-groups":
            groups_in_section = list(section.groups)
            other_index = next(
                (index for index, group in enumerate(groups_in_section) if group.name == catalog.group("other")),
                len(groups_in_section),
            )
            groups_in_section[other_index:other_index] = new_region_groups
            sections.append(replace(section, groups=tuple(groups_in_section)))
            continue

        if section.role == "stable-session-groups":
            sections.append(
                replace(
                    section,
                    groups=tuple(group for group in section.groups if group.name not in service_group_names),
                )
            )
            continue

        if section.role == "account-group":
            updated_groups = tuple(
                replace(
                    group,
                    candidates=_custom_selector_candidates(
                        protected_group_spec,
                        catalog,
                        fail_closed=True,
                        disabled_service_ids=set(disabled_service_ids),
                    ),
                )
                if group.name == protected_group_spec.name
                else group
                for group in section.groups
            )
            sections.append(replace(section, groups=updated_groups))
            continue

        sections.append(section)

    if early_deny_rules:
        before_index = next(
            (
                index
                for index, section in enumerate(sections)
                if isinstance(section, IniRulesSection) and section.role == "legacy-before"
            ),
            None,
        )
        if before_index is None:
            raise ServiceGroupError("Service deny rules have no safe insertion point")
        before = sections[before_index]
        sections[before_index] = replace(
            before,
            rules=(*early_deny_rules.values(), *before.rules),
        )

    selectors = tuple(
        IniServiceSelector(
            comments=(),
            group=IniSelectGroup(
                name=group.name,
                candidates=_custom_selector_candidates(
                    group,
                    catalog,
                    fail_closed=fail_closed,
                    disabled_service_ids=set(disabled_service_ids),
                ),
            ),
        )
        for group in groups
        if protected_service_id not in group.service_ids
    )
    sections = [
        replace(section, selectors=selectors)
        if isinstance(section, IniSelectorsSection) and section.role == "service-selectors"
        else section
        for section in sections
    ]
    if not any(isinstance(section, IniSelectorsSection) and section.role == "service-selectors" for section in sections):
        raise ServiceGroupError("INI plan is missing its service-selectors section")

    # Explicit names guard against a malformed input colliding with newly added
    # region groups; all other non-service names are rejected by the resolver.
    if {selector.group.name for selector in selectors} & new_group_names:
        raise ServiceGroupError("A service selector collides with a scoped region route group")
    return SubconverterPlan(tuple(sections))


def _negative_filter(existing: str, blocked_terms: tuple[str, ...]) -> str:
    if not blocked_terms:
        return existing
    blocked = "|".join(f"(?:{term})" for term in blocked_terms)
    body = existing
    if body.startswith("(?i)"):
        body = body[4:]
    if body.startswith("^"):
        body = body[1:]
    if body.endswith("$"):
        body = body[:-1]
    return rf"(?i)^(?!.*(?:{blocked}))(?:{body})$"
