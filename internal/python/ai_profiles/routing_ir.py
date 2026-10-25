from __future__ import annotations

from .models import (
    IniRule,
    IniRuleCluster,
    ProviderBehavior,
    RoutingRule,
    RuleProviderPlan,
)
from .settings import BASE_URL

INI_RULESET_INTERVAL = 28800


def ruleset_rule(
    provider_key: str,
    target: str,
    provider_file: str,
    provider_behavior: ProviderBehavior = "classical",
) -> RoutingRule:
    """Create a canonical RULE-SET entry with enough metadata for both dialects."""
    return RoutingRule(
        "RULE-SET",
        provider_key,
        target,
        provider_file=provider_file,
        provider_behavior=provider_behavior,
    )


def project_rule_provider(rule: RoutingRule) -> RuleProviderPlan:
    """Project one canonical RULE-SET route into a Mihomo rule-provider entry."""
    if rule.kind != "RULE-SET" or rule.provider_behavior is None:
        raise RuntimeError("RULE-SET provider projection requires provider metadata")
    if rule.provider_url is not None:
        url = rule.provider_url
    elif rule.provider_file is not None:
        url = f"{BASE_URL}/rule/{rule.provider_file}"
    else:
        raise RuntimeError("RULE-SET provider projection requires provider URL or file")
    return RuleProviderPlan(
        rule.value,
        rule.provider_behavior,
        url,
        interval=rule.provider_interval,
    )


def project_ini_rule(rule: RoutingRule) -> IniRule:
    """Project one canonical route into the subconverter rule dialect."""
    if rule.target is None:
        raise RuntimeError(f"Subconverter projection requires a target: {rule.kind},{rule.value}")

    if rule.kind == "RULE-SET":
        if rule.provider_behavior is None:
            raise RuntimeError("RULE-SET subconverter projection requires provider metadata")
        if rule.provider_url is not None:
            url = rule.provider_url
            interval = rule.provider_ini_interval
        elif rule.provider_file is not None:
            url = f"{BASE_URL}/rule/{rule.provider_file}"
            interval = INI_RULESET_INTERVAL
        else:
            raise RuntimeError("RULE-SET subconverter projection requires provider URL or file")
        return IniRule(
            kind="remote-domain" if rule.provider_behavior == "domain" else "remote-classical",
            target=rule.target,
            url=url,
            interval=interval,
        )
    if rule.kind == "GEOSITE":
        return IniRule(kind="geosite", target=rule.target, value=rule.value)
    if rule.kind == "GEOIP":
        return IniRule(
            kind="geoip",
            target=rule.target,
            value=rule.value,
            options=rule.options,
        )
    if rule.kind == "MATCH":
        return IniRule(kind="final", target=rule.target)
    raise RuntimeError(f"Unsupported subconverter routing projection: {rule.kind}")


def cluster_ini_rules(
    projections: list[tuple[str | None, tuple[RoutingRule, ...]]],
    *,
    emit_unclustered: bool,
) -> tuple[IniRuleCluster, ...]:
    """Project and group contiguous canonical rules by declaration cluster key.

    ``emit_unclustered`` distinguishes service standalone clusters from
    companion/external declarations where a null cluster means no INI output.
    """
    clusters: list[IniRuleCluster] = []
    active_cluster: str | None = None
    active_rules: list[IniRule] = []

    def flush() -> None:
        nonlocal active_cluster, active_rules
        if active_rules:
            clusters.append(IniRuleCluster(tuple(active_rules)))
        active_cluster = None
        active_rules = []

    for cluster, routing_rules in projections:
        projected = tuple(project_ini_rule(rule) for rule in routing_rules)
        if cluster is None:
            flush()
            if emit_unclustered:
                # Preserve an explicit standalone boundary even when a service
                # declaration currently projects no rules.
                clusters.append(IniRuleCluster(projected))
            continue
        if active_cluster is not None and active_cluster != cluster:
            flush()
        active_cluster = cluster
        active_rules.extend(projected)

    flush()
    return tuple(clusters)
