from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Mapping, cast

RuleKind = Literal["GEOSITE", "GEOIP", "RULE-SET", "SRC-IP-CIDR", "MATCH"]
ProviderBehavior = Literal["domain", "classical"]
AdGuardDomainKind = Literal["exact", "suffix", "regex"]
ProjectionTarget = Literal["mihomo", "subconverter"]
IniRuleKind = Literal["remote-classical", "remote-domain", "geosite", "geoip", "final"]
IniCandidateKind = Literal["group-ref", "node-filter"]
IniProxyGroupKind = Literal["select", "url-test", "fallback"]
IniSectionRole = Literal[
    "foundation-rules",
    "legacy-before",
    "service-rule-clusters",
    "legacy-after-head",
    "process-rules",
    "legacy-after-tail",
    "routing-tail-clusters",
    "foundation-groups",
    "automatic-region-groups",
    "stable-region-groups",
    "shared-routing-groups",
    "service-selectors",
    "account-group",
    "stable-session-groups",
    "final-group",
]
IniRuleClusterSource = Literal["service", "companion", "external"]
CompanionRuleCategory = Literal["ssh", "gaming", "finance", "other"]
RuleFileRenderMode = Literal["classical", "comment"]
ExternalRouteWhen = Literal["relaxed", "always"]
ProfileRouteKind = Literal["GEOSITE", "GEOIP"]
SubconverterCandidateKind = Literal["group-ref", "node-filter"]
PolicyGroupCandidateKind = Literal["builtin", "group-ref"]


@dataclass(frozen=True, slots=True)
class DnsPolicySpec:
    order: int
    selector: str
    nameservers: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class AdGuardHomeSpec:
    output_file: str
    upstream_snapshot_file: str | None = None
    upstream_base_url: str | None = None
    upstream_lists: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class AdGuardDomainRule:
    kind: AdGuardDomainKind
    domain: str
    service_id: str
    service_group: str
    source_rule: str


@dataclass(frozen=True, slots=True)
class AdGuardHomePlan:
    output_file: str
    rules: tuple[AdGuardDomainRule, ...]
    snapshot_refreshed_at: str | None = None


@dataclass(frozen=True, slots=True)
class GeositeRuleSource:
    value: str


@dataclass(frozen=True, slots=True)
class RemoteRuleSource:
    provider_key: str
    url: str
    behavior: ProviderBehavior
    format: str = "yaml"
    interval: int = 10800
    ini_interval: int = 28800


UpstreamRuleSource = GeositeRuleSource | RemoteRuleSource


@dataclass(frozen=True, slots=True)
class SubconverterServicePolicy:
    # None means derive the normal selector from direct/region policy.
    selector_candidates: tuple[str, ...] | None = None
    selector_comments: tuple[str, ...] = ()
    emit_selector_when_legacy_replaced: bool = False
    # Services sharing the same non-empty cluster key are emitted as one
    # contiguous INI ruleset cluster. None means a standalone cluster.
    rule_cluster: str | None = None


@dataclass(frozen=True, slots=True)
class ServiceAvailabilitySpec:
    working_regions: tuple[str, ...] = ()
    blocked_regions: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ServiceSpec:
    id: str
    provider_key: str
    group: str
    file: str
    upstream_rules: tuple[UpstreamRuleSource, ...]
    payload: tuple[str, ...]
    regions: tuple[str, ...]
    direct_relaxed: bool
    availability: ServiceAvailabilitySpec = ServiceAvailabilitySpec()
    dns_policies: tuple[DnsPolicySpec, ...] = ()
    subconverter: SubconverterServicePolicy = SubconverterServicePolicy()
    projections: frozenset[ProjectionTarget] = frozenset({"mihomo", "subconverter"})

    @property
    def geosites(self) -> tuple[str, ...]:
        return tuple(
            source.value
            for source in self.upstream_rules
            if isinstance(source, GeositeRuleSource)
        )


@dataclass(frozen=True, slots=True)
class RegionSpec:
    id: str
    group: str
    filter_pattern: str
    terms: str = ""
    name: str = ""
    country_codes: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class RuleFileSpec:
    id: str
    category: CompanionRuleCategory
    provider_key: str
    group: str
    file: str
    render_mode: RuleFileRenderMode
    payload: tuple[str, ...] = ()
    comments: tuple[str, ...] = ()
    comment_lines: tuple[str, ...] = ()
    mihomo: bool = False
    subconverter_cluster: str | None = None


@dataclass(frozen=True, slots=True)
class ProcessRuleSpec:
    key: str
    provider_key: str
    file: str
    group: str




@dataclass(frozen=True, slots=True)
class ExternalRouteSpec:
    id: str
    kind: RuleKind
    value: str
    target_group_key: str
    target: str
    strict_target_group_key: str | None
    strict_target: str | None
    options: tuple[str, ...]
    mihomo_when: ExternalRouteWhen
    provider_behavior: ProviderBehavior | None = None
    provider_file: str | None = None
    subconverter_cluster: str | None = None

@dataclass(frozen=True, slots=True)
class ProfileRouteSpec:
    kind: ProfileRouteKind
    value: str
    target: str
    options: tuple[str, ...] = ()
    subconverter: bool = True


@dataclass(frozen=True, slots=True)
class SubconverterCandidateSpec:
    kind: SubconverterCandidateKind
    value: str


@dataclass(frozen=True, slots=True)
class SubconverterGroupSpec:
    name: str
    candidates: tuple[SubconverterCandidateSpec, ...]


@dataclass(frozen=True, slots=True)
class PolicyGroupCandidateSpec:
    kind: PolicyGroupCandidateKind
    value: str


@dataclass(frozen=True, slots=True)
class ProfilePolicyGroupSpec:
    id: str
    name: str
    kind: Literal["select"]
    candidates: tuple[PolicyGroupCandidateSpec, ...]
    default_selected: str | None
    include_provider_nodes: bool
    mihomo_when: ExternalRouteWhen
    subconverter: bool

@dataclass(frozen=True, slots=True)
class Catalog:
    catalog_dir: Path
    groups: Mapping[str, str]
    services: tuple[ServiceSpec, ...]
    adguard_home: AdGuardHomeSpec | None
    base_dns_policies: tuple[DnsPolicySpec, ...]
    regions: tuple[RegionSpec, ...]
    primary_regions: tuple[RegionSpec, ...]
    all_region_groups: tuple[str, ...]
    ai_guard_geosites: tuple[str, ...]
    companion_rulesets: tuple[RuleFileSpec, ...]
    process_rulesets: tuple[ProcessRuleSpec, ...]
    process_rules_warning: tuple[str, ...]
    external_routes: tuple[ExternalRouteSpec, ...]
    foundation_routes: tuple[ProfileRouteSpec, ...]
    subconverter_foundation_groups: tuple[SubconverterGroupSpec, ...]
    subconverter_final_group: SubconverterGroupSpec
    profile_policy_groups: tuple[ProfilePolicyGroupSpec, ...]
    managed_ai_rule_files: frozenset[str]
    provider_noise_exclude_terms: str
    ai_hk_exclude_terms: str
    provider_noise_exclude_pattern: str
    provider_pool_filter: str
    ai_pool_filter: str
    known_region_exclude_pattern: str
    other_region_filter: str

    def group(self, key: str) -> str:
        try:
            return self.groups[key]
        except KeyError as exc:
            raise KeyError(f"Unknown group key: {key}") from exc


@dataclass(frozen=True, slots=True)
class ServiceRoutingPlan:
    service: ServiceSpec
    region_groups: tuple[str, ...]
    auto_group: str
    ui_proxies: tuple[str, ...]
    auto_proxies: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RoutingRule:
    """Canonical routing IR shared by Mihomo and subconverter projections.

    provider_* is populated only for RULE-SET entries. Mihomo renders the
    provider key from ``value``; subconverter projects the same rule to a
    remote ruleset URL without rebuilding service/companion/external policy.
    """

    kind: RuleKind
    value: str
    target: str | None = None
    options: tuple[str, ...] = ()
    provider_file: str | None = None
    provider_behavior: ProviderBehavior | None = None
    provider_url: str | None = None
    provider_interval: int = 10800
    provider_ini_interval: int = 28800


@dataclass(frozen=True, slots=True)
class RoutingComment:
    text: str


RoutingEntry = RoutingRule | RoutingComment


@dataclass(frozen=True, slots=True)
class RuleProviderPlan:
    name: str
    behavior: ProviderBehavior
    url: str
    format: str = "yaml"
    interval: int = 10800


@dataclass(frozen=True, slots=True)
class MihomoProfilePlan:
    strict: bool
    services: tuple[ServiceRoutingPlan, ...]
    manual_group_proxies: tuple[str, ...]
    fallback_group_proxies: tuple[str, ...]
    primary_regions: tuple[RegionSpec, ...]
    other_region_group: str
    policy_groups: tuple[ProfilePolicyGroupSpec, ...]
    routing_entries: tuple[RoutingEntry, ...]
    ai_routing_entries: tuple[RoutingRule, ...]
    rule_providers: tuple[RuleProviderPlan, ...]
    dns_policies: tuple[DnsPolicySpec, ...]


@dataclass(frozen=True, slots=True)
class IniRule:
    kind: IniRuleKind
    target: str
    url: str | None = None
    interval: int | None = None
    value: str | None = None
    options: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class IniCandidate:
    kind: IniCandidateKind
    value: str


@dataclass(frozen=True, slots=True)
class IniSelectGroup:
    name: str
    candidates: tuple[IniCandidate, ...]


@dataclass(frozen=True, slots=True)
class IniProxyGroup:
    """Render-ready subconverter group IR beyond plain select groups."""

    name: str
    kind: IniProxyGroupKind
    candidates: tuple[IniCandidate, ...] = ()
    filter_pattern: str | None = None
    health_check_url: str | None = None
    interval: int | None = None
    tolerance: int | None = None


@dataclass(frozen=True, slots=True)
class IniServiceSelector:
    comments: tuple[str, ...]
    group: IniSelectGroup


@dataclass(frozen=True, slots=True)
class IniRuleCluster:
    rules: tuple[IniRule, ...]
    source: IniRuleClusterSource | None = None


# Backward-compatible name retained for callers/tests from the pre-P12 API.
IniServiceRuleCluster = IniRuleCluster


@dataclass(frozen=True, slots=True)
class IniSection:
    """Semantic identity shared by typed subconverter section variants.

    The base class remains importable for compatibility, but renderable plans
    must contain one of the typed variants below.
    """

    role: IniSectionRole


@dataclass(frozen=True, slots=True)
class IniRulesSection(IniSection):
    rules: tuple[IniRule, ...] = ()
    comments: tuple[str, ...] = ()
    leading_blank: bool = False
    emit_if_empty: bool = True


@dataclass(frozen=True, slots=True)
class IniClustersSection(IniSection):
    clusters: tuple[IniRuleCluster, ...] = ()
    leading_blank: bool = False
    blank_before_first: bool = False
    blank_between: bool = True


@dataclass(frozen=True, slots=True)
class IniGroupsSection(IniSection):
    groups: tuple[IniSelectGroup | IniProxyGroup, ...] = ()
    title: str = ""
    subtitle: str | None = None
    blank_between_groups: bool = False


@dataclass(frozen=True, slots=True)
class IniSelectorsSection(IniSection):
    selectors: tuple[IniServiceSelector, ...] = ()
    title: str = ""
    subtitle: str | None = None
    blank_between_selectors: bool = True


IniTypedSection = IniRulesSection | IniClustersSection | IniGroupsSection | IniSelectorsSection


@dataclass(frozen=True, slots=True)
class SubconverterPlan:
    sections: tuple[IniTypedSection, ...]

    def __post_init__(self) -> None:
        roles = [section.role for section in self.sections]
        if len(roles) != len(set(roles)):
            raise RuntimeError("Subconverter plan section roles must be unique")
        if any(not isinstance(section, (IniRulesSection, IniClustersSection, IniGroupsSection, IniSelectorsSection)) for section in self.sections):
            raise RuntimeError("Subconverter plan requires typed section variants")

    def section(self, role: IniSectionRole) -> IniTypedSection:
        matches = [section for section in self.sections if section.role == role]
        if len(matches) != 1:
            raise RuntimeError(f"Subconverter plan requires exactly one {role!r} section")
        return matches[0]

    def _rules_section(self, role: IniSectionRole) -> IniRulesSection:
        section = self.section(role)
        if not isinstance(section, IniRulesSection):
            raise RuntimeError(f"Subconverter {role!r} section requires rule payload")
        return section

    def _clusters_section(self, role: IniSectionRole) -> IniClustersSection:
        section = self.section(role)
        if not isinstance(section, IniClustersSection):
            raise RuntimeError(f"Subconverter {role!r} section requires rule clusters")
        return section

    def _groups_section(self, role: IniSectionRole) -> IniGroupsSection:
        section = self.section(role)
        if not isinstance(section, IniGroupsSection):
            raise RuntimeError(f"Subconverter {role!r} section requires groups")
        return section

    def _select_groups(self, role: IniSectionRole) -> tuple[IniSelectGroup, ...]:
        groups = self._groups_section(role).groups
        if any(not isinstance(group, IniSelectGroup) for group in groups):
            raise RuntimeError(f"Subconverter {role!r} section requires select groups")
        return cast(tuple[IniSelectGroup, ...], groups)

    # Compatibility views for pre-P13 callers. New code should consume sections.
    @property
    def foundation_rules(self) -> tuple[IniRule, ...]:
        return self._rules_section("foundation-rules").rules

    @property
    def service_rule_clusters(self) -> tuple[IniRuleCluster, ...]:
        return self._clusters_section("service-rule-clusters").clusters

    @property
    def after_legacy_head(self) -> tuple[IniRule, ...]:
        return self._rules_section("legacy-after-head").rules

    @property
    def after_legacy_tail(self) -> tuple[IniRule, ...]:
        return self._rules_section("legacy-after-tail").rules

    @property
    def companion_rule_clusters(self) -> tuple[IniRuleCluster, ...]:
        return tuple(
            cluster
            for cluster in self._clusters_section("routing-tail-clusters").clusters
            if cluster.source == "companion"
        )

    @property
    def external_rule_clusters(self) -> tuple[IniRuleCluster, ...]:
        return tuple(
            cluster
            for cluster in self._clusters_section("routing-tail-clusters").clusters
            if cluster.source == "external"
        )

    @property
    def process_rules(self) -> tuple[IniRule, ...]:
        return self._rules_section("process-rules").rules

    @property
    def process_warning_lines(self) -> tuple[str, ...]:
        return self._rules_section("process-rules").comments

    @property
    def foundation_groups(self) -> tuple[IniSelectGroup, ...]:
        return self._select_groups("foundation-groups")

    @property
    def stable_region_groups(self) -> tuple[IniSelectGroup, ...]:
        return self._select_groups("stable-region-groups")

    @property
    def service_selectors(self) -> tuple[IniServiceSelector, ...]:
        section = self.section("service-selectors")
        if not isinstance(section, IniSelectorsSection):
            raise RuntimeError("Subconverter service selector section requires selectors")
        return section.selectors

    @property
    def account_group(self) -> IniSelectGroup:
        groups = self._groups_section("account-group").groups
        if len(groups) != 1 or not isinstance(groups[0], IniSelectGroup):
            raise RuntimeError("Subconverter account section requires one select group")
        return groups[0]

    @property
    def stable_session_groups(self) -> tuple[IniSelectGroup, ...]:
        return self._select_groups("stable-session-groups")

    @property
    def final_group(self) -> IniSelectGroup:
        groups = self._groups_section("final-group").groups
        if len(groups) != 1 or not isinstance(groups[0], IniSelectGroup):
            raise RuntimeError("Subconverter final section requires one select group")
        return groups[0]
