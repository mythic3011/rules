from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal
from urllib.parse import quote
from urllib.request import Request, urlopen

from .catalog import load_catalog
from .models import AdGuardDomainRule, AdGuardHomeSpec
from .settings import AI_CATALOG_DIR

SnapshotKind = Literal["exact", "suffix", "regex"]
FetchText = Callable[[str], str]
_DOMAIN = re.compile(r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")


@dataclass(frozen=True, slots=True)
class SnapshotEntry:
    kind: SnapshotKind
    domain: str
    source_list: str


@dataclass(frozen=True, slots=True)
class UpstreamHostSnapshot:
    refreshed_at: str
    base_url: str
    root_lists: tuple[str, ...]
    entries: tuple[SnapshotEntry, ...]


def _default_fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "mythic3011-rules-ai-profile-generator/1"})
    with urlopen(request, timeout=30) as response:  # noqa: S310 - explicit HTTPS is validated by catalog
        return response.read().decode("utf-8")


def _domain_list_url(base_url: str, list_name: str) -> str:
    # Preserve ! and other valid DLC filename characters while escaping path separators.
    return f"{base_url.rstrip('/')}/{quote(list_name, safe='!@._-')}"


def _strip_comment(raw: str) -> str:
    return raw.split("#", 1)[0].strip()


def _parse_domain_record(line: str) -> tuple[SnapshotKind, str] | None:
    # Attribute annotations apply to domain-list consumers; an unqualified root
    # list still contains the domain itself, so only the domain token is needed.
    token = line.split()[0]
    if token.startswith("regexp:"):
        pattern = token[len("regexp:"):]
        return ("regex", pattern) if pattern else None
    if token.startswith("keyword:"):
        # DLC keyword matching does not have a direct DNS-host equivalent here.
        return None
    if token.startswith("full:"):
        domain = token[5:].rstrip(".")
        if not domain or not _DOMAIN.fullmatch(domain):
            raise RuntimeError(f"Invalid upstream full domain: {token}")
        return "exact", domain
    if token.startswith("include:"):
        return None
    if ":" in token:
        raise RuntimeError(f"Unsupported upstream domain-list rule syntax: {token}")
    domain = token.rstrip(".")
    if not domain or not _DOMAIN.fullmatch(domain):
        raise RuntimeError(f"Invalid upstream domain-list domain: {token}")
    return "suffix", domain


def _nonempty_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        line = _strip_comment(raw)
        if line:
            lines.append(line)
    return lines


def resolve_domain_lists(
    *,
    base_url: str,
    root_lists: tuple[str, ...],
    fetch_text: FetchText = _default_fetch_text,
) -> tuple[SnapshotEntry, ...]:
    """Flatten DLC lists into AdGuard-compatible exact/suffix domains."""
    cache: dict[str, str] = {}
    visiting: set[str] = set()
    emitted: list[SnapshotEntry] = []
    seen: set[tuple[SnapshotKind, str]] = set()

    def fetch_list(list_name: str) -> str:
        text = cache.get(list_name)
        if text is None:
            text = fetch_text(_domain_list_url(base_url, list_name))
            cache[list_name] = text
        return text

    def emit_record(line: str, root_list: str) -> None:
        parsed = _parse_domain_record(line)
        if parsed is None:
            return
        kind, domain = parsed
        key = (kind, domain.casefold())
        if key in seen:
            return
        seen.add(key)
        emitted.append(SnapshotEntry(kind, domain, root_list))

    for root in root_lists:
        if root in visiting:
            raise RuntimeError(f"Upstream domain-list include cycle detected: {root}")
        visiting.add(root)
        stack: list[tuple[str, list[str], int, str]] = [
            (root, _nonempty_lines(fetch_list(root)), 0, root)
        ]
        while stack:
            list_name, lines, index, root_list = stack[-1]
            if index >= len(lines):
                visiting.remove(list_name)
                stack.pop()
                continue
            stack[-1] = (list_name, lines, index + 1, root_list)
            line = lines[index]
            token = line.split()[0]
            if token.startswith("include:"):
                include_name = token[len("include:"):]
                # An attributed include means a filtered subset. Flattening it as
                # the whole source would silently broaden the DNS blocklist.
                if "@" in include_name:
                    raise RuntimeError(
                        f"Attributed upstream include cannot be materialized losslessly: {token}"
                    )
                if include_name in visiting:
                    raise RuntimeError(
                        f"Upstream domain-list include cycle detected: {include_name}"
                    )
                visiting.add(include_name)
                stack.append(
                    (include_name, _nonempty_lines(fetch_list(include_name)), 0, root_list)
                )
                continue
            emit_record(line, root_list)
    return tuple(emitted)


def refresh_upstream_host_snapshot(
    spec: AdGuardHomeSpec | None = None,
    *,
    catalog_dir: Path | None = None,
    fetch_text: FetchText = _default_fetch_text,
    now: datetime | None = None,
) -> Path:
    catalog_dir = catalog_dir or AI_CATALOG_DIR
    if spec is None:
        spec = load_catalog(catalog_dir).adguard_home
    if spec is None or not spec.upstream_snapshot_file or not spec.upstream_base_url or not spec.upstream_lists:
        raise RuntimeError("AdGuard Home upstream snapshot refresh is not configured")

    entries = resolve_domain_lists(
        base_url=spec.upstream_base_url,
        root_lists=spec.upstream_lists,
        fetch_text=fetch_text,
    )
    path = catalog_dir / "sources" / spec.upstream_snapshot_file
    existing = load_upstream_host_snapshot(path)
    if (
        existing.base_url == spec.upstream_base_url
        and existing.root_lists == spec.upstream_lists
        and existing.entries == entries
    ):
        # A scheduled refresh that finds identical materialized coverage must be
        # a no-op; otherwise a timestamp-only change would create daily commits.
        return path

    refreshed_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    document = {
        "schemaVersion": 1,
        "refreshedAt": refreshed_at,
        "baseUrl": spec.upstream_base_url,
        "rootLists": list(spec.upstream_lists),
        "rules": [
            {"kind": entry.kind, "domain": entry.domain, "sourceList": entry.source_list}
            for entry in entries
        ],
    }
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def load_upstream_host_snapshot(path: Path) -> UpstreamHostSnapshot:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return UpstreamHostSnapshot("", "", (), ())
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid AdGuard upstream snapshot: {path}") from exc

    if not isinstance(document, dict) or document.get("schemaVersion") != 1:
        raise RuntimeError(f"Unsupported AdGuard upstream snapshot schema: {path}")
    refreshed_at = document.get("refreshedAt")
    base_url = document.get("baseUrl")
    root_lists = document.get("rootLists")
    rules = document.get("rules")
    if not isinstance(refreshed_at, str) or not isinstance(base_url, str):
        raise RuntimeError(f"Invalid AdGuard upstream snapshot metadata: {path}")
    if not isinstance(root_lists, list) or any(not isinstance(item, str) or not item for item in root_lists):
        raise RuntimeError(f"Invalid AdGuard upstream snapshot rootLists: {path}")
    if not isinstance(rules, list):
        raise RuntimeError(f"Invalid AdGuard upstream snapshot rules: {path}")

    entries: list[SnapshotEntry] = []
    for index, record in enumerate(rules):
        if not isinstance(record, dict) or set(record) != {"kind", "domain", "sourceList"}:
            raise RuntimeError(f"Invalid AdGuard upstream snapshot rule[{index}]: {path}")
        kind = record["kind"]
        domain = record["domain"]
        source_list = record["sourceList"]
        if kind not in {"exact", "suffix", "regex"} or not isinstance(domain, str) or not domain or not isinstance(source_list, str) or not source_list:
            raise RuntimeError(f"Invalid AdGuard upstream snapshot rule[{index}]: {path}")
        entries.append(SnapshotEntry(kind, domain, source_list))

    return UpstreamHostSnapshot(refreshed_at, base_url, tuple(root_lists), tuple(entries))


def snapshot_to_adguard_rules(snapshot: UpstreamHostSnapshot) -> tuple[AdGuardDomainRule, ...]:
    return tuple(
        AdGuardDomainRule(
            kind=entry.kind,
            domain=entry.domain,
            service_id=f"upstream:{entry.source_list}",
            service_group=f"Upstream {entry.source_list}",
            source_rule=f"DLC:{entry.source_list}:{entry.kind}:{entry.domain}",
        )
        for entry in snapshot.entries
    )
