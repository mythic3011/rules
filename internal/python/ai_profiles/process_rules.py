from __future__ import annotations

from .catalog import load_catalog
from .settings import AI_CATALOGS_DIR, ENABLE_PROCESS_RULES


def load_process_rule_source() -> dict[str, list[str]]:
    if not ENABLE_PROCESS_RULES:
        return {}

    source_path = AI_CATALOGS_DIR / "process-rules.yaml"
    if not source_path.exists():
        raise FileNotFoundError(
            f"Missing process rules source: {source_path}. "
            "Create internal/config/ai-routing/catalogs/process-rules.yaml before enabling process rules."
        )

    categories: dict[str, list[str]] = {}
    current_key = ""
    for raw_line in source_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not raw_line.startswith("  ") and stripped.endswith(":"):
            current_key = stripped[:-1]
            categories[current_key] = []
            continue
        if raw_line.startswith("  - ") and current_key:
            categories[current_key].append(stripped[2:].strip())
    return categories


def dedupe_process_names(process_rules: dict[str, list[str]]) -> dict[str, list[str]]:
    seen: set[str] = set()
    deduped: dict[str, list[str]] = {}
    for spec in load_catalog().process_rulesets:
        names = process_rules.get(spec.key, [])
        unique_names: list[str] = []
        local_seen: set[str] = set()
        for name in sorted(names, key=str.casefold):
            key = name.casefold()
            if key in local_seen or key in seen:
                continue
            local_seen.add(key)
            seen.add(key)
            unique_names.append(name)
        deduped[spec.key] = unique_names
    return deduped
