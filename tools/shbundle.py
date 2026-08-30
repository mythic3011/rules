#!/usr/bin/env python3
"""Build-time POSIX shell bundler driven by repository manifest data."""
from __future__ import annotations

import argparse
import hashlib
import heapq
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

TOOLS_DIR = Path(__file__).resolve().parent
DEFAULT_ROOT = TOOLS_DIR.parent


class ShbundleError(Exception):
    """User-facing builder/validation error."""


@dataclass(frozen=True)
class ModuleSpec:
    name: str
    path: str
    depends: tuple[str, ...]
    before: tuple[str, ...]
    after: tuple[str, ...]


@dataclass(frozen=True)
class AppSpec:
    name: str
    entry: str
    depends: tuple[str, ...]
    output: str
    manifest: str | None
    checksum: str | None


@dataclass(frozen=True)
class BundleContract:
    schema_version: int
    module_begin: str
    module_end: str
    name_pattern: re.Pattern[str]
    set_options_pattern: re.Pattern[str]
    main_dispatch_pattern: re.Pattern[str]
    function_pattern: re.Pattern[str]
    side_effect_checks: tuple[tuple[str, re.Pattern[str]], ...]
    allowed_top_keys: frozenset[str]
    allowed_module_keys: frozenset[str]
    allowed_app_keys: frozenset[str]


@dataclass(frozen=True)
class Manifest:
    schema_version: int
    generated_root: str
    modules: dict[str, ModuleSpec]
    apps: dict[str, AppSpec]
    root: Path
    path: Path
    relpath: str
    contract: BundleContract


def _unique_object_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    obj: dict[str, Any] = {}
    for key, value in pairs:
        if key in obj:
            raise ShbundleError(f"duplicate JSON key: {key}")
        obj[key] = value
    return obj


def _require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ShbundleError(f"invalid manifest: {label} must be an object")
    return value


def _require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ShbundleError(f"invalid manifest: {label} must be a non-empty string")
    return value


def _require_name(value: str, label: str, contract: BundleContract) -> str:
    if not contract.name_pattern.match(value):
        raise ShbundleError(
            f"invalid manifest: {label} {value!r} must match {contract.name_pattern.pattern}"
        )
    return value


def _string_set(value: Any, label: str) -> frozenset[str]:
    if not isinstance(value, list) or not value:
        raise ShbundleError(f"invalid manifest: {label} must be a non-empty array of strings")
    values = [_require_string(item, f"{label}[{index}]") for index, item in enumerate(value)]
    if len(values) != len(set(values)):
        raise ShbundleError(f"invalid manifest: {label} contains duplicate keys")
    return frozenset(values)


def _compile_pattern(value: Any, label: str) -> re.Pattern[str]:
    pattern = _require_string(value, label)
    try:
        return re.compile(pattern)
    except re.error as exc:
        raise ShbundleError(f"invalid manifest: {label} has invalid regex: {exc}") from exc


def load_contract(data: Mapping[str, Any]) -> BundleContract:
    raw = _require_object(data.get("contract"), "contract")
    schema_version = raw.get("schemaVersion")
    if type(schema_version) is not int or schema_version < 1:
        raise ShbundleError("invalid manifest: contract.schemaVersion must be a positive integer")
    markers = _require_object(raw.get("markers"), "contract.markers")
    patterns = _require_object(raw.get("patterns"), "contract.patterns")
    checks = raw.get("sideEffectChecks")
    if not isinstance(checks, list):
        raise ShbundleError("invalid manifest: contract.sideEffectChecks must be an array")
    side_effect_checks: list[tuple[str, re.Pattern[str]]] = []
    for index, item in enumerate(checks):
        check = _require_object(item, f"contract.sideEffectChecks[{index}]")
        label = _require_string(check.get("label"), f"contract.sideEffectChecks[{index}].label")
        side_effect_checks.append(
            (label, _compile_pattern(check.get("pattern"), f"contract.sideEffectChecks[{index}].pattern"))
        )
    allowed = _require_object(raw.get("allowedKeys"), "contract.allowedKeys")
    return BundleContract(
        schema_version=schema_version,
        module_begin=_require_string(markers.get("moduleBegin"), "contract.markers.moduleBegin"),
        module_end=_require_string(markers.get("moduleEnd"), "contract.markers.moduleEnd"),
        name_pattern=_compile_pattern(patterns.get("name"), "contract.patterns.name"),
        set_options_pattern=_compile_pattern(patterns.get("setOptions"), "contract.patterns.setOptions"),
        main_dispatch_pattern=_compile_pattern(patterns.get("mainDispatch"), "contract.patterns.mainDispatch"),
        function_pattern=_compile_pattern(patterns.get("function"), "contract.patterns.function"),
        side_effect_checks=tuple(side_effect_checks),
        allowed_top_keys=_string_set(allowed.get("root"), "contract.allowedKeys.root"),
        allowed_module_keys=_string_set(allowed.get("module"), "contract.allowedKeys.module"),
        allowed_app_keys=_string_set(allowed.get("app"), "contract.allowedKeys.app"),
    )


def _string_tuple(value: Any, label: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ShbundleError(f"invalid manifest: {label} must be an array of strings")
    seen: set[str] = set()
    items: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item:
            raise ShbundleError(
                f"invalid manifest: {label}[{index}] must be a non-empty string"
            )
        if item in seen:
            continue
        seen.add(item)
        items.append(item)
    return tuple(items)


def _unknown_keys(value: Mapping[str, Any], allowed: frozenset[str], label: str) -> None:
    extra = sorted(set(value) - allowed)
    if extra:
        raise ShbundleError(
            f"invalid manifest: {label} has unknown keys: {', '.join(extra)}"
        )


def infer_root(manifest_path: Path) -> Path:
    """Resolve repository root from a manifest path.

    Paths inside the manifest are repository-relative. A manifest living at
    ``<root>/shell/manifest.json`` therefore uses ``<root>``, not ``shell/``.
    """
    resolved = manifest_path.resolve()
    parent = resolved.parent
    if parent.name == "shell":
        return parent.parent
    return parent


def default_manifest_path() -> Path:
    candidates: list[Path] = []
    for candidate in sorted(DEFAULT_ROOT.glob("*/manifest.json")):
        if not candidate.is_file():
            continue
        try:
            data = load_json(candidate)
        except ShbundleError:
            continue
        if isinstance(data.get("modules"), dict) and isinstance(data.get("apps"), dict):
            candidates.append(candidate)
    if len(candidates) != 1:
        found = ", ".join(str(path) for path in candidates) or "none"
        raise ShbundleError(f"unable to discover unique bundle manifest: {found}")
    return candidates[0]


def resolve_manifest_path(manifest: str | os.PathLike[str] | None) -> Path:
    if manifest is None:
        return default_manifest_path()
    path = Path(manifest)
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def posix_relpath(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def _declared_path(value: str, label: str) -> str:
    text = _require_string(value, label).replace("\\", "/")
    if text.startswith("/") or text.startswith("~"):
        raise ShbundleError(f"invalid manifest: {label} must be a relative path")
    parts: list[str] = []
    for part in text.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if not parts:
                raise ShbundleError(
                    f"invalid manifest: {label} escapes the repository root"
                )
            parts.pop()
            continue
        parts.append(part)
    if not parts:
        raise ShbundleError(f"invalid manifest: {label} must be a relative path")
    return "/".join(parts)


def _inside(path: Path, container: Path) -> bool:
    path = path.resolve()
    container = container.resolve()
    return path == container or container in path.parents


def load_json(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ShbundleError(f"invalid manifest: cannot read {path}: {exc}") from exc
    try:
        value = json.loads(raw, object_pairs_hook=_unique_object_pairs)
    except ShbundleError:
        raise
    except json.JSONDecodeError as exc:
        raise ShbundleError(f"invalid manifest: {exc}") from exc
    return _require_object(value, "root")


def load_manifest(manifest: str | os.PathLike[str] | None = None) -> Manifest:
    path = resolve_manifest_path(manifest)
    if not path.is_file():
        raise ShbundleError(f"invalid manifest: file not found: {path}")
    root = infer_root(path)
    data = load_json(path)
    contract = load_contract(data)
    _unknown_keys(data, contract.allowed_top_keys, "root")

    schema_version = data.get("schemaVersion")
    if schema_version != contract.schema_version:
        raise ShbundleError(
            f"invalid manifest: schemaVersion must be {contract.schema_version}"
        )

    generated_root = _declared_path(data.get("generatedRoot"), "generatedRoot")
    modules_raw = _require_object(data.get("modules", {}), "modules")
    apps_raw = _require_object(data.get("apps", {}), "apps")

    modules: dict[str, ModuleSpec] = {}
    paths_to_modules: dict[str, str] = {}
    for name, spec in modules_raw.items():
        _require_name(name, "module name", contract)
        spec_obj = _require_object(spec, f"modules.{name}")
        _unknown_keys(spec_obj, contract.allowed_module_keys, f"modules.{name}")
        declared_path = _declared_path(spec_obj.get("path"), f"modules.{name}.path")
        if declared_path in paths_to_modules:
            raise ShbundleError(
                "duplicate module path: "
                f"{declared_path} ({paths_to_modules[declared_path]}, {name})"
            )
        paths_to_modules[declared_path] = name
        modules[name] = ModuleSpec(
            name=name,
            path=declared_path,
            depends=_string_tuple(spec_obj.get("depends"), f"modules.{name}.depends"),
            before=_string_tuple(spec_obj.get("before"), f"modules.{name}.before"),
            after=_string_tuple(spec_obj.get("after"), f"modules.{name}.after"),
        )

    apps: dict[str, AppSpec] = {}
    outputs: dict[str, str] = {}
    for name, spec in apps_raw.items():
        _require_name(name, "app name", contract)
        spec_obj = _require_object(spec, f"apps.{name}")
        _unknown_keys(spec_obj, contract.allowed_app_keys, f"apps.{name}")
        output = _declared_path(spec_obj.get("output"), f"apps.{name}.output")
        if output in outputs:
            raise ShbundleError(
                f"duplicate output path: {output} (apps: {outputs[output]}, {name})"
            )
        outputs[output] = name
        apps[name] = AppSpec(
            name=name,
            entry=_declared_path(spec_obj.get("entry"), f"apps.{name}.entry"),
            depends=_string_tuple(spec_obj.get("depends"), f"apps.{name}.depends"),
            output=output,
            manifest=(
                _declared_path(spec_obj["manifest"], f"apps.{name}.manifest")
                if spec_obj.get("manifest") is not None
                else None
            ),
            checksum=(
                _declared_path(spec_obj["checksum"], f"apps.{name}.checksum")
                if spec_obj.get("checksum") is not None
                else None
            ),
        )

    loaded = Manifest(
        schema_version=schema_version,
        generated_root=generated_root,
        modules=modules,
        apps=apps,
        root=root,
        path=path,
        relpath=posix_relpath(path, root),
        contract=contract,
    )
    validate_manifest(loaded)
    return loaded


_DEFAULT_CONTRACT: BundleContract | None = None


def default_contract() -> BundleContract:
    global _DEFAULT_CONTRACT
    if _DEFAULT_CONTRACT is None:
        _DEFAULT_CONTRACT = load_contract(load_json(default_manifest_path()))
    return _DEFAULT_CONTRACT


def _module_file(manifest: Manifest, module: ModuleSpec) -> Path:
    return (manifest.root / module.path).resolve()


def _app_output(manifest: Manifest, app: AppSpec) -> Path:
    return (manifest.root / app.output).resolve()


def _generated_root(manifest: Manifest) -> Path:
    return (manifest.root / manifest.generated_root).resolve()


def validate_manifest(manifest: Manifest) -> None:
    generated_root = _generated_root(manifest)
    if not _inside(generated_root, manifest.root):
        raise ShbundleError(
            f"output escapes generatedRoot: {manifest.generated_root}"
        )

    for module in manifest.modules.values():
        for dep in module.depends:
            if dep not in manifest.modules:
                raise ShbundleError(
                    f"unknown dependency: {dep!r} (referenced by module {module.name!r})"
                )
        for rel in module.before:
            if rel not in manifest.modules:
                raise ShbundleError(
                    f"unknown before/after reference: {rel!r} "
                    f"(module {module.name!r} before)"
                )
        for rel in module.after:
            if rel not in manifest.modules:
                raise ShbundleError(
                    f"unknown before/after reference: {rel!r} "
                    f"(module {module.name!r} after)"
                )
        path = _module_file(manifest, module)
        if not _inside(path, manifest.root):
            raise ShbundleError(f"missing module path: {module.name} ({module.path})")
        if not path.is_file():
            raise ShbundleError(f"missing module path: {module.name} ({module.path})")

    for app in manifest.apps.values():
        for dep in app.depends:
            if dep not in manifest.modules:
                raise ShbundleError(
                    f"unknown dependency: {dep!r} (referenced by app {app.name!r})"
                )
        entry_path = (manifest.root / app.entry).resolve()
        if not _inside(entry_path, manifest.root) or not entry_path.is_file():
            raise ShbundleError(
                f"app {app.name!r} has no valid entrypoint: {app.entry}"
            )
        if entry_module_name(manifest, app) is None:
            raise ShbundleError(
                f"app {app.name!r} has no valid entrypoint: {app.entry}"
            )
        output = _app_output(manifest, app)
        generated_root = _generated_root(manifest)
        if not _inside(output, generated_root) or output == generated_root:
            raise ShbundleError(f"output escapes generatedRoot: {app.output}")
        if not _inside(output, manifest.root):
            raise ShbundleError(f"output escapes generatedRoot: {app.output}")
        for label, declared in (("manifest", app.manifest), ("checksum", app.checksum)):
            if declared is None:
                continue
            metadata_path = (manifest.root / declared).resolve()
            if not _inside(metadata_path, generated_root) or not _inside(metadata_path, manifest.root):
                raise ShbundleError(f"{label} escapes generatedRoot: {declared}")
        if (app.manifest is None) != (app.checksum is None):
            raise ShbundleError(f"app {app.name!r} must define both manifest and checksum")

    if manifest.modules:
        _kahn_order(_manifest_requires(manifest))

    entry_names = {
        name
        for app in manifest.apps.values()
        for name in [entry_module_name(manifest, app)]
        if name is not None
    }
    functions: dict[str, list[str]] = {}
    for name, module in sorted(manifest.modules.items()):
        source = read_module_source(manifest, module)
        if name not in entry_names:
            if toplevel_main_dispatch(source, manifest.contract):
                raise ShbundleError(
                    f'non-entry module {name!r} invokes main "$@"'
                )
            effects = toplevel_side_effects(source, manifest.contract)
            if effects:
                raise ShbundleError(
                    f"top-level side effect in non-entry module {name!r}: {effects[0]}"
                )
        if name in entry_names:
            continue
        for func in exported_functions(source, manifest.contract):
            functions.setdefault(func, []).append(name)
    for func, owners in sorted(functions.items()):
        unique_owners = list(dict.fromkeys(owners))
        if len(unique_owners) > 1:
            raise ShbundleError(
                f"duplicate function name {func!r} in modules: {', '.join(unique_owners)}"
            )

    for app in sorted(manifest.apps, key=lambda name: name):
        validate_app(manifest, app)


def entry_module_name(manifest: Manifest, app: AppSpec) -> str | None:
    matches = [
        name for name, module in manifest.modules.items() if module.path == app.entry
    ]
    if len(matches) != 1:
        return None
    return matches[0]


def collect_included(manifest: Manifest, app: AppSpec) -> tuple[set[str], str]:
    entry = entry_module_name(manifest, app)
    if entry is None:
        raise ShbundleError(
            f"app {app.name!r} has no valid entrypoint: {app.entry}"
        )
    included: set[str] = set()
    stack = list(app.depends) + [entry]
    while stack:
        name = stack.pop()
        if name in included:
            continue
        if name not in manifest.modules:
            raise ShbundleError(
                f"unknown dependency: {name!r} (referenced by app {app.name!r})"
            )
        included.add(name)
        module = manifest.modules[name]
        for dep in module.depends:
            if dep not in manifest.modules:
                raise ShbundleError(
                    f"unknown dependency: {dep!r} (referenced by module {name!r})"
                )
            stack.append(dep)
    return included, entry


def _requires_edges(manifest: Manifest, included: Iterable[str], entry: str) -> dict[str, set[str]]:
    """Return name -> modules it requires to appear first."""
    included_set = set(included)
    requires: dict[str, set[str]] = {name: set() for name in included_set}
    for name in included_set:
        module = manifest.modules[name]
        for dep in module.depends:
            if dep in included_set:
                requires[name].add(dep)
        for other in module.after:
            if other in included_set:
                requires[name].add(other)
        for other in module.before:
            if other in included_set:
                requires[other].add(name)
        if name != entry:
            requires[entry].add(name)
    return requires


def _manifest_requires(manifest: Manifest) -> dict[str, set[str]]:
    requires: dict[str, set[str]] = {name: set() for name in manifest.modules}
    for name, module in manifest.modules.items():
        for dep in module.depends:
            requires[name].add(dep)
        for other in module.after:
            requires[name].add(other)
        for other in module.before:
            requires[other].add(name)
    return requires


def _kahn_order(requires: Mapping[str, set[str]]) -> list[str]:
    nodes = set(requires)
    successors: dict[str, set[str]] = {name: set() for name in nodes}
    indegree: dict[str, int] = {name: 0 for name in nodes}
    for name, deps in requires.items():
        for dep in deps:
            if dep not in nodes:
                continue
            if name not in successors[dep]:
                successors[dep].add(name)
                indegree[name] += 1

    ready = [name for name, degree in indegree.items() if degree == 0]
    heapq.heapify(ready)
    order: list[str] = []
    while ready:
        name = heapq.heappop(ready)
        order.append(name)
        for nxt in sorted(successors[name]):
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                heapq.heappush(ready, nxt)

    if len(order) != len(nodes):
        remaining = nodes - set(order)
        cycle = _find_cycle(requires, remaining) or _find_cycle(requires, nodes)
        if cycle:
            raise ShbundleError(f"dependency cycle: {' -> '.join(cycle)}")
        raise ShbundleError("unorderable modules: " + ", ".join(sorted(remaining)))
    return order


def _find_cycle(requires: Mapping[str, set[str]], remaining: set[str]) -> list[str] | None:
    adj = {name: sorted(requires.get(name, set()) & remaining) for name in remaining}
    visiting: dict[str, bool] = {}
    stack: list[str] = []

    def dfs(node: str) -> list[str] | None:
        visiting[node] = True
        stack.append(node)
        for nxt in adj.get(node, []):
            state = visiting.get(nxt)
            if state is None:
                found = dfs(nxt)
                if found:
                    return found
            elif state:
                start = stack.index(nxt)
                return stack[start:] + [nxt]
        stack.pop()
        visiting[node] = False
        return None

    for start in sorted(remaining):
        if start not in visiting:
            found = dfs(start)
            if found:
                return found
    return None


def topological_order(manifest: Manifest, app_name: str) -> tuple[list[str], str, set[str]]:
    if app_name not in manifest.apps:
        known = ", ".join(sorted(manifest.apps)) or "(none)"
        raise ShbundleError(f"unknown app: {app_name!r}; choose one of: {known}")
    app = manifest.apps[app_name]
    included, entry = collect_included(manifest, app)
    order = _kahn_order(_requires_edges(manifest, included, entry))
    return order, entry, included


def _strip_shell_comment(line: str) -> str:
    in_single = False
    in_double = False
    escaped = False
    chars: list[str] = []
    for ch in line:
        if in_single:
            chars.append(ch)
            if ch == "'":
                in_single = False
            continue
        if in_double:
            chars.append(ch)
            if escaped:
                escaped = False
                continue
            if ch == "\\":
                escaped = True
                continue
            if ch == '"':
                in_double = False
            continue
        if ch == "'":
            in_single = True
            chars.append(ch)
            continue
        if ch == '"':
            in_double = True
            chars.append(ch)
            continue
        if ch == "#":
            break
        chars.append(ch)
    return "".join(chars)


def _brace_delta(line: str) -> int:
    stripped = _strip_shell_comment(line)
    return stripped.count("{") - stripped.count("}")


def iter_toplevel_lines(source: str) -> Iterable[str]:
    depth = 0
    for raw in source.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if depth <= 0:
            code = _strip_shell_comment(stripped).strip()
            if code:
                yield code
        depth += _brace_delta(raw)
        if depth < 0:
            depth = 0


def strip_module_source(text: str, contract: BundleContract | None = None) -> str:
    contract = contract or default_contract()
    if text.startswith("\ufeff"):
        text = text[1:]
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    index = 0
    if index < len(lines) and lines[index].startswith("#!"):
        index += 1
    while index < len(lines) and not lines[index].strip():
        index += 1
    if index < len(lines) and contract.set_options_pattern.match(lines[index].strip()):
        index += 1
    while index < len(lines) and not lines[index].strip():
        index += 1
    kept: list[str] = []
    depth = 0
    for line in lines[index:]:
        stripped = line.strip()
        if depth <= 0 and contract.main_dispatch_pattern.match(stripped):
            depth += _brace_delta(line)
            if depth < 0:
                depth = 0
            continue
        kept.append(line)
        depth += _brace_delta(line)
        if depth < 0:
            depth = 0
    return "\n".join(kept).rstrip()


def read_module_source(manifest: Manifest, module: ModuleSpec) -> str:
    path = _module_file(manifest, module)
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ShbundleError(f"missing module path: {module.name} ({module.path})") from exc


def exported_functions(source: str, contract: BundleContract | None = None) -> list[str]:
    contract = contract or default_contract()
    names: list[str] = []
    for line in iter_toplevel_lines(source):
        match = contract.function_pattern.match(line)
        if not match:
            continue
        names.append(match.group(1) or match.group(2))
    return names


def toplevel_main_dispatch(source: str, contract: BundleContract | None = None) -> bool:
    contract = contract or default_contract()
    return any(contract.main_dispatch_pattern.match(line) for line in iter_toplevel_lines(source))


def toplevel_side_effects(source: str, contract: BundleContract | None = None) -> list[str]:
    contract = contract or default_contract()
    hits: list[str] = []
    seen: set[str] = set()
    for line in iter_toplevel_lines(source):
        if (contract.main_dispatch_pattern.match(line)
                or contract.set_options_pattern.match(line)
                or contract.function_pattern.match(line)):
            continue
        for label, pattern in contract.side_effect_checks:
            if label in seen:
                continue
            if pattern.search(line):
                seen.add(label)
                hits.append(label)
    return hits


def validate_app(manifest: Manifest, app_name: str) -> tuple[list[str], str, set[str]]:
    order, entry, included = topological_order(manifest, app_name)
    functions: dict[str, list[str]] = {}
    for name in order:
        module = manifest.modules[name]
        source = read_module_source(manifest, module)
        if name != entry and toplevel_main_dispatch(source, manifest.contract):
            raise ShbundleError(
                f'non-entry module {name!r} invokes main "$@"'
            )
        if name != entry:
            effects = toplevel_side_effects(source, manifest.contract)
            if effects:
                raise ShbundleError(
                    f"top-level side effect in non-entry module {name!r}: {effects[0]}"
                )
        for func in exported_functions(source, manifest.contract):
            functions.setdefault(func, []).append(name)
    for func, owners in sorted(functions.items()):
        unique_owners = list(dict.fromkeys(owners))
        if len(unique_owners) > 1:
            raise ShbundleError(
                f"duplicate function name {func!r} in modules: {', '.join(unique_owners)}"
            )
    return order, entry, included


def render_bundle(manifest: Manifest, app_name: str) -> str:
    order, _entry, _included = validate_app(manifest, app_name)
    chunks = [
        "#!/bin/sh",
        "set -eu",
        "",
        "# GENERATED FILE — DO NOT EDIT",
        f"# App: {app_name}",
        f"# Manifest: {manifest.relpath}",
        "",
    ]
    for name in order:
        source = strip_module_source(
            read_module_source(manifest, manifest.modules[name]), manifest.contract
        )
        chunks.append(manifest.contract.module_begin.format(name=name))
        if source:
            chunks.append(source)
        chunks.append(manifest.contract.module_end.format(name=name))
        chunks.append("")
    chunks.append('main "$@"')
    chunks.append("")
    return "\n".join(chunks)


def atomic_write_text(path: Path, content: str, mode: int = 0o755) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".shbundle-", suffix=".tmp", dir=str(path.parent))
    tmp_path: Path | None = Path(tmp)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_path, mode)
        os.replace(tmp_path, path)
        tmp_path = None
    finally:
        if tmp_path is not None:
            try:
                tmp_path.unlink()
            except OSError:
                pass


def build_app(manifest: Manifest, app_name: str) -> Path:
    app = manifest.apps.get(app_name)
    if app is None:
        known = ", ".join(sorted(manifest.apps)) or "(none)"
        raise ShbundleError(f"unknown app: {app_name!r}; choose one of: {known}")
    content = render_bundle(manifest, app_name)
    output = _app_output(manifest, app)
    atomic_write_text(output, content)
    if app.manifest and app.checksum:
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        metadata = {
            "artifact": output.relative_to(manifest.root).as_posix(),
            "schemaVersion": 1,
            "buildFormat": "posix-shell-bundle",
            "sha256": digest,
        }
        atomic_write_text(
            (manifest.root / app.manifest).resolve(),
            json.dumps(metadata, indent=2, sort_keys=True) + "\n",
            mode=0o644,
        )
        atomic_write_text(
            (manifest.root / app.checksum).resolve(),
            f"{digest}  {output.name}\n",
            mode=0o644,
        )
    return output


def build_all(manifest: Manifest) -> list[Path]:
    written: list[Path] = []
    for name in sorted(manifest.apps):
        written.append(build_app(manifest, name))
    return written


def format_graph(manifest: Manifest, app_name: str) -> str:
    order, entry, included = topological_order(manifest, app_name)
    app = manifest.apps[app_name]
    lines = [
        f"app: {app.name}",
        f"output: {app.output}",
        f"entry: {entry}",
        f"order: {', '.join(order)}",
    ]
    constraints: set[str] = set()
    for name in included:
        module = manifest.modules[name]
        for dep in module.depends:
            if dep in included:
                constraints.add(f"{name} -> {dep}")
        for other in module.after:
            if other in included:
                constraints.add(f"{name} -> {other}")
        for other in module.before:
            if other in included:
                constraints.add(f"{other} -> {name}")
    if constraints:
        lines.append("constraints:")
        for item in sorted(constraints):
            lines.append(f"  {item}")
    return "\n".join(lines) + "\n"


def format_list(manifest: Manifest) -> str:
    lines = ["modules:"]
    for name in sorted(manifest.modules):
        module = manifest.modules[name]
        extra = ""
        if module.depends:
            extra = f"  depends={','.join(module.depends)}"
        lines.append(f"  {name}  {module.path}{extra}")
    lines.append("apps:")
    for name in sorted(manifest.apps):
        app = manifest.apps[name]
        extra = ""
        if app.depends:
            extra = f"  depends={','.join(app.depends)}"
        lines.append(f"  {name}  {app.output}  entry={app.entry}{extra}")
    return "\n".join(lines) + "\n"


def _parser() -> argparse.ArgumentParser:
    shared = argparse.ArgumentParser(add_help=False)
    shared.add_argument(
        "--manifest",
        default=None,
        help="manifest path (default: discovered from repository bundle data)",
    )
    parser = argparse.ArgumentParser(
        prog="shbundle.py",
        description="Deterministic POSIX shell bundle builder",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", parents=[shared], help="build one app or all apps")
    build.add_argument("app", nargs="?", default=None, help="app name from the manifest")
    build.add_argument("--all", action="store_true", help="build every app")

    sub.add_parser("check", parents=[shared], help="validate the manifest and sources")
    graph = sub.add_parser("graph", parents=[shared], help="print an app dependency graph")
    graph.add_argument("app", help="app name from the manifest")
    sub.add_parser("list", parents=[shared], help="list modules and apps")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        manifest = load_manifest(args.manifest)
        if args.command == "check":
            print(
                f"ok  {manifest.relpath}  "
                f"({len(manifest.modules)} modules, {len(manifest.apps)} apps)"
            )
            return 0
        if args.command == "list":
            sys.stdout.write(format_list(manifest))
            return 0
        if args.command == "graph":
            sys.stdout.write(format_graph(manifest, args.app))
            return 0
        if args.command == "build":
            if args.all and args.app:
                raise ShbundleError("build accepts an app name or --all, not both")
            if args.all:
                written = build_all(manifest)
                if not written:
                    print("built 0 apps")
                else:
                    for path in written:
                        print(f"wrote {posix_relpath(path, manifest.root)}")
                return 0
            if not args.app:
                raise ShbundleError("build requires an app name or --all")
            path = build_app(manifest, args.app)
            print(f"wrote {posix_relpath(path, manifest.root)}")
            return 0
        raise ShbundleError(f"unknown command: {args.command}")
    except ShbundleError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
