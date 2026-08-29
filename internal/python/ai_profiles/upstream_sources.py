from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from .settings import AI_CATALOG_DIR, AI_SOURCES_DIR

_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_COMMIT = re.compile(r"^[0-9a-f]{40}$")
_SOURCE_ID = re.compile(r"^[a-z][a-z0-9-]*$")


@dataclass(frozen=True, slots=True)
class UpstreamSource:
    id: str
    label: str
    repository: str
    tracking_ref: str
    revision: str
    raw_base_url: str


@dataclass(frozen=True, slots=True)
class UpstreamSourceManifest:
    path: Path
    sources: tuple[UpstreamSource, ...]

    def by_id(self) -> dict[str, UpstreamSource]:
        return {source.id: source for source in self.sources}

    def by_repository(self) -> dict[str, UpstreamSource]:
        return {source.repository: source for source in self.sources}


def _valid_raw_base_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.netloc)
        and parsed.username is None
        and parsed.password is None
        and not parsed.query
        and not parsed.fragment
    )


def _manifest_path(catalog_dir: Path) -> Path:
    return catalog_dir / "sources" / "upstream-sources.json"


def load_upstream_source_manifest(
    path: Path | None = None,
    *,
    catalog_dir: Path = AI_CATALOG_DIR,
) -> UpstreamSourceManifest:
    manifest_path = path or (AI_SOURCES_DIR if catalog_dir == AI_CATALOG_DIR else catalog_dir / "sources") / "upstream-sources.json"
    try:
        value = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Upstream source manifest is unavailable: {manifest_path}") from exc

    if not isinstance(value, dict) or set(value) != {"schemaVersion", "sources"}:
        raise RuntimeError("Upstream source manifest has an unknown or incomplete shape")
    if value.get("schemaVersion") != 1 or type(value.get("schemaVersion")) is not int:
        raise RuntimeError("Upstream source manifest has an unsupported schema version")
    raw_sources = value.get("sources")
    if not isinstance(raw_sources, dict) or not raw_sources:
        raise RuntimeError("Upstream source manifest must declare at least one source")

    sources: list[UpstreamSource] = []
    repositories: set[str] = set()
    for source_id, raw in raw_sources.items():
        if not isinstance(source_id, str) or not _SOURCE_ID.fullmatch(source_id):
            raise RuntimeError(f"Invalid upstream source id: {source_id!r}")
        if not isinstance(raw, dict) or set(raw) != {
            "label", "repository", "trackingRef", "revision", "rawBaseUrl"
        }:
            raise RuntimeError(f"Upstream source {source_id} has an unknown or incomplete shape")
        label = raw.get("label")
        repository = raw.get("repository")
        tracking_ref = raw.get("trackingRef")
        revision = raw.get("revision")
        raw_base_url = raw.get("rawBaseUrl")
        if not isinstance(label, str) or not label:
            raise RuntimeError(f"Upstream source {source_id} has an invalid label")
        if not isinstance(repository, str) or not _REPOSITORY.fullmatch(repository):
            raise RuntimeError(f"Upstream source {source_id} has an invalid repository")
        if repository in repositories:
            raise RuntimeError(f"Duplicate upstream repository ownership: {repository}")
        repositories.add(repository)
        if not isinstance(tracking_ref, str) or not tracking_ref or any(ch.isspace() for ch in tracking_ref):
            raise RuntimeError(f"Upstream source {source_id} has an invalid trackingRef")
        if not isinstance(revision, str) or not _COMMIT.fullmatch(revision):
            raise RuntimeError(f"Upstream source {source_id} revision must be a lowercase 40-hex commit")
        if not isinstance(raw_base_url, str) or not _valid_raw_base_url(raw_base_url):
            raise RuntimeError(f"Upstream source {source_id} rawBaseUrl must be credential-free HTTPS")
        sources.append(
            UpstreamSource(
                id=source_id,
                label=label,
                repository=repository,
                tracking_ref=tracking_ref,
                revision=revision,
                raw_base_url=raw_base_url.rstrip("/"),
            )
        )

    return UpstreamSourceManifest(path=manifest_path, sources=tuple(sources))


def _fetch_json(url: str) -> object:
    request = Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "mythic3011-rules-upstream-refresh"})
    with urlopen(request, timeout=30) as response:  # noqa: S310 - URL is derived from validated GitHub repository metadata.
        return json.load(response)


def refresh_upstream_source_manifest(
    *,
    catalog_dir: Path = AI_CATALOG_DIR,
    fetch_json: Callable[[str], object] = _fetch_json,
) -> Path:
    """Refresh exact source revisions while keeping the manifest as the reproducibility lock."""
    manifest = load_upstream_source_manifest(catalog_dir=catalog_dir)
    value = json.loads(manifest.path.read_text(encoding="utf-8"))
    changed = False

    for source in manifest.sources:
        owner, repo = source.repository.split("/", 1)
        url = (
            "https://api.github.com/repos/"
            f"{quote(owner, safe='')}/{quote(repo, safe='')}/commits/{quote(source.tracking_ref, safe='')}"
        )
        response = fetch_json(url)
        sha = response.get("sha") if isinstance(response, dict) else None
        if not isinstance(sha, str) or not _COMMIT.fullmatch(sha):
            raise RuntimeError(f"GitHub returned an invalid commit for upstream source {source.id}")
        if sha == source.revision:
            continue
        value["sources"][source.id]["revision"] = sha
        changed = True

    if changed:
        manifest.path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    return manifest.path
