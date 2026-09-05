"""Shared IO + template abstraction for generators.

Centralizes reading config JSON and text/`string.Template` files so generators
compose from external presentation/config rather than hardcoding strings. Uses
only the standard library (no Jinja2).
"""
from __future__ import annotations

import json
from pathlib import Path
from string import Template
from typing import Any

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


def load_text(path: str | Path) -> str:
    return (_REPOSITORY_ROOT / path).read_text(encoding="utf-8")


def load_json(path: str | Path) -> dict[str, Any]:
    return json.loads(load_text(path))


def load_template(path: str | Path) -> Template:
    return Template(load_text(path))


def render_template(path: str | Path, context: dict[str, object]) -> str:
    return load_template(path).substitute(
        {key: str(value) for key, value in context.items()}
    )
