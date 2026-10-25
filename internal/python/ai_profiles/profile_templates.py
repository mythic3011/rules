from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Literal, Mapping

from .settings import CATALOG_PATHS, ROOT

OutputFormat = Literal["ini", "yaml"]
PROFILE_TEMPLATE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
DEFAULT_PROFILE_TEMPLATE = "ai-balanced"


@dataclass(frozen=True, slots=True)
class ProfileTemplate:
    id: str
    output_format: OutputFormat
    path: str
    name: str
    description: str
    supports_profile_options: bool
    dns_egress_group: str | None = None


@dataclass(frozen=True, slots=True)
class ProfileTemplateRegistry:
    default_by_format: Mapping[str, str]
    templates: tuple[ProfileTemplate, ...]
    _by_key: Mapping[tuple[str, str], ProfileTemplate]

    @classmethod
    def load(cls) -> ProfileTemplateRegistry:
        path = CATALOG_PATHS.resolve("profile-templates")
        document = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(document, dict) or document.get("schemaVersion") != 1:
            raise RuntimeError("Profile template catalog must use schemaVersion 1")
        entries = document.get("templates")
        defaults = document.get("defaultByFormat")
        if not isinstance(entries, list) or not isinstance(defaults, dict):
            raise RuntimeError("Profile template catalog must define templates and defaults")

        templates: list[ProfileTemplate] = []
        by_key: dict[tuple[str, str], ProfileTemplate] = {}
        for entry in entries:
            if not isinstance(entry, dict):
                raise RuntimeError("Profile template entries must be objects")
            template_id = entry.get("id")
            output_format = entry.get("outputFormat")
            relative_path = entry.get("path")
            name = entry.get("name")
            description = entry.get("description")
            supports_options = entry.get("supportsProfileOptions")
            dns_egress_group = entry.get("dnsEgressGroup")
            if not isinstance(template_id, str) or not PROFILE_TEMPLATE_ID_RE.fullmatch(template_id):
                raise RuntimeError("Profile template ID is invalid")
            if output_format not in {"ini", "yaml"}:
                raise RuntimeError(f"Unsupported profile output format: {output_format}")
            if not isinstance(relative_path, str) or not relative_path:
                raise RuntimeError(f"Profile template path is required: {template_id}")
            if not isinstance(name, str) or not name or not isinstance(description, str):
                raise RuntimeError(f"Profile template metadata is incomplete: {template_id}")
            if not isinstance(supports_options, bool):
                raise RuntimeError(f"Profile template option metadata is invalid: {template_id}")
            if dns_egress_group is not None and (
                output_format != "yaml"
                or not isinstance(dns_egress_group, str)
                or not dns_egress_group
            ):
                raise RuntimeError(f"Profile template DNS egress group is invalid: {template_id}")
            if output_format == "yaml" and not supports_options and dns_egress_group is None:
                raise RuntimeError(f"Static YAML template must declare its DNS egress group: {template_id}")
            source_path = (ROOT / relative_path).resolve()
            if not source_path.is_relative_to(ROOT.resolve()) or not source_path.is_file():
                raise RuntimeError(f"Profile template path is not a checked-in file: {relative_path}")
            expected_suffix = ".ini" if output_format == "ini" else ".yaml"
            if source_path.suffix != expected_suffix:
                raise RuntimeError(f"Profile template path does not match {output_format}: {relative_path}")
            template = ProfileTemplate(
                id=template_id,
                output_format=output_format,
                path=relative_path,
                name=name,
                description=description,
                supports_profile_options=supports_options,
                dns_egress_group=dns_egress_group,
            )
            key = (output_format, template_id)
            if key in by_key:
                raise RuntimeError(f"Duplicate profile template: {output_format}/{template_id}")
            templates.append(template)
            by_key[key] = template

        if set(defaults) != {"ini", "yaml"}:
            raise RuntimeError("Profile template defaults must cover INI and YAML")
        for output_format, default_id in defaults.items():
            if not isinstance(default_id, str) or (output_format, default_id) not in by_key:
                raise RuntimeError(f"Unknown default profile template: {output_format}/{default_id}")
        return cls(
            default_by_format=MappingProxyType(dict(defaults)),
            templates=tuple(templates),
            _by_key=MappingProxyType(by_key),
        )

    def get(self, output_format: OutputFormat, template_id: str) -> ProfileTemplate:
        try:
            return self._by_key[(output_format, template_id)]
        except KeyError as exc:
            raise ValueError(f"Unknown {output_format} profile template: {template_id}") from exc

    def for_format(self, output_format: OutputFormat) -> tuple[ProfileTemplate, ...]:
        return tuple(template for template in self.templates if template.output_format == output_format)


def load_profile_template_registry() -> ProfileTemplateRegistry:
    return ProfileTemplateRegistry.load()
