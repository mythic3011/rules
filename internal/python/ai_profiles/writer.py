from __future__ import annotations

from pathlib import Path

from .catalog import load_catalog
from .compiler import compile_adguard_home_plan
from .process_rules import dedupe_process_names, load_process_rule_source
from .render.adguard import render_adguard_home
from .render.rule_provider import render_comment_rule_file, render_process_rule_file, render_rule_file
from .settings import ENABLE_PROCESS_RULES, RULE_DIR


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8", newline="\n")


def remove_stale_ai_rule_outputs() -> None:
    catalog = load_catalog()
    active_files = {service.file for service in catalog.services if service.payload}
    for file_name in sorted(catalog.managed_ai_rule_files - active_files):
        path = RULE_DIR / file_name
        if path.exists():
            path.unlink()


def write_rule_outputs() -> None:
    catalog = load_catalog()
    remove_stale_ai_rule_outputs()

    if catalog.adguard_home is not None:
        adguard_plan = compile_adguard_home_plan(catalog)
        write_text(
            RULE_DIR / adguard_plan.output_file,
            render_adguard_home(adguard_plan),
        )

    for service in catalog.services:
        if not service.payload:
            continue
        write_text(
            RULE_DIR / service.file,
            render_rule_file(
                provider_key=service.provider_key,
                group=service.group,
                payload=list(service.payload),
            ),
        )

    for item in catalog.companion_rulesets:
        if item.render_mode == "comment":
            rendered = render_comment_rule_file(list(item.comment_lines))
        else:
            rendered = render_rule_file(
                provider_key=item.provider_key,
                group=item.group,
                payload=list(item.payload),
                extra_comments=list(item.comments),
            )
        write_text(RULE_DIR / item.file, rendered)

    if ENABLE_PROCESS_RULES:
        process_rules = dedupe_process_names(load_process_rule_source())
        for spec in catalog.process_rulesets:
            write_text(
                RULE_DIR / spec.file,
                render_process_rule_file(
                    provider_key=spec.provider_key,
                    group=spec.group,
                    payload=process_rules.get(spec.key, []),
                    warning_lines=list(catalog.process_rules_warning),
                ),
            )
