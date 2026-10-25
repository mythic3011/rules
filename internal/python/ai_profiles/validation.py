from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .models import RuleFileSpec, ServiceSpec

NARROW_PAYLOAD_KINDS = frozenset({"DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD"})

GOOGLE_OWNED_DOMAIN_SUFFIXES = (
    ".google",
    ".goog",
    ".googleapis.com",
    ".withgoogle.com",
    "google.com",
)

FORBIDDEN_BROAD_GOOGLE_PAYLOADS = frozenset(
    {
        "DOMAIN,oauth2.googleapis.com",
        "DOMAIN,people.googleapis.com",
        "DOMAIN-SUFFIX,google.com",
        "DOMAIN-SUFFIX,googleapis.com",
        "DOMAIN-SUFFIX,goog",
        "DOMAIN-SUFFIX,withgoogle.com",
        "DOMAIN-KEYWORD,google",
    }
)


@dataclass(frozen=True, slots=True)
class PayloadScopePolicy:
    allowed_kinds: frozenset[str] = NARROW_PAYLOAD_KINDS
    forbidden_payloads: frozenset[str] = FORBIDDEN_BROAD_GOOGLE_PAYLOADS
    allowed_domain_suffixes: tuple[str, ...] = GOOGLE_OWNED_DOMAIN_SUFFIXES


DEFAULT_GOOGLE_AI_POLICY = PayloadScopePolicy()


def payload_host(entry: str) -> str:
    _, _, host = entry.partition(",")
    return host


def is_narrow_payload_entry(
    entry: str,
    allowed_kinds: Sequence[str] | frozenset[str] = NARROW_PAYLOAD_KINDS,
) -> bool:
    kind, _, host = entry.partition(",")
    return kind in allowed_kinds and bool(host)


def validate_service_payload_scope(
    service: ServiceSpec,
    policy: PayloadScopePolicy | None = None,
) -> None:
    if policy is None:
        policy = DEFAULT_GOOGLE_AI_POLICY

    if not service.payload:
        raise ValueError(f"{service.id}: payload cannot be empty")

    for entry in service.payload:
        if entry in policy.forbidden_payloads:
            raise ValueError(f"{service.id}: payload entry is forbidden broad rule: {entry}")
        if not is_narrow_payload_entry(entry, policy.allowed_kinds):
            raise ValueError(f"{service.id}: payload entry is not a narrow rule: {entry}")
        host = payload_host(entry)
        if policy.allowed_domain_suffixes and not host.endswith(policy.allowed_domain_suffixes):
            raise ValueError(
                f"{service.id}: payload entry host does not match allowed domain suffixes: {entry}"
            )


def validate_companion_rule_payload_scope(
    rule: RuleFileSpec,
    allowed_kinds: Sequence[str] | frozenset[str] = NARROW_PAYLOAD_KINDS,
) -> None:
    if not rule.payload:
        raise ValueError(f"{rule.id}: payload cannot be empty")
    for entry in rule.payload:
        if not is_narrow_payload_entry(entry, allowed_kinds):
            raise ValueError(f"{rule.id}: payload entry is not a narrow rule: {entry}")
