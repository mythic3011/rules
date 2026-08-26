#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compatibility entrypoint for the AI profile generator.

P1 keeps the historical import surface while implementation lives under
``internal/python/ai_profiles``. Generated output behavior is intentionally unchanged.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_PACKAGE_ROOT = Path(__file__).resolve().parent
if str(_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PACKAGE_ROOT))

from ai_profiles.common import *  # noqa: F401,F403,E402
from ai_profiles.coverage import audit_rule_coverage, render_coverage_audit  # noqa: E402
from ai_profiles.definitions import *  # noqa: F401,F403,E402
from ai_profiles.distribution import *  # noqa: F401,F403,E402
from ai_profiles.plans.ini_mvp import *  # noqa: F401,F403,E402
from ai_profiles.process_rules import *  # noqa: F401,F403,E402
from ai_profiles.render.adguard import *  # noqa: F401,F403,E402
from ai_profiles.render.mihomo import *  # noqa: F401,F403,E402
from ai_profiles.render.rule_provider import *  # noqa: F401,F403,E402
from ai_profiles.render.subconverter import *  # noqa: F401,F403,E402
from ai_profiles.settings import *  # noqa: F401,F403,E402
from ai_profiles.supporting_rules import *  # noqa: F401,F403,E402
from ai_profiles.upstream_hosts import refresh_upstream_host_snapshot  # noqa: E402
from ai_profiles.upstream_sources import refresh_upstream_source_manifest  # noqa: E402
from ai_profiles.writer import *  # noqa: F401,F403,E402

import ai_profiles.plans.ini_mvp as _ini_mvp  # noqa: E402


def load_ini_mvp_plan():
    """Compatibility wrapper so patched paths do not leak into later calls."""
    previous = _ini_mvp.INI_MVP_PLAN_PATH
    try:
        _ini_mvp.INI_MVP_PLAN_PATH = INI_MVP_PLAN_PATH
        return _ini_mvp.load_ini_mvp_plan()
    finally:
        _ini_mvp.INI_MVP_PLAN_PATH = previous


def main() -> None:
    """Generate only files owned by the AI profile generator."""
    write_rule_outputs()
    write_text(YAML_DIR / "Custom_Clash_AI.yaml", render_yaml(strict=False))
    write_text(YAML_DIR / "Custom_Clash_AI_Strict.yaml", render_yaml(strict=True))
    write_text(CFG_DIR / "Custom_Clash_AI.ini", render_ini())
    write_distribution_manifest(include_process_rules=ENABLE_PROCESS_RULES)
    print("Generated AI profile outputs.")


def cli(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Generate AI routing profiles.")
    parser.add_argument(
        "--list-managed-pathspecs",
        action="store_true",
        help="print git pathspecs owned by the default generator run",
    )
    parser.add_argument(
        "--migrate-supporting-rules",
        action="store_true",
        help="explicitly patch legacy Custom_Direct_* files with managed Tailscale support",
    )
    parser.add_argument(
        "--refresh-upstream-hosts",
        action="store_true",
        help="refresh the checked-in AdGuard Home domain snapshot from configured upstream DLC lists",
    )
    parser.add_argument(
        "--refresh-upstream-sources",
        action="store_true",
        help="refresh exact revisions in the shared upstream source lock manifest",
    )
    parser.add_argument(
        "--audit-rule-coverage",
        action="store_true",
        help="report broad AI coverage and cross-authority upstream revision drift",
    )
    args = parser.parse_args(argv)
    if args.list_managed_pathspecs:
        print("\n".join(managed_git_pathspecs(include_process_rules=ENABLE_PROCESS_RULES)))
        return
    if args.migrate_supporting_rules:
        migrate_custom_direct_supporting_rules()
        print("Migrated supporting direct rules.")
        return
    if args.refresh_upstream_hosts:
        path = refresh_upstream_host_snapshot()
        print(f"Refreshed upstream AdGuard snapshot: {path}")
        return
    if args.refresh_upstream_sources:
        path = refresh_upstream_source_manifest()
        print(f"Refreshed upstream source manifest: {path}")
        return
    if args.audit_rule_coverage:
        findings = audit_rule_coverage()
        print(render_coverage_audit(findings))
        if any(item.severity == "error" for item in findings):
            raise SystemExit(1)
        return
    main()


if __name__ == "__main__":
    cli()
