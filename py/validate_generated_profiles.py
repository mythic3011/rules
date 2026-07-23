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


ROOT = Path(__file__).resolve().parent.parent
RULE_DIR = ROOT / "rule"
CFG_DIR = ROOT / "cfg"
YAML_DIR = CFG_DIR / "yaml"
DOCS_DIR = ROOT / "docs"
DATA_DIR = ROOT / "data"

ENABLE_PROCESS_RULES = os.getenv("ENABLE_PROCESS_RULES", "false").lower() == "true"
OPENCLASH_SECRET = os.environ.get("OPENCLASH_SECRET", "").strip()

GROUP = {
    "manual": "🚀 手動選擇",
    "auto": "♻️ 自動選擇",
    "direct": "🎯 全球直連",
    "reject": "⛔ 拒絕",
    "fallback": "🐟 漏網之魚",
    "us": "🇺🇸 美國節點",
    "jp": "🇯🇵 日本節點",
    "sg": "🇸🇬 新加坡節點",
    "tw": "🇹🇼 台灣節點",
    "kr": "🇰🇷 韓國節點",
    "other": "🌐 其他／未識別節點",
    "chatgpt": "🤖 ChatGPT",
    "copilot": "🤖 Copilot",
    "claude": "🤖 Claude",
    "gemini": "🤖 Gemini",
    "notebooklm": "🤖 NotebookLM",
    "perplexity": "🤖 Perplexity",
    "grok": "🤖 Grok",
    "poe": "🤖 Poe",
}

AI_PROVIDER_KEYS = [
    "AI_Copilot_Classical",
    "AI_Gemini_Classical",
    "AI_NotebookLM_Classical",
]
AI_SERVICE_GEOSITES = {
    "openai": GROUP["chatgpt"],
    "github-copilot": GROUP["copilot"],
    "anthropic": GROUP["claude"],
    "perplexity": GROUP["perplexity"],
    "xai": GROUP["grok"],
    "poe": GROUP["poe"],
}
AI_IDENTITY_SEQUENCE = (
    ("geosite", "openai", GROUP["chatgpt"]),
    ("provider", "AI_Copilot_Classical", GROUP["copilot"]),
    ("geosite", "github-copilot", GROUP["copilot"]),
    ("geosite", "anthropic", GROUP["claude"]),
    ("provider", "AI_Gemini_Classical", GROUP["gemini"]),
    ("provider", "AI_NotebookLM_Classical", GROUP["notebooklm"]),
    ("geosite", "perplexity", GROUP["perplexity"]),
    ("geosite", "xai", GROUP["grok"]),
    ("geosite", "poe", GROUP["poe"]),
)
AI_GUARD_GEOSITES = ("google-deepmind", "category-ai-!cn")
PROCESS_PROVIDER_KEYS = [
    "Process_P2P_Classical",
    "Process_Download_Classical",
    "Process_ProxyTools_Classical",
    "Process_Gaming_Classical",
]
RELAXED_SUPPORT_PROVIDER_KEYS = [
    "Custom_Direct_Domain",
    "Custom_Direct_Classical_IP",
    "Custom_Proxy_Domain",
    "Custom_Proxy_Classical_IP",
    "SSH_Direct_Classical",
    "SSH_Proxy_Classical",
    "Gaming_Direct_Classical",
]
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


def find_group(proxy_groups: list[dict[str, object]], name: str) -> dict[str, object]:
    for group in proxy_groups:
        if group.get("name") == name:
            return group
    raise ValidationError(f"Missing proxy group: {name}")


def rule_index(rules: list[str], prefix: str) -> int:
    for index, rule in enumerate(rules):
        if rule.startswith(prefix):
            return index
    raise ValidationError(f"Missing rule with prefix: {prefix}")


def assert_provider_urls(rule_providers: dict[str, object], expected_keys: list[str]) -> None:
    ensure(set(rule_providers) == set(expected_keys), "Rule-provider keys do not match the active profile contract")
    for key in expected_keys:
        provider = rule_providers[key]
        ensure(isinstance(provider, dict), f"Rule-provider {key} must be a mapping")
        url = str(provider.get("url", ""))
        filename = url.rsplit("/", 1)[-1]
        ensure(filename, f"Rule-provider {key} has no filename in URL")
        ensure((RULE_DIR / filename).exists(), f"Rule-provider {key} points to missing local file {filename}")
        expected_behavior = "domain" if key in {"Custom_Direct_Domain", "Custom_Proxy_Domain"} else "classical"
        ensure(provider.get("behavior") == expected_behavior, f"Rule-provider {key} has unexpected behavior")


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


def validate_manual_group(group: dict[str, object], known_group_names: set[str], allow_direct: bool) -> None:
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
    ensure(isinstance(use_entries, list) and "provider1" in use_entries, "Manual group must expose provider1 nodes via use:")


def validate_service_groups(proxy_groups: list[dict[str, object]], strict: bool) -> None:
    for group_key in ("chatgpt", "copilot", "claude", "gemini", "notebooklm", "perplexity", "grok", "poe"):
        name = GROUP[group_key]
        group = find_group(proxy_groups, name)
        proxies = group.get("proxies") or []
        ensure(isinstance(proxies, list) and proxies, f"{name} proxies must be a non-empty list")
        ensure(proxies[-1] == GROUP["reject"], f"{name} must end with {GROUP['reject']}")
        if strict:
            ensure(GROUP["direct"] not in proxies, f"{name} must not include DIRECT in strict profile")
    if not strict:
        for group_key in ("chatgpt", "claude"):
            proxies = find_group(proxy_groups, GROUP[group_key]).get("proxies") or []
            ensure(GROUP["direct"] not in proxies, f"{GROUP[group_key]} must not include DIRECT in relaxed profile")


def validate_fallback_group(proxy_groups: list[dict[str, object]], strict: bool) -> None:
    group = find_group(proxy_groups, GROUP["fallback"])
    proxies = group.get("proxies") or []
    ensure(isinstance(proxies, list), "Fallback group proxies must be a list")
    expected = [GROUP["manual"], GROUP["auto"], GROUP["reject"]] if strict else [GROUP["direct"], GROUP["manual"], GROUP["auto"], GROUP["reject"]]
    ensure(proxies == expected, "Fallback group order is wrong")


def validate_ai_identity_rules(rules: list[str]) -> list[int]:
    indices: list[int] = []
    for kind, identity, group in AI_IDENTITY_SEQUENCE:
        prefix = f"RULE-SET,{identity}," if kind == "provider" else f"GEOSITE,{identity},{group}"
        indices.append(rule_index(rules, prefix))
    for geosite in AI_GUARD_GEOSITES:
        index = rule_index(rules, f"GEOSITE,{geosite},{GROUP['reject']}")
        indices.append(index)
    ensure(indices == sorted(indices), "AI service identity and guard rules are out of order")
    return indices


def validate_yaml_rule_order(rules: list[str], strict: bool) -> None:
    private_site = rule_index(rules, "GEOSITE,private,")
    private_ip = rule_index(rules, "GEOIP,private,")
    ai_indices = validate_ai_identity_rules(rules)
    match = rule_index(rules, "MATCH,")
    ensure(private_site < private_ip < ai_indices[0], "Private rules must precede AI identity rules")
    if strict:
        forbidden = ("SSH_", "Gaming_Direct", "Custom_Direct", "Custom_Proxy", "GEOIP,HK,")
        ensure(not any(any(token in rule for token in forbidden) for rule in rules), "Strict rules must omit relaxed-only rule providers")
        ensure(ai_indices[-1] < match, "Strict AI guards must precede MATCH")
        return
    ssh_direct = rule_index(rules, "RULE-SET,SSH_Direct_Classical,")
    ssh_proxy = rule_index(rules, "RULE-SET,SSH_Proxy_Classical,")
    gaming = rule_index(rules, "RULE-SET,Gaming_Direct_Classical,")
    custom_direct_domain = rule_index(rules, "RULE-SET,Custom_Direct_Domain,")
    custom_direct_ip = rule_index(rules, "RULE-SET,Custom_Direct_Classical_IP,")
    custom_proxy_domain = rule_index(rules, "RULE-SET,Custom_Proxy_Domain,")
    custom_proxy_ip = rule_index(rules, "RULE-SET,Custom_Proxy_Classical_IP,")
    geoip_hk = rule_index(rules, "GEOIP,HK,")
    ensure(ai_indices[-1] < ssh_direct < ssh_proxy < gaming, "AI rules must precede relaxed SSH and gaming rules")
    ensure(gaming < custom_direct_domain < custom_direct_ip < custom_proxy_domain < custom_proxy_ip < geoip_hk < match, "Relaxed custom rule order is wrong")
    if ENABLE_PROCESS_RULES:
        process_indices = [rule_index(rules, f"RULE-SET,{key},") for key in PROCESS_PROVIDER_KEYS]
        ensure(all(gaming < index < custom_direct_domain for index in process_indices), "Process rules must sit after Gaming and before custom rules")


def validate_yaml_profile(path: Path, strict: bool) -> None:
    text = read_text(path)
    data = load_yaml(path)
    proxy_groups = data.get("proxy-groups")
    rule_providers = data.get("rule-providers")
    rules = data.get("rules")
    ensure(isinstance(proxy_groups, list), f"{path.name} proxy-groups must be a list")
    ensure(isinstance(rule_providers, dict), f"{path.name} rule-providers must be a mapping")
    ensure(isinstance(rules, list) and all(isinstance(rule, str) for rule in rules), f"{path.name} rules must be strings")

    expected_providers = list(AI_PROVIDER_KEYS) if strict else [*RELAXED_SUPPORT_PROVIDER_KEYS, *AI_PROVIDER_KEYS]
    if ENABLE_PROCESS_RULES and not strict:
        expected_providers.extend(PROCESS_PROVIDER_KEYS)
    assert_provider_urls(rule_providers, expected_providers)

    secret_value = data.get("secret", "")
    if OPENCLASH_SECRET:
        ensure(secret_value == OPENCLASH_SECRET, "Generated YAML secret did not use OPENCLASH_SECRET")
    else:
        ensure(secret_value == "", "Generated YAML secret must be empty placeholder when OPENCLASH_SECRET is unset")

    providers = data.get("proxy-providers")
    ensure(isinstance(providers, dict), f"{path.name} proxy-providers must be a mapping")
    provider1 = providers.get("provider1")
    ensure(isinstance(provider1, dict), f"{path.name} missing proxy-providers.provider1")
    health_check = provider1.get("health-check")
    ensure(isinstance(health_check, dict) and health_check.get("enable") is True, "provider1 health-check.enable must be true")
    ensure(health_check.get("interval") == 600, "provider1 health-check.interval must be 600")
    ensure(health_check.get("url") == "https://cp.cloudflare.com/generate_204", "provider1 health-check.url must stay explicit")
    ensure(provider1.get("exclude-filter"), "provider1 exclude-filter missing")

    for group in proxy_groups:
        ensure(isinstance(group, dict), f"{path.name} proxy group must be a mapping")
        if group.get("type") in {"url-test", "fallback"}:
            ensure(group.get("url") == "https://cp.cloudflare.com/generate_204", f"{group.get('name')} missing explicit health-check URL")
            ensure(group.get("interval") == 300, f"{group.get('name')} missing explicit interval 300")

    known_group_names = {str(group.get("name")) for group in proxy_groups}
    validate_manual_group(find_group(proxy_groups, GROUP["manual"]), known_group_names, allow_direct=not strict)
    validate_service_groups(proxy_groups, strict=strict)
    validate_fallback_group(proxy_groups, strict=strict)
    expected_match = f"MATCH,{GROUP['reject'] if strict else GROUP['fallback']}"
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


def validate_ini(text: str) -> None:
    ensure("[custom]" in text, "INI missing [custom] section")
    ensure("rule-providers:" not in text, "INI must not contain YAML rule-providers syntax")
    ensure("enable_rule_generator=true" in text and "overwrite_original_rules=true" in text, "INI generator flags are missing")
    ensure("AI_All_Classical" not in text, "INI must not reference removed AI_All_Classical")
    for key in AI_PROVIDER_KEYS:
        ensure(f"{key}.yaml" in text, f"INI missing local AI rule provider: {key}")
    for geosite, group in AI_SERVICE_GEOSITES.items():
        ensure(f"ruleset={group},[]GEOSITE,{geosite}" in text, f"INI missing AI GEOSITE identity: {geosite}")
    for geosite in AI_GUARD_GEOSITES:
        ensure(f"ruleset={GROUP['reject']},[]GEOSITE,{geosite}" in text, f"INI missing AI guard: {geosite}")
    if not ENABLE_PROCESS_RULES:
        for key in PROCESS_PROVIDER_KEYS:
            ensure(key not in text, f"INI must not reference {key} while disabled")

    rulesets = extract_ini_rulesets(text)
    private_ip = ini_rule_index(rulesets, "[]GEOIP,private")
    guard_indices = [ini_rule_index(rulesets, f"[]GEOSITE,{geosite}") for geosite in AI_GUARD_GEOSITES]
    ssh_direct = ini_rule_index(rulesets, "SSH_Direct_Classical.yaml")
    custom_direct = ini_rule_index(rulesets, "Custom_Direct_Domain.yaml")
    final_rule = ini_rule_index(rulesets, "[]FINAL")
    ensure(private_ip < min(guard_indices) < ssh_direct < custom_direct < final_rule, "INI AI guards must precede relaxed SSH/custom rules")


def validate_process_rules() -> None:
    if not ENABLE_PROCESS_RULES:
        return
    source = read_text(DATA_DIR / "process_rules.yaml")
    current_key = ""
    seen_global: dict[str, str] = {}
    seen_local: set[str] = set()
    for raw_line in source.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not raw_line.startswith("  ") and stripped.endswith(":"):
            current_key, seen_local = stripped[:-1], set()
            continue
        if raw_line.startswith("  - ") and current_key:
            value = stripped[2:].strip()
            lowered = value.casefold()
            ensure(lowered not in seen_local, f"Duplicate process name within {current_key}: {value}")
            ensure(lowered not in seen_global, f"Duplicate process name across categories: {value}")
            seen_local.add(lowered)
            seen_global[lowered] = current_key

    for key in PROCESS_PROVIDER_KEYS:
        path = RULE_DIR / f"{key}.yaml"
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
    custom_direct_domain = read_text(RULE_DIR / "Custom_Direct_Domain.yaml")
    for entry in ("+.tailscale.com", "+.tailscaled.com", "login.tailscale.com", "controlplane.tailscale.com", "log.tailscale.com"):
        ensure(entry in custom_direct_domain, f"Custom_Direct_Domain.yaml missing Tailscale entry {entry}")
    docs = {path.name: read_text(path) for path in DOC_PATHS}
    ensure("TProxy bypass" in docs["ssh-routing.md"] or "TProxy bypass" in docs["ai-profile-generator.md"], "Docs must mention TProxy bypass for Tailscale")
    ensure("UDP 41641" in docs["ssh-routing.md"], "Docs must mention Tailscale UDP 41641")
    ensure("UDP 3478" in docs["ssh-routing.md"], "Docs must mention Tailscale STUN UDP 3478")
    ensure("cdn" in docs["node-normalization.md"].lower(), "Docs must mention gaming CDN direct rationale")


def validate_gaming_rule() -> None:
    path = RULE_DIR / "Gaming_Direct_Classical.yaml"
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
        "SSH_Direct_Classical.yaml": read_text(RULE_DIR / "SSH_Direct_Classical.yaml"),
        "SSH_Proxy_Classical.yaml": read_text(RULE_DIR / "SSH_Proxy_Classical.yaml"),
        "SSH_Process_Classical.yaml": read_text(RULE_DIR / "SSH_Process_Classical.yaml"),
        "Gaming_Direct_Classical.yaml": read_text(RULE_DIR / "Gaming_Direct_Classical.yaml"),
    }
    for key in AI_PROVIDER_KEYS:
        texts[f"{key}.yaml"] = read_text(RULE_DIR / f"{key}.yaml")
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
