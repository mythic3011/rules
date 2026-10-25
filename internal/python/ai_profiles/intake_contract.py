"""Shared intake limits and the matcher registry used by the form and parser."""
from __future__ import annotations

import ipaddress
import re
from collections.abc import Callable
from dataclasses import dataclass
from types import MappingProxyType

from .domains import DOMAIN_PATTERN


@dataclass(frozen=True, slots=True)
class IntakeLimits:
    additional_regions: int = 3
    region_terms: int = 40
    matcher_values: int = 100
    region_text_length: int = 80


INTAKE_LIMITS = IntakeLimits()
SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
REGION_CODE_PATTERN = re.compile(r"^[A-Z]{2,3}$")
_RESERVED_HOSTS = frozenset({"localhost", "localhost.localdomain"})


def _domain(value: str) -> str:
    value = value.casefold().rstrip(".")
    if value in _RESERVED_HOSTS or not DOMAIN_PATTERN.fullmatch(value):
        raise ValueError(f"invalid public domain matcher: {value}")
    return value


def _keyword(value: str) -> str:
    if not 3 <= len(value) <= 80 or any(ch in value for ch in "*/\\"):
        raise ValueError(f"unsafe/broad domain keyword: {value!r}")
    return value


def _network(value: str) -> str:
    network = ipaddress.ip_network(value, strict=False)
    if network.is_private or network.is_loopback or network.is_link_local or network.is_reserved:
        raise ValueError(f"private/reserved CIDR is not accepted from public intake: {value}")
    return str(network)


def _process_name(value: str) -> str:
    if "/" in value or "\\" in value or len(value) > 120:
        raise ValueError(f"invalid process name: {value!r}")
    return value


def _process_path(value: str) -> str:
    if len(value) > 300:
        raise ValueError("invalid process path")
    return value


# Insertion order is the public form's display order. Adding a matcher here
# updates both the dropdown and the parser's supported types.
MATCHER_REGISTRY = MappingProxyType({
    "DOMAIN-SUFFIX": _domain,
    "DOMAIN": _domain,
    "DOMAIN-KEYWORD": _keyword,
    "IP-CIDR": _network,
    "PROCESS-NAME": _process_name,
    "PROCESS-PATH": _process_path,
})


def resolve_matcher(kind: str) -> Callable[[str], str]:
    try:
        return MATCHER_REGISTRY[kind.strip().upper()]
    except KeyError as exc:
        raise ValueError(f"unsupported matcher type: {kind}") from exc


def parse_matcher_values(kind: str, raw: str) -> list[str]:
    normalize = resolve_matcher(kind)
    values = [line.strip() for line in raw.splitlines() if line.strip() and not line.strip().startswith("#")]
    if not values:
        raise ValueError("at least one matcher value is required")
    if len(values) > INTAKE_LIMITS.matcher_values:
        raise ValueError(f"at most {INTAKE_LIMITS.matcher_values} matcher values per intake")
    result: list[str] = []
    for value in values:
        if any(ch in value for ch in "\x00\r\n,`"):
            raise ValueError("matcher value contains a rule delimiter or control character")
        value = normalize(value)
        if value not in result:
            result.append(value)
    return result
