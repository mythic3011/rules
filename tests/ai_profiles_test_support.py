from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PY_DIR = ROOT / "internal" / "python"
CATALOG_DIR = ROOT / "internal" / "config" / "ai-routing"

if str(PY_DIR) not in sys.path:
    sys.path.insert(0, str(PY_DIR))


def load_generator(module_name: str):
    module_path = PY_DIR / "generate_ai_profiles.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def copy_catalog(destination: Path) -> Path:
    target = destination / "ai-routing"
    shutil.copytree(CATALOG_DIR, target)
    return target


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AssertionError(f"Expected JSON object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
