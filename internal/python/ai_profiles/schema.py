from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any, Literal, Mapping

SCHEMA_VERSION = 1
_REQUIRED_CORE_GROUPS = frozenset({"manual", "auto", "direct", "reject", "fallback"})


@dataclass(frozen=True, slots=True)
class DnsPolicyDecl:
    order: int
    selector: str
    resolver_set: str


@dataclass(frozen=True, slots=True)
class AdGuardHomeDecl:
    output_file: str
    upstream_snapshot_file: str | None = None
    upstream_base_url: str | None = None
    upstream_lists: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class GeositeRuleDecl:
    kind: Literal["geosite"]
    value: str


@dataclass(frozen=True, slots=True)
class RemoteRuleDecl:
    kind: Literal["remote"]
    provider_key: str
    url: str | None
    source: str | None
    path: str | None
    behavior: Literal["classical", "domain"]
    format: str
    interval: int
    ini_interval: int


UpstreamRuleDecl = GeositeRuleDecl | RemoteRuleDecl


@dataclass(frozen=True, slots=True)
class ProfileRouteDecl:
    kind: Literal["GEOSITE", "GEOIP"]
    value: str
    target_group_key: str
    options: tuple[str, ...]
    subconverter: bool


@dataclass(frozen=True, slots=True)
class SubconverterCandidateDecl:
    kind: Literal["group-ref", "node-filter"]
    value: str


@dataclass(frozen=True, slots=True)
class SubconverterGroupDecl:
    group_key: str
    candidates: tuple[SubconverterCandidateDecl, ...]


@dataclass(frozen=True, slots=True)
class SubconverterGroupsDecl:
    foundation: tuple[SubconverterGroupDecl, ...]
    final: SubconverterGroupDecl


@dataclass(frozen=True, slots=True)
class PolicyGroupCandidateDecl:
    kind: Literal["builtin", "group-ref"]
    value: str


@dataclass(frozen=True, slots=True)
class ProfilePolicyGroupDecl:
    id: str
    group_key: str
    kind: Literal["select"]
    candidates: tuple[PolicyGroupCandidateDecl, ...]
    default_selected: PolicyGroupCandidateDecl | None
    include_provider_nodes: bool
    mihomo_when: Literal["relaxed", "always"]
    subconverter: bool


@dataclass(frozen=True, slots=True)
class ProfileDocument:
    core_groups: Mapping[str, str]
    other_region_group: str
    provider_noise_exclude_terms: str
    ai_hk_exclude_terms: str
    ai_guard_geosites: tuple[str, ...]
    adguard_home: AdGuardHomeDecl | None
    dns_resolver_sets: Mapping[str, tuple[str, ...]]
    dns_policies: tuple[DnsPolicyDecl, ...]
    foundation_routes: tuple[ProfileRouteDecl, ...]
    subconverter_groups: SubconverterGroupsDecl
    policy_groups: tuple[ProfilePolicyGroupDecl, ...]


@dataclass(frozen=True, slots=True)
class RegionDecl:
    id: str
    group: str
    terms: str
    name: str = ""
    country_codes: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ServiceAvailabilityDecl:
    working_regions: tuple[str, ...] = ()
    blocked_regions: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class RegionsDocument:
    primary_order: tuple[str, ...]
    regions: tuple[RegionDecl, ...]


@dataclass(frozen=True, slots=True)
class SubconverterSelectorDecl:
    mode: Literal["standard", "fixed"] = "standard"
    emit_when_legacy_replaced: bool = False
    group_keys: tuple[str, ...] = ()
    comments: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SubconverterServiceDecl:
    selector: SubconverterSelectorDecl
    rule_cluster: str | None


@dataclass(frozen=True, slots=True)
class ServiceDecl:
    id: str
    provider_key: str
    group: str
    file: str
    upstream_rules: tuple[UpstreamRuleDecl, ...]
    payload: tuple[str, ...]
    regions: tuple[str, ...]
    direct_relaxed: bool
    availability: ServiceAvailabilityDecl
    dns_policies: tuple[DnsPolicyDecl, ...]
    subconverter: SubconverterServiceDecl
    projections: frozenset[Literal["mihomo", "subconverter"]]


@dataclass(frozen=True, slots=True)
class ServicesDocument:
    services: tuple[ServiceDecl, ...]


@dataclass(frozen=True, slots=True)
class CompanionRuleDecl:
    id: str
    category: Literal["ssh", "gaming", "finance", "other"]
    provider_key: str
    group_key: str
    file: str
    render_mode: Literal["classical", "comment"]
    payload: tuple[str, ...]
    comments: tuple[str, ...]
    comment_lines: tuple[str, ...]
    mihomo: bool
    subconverter_cluster: str | None


@dataclass(frozen=True, slots=True)
class ProcessRuleDecl:
    key: str
    provider_key: str
    file: str
    group_key: str


@dataclass(frozen=True, slots=True)
class CompanionRulesDocument:
    rulesets: tuple[CompanionRuleDecl, ...]
    process_warning_lines: tuple[str, ...]
    process_rulesets: tuple[ProcessRuleDecl, ...]




@dataclass(frozen=True, slots=True)
class ExternalProviderDecl:
    behavior: Literal["domain", "classical"]
    file: str


@dataclass(frozen=True, slots=True)
class ExternalRouteDecl:
    id: str
    kind: Literal["RULE-SET", "GEOIP", "SRC-IP-CIDR", "MATCH"]
    value: str
    target_group_key: str
    strict_target_group_key: str | None
    options: tuple[str, ...]
    mihomo_when: Literal["relaxed", "always"]
    provider: ExternalProviderDecl | None
    subconverter_cluster: str | None


@dataclass(frozen=True, slots=True)
class ExternalRoutingDocument:
    routes: tuple[ExternalRouteDecl, ...]


@dataclass(frozen=True, slots=True)
class CatalogDocuments:
    catalog_dir: Path
    profile: ProfileDocument
    regions: RegionsDocument
    services: ServicesDocument
    companion_rules: CompanionRulesDocument
    external_routing: ExternalRoutingDocument


def _load_json(
    path: Path,
    expected_keys: set[str],
    optional_keys: set[str] | None = None,
) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"AI catalog file is unavailable or invalid: {path}") from exc
    if not isinstance(value, dict) or value.get("schemaVersion") != SCHEMA_VERSION:
        raise RuntimeError(f"Unsupported AI catalog schema: {path}")
    optional = optional_keys or set()
    actual = set(value)
    if not expected_keys.issubset(actual) or actual - expected_keys - optional:
        raise RuntimeError(f"AI catalog document has unknown or incomplete shape: {path}")
    return value


def _string(value: object, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"AI catalog field must be a non-empty string: {field}")
    return value


def _string_list(value: object, field: str) -> tuple[str, ...]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
        raise RuntimeError(f"AI catalog field must be a string list: {field}")
    return tuple(value)


def _unique_string_list(value: object, field: str) -> tuple[str, ...]:
    result = _string_list(value, field)
    if len(set(result)) != len(result):
        raise RuntimeError(f"AI catalog field must contain unique values: {field}")
    return result


def _line_list(value: object, field: str) -> tuple[str, ...]:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise RuntimeError(f"AI catalog field must be a line list: {field}")
    return tuple(value)


def _dns_policy_list(value: object, field: str) -> tuple[DnsPolicyDecl, ...]:
    if not isinstance(value, list):
        raise RuntimeError(f"AI catalog DNS policies must be a list: {field}")
    policies: list[DnsPolicyDecl] = []
    for index, record in enumerate(value):
        item_field = f"{field}[{index}]"
        if not isinstance(record, dict) or set(record) != {"order", "selector", "resolverSet"}:
            raise RuntimeError(f"AI catalog DNS policy has invalid shape: {item_field}")
        order = record.get("order")
        if type(order) is not int or order <= 0:
            raise RuntimeError(f"AI catalog DNS policy order must be a positive integer: {item_field}")
        policies.append(
            DnsPolicyDecl(
                order=order,
                selector=_string(record.get("selector"), f"{item_field}.selector"),
                resolver_set=_string(record.get("resolverSet"), f"{item_field}.resolverSet"),
            )
        )
    return tuple(policies)


def _profile_route_list(value: object, field: str) -> tuple[ProfileRouteDecl, ...]:
    if not isinstance(value, list) or not value:
        raise RuntimeError(f"AI profile foundation routes must be a non-empty list: {field}")
    routes: list[ProfileRouteDecl] = []
    for index, record in enumerate(value):
        item_field = f"{field}[{index}]"
        if not isinstance(record, dict) or set(record) != {
            "kind", "value", "targetGroupKey", "options", "subconverter"
        }:
            raise RuntimeError(f"AI profile foundation route has invalid shape: {item_field}")
        kind = record.get("kind")
        if kind not in {"GEOSITE", "GEOIP"}:
            raise RuntimeError(f"Unknown AI profile foundation route kind: {item_field}.kind")
        subconverter = record.get("subconverter")
        if not isinstance(subconverter, bool):
            raise RuntimeError(f"AI profile foundation route subconverter must be boolean: {item_field}")
        routes.append(
            ProfileRouteDecl(
                kind=kind,
                value=_string(record.get("value"), f"{item_field}.value"),
                target_group_key=_string(
                    record.get("targetGroupKey"), f"{item_field}.targetGroupKey"
                ),
                options=_string_list(record.get("options"), f"{item_field}.options"),
                subconverter=subconverter,
            )
        )
    return tuple(routes)


def _subconverter_group_decl(value: object, field: str) -> SubconverterGroupDecl:
    if not isinstance(value, dict) or set(value) != {"groupKey", "candidates"}:
        raise RuntimeError(f"AI profile subconverter group has invalid shape: {field}")
    raw_candidates = value.get("candidates")
    if not isinstance(raw_candidates, list) or not raw_candidates:
        raise RuntimeError(f"AI profile subconverter group requires candidates: {field}")
    candidates: list[SubconverterCandidateDecl] = []
    seen: set[tuple[str, str]] = set()
    for index, record in enumerate(raw_candidates):
        item_field = f"{field}.candidates[{index}]"
        if not isinstance(record, dict) or set(record) != {"kind", "value"}:
            raise RuntimeError(f"AI profile subconverter candidate has invalid shape: {item_field}")
        kind = record.get("kind")
        if kind not in {"group-ref", "node-filter"}:
            raise RuntimeError(f"Unknown AI profile subconverter candidate kind: {item_field}.kind")
        candidate_value = _string(record.get("value"), f"{item_field}.value")
        key = (kind, candidate_value)
        if key in seen:
            raise RuntimeError(f"Duplicate AI profile subconverter candidate: {item_field}")
        seen.add(key)
        candidates.append(SubconverterCandidateDecl(kind=kind, value=candidate_value))
    return SubconverterGroupDecl(
        group_key=_string(value.get("groupKey"), f"{field}.groupKey"),
        candidates=tuple(candidates),
    )


def _subconverter_groups_decl(value: object) -> SubconverterGroupsDecl:
    if not isinstance(value, dict) or set(value) != {"foundation", "final"}:
        raise RuntimeError("AI profile subconverterGroups has invalid shape")
    raw_foundation = value.get("foundation")
    if not isinstance(raw_foundation, list) or not raw_foundation:
        raise RuntimeError("AI profile subconverter foundation groups must be non-empty")
    foundation = tuple(
        _subconverter_group_decl(record, f"subconverterGroups.foundation[{index}]")
        for index, record in enumerate(raw_foundation)
    )
    return SubconverterGroupsDecl(
        foundation=foundation,
        final=_subconverter_group_decl(value.get("final"), "subconverterGroups.final"),
    )


def _profile_policy_groups(value: object) -> tuple[ProfilePolicyGroupDecl, ...]:
    if not isinstance(value, list):
        raise RuntimeError("AI profile policyGroups must be a list")
    groups: list[ProfilePolicyGroupDecl] = []
    ids: set[str] = set()
    group_keys: set[str] = set()
    for index, record in enumerate(value):
        field = f"policyGroups[{index}]"
        if not isinstance(record, dict) or set(record) != {
            "id",
            "groupKey",
            "kind",
            "candidates",
            "defaultSelected",
            "includeProviderNodes",
            "mihomoWhen",
            "subconverter",
        }:
            raise RuntimeError(f"AI profile policy group has invalid shape: {field}")
        group_id = _string(record.get("id"), f"{field}.id")
        if group_id in ids:
            raise RuntimeError(f"Duplicate AI profile policy group id: {group_id}")
        ids.add(group_id)
        group_key = _string(record.get("groupKey"), f"{field}.groupKey")
        if group_key in group_keys:
            raise RuntimeError(f"Duplicate AI profile policy group key: {group_key}")
        group_keys.add(group_key)
        kind = record.get("kind")
        if kind != "select":
            raise RuntimeError(f"Unknown AI profile policy group kind: {field}.kind")
        mihomo_when = record.get("mihomoWhen")
        if mihomo_when not in {"relaxed", "always"}:
            raise RuntimeError(f"Unknown AI profile policy group mihomoWhen: {field}.mihomoWhen")
        include_provider_nodes = record.get("includeProviderNodes")
        subconverter = record.get("subconverter")
        if not isinstance(include_provider_nodes, bool) or not isinstance(subconverter, bool):
            raise RuntimeError(f"AI profile policy group flags must be boolean: {field}")
        raw_candidates = record.get("candidates")
        if not isinstance(raw_candidates, list) or not raw_candidates:
            raise RuntimeError(f"AI profile policy group requires candidates: {field}")
        candidates: list[PolicyGroupCandidateDecl] = []
        seen_candidates: set[tuple[str, str]] = set()
        for candidate_index, candidate in enumerate(raw_candidates):
            candidate_field = f"{field}.candidates[{candidate_index}]"
            if not isinstance(candidate, dict) or set(candidate) != {"kind", "value"}:
                raise RuntimeError(f"AI profile policy group candidate has invalid shape: {candidate_field}")
            candidate_kind = candidate.get("kind")
            if candidate_kind not in {"builtin", "group-ref"}:
                raise RuntimeError(f"Unknown AI profile policy group candidate kind: {candidate_field}.kind")
            candidate_value = _string(candidate.get("value"), f"{candidate_field}.value")
            candidate_key = (candidate_kind, candidate_value)
            if candidate_key in seen_candidates:
                raise RuntimeError(f"Duplicate AI profile policy group candidate: {candidate_field}")
            seen_candidates.add(candidate_key)
            candidates.append(PolicyGroupCandidateDecl(candidate_kind, candidate_value))

        raw_default_selected = record.get("defaultSelected")
        default_selected: PolicyGroupCandidateDecl | None = None
        if raw_default_selected is not None:
            default_field = f"{field}.defaultSelected"
            if not isinstance(raw_default_selected, dict) or set(raw_default_selected) != {"kind", "value"}:
                raise RuntimeError(f"AI profile policy group defaultSelected has invalid shape: {default_field}")
            default_kind = raw_default_selected.get("kind")
            if default_kind not in {"builtin", "group-ref"}:
                raise RuntimeError(f"Unknown AI profile policy group defaultSelected kind: {default_field}.kind")
            default_value = _string(raw_default_selected.get("value"), f"{default_field}.value")
            default_selected = PolicyGroupCandidateDecl(default_kind, default_value)
            if (default_kind, default_value) not in seen_candidates:
                raise RuntimeError(f"AI profile policy group defaultSelected must reference a candidate: {default_field}")

        groups.append(
            ProfilePolicyGroupDecl(
                id=group_id,
                group_key=group_key,
                kind=kind,
                candidates=tuple(candidates),
                default_selected=default_selected,
                include_provider_nodes=include_provider_nodes,
                mihomo_when=mihomo_when,
                subconverter=subconverter,
            )
        )
    return tuple(groups)


def _adguard_home_decl(value: object) -> AdGuardHomeDecl | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise RuntimeError("AI profile adguardHome must be an object")
    allowed = {"outputFile", "upstreamSnapshotFile", "upstreamBaseUrl", "upstreamLists"}
    if not set(value).issubset(allowed) or "outputFile" not in value:
        raise RuntimeError("AI profile adguardHome has an invalid shape")
    output_file = _string(value.get("outputFile"), "adguardHome.outputFile")
    output_path = Path(output_file)
    if output_path.name != output_file or output_file in {".", ".."}:
        raise RuntimeError("AI profile adguardHome.outputFile must be a basename")
    if output_path.suffix.lower() != ".txt":
        raise RuntimeError("AI profile adguardHome.outputFile must use .txt")

    upstream_fields = {"upstreamSnapshotFile", "upstreamBaseUrl", "upstreamLists"}
    present = upstream_fields & set(value)
    if present and present != upstream_fields:
        raise RuntimeError("AI profile adguardHome upstream snapshot fields must be declared together")
    if not present:
        return AdGuardHomeDecl(output_file=output_file)

    snapshot_file = _string(value.get("upstreamSnapshotFile"), "adguardHome.upstreamSnapshotFile")
    snapshot_path = Path(snapshot_file)
    if snapshot_path.name != snapshot_file or snapshot_file in {".", ".."} or snapshot_path.suffix.lower() != ".json":
        raise RuntimeError("AI profile adguardHome.upstreamSnapshotFile must be a .json basename")
    base_url = _string(value.get("upstreamBaseUrl"), "adguardHome.upstreamBaseUrl")
    if not base_url.startswith("https://"):
        raise RuntimeError("AI profile adguardHome.upstreamBaseUrl must use HTTPS")
    upstream_lists = _unique_string_list(value.get("upstreamLists"), "adguardHome.upstreamLists")
    if not upstream_lists:
        raise RuntimeError("AI profile adguardHome.upstreamLists must not be empty")
    return AdGuardHomeDecl(
        output_file=output_file,
        upstream_snapshot_file=snapshot_file,
        upstream_base_url=base_url,
        upstream_lists=upstream_lists,
    )


def _upstream_rule_list(value: object, field: str) -> tuple[UpstreamRuleDecl, ...]:
    if not isinstance(value, list):
        raise RuntimeError(f"AI catalog upstreamRules must be a list: {field}")
    rules: list[UpstreamRuleDecl] = []
    provider_keys: set[str] = set()
    for index, record in enumerate(value):
        item_field = f"{field}[{index}]"
        if not isinstance(record, dict):
            raise RuntimeError(f"AI catalog upstream rule must be an object: {item_field}")
        kind = record.get("kind")
        if kind == "geosite":
            if set(record) != {"kind", "value"}:
                raise RuntimeError(f"AI catalog geosite source has invalid shape: {item_field}")
            rules.append(GeositeRuleDecl("geosite", _string(record.get("value"), f"{item_field}.value")))
            continue
        if kind != "remote":
            raise RuntimeError(f"AI catalog upstream rule kind is unsupported: {item_field}")
        common = {"kind", "providerKey", "behavior", "format", "interval", "iniInterval"}
        url_shape = common | {"url"}
        manifest_shape = common | {"source", "path"}
        if frozenset(record) not in {frozenset(url_shape), frozenset(manifest_shape)}:
            raise RuntimeError(f"AI catalog remote source has invalid shape: {item_field}")
        provider_key = _string(record.get("providerKey"), f"{item_field}.providerKey")
        if provider_key in provider_keys:
            raise RuntimeError(f"Duplicate upstream provider key within service: {provider_key}")
        provider_keys.add(provider_key)
        behavior = record.get("behavior")
        if behavior not in {"classical", "domain"}:
            raise RuntimeError(f"AI catalog upstream rule behavior is invalid: {item_field}.behavior")
        format_value = _string(record.get("format"), f"{item_field}.format")
        if format_value != "yaml":
            raise RuntimeError(f"AI catalog upstream rule format must be yaml for YAML/INI parity: {item_field}.format")
        interval = record.get("interval")
        ini_interval = record.get("iniInterval")
        if type(interval) is not int or interval <= 0 or type(ini_interval) is not int or ini_interval <= 0:
            raise RuntimeError(f"AI catalog upstream rule intervals must be positive integers: {item_field}")
        url = _string(record.get("url"), f"{item_field}.url") if "url" in record else None
        if url is not None and not url.startswith("https://"):
            raise RuntimeError(f"AI catalog upstream rule URL must use HTTPS: {item_field}.url")
        source = _string(record.get("source"), f"{item_field}.source") if "source" in record else None
        path = _string(record.get("path"), f"{item_field}.path") if "path" in record else None
        if path is not None:
            segments = path.split("/")
            if path.startswith("/") or any(ch in path for ch in "\\%?#") or any(
                segment in {"", ".", ".."} or segment.startswith(".") for segment in segments
            ):
                raise RuntimeError(f"AI catalog upstream rule path must be normalized and relative: {item_field}.path")
        rules.append(
            RemoteRuleDecl(
                kind="remote", provider_key=provider_key, url=url, source=source, path=path,
                behavior=behavior, format=format_value, interval=interval, ini_interval=ini_interval,
            )
        )
    return tuple(rules)


def _projection_set(value: object, field: str) -> frozenset[Literal["mihomo", "subconverter"]]:
    if value is None:
        return frozenset({"mihomo", "subconverter"})
    projections = _unique_string_list(value, field)
    unknown = set(projections) - {"mihomo", "subconverter"}
    if unknown or not projections:
        raise RuntimeError(f"AI catalog projections are invalid: {field}")
    return frozenset(projections)  # type: ignore[return-value]


def load_profile_document(path: Path) -> ProfileDocument:
    value = _load_json(
        path,
        {
            "schemaVersion",
            "coreGroups",
            "otherRegionGroup",
            "providerNoiseExcludeTerms",
            "aiHkExcludeTerms",
            "aiGuardGeosites",
            "dnsResolverSets",
            "dnsPolicies",
            "foundationRoutes",
            "subconverterGroups",
            "policyGroups",
        },
        optional_keys={"adguardHome"},
    )

    core_groups_raw = value.get("coreGroups")
    if not isinstance(core_groups_raw, dict):
        raise RuntimeError("AI profile coreGroups must be an object")
    core_groups = {
        _string(key, "coreGroups key"): _string(group, f"coreGroups.{key}")
        for key, group in core_groups_raw.items()
    }
    if not _REQUIRED_CORE_GROUPS.issubset(core_groups):
        raise RuntimeError("AI profile is missing required core groups")

    resolver_sets_raw = value.get("dnsResolverSets")
    if not isinstance(resolver_sets_raw, dict) or not resolver_sets_raw:
        raise RuntimeError("AI profile dnsResolverSets must be a non-empty object")
    resolver_sets: dict[str, tuple[str, ...]] = {}
    for name, raw_nameservers in resolver_sets_raw.items():
        key = _string(name, "dnsResolverSets key")
        nameservers = _unique_string_list(raw_nameservers, f"dnsResolverSets.{key}")
        if not nameservers:
            raise RuntimeError(f"DNS resolver set must not be empty: {key}")
        resolver_sets[key] = nameservers

    return ProfileDocument(
        core_groups=MappingProxyType(core_groups),
        other_region_group=_string(value.get("otherRegionGroup"), "otherRegionGroup"),
        provider_noise_exclude_terms=_string(
            value.get("providerNoiseExcludeTerms"), "providerNoiseExcludeTerms"
        ),
        ai_hk_exclude_terms=_string(value.get("aiHkExcludeTerms"), "aiHkExcludeTerms"),
        ai_guard_geosites=_string_list(value.get("aiGuardGeosites"), "aiGuardGeosites"),
        adguard_home=_adguard_home_decl(value.get("adguardHome")),
        dns_resolver_sets=MappingProxyType(resolver_sets),
        dns_policies=_dns_policy_list(value.get("dnsPolicies"), "dnsPolicies"),
        foundation_routes=_profile_route_list(value.get("foundationRoutes"), "foundationRoutes"),
        subconverter_groups=_subconverter_groups_decl(value.get("subconverterGroups")),
        policy_groups=_profile_policy_groups(value.get("policyGroups")),
    )


def load_regions_document(path: Path) -> RegionsDocument:
    value = _load_json(path, {"schemaVersion", "primaryOrder", "regions"})
    primary_order = _unique_string_list(value.get("primaryOrder"), "primaryOrder")

    raw_regions = value.get("regions")
    if not isinstance(raw_regions, list):
        raise RuntimeError("AI regions must be a list")
    regions: list[RegionDecl] = []
    ids: set[str] = set()
    allowed_region_keys = {"id", "group", "terms", "name", "countryCodes", "aliases", "keywords"}
    for index, record in enumerate(raw_regions):
        field = f"regions[{index}]"
        if not isinstance(record, dict) or not {"id", "group", "terms"}.issubset(record) or set(record) - allowed_region_keys:
            raise RuntimeError(f"AI region record has invalid shape: {field}")
        region_id = _string(record.get("id"), f"{field}.id")
        if region_id in ids:
            raise RuntimeError(f"Duplicate AI region id: {region_id}")
        ids.add(region_id)
        regions.append(
            RegionDecl(
                id=region_id,
                group=_string(record.get("group"), f"{field}.group"),
                terms=_string(record.get("terms"), f"{field}.terms"),
                name=_string(record.get("name", region_id.upper()), f"{field}.name"),
                country_codes=_unique_string_list(record.get("countryCodes", []), f"{field}.countryCodes"),
                aliases=_unique_string_list(record.get("aliases", []), f"{field}.aliases"),
                keywords=_unique_string_list(record.get("keywords", []), f"{field}.keywords"),
            )
        )

    unknown_primary = set(primary_order) - ids
    if unknown_primary:
        raise RuntimeError(f"AI primaryOrder references unknown regions: {sorted(unknown_primary)}")
    return RegionsDocument(primary_order=primary_order, regions=tuple(regions))


def _subconverter_service_decl(value: object, field: str) -> SubconverterServiceDecl:
    if not isinstance(value, dict) or not set(value).issubset({"selector", "ruleCluster"}):
        raise RuntimeError(f"AI service subconverter policy has invalid shape: {field}")

    selector_value = value.get("selector")
    if selector_value is None:
        selector_decl = SubconverterSelectorDecl()
    else:
        if not isinstance(selector_value, dict):
            raise RuntimeError(
                f"AI service subconverter selector must be an object: {field}.selector"
            )
        mode = selector_value.get("mode")
        emit_when_legacy_replaced = selector_value.get("emitWhenLegacyReplaced")
        if not isinstance(emit_when_legacy_replaced, bool):
            raise RuntimeError(
                f"AI service emitWhenLegacyReplaced must be boolean: {field}.selector"
            )
        if mode == "standard":
            if set(selector_value) != {"mode", "emitWhenLegacyReplaced"}:
                raise RuntimeError(
                    f"Standard subconverter selector has invalid shape: {field}.selector"
                )
            selector_decl = SubconverterSelectorDecl(
                mode="standard",
                emit_when_legacy_replaced=emit_when_legacy_replaced,
            )
        elif mode == "fixed":
            if set(selector_value) != {
                "mode",
                "emitWhenLegacyReplaced",
                "groupKeys",
                "comments",
            }:
                raise RuntimeError(
                    f"Fixed subconverter selector has invalid shape: {field}.selector"
                )
            group_keys = _unique_string_list(
                selector_value.get("groupKeys"), f"{field}.selector.groupKeys"
            )
            if not group_keys:
                raise RuntimeError(
                    f"Fixed subconverter selector must declare candidates: {field}.selector"
                )
            selector_decl = SubconverterSelectorDecl(
                mode="fixed",
                emit_when_legacy_replaced=emit_when_legacy_replaced,
                group_keys=group_keys,
                comments=_string_list(
                    selector_value.get("comments"), f"{field}.selector.comments"
                ),
            )
        else:
            raise RuntimeError(f"Unknown subconverter selector mode: {field}.selector")

    rule_cluster = value.get("ruleCluster")
    if rule_cluster is not None and (not isinstance(rule_cluster, str) or not rule_cluster):
        raise RuntimeError(
            f"AI service ruleCluster must be null or a non-empty string: {field}.ruleCluster"
        )

    return SubconverterServiceDecl(selector=selector_decl, rule_cluster=rule_cluster)


def _service_availability_decl(value: object, field: str) -> ServiceAvailabilityDecl:
    if value is None:
        return ServiceAvailabilityDecl()
    if not isinstance(value, dict) or set(value) != {"workingRegions", "blockedRegions"}:
        raise RuntimeError(f"AI service availability has invalid shape: {field}")
    working = _unique_string_list(value.get("workingRegions"), f"{field}.workingRegions")
    blocked = _unique_string_list(value.get("blockedRegions"), f"{field}.blockedRegions")
    overlap = set(working) & set(blocked)
    if overlap:
        raise RuntimeError(f"AI service availability cannot mark regions both working and blocked: {sorted(overlap)}")
    return ServiceAvailabilityDecl(working_regions=working, blocked_regions=blocked)


def load_services_document(path: Path) -> ServicesDocument:
    value = _load_json(path, {"schemaVersion", "services"})
    raw_services = value.get("services")
    if not isinstance(raw_services, list):
        raise RuntimeError("AI services must be a list")

    services: list[ServiceDecl] = []
    ids: set[str] = set()
    provider_keys: set[str] = set()
    files: set[str] = set()
    required_keys = {
        "id", "providerKey", "group", "file", "payload",
        "directRelaxed", "dnsPolicies", "subconverter",
    }
    optional_keys = {"geosites", "upstreamRules", "projections", "regions", "availability"}
    for index, record in enumerate(raw_services):
        field = f"services[{index}]"
        if not isinstance(record, dict):
            raise RuntimeError(f"AI service record has invalid shape: {field}")
        keys = set(record)
        if not required_keys.issubset(keys) or keys - required_keys - optional_keys:
            raise RuntimeError(f"AI service record has invalid shape: {field}")
        if ("geosites" in record) == ("upstreamRules" in record):
            raise RuntimeError(f"AI service record must declare exactly one of geosites/upstreamRules: {field}")

        service_id = _string(record.get("id"), f"{field}.id")
        provider_key = _string(record.get("providerKey"), f"{field}.providerKey")
        file = _string(record.get("file"), f"{field}.file")
        if service_id in ids or provider_key in provider_keys or file in files:
            raise RuntimeError(f"Duplicate AI service id/provider/file: {service_id}")
        direct_relaxed = record.get("directRelaxed")
        if not isinstance(direct_relaxed, bool):
            raise RuntimeError(f"AI service directRelaxed must be boolean: {service_id}")
        if "upstreamRules" in record:
            upstream_rules = _upstream_rule_list(record.get("upstreamRules"), f"{field}.upstreamRules")
        else:
            upstream_rules = tuple(
                GeositeRuleDecl("geosite", value)
                for value in _string_list(record.get("geosites"), f"{field}.geosites")
            )
        ids.add(service_id)
        provider_keys.add(provider_key)
        files.add(file)
        services.append(
            ServiceDecl(
                id=service_id,
                provider_key=provider_key,
                group=_string(record.get("group"), f"{field}.group"),
                file=file,
                upstream_rules=upstream_rules,
                payload=_string_list(record.get("payload"), f"{field}.payload"),
                regions=_unique_string_list(record.get("regions", []), f"{field}.regions"),
                direct_relaxed=direct_relaxed,
                availability=_service_availability_decl(record.get("availability"), f"{field}.availability"),
                dns_policies=_dns_policy_list(record.get("dnsPolicies"), f"{field}.dnsPolicies"),
                subconverter=_subconverter_service_decl(record.get("subconverter"), f"{field}.subconverter"),
                projections=_projection_set(record.get("projections"), f"{field}.projections"),
            )
        )

    return ServicesDocument(services=tuple(services))


def _companion_render_decl(
    value: object,
    field: str,
) -> tuple[Literal["classical", "comment"], tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    if not isinstance(value, dict):
        raise RuntimeError(f"Companion rule render must be an object: {field}")
    mode = value.get("mode")
    if mode == "classical":
        if set(value) != {"mode", "payload", "comments"}:
            raise RuntimeError(f"Classical companion rule render has invalid shape: {field}")
        return (
            "classical",
            _string_list(value.get("payload"), f"{field}.payload"),
            _string_list(value.get("comments"), f"{field}.comments"),
            (),
        )
    if mode == "comment":
        if set(value) != {"mode", "bodyLines"}:
            raise RuntimeError(f"Comment companion rule render has invalid shape: {field}")
        return (
            "comment",
            (),
            (),
            _line_list(value.get("bodyLines"), f"{field}.bodyLines"),
        )
    raise RuntimeError(f"Unknown companion rule render mode: {field}")


def load_companion_rules_document(path: Path) -> CompanionRulesDocument:
    value = _load_json(path, {"schemaVersion", "rulesets", "process"})

    raw_rulesets = value.get("rulesets")
    if not isinstance(raw_rulesets, list):
        raise RuntimeError("Companion rulesets must be a list")

    rulesets: list[CompanionRuleDecl] = []
    ids: set[str] = set()
    provider_keys: set[str] = set()
    files: set[str] = set()
    expected_rule_keys = {
        "id",
        "category",
        "providerKey",
        "groupKey",
        "file",
        "render",
        "mihomo",
        "subconverterCluster",
    }
    for index, record in enumerate(raw_rulesets):
        field = f"rulesets[{index}]"
        if not isinstance(record, dict) or set(record) != expected_rule_keys:
            raise RuntimeError(f"Companion rule record has invalid shape: {field}")
        rule_id = _string(record.get("id"), f"{field}.id")
        provider_key = _string(record.get("providerKey"), f"{field}.providerKey")
        file = _string(record.get("file"), f"{field}.file")
        if rule_id in ids or provider_key in provider_keys or file in files:
            raise RuntimeError(f"Duplicate companion rule id/provider/file: {rule_id}")
        ids.add(rule_id)
        provider_keys.add(provider_key)
        files.add(file)

        category = record.get("category")
        if category not in {"ssh", "gaming", "finance", "other"}:
            raise RuntimeError(f"Unknown companion rule category: {field}.category")
        mihomo = record.get("mihomo")
        if not isinstance(mihomo, bool):
            raise RuntimeError(f"Companion rule mihomo must be boolean: {field}.mihomo")
        cluster = record.get("subconverterCluster")
        if cluster is not None and (not isinstance(cluster, str) or not cluster):
            raise RuntimeError(
                f"Companion rule subconverterCluster must be null or non-empty: {field}"
            )
        render_mode, payload, comments, comment_lines = _companion_render_decl(
            record.get("render"), f"{field}.render"
        )
        rulesets.append(
            CompanionRuleDecl(
                id=rule_id,
                category=category,
                provider_key=provider_key,
                group_key=_string(record.get("groupKey"), f"{field}.groupKey"),
                file=file,
                render_mode=render_mode,
                payload=payload,
                comments=comments,
                comment_lines=comment_lines,
                mihomo=mihomo,
                subconverter_cluster=cluster,
            )
        )

    process = value.get("process")
    if not isinstance(process, dict) or set(process) != {"warningLines", "rulesets"}:
        raise RuntimeError("Companion process rules have invalid shape")
    warning_lines = _string_list(process.get("warningLines"), "process.warningLines")

    raw_process_rules = process.get("rulesets")
    if not isinstance(raw_process_rules, list):
        raise RuntimeError("Companion process rulesets must be a list")
    process_rulesets: list[ProcessRuleDecl] = []
    process_keys: set[str] = set()
    process_provider_keys: set[str] = set()
    process_files: set[str] = set()
    expected_process_keys = {"key", "providerKey", "file", "groupKey"}
    for index, record in enumerate(raw_process_rules):
        field = f"process.rulesets[{index}]"
        if not isinstance(record, dict) or set(record) != expected_process_keys:
            raise RuntimeError(f"Companion process rule record has invalid shape: {field}")
        key = _string(record.get("key"), f"{field}.key")
        provider_key = _string(record.get("providerKey"), f"{field}.providerKey")
        file = _string(record.get("file"), f"{field}.file")
        if key in process_keys or provider_key in process_provider_keys or file in process_files:
            raise RuntimeError(f"Duplicate companion process key/provider/file: {key}")
        process_keys.add(key)
        process_provider_keys.add(provider_key)
        process_files.add(file)
        process_rulesets.append(
            ProcessRuleDecl(
                key=key,
                provider_key=provider_key,
                file=file,
                group_key=_string(record.get("groupKey"), f"{field}.groupKey"),
            )
        )

    return CompanionRulesDocument(
        rulesets=tuple(rulesets),
        process_warning_lines=warning_lines,
        process_rulesets=tuple(process_rulesets),
    )


def load_external_routing_document(path: Path) -> ExternalRoutingDocument:
    value = _load_json(path, {"schemaVersion", "routes"})
    raw_routes = value.get("routes")
    if not isinstance(raw_routes, list) or not raw_routes:
        raise RuntimeError("External routing routes must be a non-empty list")

    routes: list[ExternalRouteDecl] = []
    ids: set[str] = set()
    provider_values: set[str] = set()
    expected_keys = {
        "id",
        "kind",
        "value",
        "targetGroupKey",
        "strictTargetGroupKey",
        "options",
        "mihomoWhen",
        "provider",
        "subconverterCluster",
    }
    for index, record in enumerate(raw_routes):
        field = f"routes[{index}]"
        if not isinstance(record, dict) or set(record) != expected_keys:
            raise RuntimeError(f"External routing record has invalid shape: {field}")
        route_id = _string(record.get("id"), f"{field}.id")
        if route_id in ids:
            raise RuntimeError(f"Duplicate external routing id: {route_id}")
        ids.add(route_id)

        kind = record.get("kind")
        if kind not in {"RULE-SET", "GEOIP", "SRC-IP-CIDR", "MATCH"}:
            raise RuntimeError(f"Unknown external routing kind: {field}.kind")
        value_raw = record.get("value")
        if not isinstance(value_raw, str) or (kind != "MATCH" and not value_raw):
            raise RuntimeError(f"External routing value is invalid: {field}.value")

        strict_target = record.get("strictTargetGroupKey")
        if strict_target is not None and (not isinstance(strict_target, str) or not strict_target):
            raise RuntimeError(
                f"External routing strictTargetGroupKey must be null or non-empty: {field}"
            )

        mihomo_when = record.get("mihomoWhen")
        if mihomo_when not in {"relaxed", "always"}:
            raise RuntimeError(f"Unknown external routing mihomoWhen: {field}.mihomoWhen")
        if mihomo_when == "relaxed" and strict_target is not None:
            raise RuntimeError(
                f"Relaxed-only external route cannot declare strict target: {field}"
            )

        provider_raw = record.get("provider")
        provider: ExternalProviderDecl | None
        if provider_raw is None:
            provider = None
        else:
            if not isinstance(provider_raw, dict) or set(provider_raw) != {"behavior", "file"}:
                raise RuntimeError(f"External routing provider has invalid shape: {field}.provider")
            behavior = provider_raw.get("behavior")
            if behavior not in {"domain", "classical"}:
                raise RuntimeError(f"Unknown external provider behavior: {field}.provider")
            file = _string(provider_raw.get("file"), f"{field}.provider.file")
            if kind != "RULE-SET":
                raise RuntimeError(f"Only RULE-SET external routes may declare providers: {field}")
            if value_raw in provider_values:
                raise RuntimeError(f"Duplicate external provider key: {value_raw}")
            provider_values.add(value_raw)
            provider = ExternalProviderDecl(behavior=behavior, file=file)

        if kind == "RULE-SET" and provider is None:
            raise RuntimeError(f"External RULE-SET route requires a provider: {field}")
        if kind != "RULE-SET" and provider is not None:
            raise RuntimeError(f"Non-RULE-SET route cannot declare provider: {field}")

        cluster = record.get("subconverterCluster")
        if cluster is not None and (not isinstance(cluster, str) or not cluster):
            raise RuntimeError(
                f"External routing subconverterCluster must be null or non-empty: {field}"
            )
        options = _string_list(record.get("options"), f"{field}.options")
        if kind == "SRC-IP-CIDR":
            if cluster is not None:
                raise RuntimeError(
                    f"SRC-IP-CIDR external routes are Mihomo-only and cannot declare a subconverter cluster: {field}"
                )
            if options:
                raise RuntimeError(
                    f"SRC-IP-CIDR external routes do not accept target-IP options: {field}"
                )

        routes.append(
            ExternalRouteDecl(
                id=route_id,
                kind=kind,
                value=value_raw,
                target_group_key=_string(record.get("targetGroupKey"), f"{field}.targetGroupKey"),
                strict_target_group_key=strict_target,
                options=options,
                mihomo_when=mihomo_when,
                provider=provider,
                subconverter_cluster=cluster,
            )
        )

    return ExternalRoutingDocument(routes=tuple(routes))


def load_catalog_documents(catalog_dir: Path) -> CatalogDocuments:
    return CatalogDocuments(
        catalog_dir=catalog_dir,
        profile=load_profile_document(catalog_dir / "profile.json"),
        regions=load_regions_document(catalog_dir / "catalogs" / "regions.json"),
        services=load_services_document(catalog_dir / "catalogs" / "services.json"),
        companion_rules=load_companion_rules_document(catalog_dir / "catalogs" / "companion-rules.json"),
        external_routing=load_external_routing_document(catalog_dir / "catalogs" / "external-routing.json"),
    )
