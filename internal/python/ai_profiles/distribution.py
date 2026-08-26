from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

DistributionKind = Literal["jsdelivr-github", "github-raw"]
VersionSource = Literal["ref", "sha"]


class DistributionStrategy(Protocol):
    def url_for(self, path: str, *, repository: str, ref: str, sha: str) -> str: ...


@dataclass(frozen=True, slots=True)
class JsDelivrGitHubStrategy:
    host: str
    version_source: VersionSource

    def url_for(self, path: str, *, repository: str, ref: str, sha: str) -> str:
        version = ref if self.version_source == "ref" else sha
        return f"https://{self.host}/gh/{repository}@{version}/{path}"


@dataclass(frozen=True, slots=True)
class GitHubRawStrategy:
    host: str
    version_source: VersionSource

    def url_for(self, path: str, *, repository: str, ref: str, sha: str) -> str:
        version = ref if self.version_source == "ref" else sha
        return f"https://{self.host}/{repository}/{version}/{path}"


@dataclass(frozen=True, slots=True)
class DistributionChannel:
    id: str
    strategy: DistributionStrategy


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
        return self.channel(channel_id).strategy.url_for(
            path,
            repository=self.repository,
            ref=ref or self.default_ref,
            sha=sha,
        )

    def base_url(self, channel_id: str, *, ref: str | None = None, sha: str = "{sha}") -> str:
        marker = "__artifact__"
        rendered = self.url_for(channel_id, marker, ref=ref, sha=sha)
        return rendered.removesuffix(f"/{marker}")


def _string(value: object, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"Distribution field must be a non-empty string: {field}")
    return value


def _channel(record: object, field: str) -> DistributionChannel:
    if not isinstance(record, dict) or set(record) != {"id", "kind", "host", "version"}:
        raise RuntimeError(f"Distribution channel has invalid shape: {field}")
    channel_id = _string(record.get("id"), f"{field}.id")
    host = _string(record.get("host"), f"{field}.host")
    kind = record.get("kind")
    version = record.get("version")
    if version not in {"ref", "sha"}:
        raise RuntimeError(f"Unknown distribution version source: {field}.version")
    if kind == "jsdelivr-github":
        strategy: DistributionStrategy = JsDelivrGitHubStrategy(host, version)
    elif kind == "github-raw":
        strategy = GitHubRawStrategy(host, version)
    else:
        raise RuntimeError(f"Unknown distribution strategy: {field}.kind")
    return DistributionChannel(channel_id, strategy)


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
