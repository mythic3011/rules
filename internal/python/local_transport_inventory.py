"""Private transport inventory and service-candidate policy compiler.

This module deliberately has no dependency on the profile generator.  It only
validates private YAML, resolves selected environment variables, and produces
typed data suitable for a caller-owned renderer.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

import yaml


class TransportConfigError(ValueError):
    """Raised when private transport or candidate configuration is invalid."""


_ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
_PROFILES = frozenset({"relaxed", "strict"})


class _UniqueKeyLoader(yaml.SafeLoader):
    pass


def _construct_unique_mapping(loader: _UniqueKeyLoader, node: yaml.MappingNode, deep: bool = False) -> dict[object, object]:
    result: dict[object, object] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in result
        except TypeError as exc:
            raise TransportConfigError("YAML mapping keys must be scalar values") from exc
        if duplicate:
            raise TransportConfigError(f"duplicate YAML mapping key: {key!s}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


_UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_unique_mapping
)


@dataclass(frozen=True)
class TransportMetadata:
    region: str | None
    source: str | None
    trusted: bool
    supports_udp: bool


@dataclass(frozen=True)
class Transport:
    transport_id: str
    type: str
    display_name: str
    server_env: str
    port_env: str
    username_env: str | None
    password_env: str | None
    allowed_services: tuple[str, ...]
    allowed_profiles: tuple[str, ...]
    metadata: TransportMetadata


@dataclass(frozen=True)
class TransportInventory:
    transports: Mapping[str, Transport]
    known_services: frozenset[str]
    known_regions: frozenset[str]


@dataclass(frozen=True)
class ServiceCandidate:
    ref: str
    role: str


@dataclass(frozen=True)
class ServiceCandidatePolicy:
    services: Mapping[str, tuple[ServiceCandidate, ...]]
    known_services: frozenset[str]
    known_regions: frozenset[str]


@dataclass(frozen=True)
class MaterializedProxy:
    transport_id: str
    name: str
    type: str
    server: str
    port: int
    username: str | None = None
    password: str | None = None
    udp: bool | None = None

    def as_mapping(self) -> dict[str, object]:
        value: dict[str, object] = {
            "name": self.name,
            "type": self.type,
            "server": self.server,
            "port": self.port,
        }
        if self.username is not None:
            value["username"] = self.username
            value["password"] = self.password
        if self.udp is not None:
            value["udp"] = self.udp
        return value


@dataclass(frozen=True)
class RedactedTransportExplanation:
    transport_id: str
    type: str
    display_name: str
    metadata: TransportMetadata
    env: Mapping[str, tuple[str, str]]


@dataclass(frozen=True)
class CompiledTransportPlan:
    service_id: str
    profile: str
    auto_candidates: tuple[str, ...]
    region_transport_membership: Mapping[str, tuple[str, ...]]
    materialized_proxies: tuple[MaterializedProxy, ...]
    explanation: tuple[RedactedTransportExplanation, ...]


def _read_yaml(path: Path) -> object:
    try:
        with path.open("r", encoding="utf-8") as stream:
            return yaml.load(stream, Loader=_UniqueKeyLoader)
    except OSError as exc:
        raise TransportConfigError(f"cannot read configuration: {path}") from exc
    except yaml.YAMLError as exc:
        raise TransportConfigError(f"invalid YAML in configuration: {path}") from exc


def _mapping(value: object, context: str) -> dict[object, object]:
    if not isinstance(value, dict):
        raise TransportConfigError(f"{context} must be a mapping")
    return value


def _keys(value: dict[object, object], allowed: set[str], context: str) -> None:
    unknown = set(value) - allowed
    if unknown or any(not isinstance(key, str) for key in value):
        raise TransportConfigError(f"unknown key in {context}")


def _nonempty_string(value: object, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TransportConfigError(f"{context} must be a non-empty string")
    return value.strip()


def _identifier(value: object, context: str) -> str:
    result = _nonempty_string(value, context)
    if not _IDENTIFIER.fullmatch(result):
        raise TransportConfigError(f"{context} has an invalid identifier")
    return result


def _env_name(value: object, context: str) -> str:
    result = _nonempty_string(value, context)
    if not _ENV_NAME.fullmatch(result):
        raise TransportConfigError(f"{context} is not a valid environment variable name")
    return result


def _string_list(value: object, context: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value:
        raise TransportConfigError(f"{context} must be a non-empty list")
    result = tuple(_nonempty_string(item, f"{context} item") for item in value)
    if len(result) != len(set(result)):
        raise TransportConfigError(f"{context} contains duplicate entries")
    return result


def _known_identifiers(values: Sequence[str], context: str) -> frozenset[str]:
    result = tuple(_identifier(item, context) for item in values)
    if not result:
        raise TransportConfigError(f"{context} must not be empty")
    if len(result) != len(set(result)):
        raise TransportConfigError(f"{context} contains duplicate entries")
    return frozenset(result)


def load_transport_inventory(
    path: Path | str,
    known_services: Sequence[str],
    known_regions: Sequence[str],
) -> TransportInventory:
    services = _known_identifiers(known_services, "known services")
    regions = _known_identifiers(known_regions, "known regions")
    root = _mapping(_read_yaml(Path(path)), "transport root")
    _keys(root, {"transports"}, "transport root")
    raw_transports = _mapping(root.get("transports"), "transports")
    transports: dict[str, Transport] = {}
    for raw_id, raw_value in raw_transports.items():
        transport_id = _identifier(raw_id, "transport id")
        if transport_id in transports:
            raise TransportConfigError(f"duplicate transport id: {transport_id}")
        item = _mapping(raw_value, f"transport {transport_id}")
        _keys(
            item,
            {
                "type",
                "display_name",
                "server_env",
                "port_env",
                "username_env",
                "password_env",
                "allowed_services",
                "allowed_profiles",
                "metadata",
            },
            f"transport {transport_id}",
        )
        transport_type = _nonempty_string(item.get("type"), f"transport {transport_id} type")
        if transport_type not in {"socks5", "http"}:
            raise TransportConfigError(f"invalid transport type for {transport_id}")
        display_name = _nonempty_string(item["display_name"] if "display_name" in item else transport_id, f"transport {transport_id} display_name")
        server_env = _env_name(item.get("server_env"), f"transport {transport_id} server_env")
        port_env = _env_name(item.get("port_env"), f"transport {transport_id} port_env")
        user_present, pass_present = "username_env" in item, "password_env" in item
        user_raw, pass_raw = item.get("username_env"), item.get("password_env")
        if user_present != pass_present:
            raise TransportConfigError(f"transport {transport_id} auth environment refs must be paired")
        username_env = (
            None if not user_present else _env_name(user_raw, f"transport {transport_id} username_env")
        )
        password_env = (
            None if not pass_present else _env_name(pass_raw, f"transport {transport_id} password_env")
        )
        allowed_services = _string_list(item.get("allowed_services"), f"transport {transport_id} allowed_services")
        if not set(allowed_services) <= services:
            raise TransportConfigError(f"transport {transport_id} has unknown service")
        allowed_profiles = _string_list(item.get("allowed_profiles"), f"transport {transport_id} allowed_profiles")
        if not set(allowed_profiles) <= _PROFILES:
            raise TransportConfigError(f"transport {transport_id} has unknown profile")
        metadata_raw = _mapping(item.get("metadata"), f"transport {transport_id} metadata")
        _keys(
            metadata_raw,
            {"region", "source", "trusted", "supports_udp"},
            f"transport {transport_id} metadata",
        )
        region_raw = metadata_raw.get("region")
        region = (
            None
            if "region" not in metadata_raw
            else _identifier(region_raw, f"transport {transport_id} region")
        )
        if region is not None and region not in regions:
            raise TransportConfigError(f"transport {transport_id} has unknown region")
        source_raw = metadata_raw.get("source")
        source = None if "source" not in metadata_raw else _nonempty_string(source_raw, f"transport {transport_id} source")
        if not isinstance(metadata_raw.get("trusted"), bool) or not isinstance(
            metadata_raw.get("supports_udp"), bool
        ):
            raise TransportConfigError(f"transport {transport_id} metadata flags must be boolean")
        transports[transport_id] = Transport(
            transport_id,
            transport_type,
            display_name,
            server_env,
            port_env,
            username_env,
            password_env,
            allowed_services,
            allowed_profiles,
            TransportMetadata(
                region,
                source,
                metadata_raw["trusted"],
                metadata_raw["supports_udp"],
            ),
        )
    return TransportInventory(transports, services, regions)


def load_service_candidate_policy(
    path: Path | str,
    known_services: Sequence[str],
    known_regions: Sequence[str],
) -> ServiceCandidatePolicy:
    services = _known_identifiers(known_services, "known services")
    regions = _known_identifiers(known_regions, "known regions")
    root = _mapping(_read_yaml(Path(path)), "service policy root")
    _keys(root, {"services"}, "service policy root")
    raw_services = _mapping(root.get("services"), "services")
    result: dict[str, tuple[ServiceCandidate, ...]] = {}
    for raw_id, raw_value in raw_services.items():
        service_id = _identifier(raw_id, "service id")
        if service_id not in services:
            raise TransportConfigError(f"unknown service: {service_id}")
        if service_id in result:
            raise TransportConfigError(f"duplicate normalized service id: {service_id}")
        item = _mapping(raw_value, f"service {service_id}")
        _keys(item, {"candidates"}, f"service {service_id}")
        raw_candidates = item.get("candidates")
        if not isinstance(raw_candidates, list) or not raw_candidates:
            raise TransportConfigError(f"service {service_id} candidates must be a non-empty list")
        candidates: list[ServiceCandidate] = []
        seen: set[str] = set()
        seen_fallback = False
        for index, raw_candidate in enumerate(raw_candidates):
            candidate = _mapping(raw_candidate, f"service {service_id} candidate {index}")
            _keys(candidate, {"ref", "role"}, f"service {service_id} candidate {index}")
            ref = _nonempty_string(candidate.get("ref"), "candidate ref")
            role = _nonempty_string(candidate.get("role"), "candidate role")
            if role not in {"preferred", "fallback"}:
                raise TransportConfigError(f"invalid candidate role for {service_id}")
            if ref in seen:
                raise TransportConfigError(f"duplicate candidate ref for {service_id}")
            seen.add(ref)
            prefix, separator, value = ref.partition(":")
            if not separator or prefix not in {"transport", "region"}:
                raise TransportConfigError(f"invalid candidate ref for {service_id}")
            target = _identifier(value, f"candidate ref for {service_id}")
            if ref != f"{prefix}:{target}":
                raise TransportConfigError(f"invalid candidate ref for {service_id}")
            if prefix == "region" and target not in regions:
                raise TransportConfigError(f"unknown candidate region for {service_id}")
            if seen_fallback and role == "preferred":
                raise TransportConfigError(f"preferred candidate follows fallback for {service_id}")
            seen_fallback |= role == "fallback"
            candidates.append(ServiceCandidate(ref, role))
        result[service_id] = tuple(candidates)
    return ServiceCandidatePolicy(result, services, regions)


def validate_service_policy(inventory: TransportInventory, policy: ServiceCandidatePolicy, profile: str) -> None:
    if profile not in _PROFILES:
        raise TransportConfigError(f"unknown profile: {profile}")
    for service_id, candidates in policy.services.items():
        for candidate in candidates:
            prefix, _, value = candidate.ref.partition(":")
            if prefix == "transport":
                transport = inventory.transports.get(value)
                if transport is None:
                    raise TransportConfigError(f"missing transport ref: {value}")
                if service_id not in transport.allowed_services or profile not in transport.allowed_profiles:
                    raise TransportConfigError(f"transport {value} is not authorized for service/profile")


def _resolve_selected(transport: Transport, environ: Mapping[str, str]) -> tuple[str, int, str | None, str | None]:
    server = environ.get(transport.server_env, "")
    if not server.strip():
        raise TransportConfigError(f"missing or empty environment variable: {transport.server_env}")
    port_text = environ.get(transport.port_env, "")
    if not port_text.strip():
        raise TransportConfigError(f"missing or empty environment variable: {transport.port_env}")
    try:
        port = int(port_text)
    except (TypeError, ValueError) as exc:
        raise TransportConfigError(f"invalid port in environment variable: {transport.port_env}") from exc
    if not 1 <= port <= 65535:
        raise TransportConfigError(f"invalid port in environment variable: {transport.port_env}")
    username = password = None
    if transport.username_env is not None and transport.password_env is not None:
        username = environ.get(transport.username_env, "")
        password = environ.get(transport.password_env, "")
        if not username.strip():
            raise TransportConfigError(f"missing or empty environment variable: {transport.username_env}")
        if not password.strip():
            raise TransportConfigError(f"missing or empty environment variable: {transport.password_env}")
    return server, port, username, password


def compile_service_transport_plan(
    inventory: TransportInventory,
    policy: ServiceCandidatePolicy,
    service_id: str,
    profile: str,
    environ: Mapping[str, str] | None = None,
    reserved_names: Sequence[str] = (),
) -> CompiledTransportPlan:
    if service_id not in policy.known_services:
        raise TransportConfigError(f"unknown service: {service_id}")
    validate_service_policy(inventory, policy, profile)
    env = os.environ if environ is None else environ
    candidates = policy.services.get(service_id, ())
    regions: dict[str, tuple[str, ...]] = {}
    selected: set[str] = set()
    auto_names: list[str] = []
    for candidate in candidates:
        prefix, _, value = candidate.ref.partition(":")
        if prefix == "transport":
            if value not in selected:
                selected.add(value)
                auto_names.append(inventory.transports[value].display_name)
        else:
            auto_names.append(candidate.ref)
            members = tuple(
                sorted(
                    transport.transport_id
                    for transport in inventory.transports.values()
                    if transport.metadata.trusted
                    and transport.metadata.region == value
                    and service_id in transport.allowed_services
                    and profile in transport.allowed_profiles
                    and transport.transport_id not in selected
                )
            )
            regions[value] = members
            for transport_id in members:
                selected.add(transport_id)
    names = set(reserved_names)
    if len(names) != len(tuple(reserved_names)):
        raise TransportConfigError("reserved names contain duplicates")
    proxies: list[MaterializedProxy] = []
    explanations: list[RedactedTransportExplanation] = []
    used_names: set[str] = set()
    for transport_id in sorted(selected):
        transport = inventory.transports[transport_id]
        if transport.display_name in names or transport.display_name in used_names:
            raise TransportConfigError(f"duplicate or reserved display name: {transport.display_name}")
        names.add(transport.display_name)
        used_names.add(transport.display_name)
        server, port, username, password = _resolve_selected(transport, env)
        proxies.append(
            MaterializedProxy(
                transport_id,
                transport.display_name,
                transport.type,
                server,
                port,
                username,
                password,
                transport.metadata.supports_udp if transport.type == "socks5" else None,
            )
        )
        env_refs = {
            "server": transport.server_env,
            "port": transport.port_env,
            "username": transport.username_env,
            "password": transport.password_env,
        }
        explanations.append(
            RedactedTransportExplanation(
                transport_id,
                transport.type,
                transport.display_name,
                transport.metadata,
                {
                    field: (env_name, "set" if env.get(env_name, "").strip() else "unset")
                    for field, env_name in env_refs.items()
                    if env_name is not None
                },
            )
        )
    return CompiledTransportPlan(service_id, profile, tuple(auto_names), regions, tuple(proxies), tuple(explanations))
