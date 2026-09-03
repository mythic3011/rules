#!/usr/bin/env python3
"""Validate the generated AI profiles against the live generator contract."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

try:
    import yaml
except ModuleNotFoundError:
    print("PyYAML is required for validation. Install it with the repository environment.", file=sys.stderr)
    raise SystemExit(1)

from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import (
    compile_ai_routing_rules,
    compile_routing_entries,
    compile_rule_providers,
)
from ai_profiles.models import RuleProviderPlan
from ai_profiles.plans.ini_mvp import load_ini_mvp_plan
from ai_profiles.process_rules import load_process_rule_source
from ai_profiles.settings import CFG_DIR, DOCS_DIR, RULE_DIR


YAML_DIR = CFG_DIR / "yaml"
CATALOG = load_catalog()

ENABLE_PROCESS_RULES = os.getenv("ENABLE_PROCESS_RULES", "false").lower() == "true"
OPENCLASH_SECRET = os.environ.get("OPENCLASH_SECRET", "").strip()

GROUP = CATALOG.groups
AI_PROVIDER_KEYS = [service.provider_key for service in CATALOG.services if service.payload]
AI_RULE_FILES = [service.file for service in CATALOG.services if service.payload]
PROCESS_PROVIDER_KEYS = [rule.provider_key for rule in CATALOG.process_rulesets]
PROCESS_RULE_FILES = [rule.file for rule in CATALOG.process_rulesets]
RAW_HOST_PORT_PATTERN = re.compile(r"^[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}:\d+$")
BUILTIN_PROXY_NAMES = {"DIRECT", "REJECT", "REJECT-DROP", "PASS"}
BANNED_SECRET_LITERAL = "uIvHEwJp"
BANNED_TAILSCALE_RANGES = {"64.112.0.0/10", "192.200.0.0/24", "199.165.136.0/24"}
PROCESS_WARNING_PHRASES = [
    "PROCESS-NAME rules only work when Mihomo runs on the same device as the process.",
    "These rules have NO EFFECT in OpenClash router transparent proxy mode.",
]

RELAXED_YAML = YAML_DIR / "Custom_Clash_AI.yaml"
STRICT_YAML = YAML_DIR / "Custom_Clash_AI_Strict.yaml"
INI_PATH = CFG_DIR / "Custom_Clash_AI.ini"
DOC_PATHS = [
    DOCS_DIR / "ai-profile-generator.md",
    DOCS_DIR / "ssh-routing.md",
    DOCS_DIR / "node-normalization.md",
    DOCS_DIR / "kill-switch.md",
]


class ValidationError(RuntimeError):
    """Raised when generated output violates its deployment contract."""


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def read_text(path: Path) -> str:
    ensure(path.exists(), f"Missing required file: {path}")
    return path.read_text(encoding="utf-8")


def load_yaml(path: Path) -> dict[str, object]:
    data = yaml.safe_load(read_text(path))
    ensure(isinstance(data, dict), f"{path.name} did not parse as a YAML mapping")
    return data


def find_group(
    proxy_groups: list[dict[str, object]] | dict[str, dict[str, object]],
    name: str,
) -> dict[str, object]:
    if isinstance(proxy_groups, dict):
        group = proxy_groups.get(name)
        if group is not None:
            return group
        raise ValidationError(f"Missing proxy group: {name}")
    for group in proxy_groups:
        if group.get("name") == name:
            return group
    raise ValidationError(f"Missing proxy group: {name}")


def rule_indices(rules: list[str], prefixes: list[str]) -> list[int]:
    prefix_to_index: dict[str, int] = {}
    remaining = set(prefixes)
    for index, rule in enumerate(rules):
        matched = [prefix for prefix in remaining if rule.startswith(prefix)]
        for prefix in matched:
            prefix_to_index[prefix] = index
            remaining.remove(prefix)
        if not remaining:
            break
    for prefix in prefixes:
        if prefix not in prefix_to_index:
            raise ValidationError(f"Missing rule with prefix: {prefix}")
    return [prefix_to_index[p] for p in prefixes]


def rule_index(rules: list[str], prefix: str) -> int:
    return rule_indices(rules, [prefix])[0]


def assert_provider_urls(
    rule_providers: dict[str, object],
    expected_plans: tuple[RuleProviderPlan, ...],
) -> None:
    expected = {plan.name: plan for plan in expected_plans}
    ensure(set(rule_providers) == set(expected), "Rule-provider keys do not match the active profile contract")
    for key, plan in expected.items():
        provider = rule_providers[key]
        ensure(isinstance(provider, dict), f"Rule-provider {key} must be a mapping")
        ensure(provider.get("behavior") == plan.behavior, f"Rule-provider {key} has unexpected behavior")
        ensure(provider.get("url") == plan.url, f"Rule-provider {key} URL drifted from compiler plan")
        ensure(provider.get("interval") == plan.interval, f"Rule-provider {key} interval drifted from compiler plan")
        filename = plan.url.rsplit("/", 1)[-1]
        if "/mythic3011/rules/" in plan.url or "github.com/mythic3011/rules" in plan.url:
            ensure((RULE_DIR / filename).exists(), f"Rule-provider {key} points to missing local file {filename}")


def validate_general_text(texts: dict[str, str]) -> None:
    joined = "\n".join(texts.values())
    ensure("🇼🇸 台灣節點" not in joined, "Legacy Samoa Taiwan flag found in generated output")
    ensure("\\U0001F1FC\\U0001F1F8 台灣節點" not in joined, "Escaped Samoa Taiwan flag found")
    ensure(BANNED_SECRET_LITERAL not in joined, "Hardcoded secret literal found in generated output")
    ensure("Custom_Direct_IP" not in joined, "Old provider name Custom_Direct_IP found")
    ensure("Custom_Proxy_IP" not in joined, "Old provider name Custom_Proxy_IP found")
    ensure("AI_All_Classical" not in joined, "Stale AI_All_Classical reference found")
    ensure("DST-PORT,80" not in joined, "Forbidden DST-PORT,80 catch-all found")
    ensure("DST-PORT,443" not in joined, "Forbidden DST-PORT,443 catch-all found")
    for cidr in BANNED_TAILSCALE_RANGES:
        ensure(cidr not in joined, f"Forbidden unverified Tailscale range found: {cidr}")


def validate_manual_group(
    group: dict[str, object],
    known_group_names: set[str],
    provider_names: set[str],
    allow_direct: bool,
) -> None:
    proxies = group.get("proxies") or []
    ensure(isinstance(proxies, list), "Manual group proxies must be a list")
    if allow_direct:
        ensure(GROUP["direct"] in proxies, "Relaxed manual group must include DIRECT group")
    else:
        ensure(GROUP["direct"] not in proxies, "Strict manual group must not include DIRECT group")
    for entry in proxies:
        ensure(isinstance(entry, str), "Manual group proxy entries must be strings")
        if entry in known_group_names or entry in BUILTIN_PROXY_NAMES:
            continue
        ensure(not RAW_HOST_PORT_PATTERN.fullmatch(entry), f"Manual group contains raw host:port entry: {entry}")
    ensure(group.get("filter"), "Manual group must keep a provider-node filter")
    use_entries = group.get("use") or []
    ensure(
        isinstance(use_entries, list) and set(use_entries) == provider_names,
        "Manual group must expose all configured provider nodes via use:",
    )


def validate_service_groups(
    proxy_groups: list[dict[str, object]] | dict[str, dict[str, object]],
    strict: bool,
) -> None:
    for service in CATALOG.services:
        if "mihomo" not in service.projections:
            continue
        name = service.group
        group = find_group(proxy_groups, name)
        proxies = group.get("proxies") or []
        ensure(isinstance(proxies, list) and proxies, f"{name} proxies must be a non-empty list")
        ensure(proxies[-1] == GROUP["reject"], f"{name} must end with {GROUP['reject']}")
        if strict:
            ensure(GROUP["direct"] not in proxies, f"{name} must not include DIRECT in strict profile")
        elif not service.direct_relaxed:
            ensure(GROUP["direct"] not in proxies, f"{name} must not include DIRECT in relaxed profile")


def validate_fallback_group(
    proxy_groups: list[dict[str, object]] | dict[str, dict[str, object]],
    strict: bool,
) -> None:
    group = find_group(proxy_groups, GROUP["fallback"])
    proxies = group.get("proxies") or []
    ensure(isinstance(proxies, list), "Fallback group proxies must be a list")
    expected = [GROUP["manual"], GROUP["auto"], GROUP["reject"]] if strict else [GROUP["direct"], GROUP["manual"], GROUP["auto"], GROUP["reject"]]
    ensure(proxies == expected, "Fallback group order is wrong")


def routing_entry_prefix(entry: object) -> str | None:
    kind = getattr(entry, "kind", None)
    value = getattr(entry, "value", None)
    target = getattr(entry, "target", None)
    if not isinstance(kind, str) or not isinstance(value, str) or not isinstance(target, str):
        return None
    if kind == "MATCH":
        return f"MATCH,{target}"
    return f"{kind},{value},{target}"


def compiled_rule_prefixes(strict: bool) -> list[str]:
    prefixes: list[str] = []
    for entry in compile_routing_entries(
        strict=strict,
        include_process_rules=ENABLE_PROCESS_RULES,
        catalog=CATALOG,
    ):
        prefix = routing_entry_prefix(entry)
        if prefix is None:
            continue
        ensure(prefix not in prefixes, f"Compiler emitted duplicate routing rule prefix: {prefix}")
        prefixes.append(prefix)
    return prefixes


def validate_ai_identity_rules(rules: list[str]) -> list[int]:
    prefixes: list[str] = []
    for entry in compile_ai_routing_rules():
        ensure(entry.target is not None, f"AI routing entry {entry.kind},{entry.value} has no target")
        prefixes.append(f"{entry.kind},{entry.value},{entry.target}")
    indices = rule_indices(rules, prefixes)
    ensure(indices == sorted(indices), "AI service identity/aggregate rules are out of compiler order")
    return indices


def validate_yaml_rule_order(rules: list[str], strict: bool) -> None:
    ai_indices = validate_ai_identity_rules(rules)
    expected_prefixes = compiled_rule_prefixes(strict)
    found_indices = rule_indices(rules, expected_prefixes)
    ensure(found_indices == sorted(found_indices), "Generated rules are out of compiler order")
    foundation_prefixes = [
        f"{route.kind},{route.value},{route.target}"
        for route in CATALOG.foundation_routes
    ]
    ensure(len(foundation_prefixes) >= 2, "Canonical foundation routes must include two ordered rules")
    private_site, private_ip = rule_indices(rules, foundation_prefixes[:2])
    final_route = next(route for route in CATALOG.external_routes if route.kind == "MATCH")
    final_target = final_route.strict_target if strict and final_route.strict_target is not None else final_route.target
    match = rule_index(rules, f"MATCH,{final_target}")
    if strict:
        relaxed_prefixes = set(compiled_rule_prefixes(False))
        strict_prefixes = set(expected_prefixes)
        forbidden = relaxed_prefixes - strict_prefixes
        ensure(
            not any(any(rule.startswith(prefix) for prefix in forbidden) for rule in rules),
            "Strict rules must omit relaxed-only rule providers",
        )
        ensure(private_site < private_ip < ai_indices[0], "Private rules must precede AI identity rules")
        ensure(ai_indices[-1] < match, "Strict AI guards must precede MATCH")
        return

    ensure(private_site < private_ip < ai_indices[0], "Private rules must precede AI identity rules")
    ensure(ai_indices[-1] < match, "AI rules must precede the final route")


def validate_yaml_profile(path: Path, strict: bool) -> None:
    text = read_text(path)
    data = load_yaml(path)
    proxy_groups = data.get("proxy-groups")
    rule_providers = data.get("rule-providers")
    rules = data.get("rules")
    ensure(isinstance(proxy_groups, list), f"{path.name} proxy-groups must be a list")
    ensure(isinstance(rule_providers, dict), f"{path.name} rule-providers must be a mapping")
    ensure(isinstance(rules, list) and all(isinstance(rule, str) for rule in rules), f"{path.name} rules must be strings")

    expected_providers = compile_rule_providers(
        strict=strict,
        include_process_rules=ENABLE_PROCESS_RULES,
    )
    assert_provider_urls(rule_providers, expected_providers)

    secret_value = data.get("secret", "")
    if OPENCLASH_SECRET:
        ensure(secret_value == OPENCLASH_SECRET, "Generated YAML secret did not use OPENCLASH_SECRET")
    else:
        ensure(secret_value == "", "Generated YAML secret must be empty placeholder when OPENCLASH_SECRET is unset")

    providers = data.get("proxy-providers")
    ensure(isinstance(providers, dict) and providers, f"{path.name} proxy-providers must be a non-empty mapping")
    provider_names = set(providers)
    for provider_name, provider in providers.items():
        ensure(isinstance(provider, dict), f"{path.name} proxy-provider {provider_name} must be a mapping")
        health_check = provider.get("health-check")
        ensure(isinstance(health_check, dict) and health_check.get("enable") is True, f"{provider_name} health-check must be enabled")
        ensure(isinstance(health_check.get("interval"), int) and health_check["interval"] > 0, f"{provider_name} health-check.interval must be positive")
        ensure(isinstance(health_check.get("url"), str) and health_check["url"], f"{provider_name} health-check.url must be explicit")
        ensure(provider.get("exclude-filter"), f"{provider_name} exclude-filter missing")

    health_check_urls: set[str] = set()
    health_check_intervals: set[int] = set()
    for group in proxy_groups:
        ensure(isinstance(group, dict), f"{path.name} proxy group must be a mapping")
        if group.get("type") in {"url-test", "fallback"}:
            ensure(isinstance(group.get("url"), str) and group["url"], f"{group.get('name')} missing explicit health-check URL")
            ensure(isinstance(group.get("interval"), int) and group["interval"] > 0, f"{group.get('name')} missing positive health-check interval")
            health_check_urls.add(group["url"])
            health_check_intervals.add(group["interval"])

    ensure(len(health_check_urls) == 1, "Generated proxy groups must share one health-check URL")
    ensure(len(health_check_intervals) == 1, "Generated proxy groups must share one health-check interval")
    ensure(
        all(provider["health-check"]["url"] in health_check_urls for provider in providers.values() if isinstance(provider, dict)),
        "Proxy-provider health-check URL must match generated group health checks",
    )

    proxy_groups_map = {
        str(group.get("name")): group
        for group in proxy_groups
        if isinstance(group, dict)
    }
    known_group_names = set(proxy_groups_map.keys())
    validate_manual_group(
        find_group(proxy_groups_map, GROUP["manual"]),
        known_group_names,
        provider_names,
        allow_direct=not strict,
    )
    validate_service_groups(proxy_groups_map, strict=strict)
    validate_fallback_group(proxy_groups_map, strict=strict)
    final_route = next(route for route in CATALOG.external_routes if route.kind == "MATCH")
    expected_target = final_route.strict_target if strict and final_route.strict_target is not None else final_route.target
    expected_match = f"MATCH,{expected_target}"
    ensure(expected_match in rules, f"{path.name} missing expected MATCH rule {expected_match}")
    ensure("MATCH,DIRECT" not in rules, f"{path.name} must not contain MATCH,DIRECT")
    if ENABLE_PROCESS_RULES and not strict:
        for phrase in PROCESS_WARNING_PHRASES:
            ensure(phrase in text, f"{path.name} missing process warning comment")
    else:
        for key in PROCESS_PROVIDER_KEYS:
            ensure(key not in text, f"{path.name} must not reference {key} while disabled or strict")
        ensure("PROCESS-NAME," not in text, f"{path.name} must not contain active PROCESS-NAME while disabled or strict")
    validate_yaml_rule_order(rules, strict)


def extract_ini_rulesets(text: str) -> list[str]:
    return [line for line in text.splitlines() if line.startswith("ruleset=")]


def ini_rule_index(rulesets: list[str], needle: str) -> int:
    for index, line in enumerate(rulesets):
        if needle in line:
            return index
    raise ValidationError(f"Missing INI ruleset containing: {needle}")


def render_ini_mvp_rule(record: dict[str, object]) -> str:
    if record.get("kind") == "remote-classical":
        return f"ruleset={record['target']},clash-classic:{record['url']},{record['interval']}"
    if record.get("kind") == "geosite":
        return f"ruleset={record['target']},[]GEOSITE,{record['value']}"
    raise ValidationError("INI MVP plan has an unsupported rule record")


def ini_route_fragment(route: object) -> str:
    kind = getattr(route, "kind", None)
    value = getattr(route, "value", None)
    target = getattr(route, "target", None)
    ensure(isinstance(kind, str) and isinstance(value, str) and isinstance(target, str), "Canonical route has an invalid shape")
    if kind == "MATCH":
        return f"ruleset={target},[]FINAL"
    return f"ruleset={target},[]{kind},{value}"


def expected_ini_mvp_group_fields(group: dict[str, object]) -> list[str]:
    candidates = group.get("candidates")
    ensure(group.get("kind") == "select" and isinstance(candidates, list), "INI MVP plan group is invalid")
    fields: list[str] = []
    for candidate in candidates:
        ensure(isinstance(candidate, dict), "INI MVP plan candidate is invalid")
        if candidate.get("kind") == "group-ref":
            fields.append(f"[]{candidate.get('value')}")
        elif candidate.get("kind") == "node-filter":
            fields.append(str(candidate.get("value")))
        else:
            raise ValidationError("INI MVP plan candidate kind is invalid")
    return fields


def validate_ini(text: str) -> None:
    ensure("[custom]" in text, "INI missing [custom] section")
    ensure("rule-providers:" not in text, "INI must not contain YAML rule-providers syntax")
    ensure("enable_rule_generator=true" in text and "overwrite_original_rules=true" in text, "INI generator flags are missing")
    ensure("AI_All_Classical" not in text, "INI must not reference removed AI_All_Classical")
    for key in AI_PROVIDER_KEYS:
        ensure(f"{key}.yaml" in text, f"INI missing local AI rule provider: {key}")
    plan = load_ini_mvp_plan()
    account = plan["accountProtection"]
    migration = plan["migration"]
    replaced_service_ids = set(migration["legacyReplacementIds"])
    for service in CATALOG.services:
        if "subconverter" not in service.projections or service.id in replaced_service_ids:
            continue
        for geosite in service.geosites:
            ensure(
                f"ruleset={service.group},[]GEOSITE,{geosite}" in text,
                f"INI missing AI GEOSITE identity: {geosite}",
            )
    ensure(plan.get("schemaVersion") == 1 and plan.get("profile") == "hk", "INI MVP plan is not the HK v1 plan")
    rule_sections = plan.get("rules")
    groups = plan.get("groups")
    ensure(isinstance(migration, dict), "INI MVP service migration metadata is invalid")
    ensure(isinstance(account, dict) and isinstance(rule_sections, dict) and isinstance(groups, list), "INI MVP plan has an invalid deployment shape")
    before_legacy = rule_sections.get("beforeLegacy")
    after_legacy = rule_sections.get("afterLegacy")
    ensure(isinstance(before_legacy, list) and len(before_legacy) >= 2 and isinstance(after_legacy, list) and after_legacy, "INI MVP plan has missing ordered rules")
    ensure(all(isinstance(record, dict) for record in [*before_legacy, *after_legacy]), "INI MVP plan rules must be mappings")
    protected_rule = before_legacy[0]
    terminal_reject = before_legacy[1]
    ensure(protected_rule.get("kind") == "remote-classical" and terminal_reject.get("kind") == "remote-classical", "INI MVP protected rules must be remote classical")
    ensure(protected_rule.get("target") == account.get("protectedGroup") and terminal_reject.get("target") == account.get("rejectGroup") and protected_rule.get("url") == terminal_reject.get("url") and protected_rule.get("interval") == terminal_reject.get("interval"), "Claude terminal reject must immediately mirror the protected provider")
    expected_before = [render_ini_mvp_rule(record) for record in before_legacy]
    expected_after = [render_ini_mvp_rule(record) for record in after_legacy]
    ensure(all(line in text for line in [*expected_before, *expected_after]), "INI is missing a normalized MVP rule record")
    ensure("ruleset=🤖 Claude,[]GEOSITE,anthropic" not in text and "custom_proxy_group=🤖 Claude`" not in text and "custom_proxy_group=🤖 Claude ·" not in text, "INI must not retain legacy Claude rules or groups")
    for group in groups:
        ensure(isinstance(group, dict) and isinstance(group.get("name"), str), "INI MVP plan group must be a mapping")
        expected_fields = expected_ini_mvp_group_fields(group)
        prefix = f"custom_proxy_group={group['name']}`select`"
        rendered = [line for line in text.splitlines() if line.startswith(prefix)]
        ensure(rendered, f"INI missing MVP group {group['name']}")
        expected = [f"custom_proxy_group={group['name']}", "select", *expected_fields]
        ensure(
            any(line.split("`") == expected for line in rendered),
            f"INI MVP group {group['name']} has invalid candidate separators or order",
        )
    protected_group = next((group for group in groups if group.get("name") == account.get("protectedGroup")), None)
    ensure(isinstance(protected_group, dict) and expected_ini_mvp_group_fields(protected_group) == [f"[]{account.get('rejectGroup')}"], "Claude public INI group must be REJECT-only")
    if not ENABLE_PROCESS_RULES:
        for key in PROCESS_PROVIDER_KEYS:
            ensure(key not in text, f"INI must not reference {key} while disabled")

    rulesets = extract_ini_rulesets(text)
    foundation_routes = CATALOG.foundation_routes
    ensure(len(foundation_routes) >= 2, "Canonical foundation routes must include two ordered rules")
    private_ip = ini_rule_index(rulesets, ini_route_fragment(foundation_routes[1]))
    before_indices = [rulesets.index(line) for line in expected_before]
    after_indices = [rulesets.index(line) for line in expected_after]
    first_companion = next(rule for rule in CATALOG.companion_rulesets if rule.mihomo)
    first_external_provider = next(
        route
        for route in CATALOG.external_routes
        if route.mihomo_when == "relaxed" and route.provider_file is not None
    )
    legacy_identity = next(
        (service, geosite)
        for service in CATALOG.services
        if "subconverter" in service.projections and service.id not in replaced_service_ids
        for geosite in service.geosites
    )
    first_companion_index = ini_rule_index(rulesets, first_companion.file)
    first_external_provider_index = ini_rule_index(rulesets, first_external_provider.provider_file)
    legacy_identity_index = ini_rule_index(
        rulesets,
        f"ruleset={legacy_identity[0].group},[]GEOSITE,{legacy_identity[1]}",
    )
    final_route = next(route for route in CATALOG.external_routes if route.kind == "MATCH")
    final_rule = ini_rule_index(rulesets, ini_route_fragment(final_route))
    ensure(before_indices == list(range(before_indices[0], before_indices[0] + len(before_indices))), "INI protected rule records must remain adjacent")
    ensure(after_indices == list(range(after_indices[0], after_indices[0] + len(after_indices))), "INI post-legacy rule records must remain adjacent")
    ensure(private_ip < before_indices[0] < legacy_identity_index < after_indices[0] < first_companion_index < first_external_provider_index < final_rule, "INI MVP rule ordering is wrong")


def validate_process_rules() -> None:
    if not ENABLE_PROCESS_RULES:
        return
    source = load_process_rule_source()
    seen_global: dict[str, str] = {}
    for category, values in source.items():
        seen_local: set[str] = set()
        for value in values:
            lowered = value.casefold()
            ensure(lowered not in seen_local, f"Duplicate process name within {category}: {value}")
            ensure(lowered not in seen_global, f"Duplicate process name across categories: {value}")
            seen_local.add(lowered)
            seen_global[lowered] = category

    for path_name in PROCESS_RULE_FILES:
        path = RULE_DIR / path_name
        payload = load_yaml(path).get("payload")
        ensure(isinstance(payload, list), f"{path.name} payload must be a list")
        names: set[str] = set()
        for entry in payload:
            ensure(isinstance(entry, str) and entry.startswith("PROCESS-NAME,"), f"{path.name} must contain only PROCESS-NAME entries")
            name = entry.split(",", 1)[1]
            lowered = name.casefold()
            ensure(lowered not in names, f"{path.name} contains duplicate PROCESS-NAME entry: {name}")
            names.add(lowered)


def validate_tailscale_and_docs() -> None:
    custom_direct_rule = next(
        rule
        for rule in CATALOG.external_routes
        if rule.mihomo_when == "relaxed"
        and rule.provider_behavior == "domain"
        and rule.target == GROUP["direct"]
        and rule.provider_file is not None
    )
    custom_direct_domain = read_text(RULE_DIR / custom_direct_rule.provider_file)
    for entry in ("+.tailscale.com", "+.tailscaled.com", "login.tailscale.com", "controlplane.tailscale.com", "log.tailscale.com"):
        ensure(entry in custom_direct_domain, f"{custom_direct_rule.provider_file} missing Tailscale entry {entry}")
    docs = {path.name: read_text(path) for path in DOC_PATHS}
    ensure("TProxy bypass" in docs["ssh-routing.md"] or "TProxy bypass" in docs["ai-profile-generator.md"], "Docs must mention TProxy bypass for Tailscale")
    ensure("UDP 41641" in docs["ssh-routing.md"], "Docs must mention Tailscale UDP 41641")
    ensure("UDP 3478" in docs["ssh-routing.md"], "Docs must mention Tailscale STUN UDP 3478")
    ensure("cdn" in docs["node-normalization.md"].lower(), "Docs must mention gaming CDN direct rationale")


def validate_gaming_rule() -> None:
    gaming_rule = next(rule for rule in CATALOG.companion_rulesets if rule.category == "gaming")
    path = RULE_DIR / gaming_rule.file
    text = read_text(path)
    payload = load_yaml(path).get("payload")
    ensure(isinstance(payload, list), "Gaming_Direct_Classical payload must be a list")
    ensure("DOMAIN-SUFFIX,ea.com" not in payload, "Gaming_Direct_Classical must not contain ea.com by default")
    if any(line.strip() == "- DOMAIN-SUFFIX,ea.com" for line in text.splitlines()):
        ensure("ALLOW_BROAD_EA_DIRECT_CONFIRMED" in text, "ea.com requires ALLOW_BROAD_EA_DIRECT_CONFIRMED comment")


def main() -> None:
    texts = {
        RELAXED_YAML.name: read_text(RELAXED_YAML),
        STRICT_YAML.name: read_text(STRICT_YAML),
        INI_PATH.name: read_text(INI_PATH),
    }
    for rule in CATALOG.companion_rulesets:
        if rule.category in {"ssh", "gaming"}:
            texts[rule.file] = read_text(RULE_DIR / rule.file)
    for file_name in AI_RULE_FILES:
        texts[file_name] = read_text(RULE_DIR / file_name)
    ensure(not (RULE_DIR / "AI_All_Classical.yaml").exists(), "Stale AI_All_Classical.yaml must not exist")
    validate_general_text(texts)
    validate_yaml_profile(RELAXED_YAML, strict=False)
    validate_yaml_profile(STRICT_YAML, strict=True)
    validate_ini(texts[INI_PATH.name])
    validate_process_rules()
    validate_tailscale_and_docs()
    validate_gaming_rule()
    print("Generated profile validation passed.")


if __name__ == "__main__":
    try:
        main()
    except ValidationError as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
