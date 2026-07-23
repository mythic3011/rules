"""Safely compose a public Mihomo profile with a private local overlay.

The public generator remains the authority for routing rules.  A local overlay
can only add private proxies or replace/add named proxy groups; it cannot alter
rules, DNS, providers, or other public profile settings.
"""

from __future__ import annotations

import copy
import os
import tempfile
from pathlib import Path
from typing import Mapping

import yaml


class LocalComposeError(ValueError):
    """Raised when a local overlay is unsafe or cannot be composed."""


_OVERLAY_KEYS = frozenset({"proxies", "proxy-groups"})
_SCALAR_TYPES = (str, int, float, bool, type(None))


def _is_structurally_locked_selector(entry: Mapping[str, object]) -> bool:
    """Recognize a fail-closed selector without relying on its display name.

    The generic Python helper is non-authoritative. Account materialization
    belongs to the TypeScript fail-closed path, which validates the canonical
    candidate, exact local bindings, provenance, and private-output boundary.
    """
    return (
        entry.get("type") == "select"
        and entry.get("proxies") == ["REJECT"]
        and entry.get("empty-fallback") == "REJECT"
    )


def _ensure_safe_yaml_value(value: object, context: str) -> None:
    """Reject non-standard Python objects before passing them to safe_dump."""
    if isinstance(value, _SCALAR_TYPES):
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _ensure_safe_yaml_value(item, f"{context}[{index}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise LocalComposeError(f"{context} mapping keys must be strings")
            _ensure_safe_yaml_value(item, f"{context}.{key}")
        return
    raise LocalComposeError(f"{context} contains an unsafe YAML value")


def _named_entries(value: object, context: str) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise LocalComposeError(f"{context} must be a list")

    names: set[str] = set()
    entries: list[dict[str, object]] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, dict):
            raise LocalComposeError(f"{context}[{index}] must be a mapping")
        name = entry.get("name")
        if not isinstance(name, str) or not name.strip():
            raise LocalComposeError(f"{context}[{index}].name must be a non-empty string")
        if name in names:
            raise LocalComposeError(f"{context} contains duplicate named entry: {name}")
        names.add(name)
        _ensure_safe_yaml_value(entry, f"{context}[{index}]")
        entries.append(entry)
    return entries


def _copy_mapping(value: object, context: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise LocalComposeError(f"{context} must be a mapping")
    _ensure_safe_yaml_value(value, context)
    return copy.deepcopy(value)


def compose_mihomo_config(
    public_config: Mapping[str, object],
    local_overlay: Mapping[str, object],
) -> dict[str, object]:
    """Return a new profile with a strict, private-only local overlay applied.

    ``proxy-groups`` replace public groups with the same name and append new
    groups in overlay order.  ``proxies`` are append-only; a duplicate proxy
    name is rejected rather than silently replacing a public proxy.
    """
    public = _copy_mapping(public_config, "public config")
    overlay = _copy_mapping(local_overlay, "local overlay")

    unknown_keys = set(overlay) - _OVERLAY_KEYS
    if unknown_keys:
        rendered = ", ".join(sorted(unknown_keys))
        raise LocalComposeError(f"local overlay contains unsupported keys: {rendered}")

    public_groups = _named_entries(public.get("proxy-groups", []), "public proxy-groups")
    overlay_groups = _named_entries(overlay.get("proxy-groups", []), "local proxy-groups")
    public_proxies = _named_entries(public.get("proxies", []), "public proxies")
    overlay_proxies = _named_entries(overlay.get("proxies", []), "local proxies")

    public_proxy_names = {str(entry["name"]) for entry in public_proxies}
    for entry in overlay_proxies:
        name = str(entry["name"])
        if name in public_proxy_names:
            raise LocalComposeError(f"local proxies duplicate public named entry: {name}")

    public_group_by_name = {str(entry["name"]): entry for entry in public_groups}
    for entry in overlay_groups:
        name = str(entry["name"])
        public_group = public_group_by_name.get(name)
        if public_group is not None and _is_structurally_locked_selector(public_group):
            raise LocalComposeError(
                "local overlays cannot replace structurally locked selectors; "
                "use the validated TypeScript private materializer"
            )

    replacement_groups = {str(entry["name"]): entry for entry in overlay_groups}
    merged_groups = [
        replacement_groups.pop(str(entry["name"]), entry)
        for entry in public_groups
    ]
    merged_groups.extend(replacement_groups.values())

    if merged_groups:
        public["proxy-groups"] = merged_groups
    if public_proxies or overlay_proxies:
        public["proxies"] = [*public_proxies, *overlay_proxies]
    return public


def dump_yaml(value: Mapping[str, object]) -> str:
    """Render a deterministic, safe YAML document for a private profile."""
    copied = _copy_mapping(value, "YAML value")
    return yaml.safe_dump(
        copied,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=1000,
    )


def write_private_yaml(path: Path | str, value: Mapping[str, object]) -> None:
    """Atomically write private YAML with owner-only permissions."""
    destination = Path(path)
    if destination.exists() and destination.is_dir():
        raise LocalComposeError(f"private YAML destination is a directory: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    rendered = dump_yaml(value)

    file_descriptor: int | None = None
    temporary_path: Path | None = None
    try:
        file_descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{destination.name}.",
            suffix=".tmp",
            dir=destination.parent,
        )
        temporary_path = Path(temporary_name)
        os.fchmod(file_descriptor, 0o600)
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as stream:
            file_descriptor = None
            stream.write(rendered)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_path, destination)
        try:
            directory_descriptor = os.open(destination.parent, os.O_RDONLY)
        except OSError:
            directory_descriptor = None
        if directory_descriptor is not None:
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
    except OSError as exc:
        raise LocalComposeError(f"cannot write private YAML: {destination}") from exc
    finally:
        if file_descriptor is not None:
            os.close(file_descriptor)
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
