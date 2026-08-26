from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

RULE_DIR = ROOT / "rule"

CFG_DIR = ROOT / "cfg"

YAML_DIR = CFG_DIR / "yaml"

DOCS_DIR = ROOT / "docs"

DATA_DIR = ROOT / "internal" / "config"

AI_CATALOG_DIR = DATA_DIR / "ai-routing"

AI_DISTRIBUTION_PATH = AI_CATALOG_DIR / "distribution.json"

TEMPLATE_DIR = ROOT / "internal" / "templates" / "ai-routing"

INI_MVP_PLAN_PATH = ROOT / "internal" / "generated" / "ai-routing" / "hk.ini-mvp-plan.json"

from .distribution import load_distribution

_DISTRIBUTION = load_distribution(AI_DISTRIBUTION_PATH)
REPO_SLUG = _DISTRIBUTION.repository
REPO_URL = f"https://github.com/{REPO_SLUG}"
BASE_URL = _DISTRIBUTION.base_url("rolling")

OPENCLASH_SECRET = os.environ.get("OPENCLASH_SECRET", "").strip()

ENABLE_PROCESS_RULES = os.getenv("ENABLE_PROCESS_RULES", "false").lower() == "true"
