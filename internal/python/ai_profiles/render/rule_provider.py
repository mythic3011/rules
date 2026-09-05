from __future__ import annotations

from ..common import yaml_string
from ..shared.provenance import canonical_digest, load_provenance
from ..shared.templates import render_template

_RULE_HEADER = "internal/templates/generated/rule-header.txt"
_COMMENT_HEADER = "internal/templates/generated/comment-header.txt"

# Bump when the generation algorithm changes in a way that alters output for
# unchanged inputs, so SOURCE-DIGEST reflects it rather than silently matching.
_GENERATOR_SCHEMA_VERSION = 1


def render_rule_file(
    provider_key: str,
    group: str,
    payload: list[str],
    extra_comments: list[str] | None = None,
) -> str:
    header = render_template(
        _RULE_HEADER,
        {
            **load_provenance(),
            "provider_key": provider_key,
            "group": group,
            "total": len(payload),
            "source_digest": canonical_digest(
                {
                    "provider": provider_key,
                    "group": group,
                    "payload": payload,
                    "generatorSchemaVersion": _GENERATOR_SCHEMA_VERSION,
                }
            ),
        },
    )
    lines = [header]
    if extra_comments:
        lines.extend(["", *extra_comments])
    lines.extend(["", "payload:", *(f"  - {yaml_string(rule)}" for rule in payload)])
    return "\n".join(lines)


def render_process_rule_file(
    provider_key: str,
    group: str,
    payload: list[str],
    warning_lines: list[str] | None = None,
) -> str:
    if warning_lines is None:
        from ..catalog import load_catalog

        warning_lines = list(load_catalog().process_rules_warning)
    return render_rule_file(
        provider_key=provider_key,
        group=group,
        payload=[f"PROCESS-NAME,{name}" for name in payload],
        extra_comments=warning_lines,
    )


def render_comment_rule_file(body_lines: list[str]) -> str:
    header = render_template(_COMMENT_HEADER, load_provenance())
    return "\n".join([header, *body_lines])
