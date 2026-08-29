from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

DistributionKind = Literal["jsdelivr-github", "github-raw"]
VersionSource = Literal["ref", "sha"]


@dataclass(frozen=True, slots=True)
class DistributionChannel:
    id: str
    type: str
    base_url: str
    priority: int
    enabled: bool
    health_check: str | None
    immutable_revision_support: bool
    version_source: VersionSource


@dataclass(frozen=True, slots=True)
class DistributionCatalog:
    repository: str
    default_ref: str
    manifest_path: str
    channels: tuple[DistributionChannel, ...]

    def channel(self, channel_id: str) -> DistributionChannel:
        for channel in self.channels:
            if channel.id == channel_id:
                return channel
        raise KeyError(f"Unknown distribution channel: {channel_id}")

    def url_for(
        self,
        channel_id: str,
        path: str,
        *,
        ref: str | None = None,
        sha: str = "{sha}",
    ) -> str:
        channel = self.channel(channel_id)
        if not channel.enabled:
            raise KeyError(f"Distribution source is disabled: {channel_id}")
        version = (ref or self.default_ref) if channel.version_source == "ref" else sha
        base = channel.base_url.format(repository=self.repository, version=version)
        return f"{base.rstrip('/')}/{path.lstrip('/')}"

    def resolve(self, source_id: str = "auto") -> tuple[DistributionChannel, ...]:
        candidates = [channel for channel in self.channels if channel.enabled]
        if source_id != "auto":
            return (self.channel(source_id),)
        return tuple(sorted(candidates, key=lambda channel: (channel.priority, channel.id)))

    def base_url(self, channel_id: str, *, ref: str | None = None, sha: str = "{sha}") -> str:
        marker = "__artifact__"
        rendered = self.url_for(channel_id, marker, ref=ref, sha=sha)
        return rendered.removesuffix(f"/{marker}")


def _string(value: object, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"Distribution field must be a non-empty string: {field}")
    return value


def _channel(record: object, field: str) -> DistributionChannel:
    required = {"id", "type", "baseUrl", "priority", "enabled", "healthCheck", "immutableRevisionSupport", "version"}
    if not isinstance(record, dict) or set(record) != required:
        raise RuntimeError(f"Distribution channel has invalid shape: {field}")
    channel_id = _string(record.get("id"), f"{field}.id")
    source_type = _string(record.get("type"), f"{field}.type")
    base_url = _string(record.get("baseUrl"), f"{field}.baseUrl")
    if not base_url.startswith("https://") or "{repository}" not in base_url or "{version}" not in base_url:
        raise RuntimeError(f"Distribution source has invalid URL template: {field}.baseUrl")
    priority = record.get("priority")
    if type(priority) is not int or priority < 0:
        raise RuntimeError(f"Distribution source priority must be a non-negative integer: {field}.priority")
    enabled = record.get("enabled")
    if type(enabled) is not bool:
        raise RuntimeError(f"Distribution source enabled must be boolean: {field}.enabled")
    health_check = record.get("healthCheck")
    if health_check is not None and (not isinstance(health_check, str) or not health_check.startswith("https://")):
        raise RuntimeError(f"Distribution source healthCheck must use HTTPS: {field}.healthCheck")
    immutable = record.get("immutableRevisionSupport")
    if type(immutable) is not bool:
        raise RuntimeError(f"Distribution source immutableRevisionSupport must be boolean: {field}.immutableRevisionSupport")
    version = record.get("version")
    if version not in {"ref", "sha"}:
        raise RuntimeError(f"Unknown distribution version source: {field}.version")
    if source_type not in {"cdn", "github-raw", "mirror"}:
        raise RuntimeError(f"Unknown distribution source type: {field}.type")
    return DistributionChannel(channel_id, source_type, base_url, priority, enabled, health_check, immutable, version)


def load_distribution(path: Path) -> DistributionCatalog:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Distribution catalog is unavailable or invalid: {path}") from exc
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise RuntimeError(f"Unsupported distribution catalog schema: {path}")
    if set(value) != {"schemaVersion", "repository", "defaultRef", "manifestPath", "channels"}:
        raise RuntimeError(f"Distribution catalog has unknown or incomplete shape: {path}")
    raw_channels = value.get("channels")
    if not isinstance(raw_channels, list) or not raw_channels:
        raise RuntimeError("Distribution catalog requires channels")
    channels = tuple(_channel(item, f"channels[{index}]") for index, item in enumerate(raw_channels))
    ids = [channel.id for channel in channels]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Distribution channel IDs must be unique")
    required = {"rolling", "cdn", "raw", "immutable"}
    if not required.issubset(ids):
        raise RuntimeError("Distribution catalog is missing required channels")
    return DistributionCatalog(
        repository=_string(value.get("repository"), "repository"),
        default_ref=_string(value.get("defaultRef"), "defaultRef"),
        manifest_path=_string(value.get("manifestPath"), "manifestPath"),
        channels=channels,
    )


def managed_output_paths(*, include_process_rules: bool = False) -> tuple[str, ...]:
    # Lazy import keeps settings -> distribution config loading acyclic.
    from .catalog import load_catalog
    from .settings import AI_DISTRIBUTION_PATH

    catalog = load_catalog()
    distribution = load_distribution(AI_DISTRIBUTION_PATH)
    paths: list[str] = [
        "cfg/Custom_Clash_AI.ini",
        "cfg/yaml/Custom_Clash_AI.yaml",
        "cfg/yaml/Custom_Clash_AI_Strict.yaml",
    ]
    paths.extend(f"rule/{service.file}" for service in catalog.services if service.payload)
    paths.extend(f"rule/{rule.file}" for rule in catalog.companion_rulesets)
    if include_process_rules:
        paths.extend(f"rule/{rule.file}" for rule in catalog.process_rulesets)
    paths.append(distribution.manifest_path)
    # Preserve semantic declaration order while removing accidental duplicates.
    return tuple(dict.fromkeys(paths))


def managed_git_pathspecs(*, include_process_rules: bool = False) -> tuple[str, ...]:
    from .catalog import load_catalog
    from .settings import AI_DISTRIBUTION_PATH

    catalog = load_catalog()
    distribution = load_distribution(AI_DISTRIBUTION_PATH)
    specs: list[str] = [
        "cfg/Custom_Clash_AI.ini",
        "cfg/yaml/Custom_Clash_AI.yaml",
        "cfg/yaml/Custom_Clash_AI_Strict.yaml",
        ":(glob)rule/AI_*_Classical.yaml",
    ]
    specs.extend(f"rule/{rule.file}" for rule in catalog.companion_rulesets)
    if include_process_rules:
        specs.extend(f"rule/{rule.file}" for rule in catalog.process_rulesets)
    specs.append(distribution.manifest_path)
    return tuple(dict.fromkeys(specs))


def render_distribution_manifest(*, include_process_rules: bool = False) -> str:
    from .settings import AI_DISTRIBUTION_PATH

    distribution = load_distribution(AI_DISTRIBUTION_PATH)
    artifacts = []
    for path in managed_output_paths(include_process_rules=include_process_rules):
        artifacts.append(
            {
                "path": path,
                "urls": {
                    channel.id: distribution.url_for(channel.id, path)
                    for channel in distribution.channels
                },
            }
        )
    return json.dumps(
        {
            "schemaVersion": 1,
            "repository": distribution.repository,
            "ref": distribution.default_ref,
            "artifacts": artifacts,
        },
        ensure_ascii=False,
        indent=2,
    ) + "\n"


def write_distribution_manifest(*, include_process_rules: bool = False) -> Path:
    from .settings import AI_DISTRIBUTION_PATH, ROOT

    distribution = load_distribution(AI_DISTRIBUTION_PATH)
    path = ROOT / distribution.manifest_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        render_distribution_manifest(include_process_rules=include_process_rules),
        encoding="utf-8",
        newline="\n",
    )
    return path
