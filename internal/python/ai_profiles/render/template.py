from __future__ import annotations

import re
from pathlib import Path
from typing import Mapping


_PLACEHOLDER_RE = re.compile(r"\{\{([A-Z][A-Z0-9_]*)\}\}")


def load_template(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").rstrip("\n")
    except OSError as exc:
        raise RuntimeError(f"Template is unavailable: {path}") from exc


def render_template(template: str, values: Mapping[str, str]) -> str:
    placeholders = set(_PLACEHOLDER_RE.findall(template))
    supplied = set(values)
    missing = placeholders - supplied
    unexpected = supplied - placeholders
    if missing or unexpected:
        details: list[str] = []
        if missing:
            details.append(f"missing={sorted(missing)}")
        if unexpected:
            details.append(f"unexpected={sorted(unexpected)}")
        raise RuntimeError("Template values do not match placeholders: " + ", ".join(details))

    rendered = template
    for name in sorted(placeholders):
        rendered = rendered.replace(f"{{{{{name}}}}}", values[name])

    unresolved = _PLACEHOLDER_RE.findall(rendered)
    if unresolved:
        raise RuntimeError(f"Template has unresolved placeholders: {sorted(set(unresolved))}")
    return rendered
