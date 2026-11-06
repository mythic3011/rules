from __future__ import annotations

import hashlib
import ipaddress
import json
from pathlib import Path
from typing import Any

from .catalog import load_catalog
from .compiler import compile_adguard_home_plan
from .distribution import load_distribution
from .models import Catalog, GeositeRuleSource, RemoteRuleSource
from .settings import AI_DISTRIBUTION_PATH, RULE_DIR

OUTPUT_PATH = "rule/AI_Service_Blocking.json"
SERVICES_SOURCE_PATH = "internal/config/ai-routing/catalogs/services.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(128 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def compile_ai_service_blocking_policy(catalog: Catalog | None = None) -> dict[str, Any]:
    """Project supported domain/CIDR rules and disclose incomplete catalog coverage."""
    catalog = catalog or load_catalog()
    services_path = catalog.catalog_dir / "catalogs" / "services.json"
    if not services_path.is_file() or services_path.is_symlink():
        raise RuntimeError("AI service source must be a regular file")

    files = [{"path": SERVICES_SOURCE_PATH, "sha256": _sha256(services_path)}]
    domains_by_key: dict[tuple[str, str], tuple[str, set[str]]] = {}
    ipv4: dict[str, set[str]] = {}
    ipv6: dict[str, set[str]] = {}
    unsupported: set[tuple[str, str, str, str]] = set()
    reasons: set[str] = {"no_canonical_dynamic_ip_feed"}

    # Reuse the owner compiler for AdGuard-compatible exact and suffix domains.
    # Regex entries remain visible as unsupported metadata; no broader matcher is
    # synthesized for the firewall or the DNS blocklist.
    domain_plan = compile_adguard_home_plan(catalog)
    for rule in domain_plan.rules:
        if rule.kind not in {"exact", "suffix"}:
            unsupported.add((rule.service_id, "DOMAIN-REGEX", rule.domain, "regex_requires_a_separate_reviewed_matcher"))
            reasons.add("unsupported_domain_matcher")
            continue
        key = (rule.kind, rule.domain.casefold())
        if key not in domains_by_key:
            domains_by_key[key] = (rule.domain, set())
        domains_by_key[key][1].add(rule.service_id)

    for service in catalog.services:
        for source_rule in service.payload:
            parts = source_rule.split(",")
            kind = parts[0].strip() if parts else ""
            if kind in {"DOMAIN", "DOMAIN-SUFFIX"}:
                continue
            if kind in {"IP-CIDR", "IP-CIDR6"}:
                if len(parts) not in {2, 3} or (len(parts) == 3 and parts[2].strip() != "no-resolve"):
                    unsupported.add((service.id, kind, source_rule, "unsupported_ip_rule_options"))
                    reasons.add("unsupported_ip_rule_options")
                    continue
                raw_network = parts[1].strip()
                try:
                    network = ipaddress.ip_network(raw_network, strict=True)
                except ValueError as exc:
                    raise RuntimeError(f"Invalid canonical AI network rule: {service.id}:{source_rule}") from exc
                expected_version = 4 if kind == "IP-CIDR" else 6
                if network.version != expected_version:
                    raise RuntimeError(f"AI network family does not match its rule kind: {service.id}:{source_rule}")
                target = ipv4 if network.version == 4 else ipv6
                target.setdefault(network.with_prefixlen, set()).add(service.id)
                continue
            if kind == "DOMAIN-KEYWORD":
                value = parts[1].strip() if len(parts) == 2 else source_rule
                unsupported.add((service.id, kind, value, "keyword_match_has_no_safe_dns_suffix_equivalent"))
                reasons.add("unsupported_domain_matcher")
                continue
            unsupported.add((service.id, kind or "MALFORMED", source_rule, "rule_kind_has_no_blocking_projection"))
            reasons.add("unsupported_rule_kind")

        for source in service.upstream_rules:
            if isinstance(source, GeositeRuleSource):
                unsupported.add((service.id, "GEOSITE", source.value, "geosite_source_not_materialized_in_service_catalog"))
                reasons.add("unmaterialized_geosite_sources")
            elif isinstance(source, RemoteRuleSource):
                unsupported.add((service.id, "REMOTE_RULESET", source.provider_key, "remote_provider_not_materialized_in_service_catalog"))
                reasons.add("unmaterialized_remote_sources")
            else:
                unsupported.add((service.id, "UNKNOWN_UPSTREAM", type(source).__name__, "unknown_upstream_rule_type"))
                reasons.add("unknown_upstream_source")

    upstream: dict[str, Any] = {"snapshotRefreshedAt": None, "baseUrl": None, "rootLists": []}
    if catalog.adguard_home and catalog.adguard_home.upstream_snapshot_file:
        from .upstream_hosts import load_upstream_host_snapshot

        snapshot_path = catalog.catalog_dir / "sources" / catalog.adguard_home.upstream_snapshot_file
        if snapshot_path.is_file() and not snapshot_path.is_symlink():
            snapshot = load_upstream_host_snapshot(snapshot_path)
            files.append({
                "path": f"internal/config/ai-routing/sources/{catalog.adguard_home.upstream_snapshot_file}",
                "sha256": _sha256(snapshot_path),
            })
            upstream = {
                "snapshotRefreshedAt": snapshot.refreshed_at or None,
                "baseUrl": snapshot.base_url or None,
                "rootLists": list(snapshot.root_lists),
            }
            if not snapshot.refreshed_at:
                reasons.add("upstream_snapshot_not_refreshed")
        else:
            reasons.add("upstream_snapshot_missing")

    rendered_domains = [
        {"match": kind, "value": value, "services": sorted(service_ids)}
        for (kind, _), (value, service_ids) in domains_by_key.items()
    ]
    rendered_domains.sort(key=lambda item: (item["match"], item["value"].casefold(), item["value"]))
    rendered_unsupported = [
        {"serviceId": service_id, "kind": kind, "value": value, "reason": reason}
        for service_id, kind, value, reason in sorted(unsupported)
    ]

    return {
        "schemaVersion": 1,
        "source": {
            "repository": load_distribution(AI_DISTRIBUTION_PATH).repository,
            "files": sorted(files, key=lambda item: item["path"]),
        },
        "upstream": upstream,
        "coverage": {"complete": False, "reasons": sorted(reasons)},
        "domains": rendered_domains,
        "ipv4Cidrs": [
            {"cidr": value, "services": sorted(service_ids)}
            for value, service_ids in sorted(ipv4.items())
        ],
        "ipv6Cidrs": [
            {"cidr": value, "services": sorted(service_ids)}
            for value, service_ids in sorted(ipv6.items())
        ],
        "unsupportedRules": rendered_unsupported,
    }


def render_ai_service_blocking_policy(policy: dict[str, Any] | None = None) -> str:
    return json.dumps(policy or compile_ai_service_blocking_policy(), ensure_ascii=False, indent=2) + "\n"


def write_ai_service_blocking_policy() -> Path:
    path = RULE_DIR / Path(OUTPUT_PATH).name
    path.write_text(render_ai_service_blocking_policy(), encoding="utf-8", newline="\n")
    return path
