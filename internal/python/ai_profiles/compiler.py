from __future__ import annotations

import re
from typing import cast

from .catalog import load_catalog, service_from_legacy
from .models import (
    AdGuardDomainRule,
    AdGuardHomePlan,
    Catalog,
    DnsPolicySpec,
    GeositeRuleSource,
    ExternalRouteSpec,
    IniCandidate,
    IniRule,
    IniProxyGroup,
    IniRuleCluster,
    IniRuleClusterSource,
    IniRulesSection,
    IniClustersSection,
    IniGroupsSection,
    IniSelectorsSection,
    IniSelectGroup,
    IniServiceSelector,
    MihomoProfilePlan,
    ProcessRuleSpec,
    ProfilePolicyGroupSpec,
    ProfileRouteSpec,
    RoutingComment,
    RoutingEntry,
    RoutingRule,
    RemoteRuleSource,
    RuleFileSpec,
    RuleProviderPlan,
    ServiceRoutingPlan,
    ServiceSpec,
    SubconverterGroupSpec,
    SubconverterPlan,
)
from .plans.ini_mvp import IniMvpPlan
from .routing_ir import cluster_ini_rules, project_ini_rule, project_rule_provider, ruleset_rule

_DOMAIN_PATTERN = re.compile(
    r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$"
)


def service_auto_group_name(service_group: str) -> str:
    return f"{service_group} · 自動"


def service_region_groups(service: ServiceSpec, catalog: Catalog | None = None) -> tuple[str, ...]:
    catalog = catalog or load_catalog()
    group_by_region = {region.id: region.group for region in catalog.primary_regions}
    group_by_region["other"] = catalog.group("other")
    return tuple(group_by_region[region] for region in service.regions) + (catalog.group("other"),)


def compile_service_routing(
    service: ServiceSpec,
    *,
    strict: bool,
    catalog: Catalog | None = None,
) -> ServiceRoutingPlan:
    catalog = catalog or load_catalog()
    region_groups = service_region_groups(service, catalog)
    auto_group = service_auto_group_name(service.group)

    ui_proxies = [auto_group, catalog.group("manual"), catalog.group("auto")]
    if service.direct_relaxed and not strict:
        ui_proxies.append(catalog.group("direct"))
    ui_proxies.extend(region_groups)
    ui_proxies.append(catalog.group("reject"))

    # Availability fallback deliberately excludes DIRECT. A generic HTTP
    # health check only validates proxy reachability, not regional AI usability.
    auto_proxies = [*region_groups, catalog.group("reject")]

    return ServiceRoutingPlan(
        service=service,
        region_groups=region_groups,
        auto_group=auto_group,
        ui_proxies=tuple(ui_proxies),
        auto_proxies=tuple(auto_proxies),
    )



def compile_dns_policies(catalog: Catalog | None = None) -> tuple[DnsPolicySpec, ...]:
    """Merge ordered base + service DNS policy declarations into render-ready IR."""
    catalog = catalog or load_catalog()
    policies = [
        *catalog.base_dns_policies,
        *(
            policy
            for service in catalog.services
            if "mihomo" in service.projections
            for policy in service.dns_policies
        ),
    ]
    return tuple(sorted(policies, key=lambda policy: policy.order))


def _service_routing_rules(service: ServiceSpec) -> tuple[RoutingRule, ...]:
    rules: list[RoutingRule] = []
    if service.payload:
        rules.append(ruleset_rule(service.provider_key, service.group, service.file))
    for source in service.upstream_rules:
        if isinstance(source, GeositeRuleSource):
            rules.append(RoutingRule("GEOSITE", source.value, service.group))
        elif isinstance(source, RemoteRuleSource):
            rules.append(
                RoutingRule(
                    "RULE-SET",
                    source.provider_key,
                    service.group,
                    provider_behavior=source.behavior,
                    provider_url=source.url,
                    provider_interval=source.interval,
                    provider_ini_interval=source.ini_interval,
                )
            )
    return tuple(rules)


def compile_ai_routing_rules(catalog: Catalog | None = None) -> tuple[RoutingRule, ...]:
    catalog = catalog or load_catalog()
    rules = [
        rule
        for service in catalog.services
        if "mihomo" in service.projections
        for rule in _service_routing_rules(service)
    ]
    rules.extend(
        RoutingRule("GEOSITE", geosite, catalog.group("reject"))
        for geosite in catalog.ai_guard_geosites
    )
    return tuple(rules)


def compile_adguard_home_plan(catalog: Catalog | None = None) -> AdGuardHomePlan:
    catalog = catalog or load_catalog()
    if catalog.adguard_home is None:
        raise RuntimeError("AdGuard Home projection is not configured in the AI catalog")
    rules: list[AdGuardDomainRule] = []
    seen: set[tuple[str, str]] = set()
    for service in catalog.services:
        for source_rule in service.payload:
            rule_type, separator, value = source_rule.partition(",")
            if not separator or rule_type not in {"DOMAIN", "DOMAIN-SUFFIX"}:
                continue
            domain = value.strip().rstrip(".")
            if not _DOMAIN_PATTERN.fullmatch(domain):
                raise RuntimeError(
                    f"AI service {service.id} has an invalid domain rule for AdGuard projection: {source_rule}"
                )
            kind = "exact" if rule_type == "DOMAIN" else "suffix"
            dedupe_key = (kind, domain.casefold())
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            rules.append(AdGuardDomainRule(kind, domain, service.id, service.group, source_rule))
    snapshot_refreshed_at: str | None = None
    if catalog.adguard_home.upstream_snapshot_file:
        from .upstream_hosts import load_upstream_host_snapshot, snapshot_to_adguard_rules
        snapshot = load_upstream_host_snapshot(
            catalog.catalog_dir / "sources" / catalog.adguard_home.upstream_snapshot_file
        )
        snapshot_refreshed_at = snapshot.refreshed_at or None
        for rule in snapshot_to_adguard_rules(snapshot):
            dedupe_key = (rule.kind, rule.domain.casefold())
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            rules.append(rule)
    return AdGuardHomePlan(
        output_file=catalog.adguard_home.output_file,
        rules=tuple(rules),
        snapshot_refreshed_at=snapshot_refreshed_at,
    )


def _profile_routing_rule(route: ProfileRouteSpec) -> RoutingRule:
    return RoutingRule(route.kind, route.value, route.target, route.options)


def _external_route_enabled(route: ExternalRouteSpec, *, strict: bool) -> bool:
    return route.mihomo_when == "always" or not strict


def _external_routing_rule(route: ExternalRouteSpec, *, strict: bool) -> RoutingRule:
    target = route.strict_target if strict and route.strict_target is not None else route.target
    return RoutingRule(
        route.kind,
        route.value,
        target,
        route.options,
        provider_file=route.provider_file,
        provider_behavior=route.provider_behavior,
    )


def _companion_routing_rule(rule: RuleFileSpec) -> RoutingRule:
    return ruleset_rule(rule.provider_key, rule.group, rule.file)


def _process_routing_rule(spec: ProcessRuleSpec) -> RoutingRule:
    return ruleset_rule(spec.provider_key, spec.group, spec.file)


def _compile_external_routing_entries(
    catalog: Catalog,
    *,
    strict: bool,
) -> tuple[RoutingRule, ...]:
    return tuple(
        _external_routing_rule(route, strict=strict)
        for route in catalog.external_routes
        if _external_route_enabled(route, strict=strict)
    )


def _compile_routing_entries(
    *,
    strict: bool,
    include_process_rules: bool,
    catalog: Catalog,
    ai_rules: tuple[RoutingRule, ...],
) -> tuple[RoutingEntry, ...]:
    entries: list[RoutingEntry] = [
        *(_profile_routing_rule(route) for route in catalog.foundation_routes),
        *ai_rules,
    ]

    if not strict:
        entries.extend(
            _companion_routing_rule(rule)
            for rule in catalog.companion_rulesets
            if rule.mihomo
        )

        if include_process_rules:
            entries.extend(RoutingComment(line) for line in catalog.process_rules_warning)
            entries.extend(_process_routing_rule(spec) for spec in catalog.process_rulesets)

    entries.extend(_compile_external_routing_entries(catalog, strict=strict))
    return tuple(entries)


def compile_routing_entries(
    *,
    strict: bool,
    include_process_rules: bool,
    catalog: Catalog | None = None,
) -> tuple[RoutingEntry, ...]:
    catalog = catalog or load_catalog()
    return _compile_routing_entries(
        strict=strict,
        include_process_rules=include_process_rules,
        catalog=catalog,
        ai_rules=compile_ai_routing_rules(catalog),
    )


def compile_rule_providers(
    *,
    strict: bool,
    include_process_rules: bool,
    catalog: Catalog | None = None,
) -> tuple[RuleProviderPlan, ...]:
    catalog = catalog or load_catalog()
    provider_rules: list[RoutingRule] = [
        _external_routing_rule(route, strict=strict)
        for route in catalog.external_routes
        if route.provider_behavior is not None
        and route.provider_file is not None
        and _external_route_enabled(route, strict=strict)
    ]

    if not strict:
        provider_rules.extend(
            _companion_routing_rule(rule)
            for rule in catalog.companion_rulesets
            if rule.mihomo
        )

    if include_process_rules and not strict:
        provider_rules.extend(_process_routing_rule(spec) for spec in catalog.process_rulesets)

    provider_rules.extend(
        rule
        for service in catalog.services
        if "mihomo" in service.projections
        for rule in _service_routing_rules(service)
        if rule.kind == "RULE-SET"
    )
    return tuple(project_rule_provider(rule) for rule in provider_rules)


def _profile_policy_group_enabled(
    group: ProfilePolicyGroupSpec,
    *,
    strict: bool,
) -> bool:
    return group.mihomo_when == "always" or not strict


def compile_mihomo_profile(
    *,
    strict: bool,
    include_process_rules: bool,
    catalog: Catalog | None = None,
) -> MihomoProfilePlan:
    catalog = catalog or load_catalog()
    manual_group_proxies = [catalog.group("auto"), *catalog.all_region_groups]
    if not strict:
        manual_group_proxies.insert(1, catalog.group("direct"))
    manual_group_proxies.append(catalog.group("reject"))

    fallback_group_proxies = [catalog.group("manual"), catalog.group("auto"), catalog.group("reject")]
    if not strict:
        fallback_group_proxies.insert(0, catalog.group("direct"))

    ai_routing_entries = compile_ai_routing_rules(catalog)

    return MihomoProfilePlan(
        strict=strict,
        services=tuple(
            compile_service_routing(service, strict=strict, catalog=catalog)
            for service in catalog.services
            if "mihomo" in service.projections
        ),
        manual_group_proxies=tuple(manual_group_proxies),
        fallback_group_proxies=tuple(fallback_group_proxies),
        primary_regions=catalog.primary_regions,
        other_region_group=catalog.group("other"),
        policy_groups=tuple(
            group
            for group in catalog.profile_policy_groups
            if _profile_policy_group_enabled(group, strict=strict)
        ),
        routing_entries=_compile_routing_entries(
            strict=strict,
            include_process_rules=include_process_rules,
            catalog=catalog,
            ai_rules=ai_routing_entries,
        ),
        ai_routing_entries=ai_routing_entries,
        rule_providers=compile_rule_providers(
            strict=strict,
            include_process_rules=include_process_rules,
            catalog=catalog,
        ),
        dns_policies=compile_dns_policies(catalog),
    )


def _normalize_ini_rule(record: dict[str, object]) -> IniRule:
    if record["kind"] == "remote-classical":
        return IniRule(
            kind="remote-classical",
            target=str(record["target"]),
            url=str(record["url"]),
            interval=int(cast(int, record["interval"])),
        )
    return IniRule(
        kind="geosite",
        target=str(record["target"]),
        value=str(record["value"]),
    )


def _normalize_ini_group(group: dict[str, object]) -> IniSelectGroup:
    candidates = cast(list[dict[str, object]], group["candidates"])
    return IniSelectGroup(
        name=str(group["name"]),
        candidates=tuple(
            IniCandidate(kind=cast(str, candidate["kind"]), value=str(candidate["value"]))  # type: ignore[arg-type]
            for candidate in candidates
        ),
    )


def _tag_clusters(
    clusters: tuple[IniRuleCluster, ...],
    source: IniRuleClusterSource,
) -> tuple[IniRuleCluster, ...]:
    return tuple(IniRuleCluster(cluster.rules, source=source) for cluster in clusters)


def _compile_service_rule_clusters(
    services: tuple[ServiceSpec, ...],
    legacy_replacement_ids: set[str],
) -> tuple[IniRuleCluster, ...]:
    return _tag_clusters(
        cluster_ini_rules(
            [
                (service.subconverter.rule_cluster, _service_routing_rules(service))
                for service in services
                if "subconverter" in service.projections
                and service.id not in legacy_replacement_ids
            ],
            emit_unclustered=True,
        ),
        "service",
    )


def _compile_companion_rule_clusters(catalog: Catalog) -> tuple[IniRuleCluster, ...]:
    return _tag_clusters(
        cluster_ini_rules(
            [
                (rule.subconverter_cluster, (_companion_routing_rule(rule),))
                for rule in catalog.companion_rulesets
            ],
            emit_unclustered=False,
        ),
        "companion",
    )


def _compile_external_rule_clusters(catalog: Catalog) -> tuple[IniRuleCluster, ...]:
    # Null cluster is an explicit Mihomo-only route. Filter before projection so
    # source-scoped rules (for example SRC-IP-CIDR client fallbacks) never need
    # a subconverter representation.
    return _tag_clusters(
        cluster_ini_rules(
            [
                (route.subconverter_cluster, (_external_routing_rule(route, strict=False),))
                for route in catalog.external_routes
                if route.subconverter_cluster is not None
            ],
            emit_unclustered=False,
        ),
        "external",
    )


def _group_refs(values: tuple[str, ...] | list[str]) -> tuple[IniCandidate, ...]:
    return tuple(IniCandidate("group-ref", value) for value in values)


def _compile_profile_ini_group(spec: SubconverterGroupSpec) -> IniSelectGroup:
    # Catalog already resolves group-ref keys to rendered group names.
    return IniSelectGroup(
        spec.name,
        tuple(IniCandidate(candidate.kind, candidate.value) for candidate in spec.candidates),
    )


_HEALTH_CHECK_URL = "https://cp.cloudflare.com/generate_204"


def _compile_automatic_region_groups(catalog: Catalog) -> tuple[IniProxyGroup, ...]:
    groups = [
        IniProxyGroup(
            name=region.group,
            kind="url-test",
            filter_pattern=region.filter_pattern,
            health_check_url=_HEALTH_CHECK_URL,
            interval=300,
            tolerance=50,
        )
        for region in catalog.primary_regions
    ]
    groups.append(
        IniProxyGroup(
            name=catalog.group("other"),
            kind="url-test",
            filter_pattern=catalog.other_region_filter,
            health_check_url=_HEALTH_CHECK_URL,
            interval=300,
            tolerance=50,
        )
    )
    return tuple(groups)


def _compile_shared_routing_groups(catalog: Catalog) -> tuple[IniProxyGroup, ...]:
    global_auto = IniProxyGroup(
        name=catalog.group("auto"),
        kind="fallback",
        candidates=_group_refs([*catalog.all_region_groups, catalog.group("reject")]),
        health_check_url=_HEALTH_CHECK_URL,
        interval=300,
        tolerance=50,
    )
    manual = IniProxyGroup(
        name=catalog.group("manual"),
        kind="select",
        candidates=_group_refs(
            [
                catalog.group("auto"),
                catalog.group("direct"),
                *catalog.all_region_groups,
                catalog.group("reject"),
            ]
        ),
        filter_pattern=catalog.ai_pool_filter,
    )
    policy_groups = tuple(
        IniProxyGroup(
            name=group.name,
            kind="select",
            candidates=tuple(
                IniCandidate(
                    "node-filter" if candidate.kind == "builtin" else "group-ref",
                    f"[]{candidate.value}" if candidate.kind == "builtin" else candidate.value,
                )
                for candidate in group.candidates
            ),
            filter_pattern=(
                catalog.provider_pool_filter if group.include_provider_nodes else None
            ),
        )
        for group in catalog.profile_policy_groups
        if group.subconverter
    )
    return (global_auto, manual, *policy_groups)


def _compile_foundation_ini_rules(catalog: Catalog) -> tuple[IniRule, ...]:
    return tuple(
        project_ini_rule(_profile_routing_rule(route))
        for route in catalog.foundation_routes
        if route.subconverter
    )


def _compile_process_rules(catalog: Catalog, include_process_rules: bool) -> tuple[IniRule, ...]:
    if not include_process_rules:
        return ()
    return tuple(project_ini_rule(_process_routing_rule(spec)) for spec in catalog.process_rulesets)


def _service_selector_candidates(
    service: ServiceSpec, catalog: Catalog
) -> tuple[list[str], tuple[str, ...]]:
    fixed_candidates = service.subconverter.selector_candidates
    if fixed_candidates is not None:
        return list(fixed_candidates), service.subconverter.selector_comments
    candidates: list[str] = []
    if service.direct_relaxed:
        candidates.append(catalog.group("direct"))
    candidates.extend(service_region_groups(service, catalog))
    candidates.append(catalog.group("reject"))
    return candidates, ()


def _compile_service_selectors(
    catalog: Catalog, legacy_replacement_ids: set[str]
) -> tuple[IniServiceSelector, ...]:
    selectors: list[IniServiceSelector] = []
    for service in catalog.services:
        if "subconverter" not in service.projections:
            continue
        if (
            service.id in legacy_replacement_ids
            and not service.subconverter.emit_selector_when_legacy_replaced
        ):
            continue
        candidates, comments = _service_selector_candidates(service, catalog)
        selectors.append(
            IniServiceSelector(
                comments=comments,
                group=IniSelectGroup(service.group, _group_refs(candidates)),
            )
        )
    return tuple(selectors)


def _build_subconverter_sections(
    catalog: Catalog,
    *,
    before_legacy: tuple[IniRule, ...],
    after_legacy: tuple[IniRule, ...],
    process_rules: tuple[IniRule, ...],
    include_process_rules: bool,
    selectors: tuple[IniServiceSelector, ...],
    stable_groups: tuple[IniSelectGroup, ...],
    service_clusters: tuple[IniRuleCluster, ...],
    routing_tail_clusters: tuple[IniRuleCluster, ...],
):
    return (
        IniRulesSection(
            "foundation-rules",
            rules=_compile_foundation_ini_rules(catalog),
        ),
        IniRulesSection("legacy-before", rules=before_legacy, leading_blank=True),
        IniClustersSection(
            "service-rule-clusters",
            clusters=service_clusters,
            blank_before_first=True,
        ),
        IniRulesSection("legacy-after-head", rules=after_legacy[:2], leading_blank=True),
        IniRulesSection(
            "process-rules",
            rules=process_rules,
            comments=catalog.process_rules_warning if include_process_rules else (),
            leading_blank=True,
            emit_if_empty=False,
        ),
        IniRulesSection("legacy-after-tail", rules=after_legacy[2:], leading_blank=True),
        IniClustersSection(
            "routing-tail-clusters",
            clusters=routing_tail_clusters,
            leading_blank=True,
        ),
        IniGroupsSection(
            "foundation-groups",
            groups=tuple(
                _compile_profile_ini_group(group)
                for group in catalog.subconverter_foundation_groups
            ),
            title="Level 0 — Foundation groups",
            subtitle="Define these before anything references them",
        ),
        IniGroupsSection(
            "automatic-region-groups",
            groups=_compile_automatic_region_groups(catalog),
            title="Level 1 — Automatic region groups",
            blank_between_groups=True,
        ),
        IniGroupsSection(
            "stable-region-groups",
            groups=stable_groups[:3],
            title="Level 1 — Stable manual region groups",
            blank_between_groups=True,
        ),
        IniGroupsSection(
            "shared-routing-groups",
            groups=_compile_shared_routing_groups(catalog),
            title="Level 2 — Shared routing selectors",
            blank_between_groups=True,
        ),
        IniSelectorsSection(
            "service-selectors",
            selectors=selectors,
            title="Level 3 — AI service selectors",
            subtitle="One service = one visible group",
        ),
        IniGroupsSection(
            "account-group",
            groups=(stable_groups[3],),
            title="Account-protected service",
        ),
        IniGroupsSection(
            "stable-session-groups",
            groups=stable_groups[4:],
            title="Stable-session / explicitly separated AI services",
            blank_between_groups=True,
        ),
        IniGroupsSection(
            "final-group",
            groups=(_compile_profile_ini_group(catalog.subconverter_final_group),),
            title="Level 4 — Final catch-all selector",
        ),
    )


def compile_subconverter_plan(
    ini_mvp: IniMvpPlan,
    *,
    include_process_rules: bool,
    catalog: Catalog | None = None,
    profile_spec=None,
) -> SubconverterPlan:
    catalog = catalog or load_catalog()
    legacy_replacement_ids = set(ini_mvp["migration"]["legacyReplacementIds"])
    before_legacy = tuple(_normalize_ini_rule(record) for record in ini_mvp["rules"]["beforeLegacy"])
    after_legacy = tuple(_normalize_ini_rule(record) for record in ini_mvp["rules"]["afterLegacy"])
    stable_groups = tuple(_normalize_ini_group(group) for group in ini_mvp["groups"])
    if len(stable_groups) < 4:
        raise RuntimeError("INI MVP plan requires at least four groups for legacy layout projection")

    plan = SubconverterPlan(
        sections=_build_subconverter_sections(
            catalog,
            before_legacy=before_legacy,
            after_legacy=after_legacy,
            process_rules=_compile_process_rules(catalog, include_process_rules),
            include_process_rules=include_process_rules,
            selectors=_compile_service_selectors(catalog, legacy_replacement_ids),
            stable_groups=stable_groups,
            service_clusters=_compile_service_rule_clusters(
                catalog.services, legacy_replacement_ids
            ),
            routing_tail_clusters=(
                *_compile_companion_rule_clusters(catalog),
                *_compile_external_rule_clusters(catalog),
            ),
        )
    )
    if profile_spec is not None:
        from .profile_spec import apply_profile_spec_to_subconverter_plan, resolve_profile_spec

        resolved = resolve_profile_spec(profile_spec, catalog)
        plan = apply_profile_spec_to_subconverter_plan(plan, resolved, catalog)
    return plan


def legacy_service_spec(service: dict[str, object]) -> ServiceSpec:
    """Compatibility adapter for old helper APIs that still accept dictionaries."""
    return service_from_legacy(service)
