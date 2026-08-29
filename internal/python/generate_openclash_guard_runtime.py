#!/usr/bin/env python3
"""Compile canonical AI routing + guard config into openclash-guard runtime JSON."""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping

import yaml

ROOT = Path(__file__).resolve().parents[2]
AI_ROUTING_DIR = ROOT / "internal" / "config" / "ai-routing"
GUARD_CONFIG_DIR = ROOT / "internal" / "config" / "openclash-guard"
SCHEMA_PATH = ROOT / "internal" / "schemas" / "openclash-guard-runtime.schema.json"
OUTPUT_PATH = ROOT / "cfg" / "runtime" / "openclash-guard.json"
TEMPLATES_OUTPUT_PATH = ROOT / "cfg" / "runtime" / "openclash-guard-templates.json"

SCHEMA_VERSION = 1
PROTECTED_UDP_PORT = 443
CORE_FRAGMENT_FILE = re.compile(r"^\d{2}-.*\.ya?ml$", re.IGNORECASE)
ID_RE = re.compile(r"^[a-z][a-z0-9-]*$")
SECRET_KEY_RE = re.compile(
    r"^(api[_-]?key|token|password|secret|authorization|access[_-]?key|private[_-]?key)$",
    re.IGNORECASE,
)
SKIP_ROUTE_KINDS = frozenset({"direct", "reject"})
REGION_ROUTE_KINDS = frozenset({"region-auto", "region-stable"})
KNOWN_ROUTE_KINDS = SKIP_ROUTE_KINDS | REGION_ROUTE_KINDS | frozenset({"pinned-egress"})
QUIC_VALUES = frozenset({"proxy-or-reject", "allow", "reject"})
FAIL_MODES = frozenset({"reject", "allow"})
TEMPLATE_SEVERITIES = frozenset({"info", "medium", "high"})
TEMPLATE_CONFIDENCES = frozenset({"low", "medium", "high"})
MATCHER_OPS = frozenset({"eq", "ne", "in", "contains", "gte", "lte", "exists"})
MATCHER_COMBINATORS = frozenset({"all", "any", "not"})
KNOWN_ENV_PATHS = frozenset(
    {
        "openclash.installed",
        "openclash.enabled",
        "openclash.running",
        "openclash.healthy",
        "dns.backend",
        "dns.dnsmasqEnabled",
        "dns.dnsmasqRunning",
        "dns.adguardhomeEnabled",
        "dns.adguardhomeRunning",
        "dns.domainSetBackend",
        "network.ipv6",
        "network.directRegion",
        "proxy.healthy",
        "proxy.region",
        "gaming.clients.count",
        "gaming.clients.items",
        "gaming.blanketUdpBypassDetected",
        "nft.available",
    }
)
KNOWN_TEMPLATE_APPLY_KEYS = frozenset(
    {
        "guard.kill_switch",
        "guard.dns_kill_switch",
        "dns.ownership",
        "gaming.blanket_udp_bypass",
        "gaming.protect_udp_443",
        "mode",
        "policy.refresh",
    }
)
SERVICE_FACT_KEYS = frozenset(
    {
        "allowedregions",
        "allowedroutes",
        "domainsuffixes",
        "geosite",
        "matchers",
        "protectionclass",
        "regions",
        "routetargets",
        "services",
    }
)
APPLY_BOOL_KEYS = frozenset(
    {
        "guard.kill_switch",
        "guard.dns_kill_switch",
        "gaming.blanket_udp_bypass",
        "gaming.protect_udp_443",
        "policy.refresh",
    }
)
APPLY_MODE_VALUES = frozenset({"auto", "strict", "manual"})
DEFAULT_GEO_CACHE_TTL = 300


class DuplicateKeyError(RuntimeError):
    """YAML mapping declared the same key twice."""


class UniqueKeyLoader(yaml.SafeLoader):
    """SafeLoader that refuses duplicate mapping keys."""


def _construct_unique_mapping(loader: yaml.SafeLoader, node: yaml.MappingNode, deep: bool = False):
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            mark = getattr(key_node, "start_mark", None)
            location = f" at line {mark.line + 1}" if mark is not None else ""
            raise DuplicateKeyError(f"duplicate mapping key {key!r}{location}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


def _is_mapping(value: object) -> bool:
    return isinstance(value, dict)


def _refuse_secrets(value: object, source: Path | str, path: tuple[str, ...] = ()) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key)
            here = path + (key_text,)
            if SECRET_KEY_RE.match(key_text):
                joined = ".".join(here) or key_text
                raise RuntimeError(f"refusing secret field {joined} in {source}")
            _refuse_secrets(item, source, here)
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _refuse_secrets(item, source, path + (str(index),))


def load_yaml_mapping(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"unable to read {path}") from exc
    try:
        loaded = yaml.load(raw, Loader=UniqueKeyLoader)
    except DuplicateKeyError as exc:
        raise RuntimeError(f"{path}: {exc}") from exc
    except yaml.YAMLError as exc:
        raise RuntimeError(f"invalid YAML: {path}") from exc
    if loaded is None:
        return {}
    if not _is_mapping(loaded):
        raise RuntimeError(f"expected a mapping in {path}")
    _refuse_secrets(loaded, path)
    return loaded


def _merge_record(
    destination: dict[str, Any],
    value: object,
    section: str,
    source: Path,
) -> None:
    if not _is_mapping(value):
        raise RuntimeError(f"{section} must be a mapping in {source}")
    for item_id, item in value.items():
        key = str(item_id)
        if key in destination:
            raise RuntimeError(f"duplicate {section} id {key!r} in {source}")
        destination[key] = item


def load_ai_routing(directory: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    if not directory.is_dir():
        raise RuntimeError(f"AI routing directory does not exist: {directory}")
    fragments = sorted(
        path for path in directory.iterdir() if path.is_file() and CORE_FRAGMENT_FILE.match(path.name)
    )
    if not fragments:
        raise RuntimeError(f"no numbered routing fragments (NN-*.yaml) in {directory}")

    route_targets: dict[str, Any] = {}
    protection_classes: dict[str, Any] = {}
    services: dict[str, Any] = {}
    for path in fragments:
        document = load_yaml_mapping(path)
        for section, value in document.items():
            if section == "routeTargets":
                _merge_record(route_targets, value, section, path)
            elif section == "protectionClasses":
                _merge_record(protection_classes, value, section, path)
            elif section == "services":
                _merge_record(services, value, section, path)

    if not route_targets:
        raise RuntimeError(f"routeTargets missing from numbered fragments in {directory}")
    if not protection_classes:
        raise RuntimeError(f"protectionClasses missing from numbered fragments in {directory}")
    if not services:
        raise RuntimeError(f"services missing from numbered fragments in {directory}")
    return route_targets, protection_classes, services


def load_services_json(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"unable to read services catalog: {path}") from exc
    _refuse_secrets(loaded, path)
    if not _is_mapping(loaded):
        raise RuntimeError(f"services catalog must be an object: {path}")
    records = loaded.get("services", [])
    if not isinstance(records, list):
        raise RuntimeError(f"services catalog services must be a list: {path}")
    by_id: dict[str, dict[str, Any]] = {}
    for index, record in enumerate(records):
        if not _is_mapping(record):
            raise RuntimeError(f"services catalog entry {index} must be an object")
        service_id = record.get("id")
        if not isinstance(service_id, str) or not service_id:
            raise RuntimeError(f"services catalog entry {index} is missing id")
        if service_id in by_id:
            raise RuntimeError(f"duplicate service id {service_id!r} in {path}")
        by_id[service_id] = record
    return by_id


def load_guard_config(directory: Path) -> dict[str, Any]:
    if not directory.is_dir():
        raise RuntimeError(f"openclash-guard config directory does not exist: {directory}")
    files = sorted(path for path in directory.iterdir() if path.is_file() and path.suffix in {".yaml", ".yml"})
    if not files:
        raise RuntimeError(f"no YAML files in {directory}")
    merged: dict[str, Any] = {}
    for path in files:
        document = load_yaml_mapping(path)
        for key, value in document.items():
            if key in merged:
                raise RuntimeError(f"duplicate guard config key {key!r} in {path}")
            merged[key] = value
    for required in ("nft", "gaming", "geoProviders"):
        if required not in merged:
            raise RuntimeError(f"openclash-guard config missing {required} in {directory}")
    return merged


def _unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _as_int(value: object, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise RuntimeError(f"{field} must be an integer")
    return value


def _ports(values: object, field: str) -> list[int]:
    if values is None:
        values = []
    if not isinstance(values, list):
        raise RuntimeError(f"{field} must be a list")
    ports: list[int] = []
    seen: set[int] = set()
    for value in values:
        port = _as_int(value, field)
        if port < 1 or port > 65535:
            raise RuntimeError(f"{field} port out of range: {port}")
        if port in seen:
            continue
        seen.add(port)
        ports.append(port)
    return sorted(ports)


def _cidrs(values: object, field: str) -> list[str]:
    if values is None:
        values = []
    if not isinstance(values, list):
        raise RuntimeError(f"{field} must be a list")
    cidrs: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, str) or not value:
            raise RuntimeError(f"{field} entries must be non-empty strings")
        try:
            ipaddress.ip_network(value, strict=True)
        except ValueError as exc:
            raise RuntimeError(f"invalid CIDR in {field}: {value}") from exc
        if value in seen:
            continue
        seen.add(value)
        cidrs.append(value)
    return sorted(cidrs)


def _require_id(value: object, field: str) -> str:
    if not isinstance(value, str) or not ID_RE.fullmatch(value):
        raise RuntimeError(f"{field} must match {ID_RE.pattern}: {value!r}")
    return value


def compile_protection_class(class_id: str, spec: object) -> dict[str, Any]:
    if not _is_mapping(spec):
        raise RuntimeError(f"protection class {class_id} must be a mapping")
    if "directAllowed" not in spec:
        raise RuntimeError(f"protection class {class_id} is missing directAllowed")
    direct_allowed = spec["directAllowed"]
    if not isinstance(direct_allowed, bool):
        raise RuntimeError(f"protection class {class_id} directAllowed must be a boolean")

    firewall_kill_switch = spec.get("firewallKillSwitch", False)
    if not isinstance(firewall_kill_switch, bool):
        raise RuntimeError(f"protection class {class_id} firewallKillSwitch must be a boolean")

    if "failMode" in spec:
        fail_mode = spec["failMode"]
    elif firewall_kill_switch or not direct_allowed:
        fail_mode = "reject"
    else:
        fail_mode = "allow"
    if fail_mode not in FAIL_MODES:
        raise RuntimeError(f"protection class {class_id} has invalid failMode: {fail_mode!r}")
    if firewall_kill_switch and fail_mode != "reject":
        raise RuntimeError(
            f"protection class {class_id} firewallKillSwitch requires failMode=reject"
        )

    if "quic" in spec:
        quic = spec["quic"]
    elif not direct_allowed:
        quic = "proxy-or-reject"
    else:
        quic = "allow"
    if quic not in QUIC_VALUES:
        raise RuntimeError(f"protection class {class_id} has invalid quic: {quic!r}")

    return {
        "directAllowed": direct_allowed,
        "failMode": fail_mode,
        "quic": quic,
        "firewallKillSwitch": firewall_kill_switch,
    }


def _route_region(route_id: str, target: object, service_id: str) -> str | None:
    if not _is_mapping(target):
        raise RuntimeError(f"route target {route_id} must be a mapping")
    kind = target.get("kind")
    if not isinstance(kind, str) or kind not in KNOWN_ROUTE_KINDS:
        raise RuntimeError(f"service {service_id} references unknown route kind {kind!r} ({route_id})")
    if kind in SKIP_ROUTE_KINDS:
        return None
    region = target.get("region")
    if isinstance(region, str) and region:
        return _require_id(region, f"route target {route_id} region")
    if kind == "pinned-egress":
        return None
    raise RuntimeError(f"route target {route_id} is missing region")


def allowed_regions_for_routes(
    service_id: str,
    allowed_routes: object,
    route_targets: Mapping[str, Any],
) -> list[str]:
    if not isinstance(allowed_routes, list) or not allowed_routes:
        raise RuntimeError(f"service {service_id} allowedRoutes must be a non-empty list")
    regions: list[str] = []
    for route_id in allowed_routes:
        if not isinstance(route_id, str) or not route_id:
            raise RuntimeError(f"service {service_id} allowedRoutes entries must be strings")
        if route_id not in route_targets:
            raise RuntimeError(f"service {service_id} references unknown route: {route_id}")
        region = _route_region(route_id, route_targets[route_id], service_id)
        if region is not None:
            regions.append(region)
    return _unique(regions)


def _geosite_values(upstream_rules: object) -> list[str]:
    if upstream_rules is None:
        return []
    if not isinstance(upstream_rules, list):
        raise RuntimeError("upstreamRules must be a list")
    values: list[str] = []
    for rule in upstream_rules:
        if not _is_mapping(rule):
            continue
        if rule.get("kind") != "geosite":
            continue
        value = rule.get("value")
        if isinstance(value, str) and value:
            values.append(value)
    return _unique(values)


def _domain_suffixes(payload: object) -> list[str]:
    if payload is None:
        return []
    if not isinstance(payload, list):
        raise RuntimeError("payload must be a list")
    values: list[str] = []
    for line in payload:
        if not isinstance(line, str):
            continue
        kind, _, rest = line.partition(",")
        if kind.strip().upper() != "DOMAIN-SUFFIX":
            continue
        domain = rest.split(",", 1)[0].strip().lower()
        if domain:
            values.append(domain)
    return _unique(values)


def compile_matchers(record: Mapping[str, Any] | None) -> dict[str, list[str]]:
    if record is None:
        return {"geosite": [], "domainSuffixes": []}
    return {
        "geosite": _geosite_values(record.get("upstreamRules")),
        "domainSuffixes": _domain_suffixes(record.get("payload")),
    }


def compile_nft(spec: object) -> dict[str, str]:
    if not _is_mapping(spec):
        raise RuntimeError("nft config must be a mapping")
    family = spec.get("family")
    table = spec.get("table")
    comment_prefix = spec.get("commentPrefix")
    if family not in {"inet", "ip", "ip6"}:
        raise RuntimeError(f"nft.family must be inet, ip, or ip6: {family!r}")
    if not isinstance(table, str) or not table:
        raise RuntimeError("nft.table must be a non-empty string")
    if not isinstance(comment_prefix, str) or not comment_prefix:
        raise RuntimeError("nft.commentPrefix must be a non-empty string")
    return {"family": family, "table": table, "commentPrefix": comment_prefix}


def compile_gaming(spec: object) -> dict[str, Any]:
    if not _is_mapping(spec):
        raise RuntimeError("gaming config must be a mapping")
    protected = _ports(spec.get("protectedUdpPorts"), "gaming.protectedUdpPorts")
    if PROTECTED_UDP_PORT not in protected:
        protected.append(PROTECTED_UDP_PORT)
    protected = sorted(set(protected))
    protected_set = set(protected)
    udp_ports = [port for port in _ports(spec.get("udpPorts"), "gaming.udpPorts") if port not in protected_set]
    tcp_ports = [port for port in _ports(spec.get("tcpPorts"), "gaming.tcpPorts") if port not in protected_set]
    return {
        "udpPorts": udp_ports,
        "tcpPorts": tcp_ports,
        "protectedUdpPorts": protected,
        "destinationCidrs": _cidrs(spec.get("destinationCidrs"), "gaming.destinationCidrs"),
    }


def compile_geo_providers(spec: object) -> list[dict[str, Any]]:
    if not isinstance(spec, list):
        raise RuntimeError("geoProviders must be a list")
    providers: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(spec):
        if not _is_mapping(item):
            raise RuntimeError(f"geoProviders[{index}] must be a mapping")
        provider_id = _require_id(item.get("id"), f"geoProviders[{index}].id")
        if provider_id in seen:
            raise RuntimeError(f"duplicate geo provider id: {provider_id}")
        seen.add(provider_id)
        url = item.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise RuntimeError(f"geo provider {provider_id} url must be https")
        timeout = _as_int(item.get("timeoutSeconds"), f"geoProviders[{index}].timeoutSeconds")
        if timeout < 1 or timeout > 60:
            raise RuntimeError(f"geo provider {provider_id} timeoutSeconds out of range")
        if "cacheTtlSeconds" in item:
            cache_ttl = _as_int(item.get("cacheTtlSeconds"), f"geoProviders[{index}].cacheTtlSeconds")
        else:
            cache_ttl = DEFAULT_GEO_CACHE_TTL
        if cache_ttl < 1 or cache_ttl > 86400:
            raise RuntimeError(f"geo provider {provider_id} cacheTtlSeconds out of range")
        fields = item.get("fields")
        if not _is_mapping(fields):
            raise RuntimeError(f"geo provider {provider_id} fields must be a mapping")
        compiled_fields: dict[str, str] = {}
        for key in ("ip", "country", "asn"):
            if key not in fields:
                if key == "asn":
                    continue
                raise RuntimeError(f"geo provider {provider_id} fields.{key} is required")
            value = fields[key]
            if not isinstance(value, str) or not value:
                raise RuntimeError(f"geo provider {provider_id} fields.{key} must be a string")
            compiled_fields[key] = value
        extra = set(fields) - {"ip", "country", "asn"}
        if extra:
            raise RuntimeError(f"geo provider {provider_id} has unsupported field mappings: {sorted(extra)}")
        providers.append(
            {
                "id": provider_id,
                "url": url,
                "timeoutSeconds": timeout,
                "cacheTtlSeconds": cache_ttl,
                "fields": compiled_fields,
            }
        )
    providers.sort(key=lambda item: item["id"])
    return providers


def _refuse_service_facts(value: object, source: str, path: tuple[str, ...] = ()) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key)
            here = path + (key_text,)
            if key_text.replace("-", "").replace("_", "").lower() in SERVICE_FACT_KEYS:
                joined = ".".join(here) or key_text
                raise RuntimeError(f"templates must not copy service/region facts ({joined}) in {source}")
            _refuse_service_facts(item, source, here)
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _refuse_service_facts(item, source, path + (str(index),))


def _require_env_path(value: object, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"{field} path must be a non-empty string")
    if value not in KNOWN_ENV_PATHS:
        raise RuntimeError(f"{field} references unknown environment path: {value}")
    return value


def compile_when(node: object, field: str) -> dict[str, Any]:
    if not _is_mapping(node):
        raise RuntimeError(f"{field} must be a mapping")
    keys = set(node)
    combinators = keys & MATCHER_COMBINATORS
    if combinators:
        extra = keys - MATCHER_COMBINATORS
        if extra:
            raise RuntimeError(f"{field} has extra keys: {sorted(extra)}")
        if len(combinators) != 1:
            raise RuntimeError(f"{field} must use exactly one of all/any/not")
        combinator = next(iter(combinators))
        child = node[combinator]
        if combinator in {"all", "any"}:
            if not isinstance(child, list) or not child:
                raise RuntimeError(f"{field}.{combinator} must be a non-empty list")
            return {
                combinator: [compile_when(item, f"{field}.{combinator}[{index}]") for index, item in enumerate(child)]
            }
        if not _is_mapping(child):
            raise RuntimeError(f"{field}.not must be a mapping")
        return {"not": compile_when(child, f"{field}.not")}

    if "path" not in node:
        raise RuntimeError(f"{field} must declare path or a combinator")
    path = _require_env_path(node.get("path"), field)
    ops = keys & MATCHER_OPS
    extra = keys - {"path"} - MATCHER_OPS
    if extra:
        raise RuntimeError(f"{field} has unknown matcher keys: {sorted(extra)}")
    if len(ops) != 1:
        raise RuntimeError(f"{field} must declare exactly one matcher operator")
    op = next(iter(ops))
    raw = node[op]
    compiled: dict[str, Any] = {"path": path}
    if op in {"eq", "ne"}:
        if isinstance(raw, bool) or (isinstance(raw, (str, int)) and not isinstance(raw, bool)):
            if isinstance(raw, str) and not raw and op == "eq":
                compiled[op] = raw
            elif isinstance(raw, str) or isinstance(raw, bool) or (isinstance(raw, int) and not isinstance(raw, bool)):
                compiled[op] = raw
            else:
                raise RuntimeError(f"{field}.{op} must be a boolean, string, or integer")
        else:
            raise RuntimeError(f"{field}.{op} must be a boolean, string, or integer")
        compiled[op] = raw
    elif op == "in":
        if not isinstance(raw, list) or not raw:
            raise RuntimeError(f"{field}.in must be a non-empty list")
        items: list[Any] = []
        for index, item in enumerate(raw):
            if isinstance(item, bool) or (isinstance(item, (str, int)) and not isinstance(item, bool)):
                items.append(item)
            else:
                raise RuntimeError(f"{field}.in[{index}] must be a boolean, string, or integer")
        compiled["in"] = items
    elif op == "contains":
        if not isinstance(raw, (str, int)) or isinstance(raw, bool):
            if not isinstance(raw, str):
                raise RuntimeError(f"{field}.contains must be a string or integer")
        compiled["contains"] = raw
    elif op in {"gte", "lte"}:
        if isinstance(raw, bool) or not isinstance(raw, int):
            raise RuntimeError(f"{field}.{op} must be an integer")
        compiled[op] = raw
    elif op == "exists":
        if not isinstance(raw, bool):
            raise RuntimeError(f"{field}.exists must be a boolean")
        compiled["exists"] = raw
    return compiled


def compile_apply(spec: object, field: str) -> dict[str, Any]:
    if not _is_mapping(spec) or not spec:
        raise RuntimeError(f"{field} must be a non-empty mapping")
    compiled: dict[str, Any] = {}
    for key, value in spec.items():
        apply_key = str(key)
        if apply_key not in KNOWN_TEMPLATE_APPLY_KEYS:
            raise RuntimeError(f"{field} has unknown apply key: {apply_key}")
        if apply_key in compiled:
            raise RuntimeError(f"{field} duplicate apply key: {apply_key}")
        if apply_key in APPLY_BOOL_KEYS:
            if not isinstance(value, bool):
                raise RuntimeError(f"{field}.{apply_key} must be a boolean")
            if apply_key == "gaming.blanket_udp_bypass" and value is True:
                raise RuntimeError(f"{field}.{apply_key} cannot enable blanket UDP bypass")
            if apply_key == "gaming.protect_udp_443" and value is False:
                raise RuntimeError(f"{field}.{apply_key} cannot disable UDP/443 protection")
            compiled[apply_key] = value
            continue
        if apply_key == "dns.ownership":
            if value != "preserve":
                raise RuntimeError(f"{field}.{apply_key} must be 'preserve'")
            compiled[apply_key] = value
            continue
        if apply_key == "mode":
            if value not in APPLY_MODE_VALUES:
                raise RuntimeError(f"{field}.{apply_key} must be one of {sorted(APPLY_MODE_VALUES)}")
            compiled[apply_key] = value
            continue
        raise RuntimeError(f"{field}.{apply_key} is not implemented")
    return compiled


def compile_templates(spec: object) -> dict[str, Any]:
    if not _is_mapping(spec) or not spec:
        raise RuntimeError("templates must be a non-empty mapping")
    compiled: dict[str, Any] = {}
    for raw_id, item in spec.items():
        template_id = _require_id(raw_id, "template id")
        if template_id in compiled:
            raise RuntimeError(f"duplicate template id: {template_id}")
        if not _is_mapping(item):
            raise RuntimeError(f"template {template_id} must be a mapping")
        extra = set(item) - {"title", "description", "when", "recommendation", "apply"}
        if extra:
            raise RuntimeError(f"template {template_id} has unknown keys: {sorted(extra)}")
        title = item.get("title")
        description = item.get("description")
        if not isinstance(title, str) or not title.strip():
            raise RuntimeError(f"template {template_id} title must be a non-empty string")
        if not isinstance(description, str) or not description.strip():
            raise RuntimeError(f"template {template_id} description must be a non-empty string")
        recommendation = item.get("recommendation")
        if not _is_mapping(recommendation):
            raise RuntimeError(f"template {template_id} recommendation must be a mapping")
        rec_extra = set(recommendation) - {"severity", "confidence", "reason", "risk"}
        if rec_extra:
            raise RuntimeError(f"template {template_id} recommendation has unknown keys: {sorted(rec_extra)}")
        severity = recommendation.get("severity")
        confidence = recommendation.get("confidence")
        reason = recommendation.get("reason")
        risk = recommendation.get("risk")
        if severity not in TEMPLATE_SEVERITIES:
            raise RuntimeError(f"template {template_id} has invalid severity: {severity!r}")
        if confidence not in TEMPLATE_CONFIDENCES:
            raise RuntimeError(f"template {template_id} has invalid confidence: {confidence!r}")
        if not isinstance(reason, str) or not reason.strip():
            raise RuntimeError(f"template {template_id} reason must be a non-empty string")
        if not isinstance(risk, str) or not risk.strip():
            raise RuntimeError(f"template {template_id} risk must be a non-empty string")
        compiled[template_id] = {
            "title": title.strip(),
            "description": description.strip(),
            "when": compile_when(item.get("when"), f"template {template_id} when"),
            "recommendation": {
                "severity": severity,
                "confidence": confidence,
                "reason": reason.strip(),
                "risk": risk.strip(),
            },
            "apply": compile_apply(item.get("apply"), f"template {template_id} apply"),
        }
    _refuse_service_facts(compiled, "templates")
    return compiled


def compile_openclash_guard_templates(
    *,
    guard_config_dir: Path = GUARD_CONFIG_DIR,
) -> dict[str, Any]:
    guard = load_guard_config(guard_config_dir)
    if "templates" not in guard:
        raise RuntimeError(f"openclash-guard config missing templates in {guard_config_dir}")
    document: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "templates": compile_templates(guard["templates"]),
    }
    _refuse_secrets(document, "templates document")
    _refuse_service_facts(document["templates"], "templates document")
    return document


def compile_services(
    services: Mapping[str, Any],
    protection_classes: Mapping[str, Any],
    route_targets: Mapping[str, Any],
    matcher_catalog: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    compiled: dict[str, Any] = {}
    for service_id in sorted(services):
        _require_id(service_id, "service id")
        spec = services[service_id]
        if not _is_mapping(spec):
            raise RuntimeError(f"service {service_id} must be a mapping")
        class_id = spec.get("protectionClass")
        if not isinstance(class_id, str) or not class_id:
            raise RuntimeError(f"service {service_id} is missing protectionClass")
        if class_id not in protection_classes:
            raise RuntimeError(f"service {service_id} references unknown protection class: {class_id}")
        compiled[service_id] = {
            "protectionClass": class_id,
            "allowedRegions": allowed_regions_for_routes(
                service_id, spec.get("allowedRoutes"), route_targets
            ),
            "matchers": compile_matchers(matcher_catalog.get(service_id)),
        }
    return compiled


def _content_revision(document: Mapping[str, Any]) -> str:
    payload = dict(document)
    payload["revision"] = ""
    encoded = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _json_pointer(ref: str, root: Mapping[str, Any]) -> Any:
    if not ref.startswith("#/"):
        raise RuntimeError(f"unsupported $ref: {ref}")
    node: Any = root
    for part in ref[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not _is_mapping(node) or part not in node:
            raise RuntimeError(f"unresolved $ref: {ref}")
        node = node[part]
    return node


def _deref(schema: Any, root: Mapping[str, Any]) -> Any:
    if not _is_mapping(schema) or "$ref" not in schema:
        return schema
    resolved = _json_pointer(str(schema["$ref"]), root)
    if not _is_mapping(resolved):
        return resolved
    merged = dict(resolved)
    for key, value in schema.items():
        if key != "$ref":
            merged[key] = value
    return merged if "$ref" not in merged else _deref(merged, root)


def _type_name(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _matches_type(value: object, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return (isinstance(value, (int, float)) and not isinstance(value, bool))
    if expected == "null":
        return value is None
    return False


def _format_path(path: tuple[str, ...]) -> str:
    return "/" + "/".join(path) if path else "/"


def _validate(
    instance: object,
    schema: Any,
    root: Mapping[str, Any],
    loc: tuple[str, ...],
) -> None:
    schema = _deref(schema, root)
    if not _is_mapping(schema):
        raise RuntimeError(f"invalid schema at {_format_path(loc)}")
    path = _format_path(loc)

    expected_type = schema.get("type")
    if isinstance(expected_type, str) and not _matches_type(instance, expected_type):
        raise RuntimeError(f"{path}: expected {expected_type}, got {_type_name(instance)}")
    if isinstance(expected_type, list) and not any(_matches_type(instance, item) for item in expected_type):
        raise RuntimeError(f"{path}: expected one of {expected_type}, got {_type_name(instance)}")

    if "const" in schema and instance != schema["const"]:
        raise RuntimeError(f"{path}: expected const {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        raise RuntimeError(f"{path}: expected one of {schema['enum']}")

    if isinstance(instance, str):
        min_length = schema.get("minLength")
        if isinstance(min_length, int) and len(instance) < min_length:
            raise RuntimeError(f"{path}: shorter than minLength {min_length}")
        pattern = schema.get("pattern")
        if isinstance(pattern, str) and re.search(pattern, instance) is None:
            raise RuntimeError(f"{path}: does not match {pattern}")

    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if isinstance(minimum, (int, float)) and instance < minimum:
            raise RuntimeError(f"{path}: below minimum {minimum}")
        if isinstance(maximum, (int, float)) and instance > maximum:
            raise RuntimeError(f"{path}: above maximum {maximum}")

    if isinstance(instance, list):
        min_items = schema.get("minItems")
        if isinstance(min_items, int) and len(instance) < min_items:
            raise RuntimeError(f"{path}: fewer than minItems {min_items}")
        if schema.get("uniqueItems") is True:
            encoded = [json.dumps(item, sort_keys=True, separators=(",", ":")) for item in instance]
            if len(encoded) != len(set(encoded)):
                raise RuntimeError(f"{path}: items are not unique")
        item_schema = schema.get("items")
        if item_schema is not None:
            for index, item in enumerate(instance):
                _validate(item, item_schema, root, loc + (str(index),))

    if isinstance(instance, dict):
        required = schema.get("required", [])
        if isinstance(required, list):
            missing = [key for key in required if key not in instance]
            if missing:
                raise RuntimeError(f"{path}: missing required {missing}")
        properties = schema.get("properties")
        if not _is_mapping(properties):
            properties = {}
        property_names = schema.get("propertyNames")
        additional = schema.get("additionalProperties", True)
        for key, value in instance.items():
            child = loc + (str(key),)
            if property_names is not None:
                _validate(key, property_names, root, child + ("$name",))
            if key in properties:
                _validate(value, properties[key], root, child)
            elif additional is False:
                raise RuntimeError(f"{path}: additional property {key!r} is not allowed")
            elif additional is not True:
                _validate(value, additional, root, child)


def load_schema(path: Path = SCHEMA_PATH) -> dict[str, Any]:
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"unable to read schema: {path}") from exc
    if not _is_mapping(loaded):
        raise RuntimeError(f"schema must be an object: {path}")
    return loaded


def validate_runtime_document(document: Mapping[str, Any], schema: Mapping[str, Any] | None = None) -> None:
    schema = schema if schema is not None else load_schema()
    _refuse_secrets(document, "runtime document")
    _validate(document, schema, schema, ())
    classes = document.get("protectionClasses")
    services = document.get("services")
    if _is_mapping(classes) and _is_mapping(services):
        for service_id, service in services.items():
            if not _is_mapping(service):
                continue
            class_id = service.get("protectionClass")
            if class_id not in classes:
                raise RuntimeError(
                    f"service {service_id} protectionClass {class_id!r} does not resolve"
                )
    gaming = document.get("gaming")
    if _is_mapping(gaming):
        protected = gaming.get("protectedUdpPorts")
        if not isinstance(protected, list) or PROTECTED_UDP_PORT not in protected:
            raise RuntimeError("gaming.protectedUdpPorts must include 443")


def compile_openclash_guard_runtime(
    *,
    ai_routing_dir: Path = AI_ROUTING_DIR,
    guard_config_dir: Path = GUARD_CONFIG_DIR,
    schema_path: Path = SCHEMA_PATH,
) -> dict[str, Any]:
    route_targets, protection_classes, services = load_ai_routing(ai_routing_dir)
    matcher_catalog = load_services_json(ai_routing_dir / "services.json")
    guard = load_guard_config(guard_config_dir)

    compiled_classes = {
        _require_id(class_id, "protection class id"): compile_protection_class(class_id, spec)
        for class_id, spec in sorted(protection_classes.items())
    }
    document: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "revision": "",
        "nft": compile_nft(guard["nft"]),
        "protectionClasses": compiled_classes,
        "services": compile_services(services, compiled_classes, route_targets, matcher_catalog),
        "gaming": compile_gaming(guard["gaming"]),
        "geoProviders": compile_geo_providers(guard["geoProviders"]),
    }
    document["revision"] = _content_revision(document)
    validate_runtime_document(document, load_schema(schema_path))
    return document


def dumps_runtime(document: Mapping[str, Any]) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_runtime(path: Path, document: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps_runtime(document), encoding="utf-8", newline="\n")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Generate openclash-guard runtime policy JSON.")
    parser.add_argument("--ai-routing-dir", type=Path, default=AI_ROUTING_DIR)
    parser.add_argument("--guard-config-dir", type=Path, default=GUARD_CONFIG_DIR)
    parser.add_argument("--schema", type=Path, default=SCHEMA_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--templates-output", type=Path, default=TEMPLATES_OUTPUT_PATH)
    args = parser.parse_args(argv)
    document = compile_openclash_guard_runtime(
        ai_routing_dir=args.ai_routing_dir,
        guard_config_dir=args.guard_config_dir,
        schema_path=args.schema,
    )
    write_runtime(args.output, document)
    templates = compile_openclash_guard_templates(guard_config_dir=args.guard_config_dir)
    write_runtime(args.templates_output, templates)
    for path in (args.output, args.templates_output):
        try:
            rendered = path.resolve().relative_to(ROOT)
        except ValueError:
            rendered = path
        print(rendered)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
