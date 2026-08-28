from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from .catalog import load_catalog
from .models import Catalog, GeositeRuleSource
from .settings import INI_MVP_PLAN_PATH
from .upstream_hosts import load_upstream_host_snapshot
from .upstream_sources import load_upstream_source_manifest

_COMMIT_REF = re.compile(r"^[0-9a-fA-F]{40}$")


@dataclass(frozen=True, slots=True)
class CoverageFinding:
    severity: str
    code: str
    message: str


def _find_service(catalog: Catalog, service_id: str):
    return next((service for service in catalog.services if service.id == service_id), None)


def _service_geosites(catalog: Catalog, service_id: str) -> set[str]:
    service = _find_service(catalog, service_id)
    if service is None:
        return set()
    return {
        source.value
        for source in service.upstream_rules
        if isinstance(source, GeositeRuleSource)
    }


def _audit_aggregate_services(catalog: Catalog) -> list[CoverageFinding]:
    findings: list[CoverageFinding] = []
    expected = {
        "ai-other": {"google-deepmind", "category-ai-!cn"},
        "ai-cn-other": {"category-ai-cn"},
    }
    for service_id, geosites in expected.items():
        service = _find_service(catalog, service_id)
        if service is None:
            findings.append(
                CoverageFinding("error", "missing-aggregate", f"Missing aggregate AI service: {service_id}")
            )
            continue
        if service.projections != frozenset({"mihomo"}):
            findings.append(
                CoverageFinding(
                    "error",
                    "aggregate-ownership",
                    f"{service_id} must be Mihomo-only so Python does not duplicate TS-owned INI groups",
                )
            )
        missing = geosites - _service_geosites(catalog, service_id)
        if missing:
            findings.append(
                CoverageFinding(
                    "error",
                    "missing-geosite-coverage",
                    f"{service_id} is missing upstream geosites: {sorted(missing)}",
                )
            )
    if catalog.ai_guard_geosites:
        findings.append(
            CoverageFinding(
                "warning",
                "legacy-ai-guard",
                f"AI guard still rejects broad upstream categories: {list(catalog.ai_guard_geosites)}",
            )
        )
    return findings


def _audit_adguard_snapshot(catalog: Catalog) -> list[CoverageFinding]:
    spec = catalog.adguard_home
    if not spec or not spec.upstream_snapshot_file:
        return []
    snapshot_path = catalog.catalog_dir / spec.upstream_snapshot_file
    snapshot = load_upstream_host_snapshot(snapshot_path)
    if snapshot.refreshed_at:
        return []
    # Snapshot refresh is scheduled externally.  The refresher is a no-op
    # when materialized rules are unchanged, so age alone is not a stale signal.
    return [
        CoverageFinding(
            "warning",
            "missing-adguard-snapshot",
            f"AdGuard upstream snapshot is missing: {snapshot_path}",
        )
    ]


def _audit_ini_ai_other(plan: object) -> list[CoverageFinding]:
    after = plan.get("rules", {}).get("afterLegacy", []) if isinstance(plan, dict) else []
    ai_other_geosites = {
        record.get("value")
        for record in after
        if isinstance(record, dict)
        and record.get("kind") == "geosite"
        and record.get("target") == "🤖 AI Other"
    }
    required_ini_geosites = {"google-deepmind", "category-ai-!cn"}
    if required_ini_geosites.issubset(ai_other_geosites):
        return []
    return [
        CoverageFinding(
            "warning",
            "ini-ai-other-coverage",
            f"TS INI AI Other does not declare all broad geosites: {sorted(required_ini_geosites - ai_other_geosites)}",
        )
    ]


def _audit_remote_classical_url(url: str, managed_by_repo) -> list[CoverageFinding]:
    parsed = urlparse(url)
    parts = parsed.path.strip("/").split("/")
    if parsed.netloc != "raw.githubusercontent.com" or len(parts) < 3:
        return []
    owner, repo, ref = parts[:3]
    repository = f"{owner}/{repo}"
    source = managed_by_repo.get(repository)
    if source is None:
        return []
    if not _COMMIT_REF.fullmatch(ref):
        return [
            CoverageFinding(
                "error",
                "unpinned-upstream-source",
                f"TS INI plan source {repository} is not pinned to an exact commit: {ref}",
            )
        ]
    if ref != source.revision:
        return [
            CoverageFinding(
                "error",
                "ini-upstream-drift",
                f"TS INI plan uses {repository}@{ref[:12]}… but shared manifest locks {source.revision[:12]}…",
            )
        ]
    return []


def _audit_ini_upstream_pins(catalog: Catalog, plan: object) -> list[CoverageFinding]:
    try:
        source_manifest = load_upstream_source_manifest(catalog_dir=catalog.catalog_dir)
    except RuntimeError as exc:
        return [CoverageFinding("error", "invalid-upstream-manifest", str(exc))]
    findings: list[CoverageFinding] = []
    managed_by_repo = source_manifest.by_repository()
    for section in ("beforeLegacy", "afterLegacy"):
        records = plan.get("rules", {}).get(section, []) if isinstance(plan, dict) else []
        for record in records:
            if not isinstance(record, dict) or record.get("kind") != "remote-classical":
                continue
            url = record.get("url")
            if not isinstance(url, str):
                continue
            findings.extend(_audit_remote_classical_url(url, managed_by_repo))
    return findings


def _audit_ini_plan(catalog: Catalog, ini_plan_path: Path) -> list[CoverageFinding]:
    if not ini_plan_path.exists():
        return [
            CoverageFinding(
                "warning",
                "missing-ini-plan",
                f"INI MVP plan not found for cross-authority coverage audit: {ini_plan_path}",
            )
        ]
    try:
        plan = json.loads(ini_plan_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [CoverageFinding("error", "invalid-ini-plan", f"Cannot inspect INI MVP plan: {exc}")]
    return [*_audit_ini_ai_other(plan), *_audit_ini_upstream_pins(catalog, plan)]


def audit_rule_coverage(
    catalog: Catalog | None = None,
    *,
    ini_plan_path: Path = INI_MVP_PLAN_PATH,
) -> tuple[CoverageFinding, ...]:
    """Audit coverage ownership/freshness without mutating generated artifacts."""
    catalog = catalog or load_catalog()
    return tuple(
        [
            *_audit_aggregate_services(catalog),
            *_audit_adguard_snapshot(catalog),
            *_audit_ini_plan(catalog, ini_plan_path),
        ]
    )


def render_coverage_audit(findings: tuple[CoverageFinding, ...]) -> str:
    if not findings:
        return "coverage audit: OK"
    return "\n".join(f"[{item.severity.upper()}] {item.code}: {item.message}" for item in findings)
