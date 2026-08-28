from __future__ import annotations

from pathlib import Path
from types import MappingProxyType
from typing import Iterable, Mapping

from .models import (
    AdGuardHomeSpec,
    Catalog,
    DnsPolicySpec,
    GeositeRuleSource,
    RemoteRuleSource,
    ExternalRouteSpec,
    PolicyGroupCandidateSpec,
    ProfilePolicyGroupSpec,
    ProfileRouteSpec,
    ProcessRuleSpec,
    RegionSpec,
    RuleFileSpec,
    ServiceAvailabilitySpec,
    ServiceSpec,
    SubconverterCandidateSpec,
    SubconverterGroupSpec,
    SubconverterServicePolicy,
)
from .schema import (
    CatalogDocuments,
    CompanionRuleDecl,
    DnsPolicyDecl,
    ExternalRouteDecl,
    GeositeRuleDecl,
    RemoteRuleDecl,
    ProfilePolicyGroupDecl,
    ProfileRouteDecl,
    ProcessRuleDecl,
    SubconverterGroupDecl,
    load_catalog_documents,
)
from .settings import AI_CATALOG_DIR
from .upstream_sources import load_upstream_source_manifest


def _resolve_dns_policies(
    declarations: tuple[DnsPolicyDecl, ...],
    resolver_sets: Mapping[str, tuple[str, ...]],
) -> tuple[DnsPolicySpec, ...]:
    policies: list[DnsPolicySpec] = []
    for declaration in declarations:
        try:
            nameservers = resolver_sets[declaration.resolver_set]
        except KeyError as exc:
            raise RuntimeError(
                f"AI catalog DNS policy references unknown resolver set: {declaration.resolver_set}"
            ) from exc
        policies.append(
            DnsPolicySpec(
                order=declaration.order,
                selector=declaration.selector,
                nameservers=nameservers,
            )
        )
    return tuple(policies)


def _validate_dns_policy_space(policies: tuple[DnsPolicySpec, ...]) -> None:
    orders = tuple(policy.order for policy in policies)
    selectors = tuple(policy.selector for policy in policies)
    if len(set(orders)) != len(orders):
        raise RuntimeError("AI catalog DNS policy orders must be globally unique")
    if len(set(selectors)) != len(selectors):
        raise RuntimeError("AI catalog DNS policy selectors must be globally unique")


def _rule_file_from_decl(value: CompanionRuleDecl, groups: dict[str, str]) -> RuleFileSpec:
    if value.group_key not in groups:
        raise RuntimeError(f"Unknown companion rule group key: {value.group_key}")
    return RuleFileSpec(
        id=value.id,
        category=value.category,
        provider_key=value.provider_key,
        group=groups[value.group_key],
        file=value.file,
        render_mode=value.render_mode,
        payload=value.payload,
        comments=value.comments,
        comment_lines=value.comment_lines,
        mihomo=value.mihomo,
        subconverter_cluster=value.subconverter_cluster,
    )


def _process_rule_from_decl(value: ProcessRuleDecl, groups: dict[str, str]) -> ProcessRuleSpec:
    if value.group_key not in groups:
        raise RuntimeError(f"Unknown process rule group key: {value.group_key}")
    return ProcessRuleSpec(
        key=value.key,
        provider_key=value.provider_key,
        file=value.file,
        group=groups[value.group_key],
    )


def _validate_cluster_contiguity(clusters: Iterable[str | None], *, kind: str) -> None:
    closed: set[str] = set()
    active: str | None = None
    for cluster in clusters:
        if cluster != active:
            if active is not None:
                closed.add(active)
            if cluster is not None and cluster in closed:
                raise RuntimeError(f"{kind} must be contiguous: {cluster}")
            active = cluster


def _validate_companion_cluster_contiguity(rulesets: tuple[RuleFileSpec, ...]) -> None:
    _validate_cluster_contiguity(
        (rule.subconverter_cluster for rule in rulesets),
        kind="Companion rule subconverterCluster",
    )




def _profile_route_from_decl(value: ProfileRouteDecl, groups: dict[str, str]) -> ProfileRouteSpec:
    if value.target_group_key not in groups:
        raise RuntimeError(f"Unknown foundation route group key: {value.target_group_key}")
    return ProfileRouteSpec(
        kind=value.kind,
        value=value.value,
        target=groups[value.target_group_key],
        options=value.options,
        subconverter=value.subconverter,
    )


def _subconverter_group_from_decl(
    value: SubconverterGroupDecl,
    groups: dict[str, str],
) -> SubconverterGroupSpec:
    if value.group_key not in groups:
        raise RuntimeError(f"Unknown profile subconverter group key: {value.group_key}")
    candidates: list[SubconverterCandidateSpec] = []
    for candidate in value.candidates:
        if candidate.kind == "group-ref":
            if candidate.value not in groups:
                raise RuntimeError(
                    f"Unknown profile subconverter candidate group key: {candidate.value}"
                )
            resolved = groups[candidate.value]
        else:
            resolved = candidate.value
        candidates.append(SubconverterCandidateSpec(candidate.kind, resolved))
    return SubconverterGroupSpec(
        name=groups[value.group_key],
        candidates=tuple(candidates),
    )


def _profile_policy_group_from_decl(
    value: ProfilePolicyGroupDecl,
    groups: dict[str, str],
) -> ProfilePolicyGroupSpec:
    if value.group_key not in groups:
        raise RuntimeError(f"Unknown profile policy group key: {value.group_key}")
    candidates: list[PolicyGroupCandidateSpec] = []
    for candidate in value.candidates:
        if candidate.kind == "group-ref":
            if candidate.value not in groups:
                raise RuntimeError(
                    f"Unknown profile policy candidate group key: {candidate.value}"
                )
            resolved = groups[candidate.value]
        else:
            if candidate.value not in {"DIRECT", "REJECT"}:
                raise RuntimeError(
                    f"Unknown profile policy builtin candidate: {candidate.value}"
                )
            resolved = candidate.value
        candidates.append(PolicyGroupCandidateSpec(candidate.kind, resolved))
    default_selected: str | None = None
    if value.default_selected is not None:
        if value.default_selected.kind == "group-ref":
            if value.default_selected.value not in groups:
                raise RuntimeError(
                    f"Unknown profile policy default-selected group key: {value.default_selected.value}"
                )
            default_selected = groups[value.default_selected.value]
        else:
            if value.default_selected.value not in {"DIRECT", "REJECT"}:
                raise RuntimeError(
                    f"Unknown profile policy default-selected builtin: {value.default_selected.value}"
                )
            default_selected = value.default_selected.value

    return ProfilePolicyGroupSpec(
        id=value.id,
        name=groups[value.group_key],
        kind=value.kind,
        candidates=tuple(candidates),
        default_selected=default_selected,
        include_provider_nodes=value.include_provider_nodes,
        mihomo_when=value.mihomo_when,
        subconverter=value.subconverter,
    )


def _external_route_from_decl(value: ExternalRouteDecl, groups: dict[str, str]) -> ExternalRouteSpec:
    if value.target_group_key not in groups:
        raise RuntimeError(f"Unknown external route group key: {value.target_group_key}")
    strict_target: str | None = None
    if value.strict_target_group_key is not None:
        if value.strict_target_group_key not in groups:
            raise RuntimeError(
                f"Unknown external strict route group key: {value.strict_target_group_key}"
            )
        strict_target = groups[value.strict_target_group_key]
    return ExternalRouteSpec(
        id=value.id,
        kind=value.kind,
        value=value.value,
        target_group_key=value.target_group_key,
        target=groups[value.target_group_key],
        strict_target_group_key=value.strict_target_group_key,
        strict_target=strict_target,
        options=value.options,
        mihomo_when=value.mihomo_when,
        provider_behavior=value.provider.behavior if value.provider else None,
        provider_file=value.provider.file if value.provider else None,
        subconverter_cluster=value.subconverter_cluster,
    )


def _validate_external_cluster_contiguity(routes: tuple[ExternalRouteSpec, ...]) -> None:
    _validate_cluster_contiguity(
        (route.subconverter_cluster for route in routes),
        kind="External routing subconverterCluster",
    )


def _resolve_upstream_rules(declarations, source_manifest):
    resolved = []
    for declaration in declarations:
        if isinstance(declaration, GeositeRuleDecl):
            resolved.append(GeositeRuleSource(declaration.value))
            continue
        if not isinstance(declaration, RemoteRuleDecl):
            raise RuntimeError("Unsupported upstream rule declaration")
        if declaration.url is not None:
            url = declaration.url
        else:
            source = source_manifest.by_id().get(declaration.source or "")
            if source is None:
                raise RuntimeError(
                    f"AI catalog upstream rule references unknown source: {declaration.source}"
                )
            if declaration.path is None:
                raise RuntimeError("Manifest-backed upstream rule is missing path")
            url = f"{source.raw_base_url}/{source.revision}/{declaration.path}"
        resolved.append(
            RemoteRuleSource(
                provider_key=declaration.provider_key,
                url=url,
                behavior=declaration.behavior,
                format=declaration.format,
                interval=declaration.interval,
                ini_interval=declaration.ini_interval,
            )
        )
    return tuple(resolved)


def _adguard_spec(profile) -> AdGuardHomeSpec | None:
    value = profile.adguard_home
    if value is None:
        return None
    return AdGuardHomeSpec(
        output_file=value.output_file,
        upstream_snapshot_file=value.upstream_snapshot_file,
        upstream_base_url=value.upstream_base_url,
        upstream_lists=value.upstream_lists,
    )


def _compile_regions(
    regions_doc, groups: dict[str, str]
) -> tuple[dict[str, RegionSpec], dict[str, str], tuple[RegionSpec, ...]]:
    region_by_id: dict[str, RegionSpec] = {}
    region_terms: dict[str, str] = {}
    for record in regions_doc.regions:
        region_by_id[record.id] = RegionSpec(
            record.id,
            record.group,
            rf"(?i)(?:{record.terms})",
            record.terms,
            record.name,
            record.country_codes,
            record.aliases,
            record.keywords,
        )
        region_terms[record.id] = record.terms
        if record.id in groups and groups[record.id] != record.group:
            raise RuntimeError(f"AI region group collides with existing group key: {record.id}")
        groups[record.id] = record.group
    primary_regions = tuple(region_by_id[region] for region in regions_doc.primary_order)
    return region_by_id, region_terms, primary_regions


def _register_service_groups(services_doc, groups: dict[str, str], known_regions: set[str]) -> None:
    # Register every service group before resolving cross-service policy refs so
    # declaration order never changes which group keys are resolvable.
    for record in services_doc.services:
        declared_regions = (
            set(record.regions)
            | set(record.availability.working_regions)
            | set(record.availability.blocked_regions)
        )
        unknown_regions = declared_regions - known_regions
        if unknown_regions:
            raise RuntimeError(
                f"AI service {record.id} references unknown regions: {sorted(unknown_regions)}"
            )
        if record.id in groups and groups[record.id] != record.group:
            raise RuntimeError(f"AI service group collides with existing group key: {record.id}")
        groups[record.id] = record.group


def _service_selector(
    record, groups: dict[str, str]
) -> tuple[tuple[str, ...] | None, tuple[str, ...]]:
    if record.subconverter.selector.mode != "fixed":
        return None, ()
    unknown_group_keys = set(record.subconverter.selector.group_keys) - set(groups)
    if unknown_group_keys:
        raise RuntimeError(
            f"AI service {record.id} subconverter selector references unknown "
            f"group keys: {sorted(unknown_group_keys)}"
        )
    return (
        tuple(groups[key] for key in record.subconverter.selector.group_keys),
        record.subconverter.selector.comments,
    )


def _compile_services(
    services_doc,
    groups: dict[str, str],
    source_manifest,
    profile,
    routable_regions: set[str],
) -> tuple[ServiceSpec, ...]:
    services: list[ServiceSpec] = []
    closed_rule_clusters: set[str] = set()
    active_rule_cluster: str | None = None
    for record in services_doc.services:
        rule_cluster = record.subconverter.rule_cluster
        if rule_cluster != active_rule_cluster:
            if active_rule_cluster is not None:
                closed_rule_clusters.add(active_rule_cluster)
            if rule_cluster is not None and rule_cluster in closed_rule_clusters:
                raise RuntimeError(
                    f"AI service subconverter ruleCluster must be contiguous: {rule_cluster}"
                )
            active_rule_cluster = rule_cluster
        selector_candidates, selector_comments = _service_selector(record, groups)
        services.append(
            ServiceSpec(
                id=record.id,
                provider_key=record.provider_key,
                group=record.group,
                file=record.file,
                upstream_rules=_resolve_upstream_rules(record.upstream_rules, source_manifest),
                payload=record.payload,
                regions=(
                    record.regions
                    or tuple(
                        region
                        for region in record.availability.working_regions
                        if region in routable_regions
                    )
                ),
                direct_relaxed=record.direct_relaxed,
                availability=ServiceAvailabilitySpec(
                    working_regions=record.availability.working_regions,
                    blocked_regions=record.availability.blocked_regions,
                ),
                dns_policies=_resolve_dns_policies(
                    record.dns_policies,
                    profile.dns_resolver_sets,
                ),
                subconverter=SubconverterServicePolicy(
                    selector_candidates=selector_candidates,
                    selector_comments=selector_comments,
                    emit_selector_when_legacy_replaced=(
                        record.subconverter.selector.emit_when_legacy_replaced
                    ),
                    rule_cluster=rule_cluster,
                ),
                projections=record.projections,
            )
        )
    return tuple(services)


def _compile_filter_patterns(
    profile, region_terms: dict[str, str], primary_order: tuple[str, ...]
) -> dict[str, str]:
    known_region_terms = "|".join(rf"(?:{region_terms[region]})" for region in primary_order)
    return {
        "provider_noise_pattern": rf"(?i)({profile.provider_noise_exclude_terms})",
        "provider_pool_filter": rf"(?i)^(?!.*(?:{profile.provider_noise_exclude_terms})).*$",
        "ai_pool_filter": (
            rf"(?i)^(?!.*(?:{profile.ai_hk_exclude_terms}|"
            rf"{profile.provider_noise_exclude_terms})).*$"
        ),
        "known_region_exclude_pattern": rf"(?i)(?:{known_region_terms})",
        "other_region_filter": (
            rf"(?i)^(?!.*(?:{profile.provider_noise_exclude_terms}|"
            rf"{profile.ai_hk_exclude_terms}|{known_region_terms})).*$"
        ),
    }


def _validate_provider_uniqueness(
    services: tuple[ServiceSpec, ...],
    companion_rulesets: tuple[RuleFileSpec, ...],
    process_rulesets: tuple[ProcessRuleSpec, ...],
    external_routes: tuple[ExternalRouteSpec, ...],
) -> None:
    service_provider_keys = {service.provider_key for service in services}
    upstream_provider_keys = {
        source.provider_key
        for service in services
        for source in service.upstream_rules
        if isinstance(source, RemoteRuleSource)
    }
    if service_provider_keys & upstream_provider_keys:
        raise RuntimeError("AI local/upstream provider keys must not collide")
    if len(upstream_provider_keys) != sum(
        1
        for service in services
        for source in service.upstream_rules
        if isinstance(source, RemoteRuleSource)
    ):
        raise RuntimeError("AI upstream provider keys must be globally unique")
    service_provider_keys |= upstream_provider_keys
    service_files = {service.file for service in services}
    companion_provider_keys = {rule.provider_key for rule in companion_rulesets}
    companion_files = {rule.file for rule in companion_rulesets}
    process_provider_keys = {rule.provider_key for rule in process_rulesets}
    process_files = {rule.file for rule in process_rulesets}
    external_provider_keys = {
        route.value for route in external_routes if route.provider_behavior is not None
    }
    external_provider_files = {
        route.provider_file for route in external_routes if route.provider_file is not None
    }
    if service_provider_keys & (companion_provider_keys | process_provider_keys):
        raise RuntimeError("AI service and companion provider keys must not collide")
    if service_files & (companion_files | process_files):
        raise RuntimeError("AI service and companion rule files must not collide")
    if companion_provider_keys & process_provider_keys:
        raise RuntimeError("Companion static/process provider keys must not collide")
    if companion_files & process_files:
        raise RuntimeError("Companion static/process rule files must not collide")
    if external_provider_keys & (service_provider_keys | companion_provider_keys | process_provider_keys):
        raise RuntimeError("External routing provider keys must not collide with catalog providers")
    if external_provider_files & (service_files | companion_files | process_files):
        raise RuntimeError("External routing provider files must not collide with catalog rule files")


def compile_catalog(documents: CatalogDocuments) -> Catalog:
    """Resolve validated catalog documents into runtime routing specifications."""
    profile = documents.profile
    regions_doc = documents.regions
    services_doc = documents.services
    companion_doc = documents.companion_rules
    external_doc = documents.external_routing
    source_manifest = load_upstream_source_manifest(catalog_dir=documents.catalog_dir)

    groups = dict(profile.core_groups)
    groups["other"] = profile.other_region_group
    region_by_id, region_terms, primary_regions = _compile_regions(regions_doc, groups)
    base_dns_policies = _resolve_dns_policies(profile.dns_policies, profile.dns_resolver_sets)
    _register_service_groups(services_doc, groups, set(region_by_id))
    services = _compile_services(
        services_doc,
        groups,
        source_manifest,
        profile,
        set(regions_doc.primary_order),
    )
    _validate_dns_policy_space(
        tuple([*base_dns_policies, *(policy for service in services for policy in service.dns_policies)])
    )
    filters = _compile_filter_patterns(profile, region_terms, regions_doc.primary_order)

    companion_rulesets = tuple(_rule_file_from_decl(item, groups) for item in companion_doc.rulesets)
    _validate_companion_cluster_contiguity(companion_rulesets)
    process_rulesets = tuple(
        _process_rule_from_decl(item, groups) for item in companion_doc.process_rulesets
    )
    foundation_routes = tuple(
        _profile_route_from_decl(item, groups) for item in profile.foundation_routes
    )
    subconverter_foundation_groups = tuple(
        _subconverter_group_from_decl(item, groups)
        for item in profile.subconverter_groups.foundation
    )
    subconverter_final_group = _subconverter_group_from_decl(
        profile.subconverter_groups.final, groups
    )
    profile_policy_groups = tuple(
        _profile_policy_group_from_decl(item, groups) for item in profile.policy_groups
    )
    external_routes = tuple(_external_route_from_decl(item, groups) for item in external_doc.routes)
    _validate_external_cluster_contiguity(external_routes)
    _validate_provider_uniqueness(services, companion_rulesets, process_rulesets, external_routes)

    return Catalog(
        catalog_dir=documents.catalog_dir,
        groups=MappingProxyType(dict(groups)),
        services=services,
        adguard_home=_adguard_spec(profile),
        base_dns_policies=base_dns_policies,
        regions=tuple(region_by_id.values()),
        primary_regions=primary_regions,
        all_region_groups=tuple(
            [*(region.group for region in primary_regions), profile.other_region_group]
        ),
        ai_guard_geosites=profile.ai_guard_geosites,
        companion_rulesets=companion_rulesets,
        process_rulesets=process_rulesets,
        process_rules_warning=companion_doc.process_warning_lines,
        external_routes=external_routes,
        foundation_routes=foundation_routes,
        subconverter_foundation_groups=subconverter_foundation_groups,
        subconverter_final_group=subconverter_final_group,
        profile_policy_groups=profile_policy_groups,
        managed_ai_rule_files=frozenset({service.file for service in services} | {"AI_All_Classical.yaml"}),
        provider_noise_exclude_terms=profile.provider_noise_exclude_terms,
        ai_hk_exclude_terms=profile.ai_hk_exclude_terms,
        provider_noise_exclude_pattern=filters["provider_noise_pattern"],
        provider_pool_filter=filters["provider_pool_filter"],
        ai_pool_filter=filters["ai_pool_filter"],
        known_region_exclude_pattern=filters["known_region_exclude_pattern"],
        other_region_filter=filters["other_region_filter"],
    )


def load_catalog(catalog_dir: Path | None = None) -> Catalog:
    catalog_dir = catalog_dir or AI_CATALOG_DIR
    return compile_catalog(load_catalog_documents(catalog_dir))


def service_from_legacy(value: dict[str, object]) -> ServiceSpec:
    """Compatibility adapter for callers using the old service-dict surface."""
    return ServiceSpec(
        id=str(value["id"]),
        provider_key=str(value["provider_key"]),
        group=str(value["group"]),
        file=str(value["file"]),
        upstream_rules=tuple(
            GeositeRuleSource(str(item))
            for item in value["geosites"]  # type: ignore[union-attr]
        ),
        payload=tuple(value["payload"]),  # type: ignore[arg-type]
        regions=tuple(value["regions"]),  # type: ignore[arg-type]
        direct_relaxed=bool(value["direct_relaxed"]),
        dns_policies=tuple(value.get("dns_policies", ())),  # type: ignore[arg-type]
    )
