from __future__ import annotations

import ipaddress
import json
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from .common import yaml_string
from .models import Catalog, DnsPolicySpec
from .paths import CatalogPaths
from .schema import ProfileDocument, load_profile_document

_DNS_SCHEMA_VERSION = 1
_DNS_KEYS = frozenset(
    {
        "schemaVersion",
        "dnsProxyGroupKey",
        "defaultResolverSet",
        "nameserverResolverSet",
        "bootstrapResolverSet",
        "directResolverSet",
        "listen",
        "ipv6",
        "enhancedMode",
        "fakeIpRange",
        "fakeIpFilter",
        "fakeIpFilterMode",
    }
)


@dataclass(frozen=True, slots=True)
class _DnsSettings:
    dns_proxy_group_key: str
    default_resolver_set: str
    nameserver_resolver_set: str
    bootstrap_resolver_set: str
    direct_resolver_set: str
    listen: str
    ipv6: bool
    enhanced_mode: str
    fake_ip_range: str
    fake_ip_filter: tuple[str, ...]
    fake_ip_filter_mode: str


def _string(value: object, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"AI DNS field must be a non-empty string: {field}")
    return value


def _string_list(value: object, field: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value or any(not isinstance(item, str) or not item for item in value):
        raise RuntimeError(f"AI DNS field must be a non-empty string list: {field}")
    return tuple(value)


def _load_dns_settings(path: Path) -> _DnsSettings:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"AI DNS settings are unavailable or invalid: {path}") from exc
    if not isinstance(value, dict) or set(value) != _DNS_KEYS:
        raise RuntimeError(f"AI DNS settings have unknown or incomplete shape: {path}")
    version = value.get("schemaVersion")
    if type(version) is not int or version != _DNS_SCHEMA_VERSION:
        raise RuntimeError(f"Unsupported AI DNS settings schema: {path}")
    if value.get("ipv6") is not False:
        raise RuntimeError("AI DNS ipv6 must remain disabled to prevent IPv6 DNS escape")
    enhanced_mode = _string(value.get("enhancedMode"), "enhancedMode")
    if enhanced_mode != "fake-ip":
        raise RuntimeError("AI DNS enhancedMode must be fake-ip")
    fake_ip_filter_mode = _string(value.get("fakeIpFilterMode"), "fakeIpFilterMode")
    if fake_ip_filter_mode not in {"blacklist", "whitelist", "rule"}:
        raise RuntimeError("AI DNS fakeIpFilterMode is unsupported")
    return _DnsSettings(
        dns_proxy_group_key=_string(value.get("dnsProxyGroupKey"), "dnsProxyGroupKey"),
        default_resolver_set=_string(value.get("defaultResolverSet"), "defaultResolverSet"),
        nameserver_resolver_set=_string(value.get("nameserverResolverSet"), "nameserverResolverSet"),
        bootstrap_resolver_set=_string(value.get("bootstrapResolverSet"), "bootstrapResolverSet"),
        direct_resolver_set=_string(value.get("directResolverSet"), "directResolverSet"),
        listen=_string(value.get("listen"), "listen"),
        ipv6=False,
        enhanced_mode=enhanced_mode,
        fake_ip_range=_string(value.get("fakeIpRange"), "fakeIpRange"),
        fake_ip_filter=_string_list(value.get("fakeIpFilter"), "fakeIpFilter"),
        fake_ip_filter_mode=fake_ip_filter_mode,
    )


def _resolver_parts(
    resolver: str,
    field: str,
) -> tuple[str, str, ipaddress.IPv4Address | ipaddress.IPv6Address | None]:
    if "#" in resolver or any(character.isspace() for character in resolver):
        raise RuntimeError(f"AI DNS resolver must not contain an egress suffix or whitespace: {field}")
    try:
        parsed = urlsplit(resolver)
    except ValueError as exc:
        raise RuntimeError(f"AI DNS resolver URL is invalid: {field}") from exc
    hostname = parsed.hostname
    try:
        address = ipaddress.ip_address(hostname) if hostname is not None else None
    except ValueError:
        address = None
    if parsed.scheme not in {"https", "tls", "quic"} or not hostname or parsed.username or parsed.password:
        raise RuntimeError(f"AI DNS resolvers must use an encrypted URL without credentials: {field}")
    return parsed.scheme, hostname, address


def _resolver_set(profile: ProfileDocument, name: str, field: str) -> tuple[str, ...]:
    try:
        return profile.dns_resolver_sets[name]
    except KeyError as exc:
        raise RuntimeError(f"AI DNS setting references unknown resolver set: {field}={name}") from exc


def _validate_resolver_set(
    resolvers: tuple[str, ...],
    field: str,
    *,
    literal_public: bool = False,
    local_only: bool = False,
) -> None:
    for index, resolver in enumerate(resolvers):
        scheme, _hostname, address = _resolver_parts(resolver, f"{field}[{index}]")
        if literal_public and (address is None or not address.is_global):
            raise RuntimeError(f"AI DNS resolver set must use public IP-literal endpoints: {field}[{index}]")
        if address is not None and not address.is_global and not local_only:
            raise RuntimeError(f"AI DNS public resolver set contains a non-public IP endpoint: {field}[{index}]")
        if local_only and (address is None or not address.is_loopback or scheme != "https"):
            raise RuntimeError(f"AI DNS direct resolver set must use HTTPS loopback endpoints: {field}[{index}]")


def _validate_dns_group(profile: ProfileDocument, group_key: str) -> None:
    groups = [group for group in profile.policy_groups if group.group_key == group_key]
    if len(groups) != 1:
        raise RuntimeError("AI DNS proxy group must have exactly one policyGroups declaration")
    group = groups[0]
    allowed = {
        ("group-ref", "auto"),
        ("group-ref", "reject"),
        ("builtin", "REJECT"),
    }
    actual = {(candidate.kind, candidate.value) for candidate in group.candidates}
    has_auto = ("group-ref", "auto") in actual
    has_reject = ("group-ref", "reject") in actual or ("builtin", "REJECT") in actual
    default = group.default_selected
    defaults_to_auto = default is not None and default.kind == "group-ref" and default.value == "auto"
    if (
        group.kind != "select"
        or not has_auto
        or not has_reject
        or not actual.issubset(allowed)
        or group.include_provider_nodes
        or group.mihomo_when != "always"
        or group.subconverter
        or not defaults_to_auto
    ):
        raise RuntimeError(
            f"AI DNS policy group {group_key} must select only auto and reject, with no provider nodes"
        )


def _routed_resolver(
    resolver: str,
    profile: ProfileDocument,
    direct_resolvers: frozenset[str],
    bootstrap_resolvers: frozenset[str],
    dns_group: str,
    field: str,
) -> str:
    known = {item for resolver_set in profile.dns_resolver_sets.values() for item in resolver_set}
    if resolver not in known:
        raise RuntimeError(f"AI DNS policy references an undeclared resolver: {field}")
    _scheme, _hostname, address = _resolver_parts(resolver, field)
    if resolver in bootstrap_resolvers:
        raise RuntimeError(f"AI DNS bootstrap resolvers are reserved for proxy-server hostname lookups: {field}")
    if resolver not in direct_resolvers and address is not None and not address.is_global:
        raise RuntimeError(f"AI DNS policy public resolvers must not target local addresses: {field}")
    route = "DIRECT" if resolver in direct_resolvers else dns_group
    return f"{resolver}#{route}"


def _yaml_list(lines: list[str], key: str, values: tuple[str, ...]) -> None:
    lines.append(f"  {key}:")
    lines.extend(f"    - {yaml_string(value)}" for value in values)


def render_dns_config(catalog: Catalog, policies: tuple[DnsPolicySpec, ...]) -> str:
    """Render validated DNS settings and explicitly routed resolver policies."""
    paths = CatalogPaths(catalog.catalog_dir)
    settings = _load_dns_settings(paths.resolve("dns"))
    profile = load_profile_document(paths.resolve("profile"))
    group_key = settings.dns_proxy_group_key
    try:
        dns_group = catalog.group(group_key)
    except KeyError as exc:
        raise RuntimeError(f"AI DNS setting references unknown proxy group key: {group_key}") from exc
    if profile.core_groups.get(group_key) != dns_group:
        raise RuntimeError(f"AI DNS group key is not declared by profile.json: {group_key}")
    _validate_dns_group(profile, group_key)
    if "#" in dns_group:
        raise RuntimeError("AI DNS proxy group name must not contain '#'")

    default_resolvers = _resolver_set(profile, settings.default_resolver_set, "defaultResolverSet")
    nameserver_resolvers = _resolver_set(profile, settings.nameserver_resolver_set, "nameserverResolverSet")
    bootstrap_resolvers = _resolver_set(profile, settings.bootstrap_resolver_set, "bootstrapResolverSet")
    direct_resolvers = _resolver_set(profile, settings.direct_resolver_set, "directResolverSet")
    _validate_resolver_set(default_resolvers, "defaultResolverSet", literal_public=True)
    _validate_resolver_set(nameserver_resolvers, "nameserverResolverSet")
    _validate_resolver_set(bootstrap_resolvers, "bootstrapResolverSet", literal_public=True)
    _validate_resolver_set(direct_resolvers, "directResolverSet", local_only=True)
    if set(nameserver_resolvers) & set(direct_resolvers):
        raise RuntimeError("AI DNS local resolver set cannot be used as the public nameserver set")
    if set(default_resolvers) & set(bootstrap_resolvers):
        raise RuntimeError("AI DNS bootstrap resolver set must be independent from public DNS defaults")
    if set(nameserver_resolvers) & set(bootstrap_resolvers):
        raise RuntimeError("AI DNS bootstrap resolver set must be independent from public nameservers")

    sorted_policies = tuple(sorted(policies, key=lambda policy: policy.order))
    orders = tuple(policy.order for policy in sorted_policies)
    selectors = tuple(policy.selector for policy in sorted_policies)
    if any(type(order) is not int or order <= 0 for order in orders):
        raise RuntimeError("AI DNS policy orders must be positive integers")
    if len(set(orders)) != len(orders) or len(set(selectors)) != len(selectors):
        raise RuntimeError("AI DNS policies must have unique orders and selectors")

    direct_set = frozenset(direct_resolvers)
    bootstrap_set = frozenset(bootstrap_resolvers)
    routed_policies: list[tuple[str, tuple[str, ...]]] = []
    for index, policy in enumerate(sorted_policies):
        selector = _string(policy.selector, f"policies[{index}].selector")
        if not policy.nameservers:
            raise RuntimeError(f"AI DNS policy must include resolvers: {selector}")
        resolvers = tuple(
            _routed_resolver(
                resolver,
                profile,
                direct_set,
                bootstrap_set,
                dns_group,
                f"policies[{index}].nameservers[{resolver_index}]",
            )
            for resolver_index, resolver in enumerate(policy.nameservers)
        )
        routed_policies.append((selector, resolvers))

    lines = [
        "dns:",
        "  enable: true",
        f"  listen: {yaml_string(settings.listen)}",
        "  ipv6: false",
        f"  enhanced-mode: {yaml_string(settings.enhanced_mode)}",
        f"  fake-ip-range: {yaml_string(settings.fake_ip_range)}",
        "  fake-ip-filter:",
        *(f"    - {yaml_string(item)}" for item in settings.fake_ip_filter),
        f"  fake-ip-filter-mode: {yaml_string(settings.fake_ip_filter_mode)}",
        "  use-system-hosts: false",
        "  respect-rules: false",
    ]
    _yaml_list(lines, "default-nameserver", tuple(f"{resolver}#{dns_group}" for resolver in default_resolvers))
    _yaml_list(lines, "nameserver", tuple(f"{resolver}#{dns_group}" for resolver in nameserver_resolvers))
    _yaml_list(lines, "proxy-server-nameserver", tuple(f"{resolver}#DIRECT" for resolver in bootstrap_resolvers))
    _yaml_list(lines, "direct-nameserver", tuple(f"{resolver}#DIRECT" for resolver in direct_resolvers))
    lines.append("  direct-nameserver-follow-policy: false")
    if routed_policies:
        lines.append("  nameserver-policy:")
        for selector, resolvers in routed_policies:
            lines.append(f"    {yaml_string(selector)}:")
            lines.extend(f"      - {yaml_string(resolver)}" for resolver in resolvers)
    else:
        lines.append("  nameserver-policy: {}")
    return "\n".join(lines)
