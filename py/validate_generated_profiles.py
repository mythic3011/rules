#!/usr/bin/env python3
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

try:
    import yaml
except ModuleNotFoundError:
    print(
        "PyYAML is required for validation. Install it with: python3 -m pip install PyYAML",
        file=sys.stderr,
    )
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
    "AI_ChatGPT_Classical",
    "AI_Copilot_Classical",
    "AI_Claude_Classical",
    "AI_Gemini_Classical",
    "AI_NotebookLM_Classical",
    "AI_Perplexity_Classical",
    "AI_Grok_Classical",
    "AI_Poe_Classical",
]
PROCESS_PROVIDER_KEYS = [
    "Process_P2P_Classical",
    "Process_Download_Classical",
    "Process_ProxyTools_Classical",
    "Process_Gaming_Classical",
]
MANDATORY_PROVIDER_KEYS = [
    "Custom_Direct_Domain",
    "Custom_Direct_Classical_IP",
    "Custom_Proxy_Domain",
    "Custom_Proxy_Classical_IP",
    *AI_PROVIDER_KEYS,
    "AI_All_Classical",
    "SSH_Direct_Classical",
    "SSH_Proxy_Classical",
    "SSH_Process_Classical",
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
AI_ALL_ALLOWED_KEYWORDS = {
    "openai",
    "chatgpt",
    "anthropic",
    "claude",
    "gemini",
    "perplexity",
    "grok",
    "copilot",
    "poe",
}

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
    pass


def ensure(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def read_text(path: Path) -> str:
    ensure(path.exists(), f"Missing required file: {path}")
    return path.read_text(encoding="utf-8")


def load_yaml(path: Path) -> object:
    return yaml.safe_load(read_text(path))


def find_group(proxy_groups: list[dict[str, object]], name: str) -> dict[str, object]:
    for group in proxy_groups:
        if group.get("name") == name:
            return group
    raise ValidationError(f"Missing proxy group: {name}")


def rule_index(rules: list[str], prefix: str) -> int:
    for idx, rule in enumerate(rules):
        if rule.startswith(prefix):
            return idx
    raise ValidationError(f"Missing rule with prefix: {prefix}")


def extract_ini_rulesets(text: str) -> list[str]:
    return [line for line in text.splitlines() if line.startswith("ruleset=")]


def extract_ini_proxy_groups(text: str) -> list[str]:
    return [line for line in text.splitlines() if line.startswith("custom_proxy_group=")]


def assert_provider_urls(rule_providers: dict[str, dict[str, object]], expected_keys: list[str]) -> None:
    for key in expected_keys:
        ensure(key in rule_providers, f"Missing YAML rule-provider key: {key}")
        provider = rule_providers[key]
        url = str(provider.get("url", ""))
        filename = url.rsplit("/", 1)[-1]
        ensure(filename, f"Rule-provider {key} has no filename in URL")
        ensure((RULE_DIR / filename).exists(), f"Rule-provider {key} points to missing local file {filename}")


def validate_general_text(texts: dict[str, str]) -> None:
    joined = "\n".join(texts.values())
    ensure("🇼🇸 台灣節點" not in joined, "Legacy Samoa Taiwan flag found in generated output")
    ensure("\\U0001F1FC\\U0001F1F8 台灣節點" not in joined, "Escaped Samoa Taiwan flag found")
    ensure(BANNED_SECRET_LITERAL not in joined, "Hardcoded secret literal found in generated output")
    ensure("Custom_Direct_IP" not in joined, "Old provider name Custom_Direct_IP found")
    ensure("Custom_Proxy_IP" not in joined, "Old provider name Custom_Proxy_IP found")
    ensure("AI_ChatGPT," not in joined, "Old AI_ChatGPT provider key found")
    ensure("AI_Claude," not in joined, "Old AI_Claude provider key found")
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
        ensure(
            not RAW_HOST_PORT_PATTERN.fullmatch(entry),
            f"Manual group contains raw host:port entry: {entry}",
        )
    ensure(group.get("filter"), "Manual group must keep a provider-node filter")
    use_entries = group.get("use") or []
    ensure(isinstance(use_entries, list) and "provider1" in use_entries, "Manual group must expose provider1 nodes via use:")


def validate_service_groups(proxy_groups: list[dict[str, object]], strict: bool) -> None:
    ai_groups = [
        GROUP["chatgpt"],
        GROUP["copilot"],
        GROUP["claude"],
        GROUP["gemini"],
        GROUP["notebooklm"],
        GROUP["perplexity"],
        GROUP["grok"],
        GROUP["poe"],
    ]
    for name in ai_groups:
        group = find_group(proxy_groups, name)
        proxies = group.get("proxies") or []
        ensure(isinstance(proxies, list), f"{name} proxies must be a list")
        ensure(proxies[-1] == GROUP["reject"], f"{name} must end with {GROUP['reject']}")
        ensure(GROUP["reject"] in proxies, f"{name} must include {GROUP['reject']}")
        if strict:
            ensure(GROUP["direct"] not in proxies, f"{name} must not include DIRECT in strict profile")

    relaxed_chatgpt = find_group(proxy_groups, GROUP["chatgpt"]).get("proxies") or []
    relaxed_claude = find_group(proxy_groups, GROUP["claude"]).get("proxies") or []
    if not strict:
        ensure(GROUP["direct"] not in relaxed_chatgpt, "ChatGPT must not include DIRECT in relaxed profile")
        ensure(GROUP["direct"] not in relaxed_claude, "Claude must not include DIRECT in relaxed profile")


def validate_fallback_group(proxy_groups: list[dict[str, object]], strict: bool) -> None:
    group = find_group(proxy_groups, GROUP["fallback"])
    proxies = group.get("proxies") or []
    ensure(isinstance(proxies, list), "Fallback group proxies must be a list")
    ensure(proxies[-1] == GROUP["reject"], "Fallback group must end with reject")
    if strict:
        ensure(GROUP["direct"] not in proxies, "Strict fallback group must not include DIRECT")
    else:
        ensure(proxies == [GROUP["direct"], GROUP["manual"], GROUP["auto"], GROUP["reject"]], "Relaxed fallback group order is wrong")


def validate_yaml_profile(path: Path, strict: bool) -> None:
    text = read_text(path)
    data = load_yaml(path)
    ensure(isinstance(data, dict), f"{path.name} did not parse as YAML mapping")

    proxy_groups = data.get("proxy-groups")
    rule_providers = data.get("rule-providers")
    rules = data.get("rules")
    ensure(isinstance(proxy_groups, list), f"{path.name} proxy-groups must be a list")
    ensure(isinstance(rule_providers, dict), f"{path.name} rule-providers must be a mapping")
    ensure(isinstance(rules, list), f"{path.name} rules must be a list")

    provider_keys = MANDATORY_PROVIDER_KEYS + (PROCESS_PROVIDER_KEYS if ENABLE_PROCESS_RULES else [])
    assert_provider_urls(rule_providers, provider_keys)

    secret_value = data.get("secret", "")
    if OPENCLASH_SECRET:
        ensure(isinstance(secret_value, str) and secret_value == OPENCLASH_SECRET, "Generated YAML secret did not use OPENCLASH_SECRET")
    else:
        ensure(secret_value == "", "Generated YAML secret must be empty placeholder when OPENCLASH_SECRET is unset")

    provider_health_check = data.get("proxy-providers", {}).get("provider1", {}).get("health-check", {})
    ensure(provider_health_check.get("enable") is True, "provider1 health-check.enable must be true")
    ensure(provider_health_check.get("interval") == 600, "provider1 health-check.interval must be 600")
    ensure(provider_health_check.get("url") == "https://cp.cloudflare.com/generate_204", "provider1 health-check.url must stay explicit")
    override = data.get("proxy-providers", {}).get("provider1", {}).get("override", {})
    ensure("exclude-filter" in override, "provider1 override.exclude-filter missing")

    for group in proxy_groups:
        if group.get("type") in {"url-test", "fallback"}:
            ensure(group.get("url") == "https://cp.cloudflare.com/generate_204", f"{group.get('name')} missing explicit health-check URL")
            ensure(group.get("interval") == 300, f"{group.get('name')} missing explicit interval 300")

    known_group_names = {str(group.get("name")) for group in proxy_groups}
    validate_manual_group(find_group(proxy_groups, GROUP["manual"]), known_group_names, allow_direct=not strict)
    validate_service_groups(proxy_groups, strict=strict)
    validate_fallback_group(proxy_groups, strict=strict)

    match_rule = f"MATCH,{GROUP['reject'] if strict else GROUP['fallback']}"
    ensure(match_rule in rules, f"{path.name} missing expected MATCH rule {match_rule}")
    ensure("MATCH,DIRECT" not in rules, f"{path.name} must not contain MATCH,DIRECT")
    ensure(f"RULE-SET,AI_All_Classical,{GROUP['reject']}" in rules, f"{path.name} must route AI_All_Classical to reject")

    if ENABLE_PROCESS_RULES:
        for phrase in PROCESS_WARNING_PHRASES:
            ensure(phrase in text, f"{path.name} missing process warning comment")
    else:
        for key in PROCESS_PROVIDER_KEYS:
            ensure(key not in text, f"{path.name} must not reference {key} while disabled")
        ensure("PROCESS-NAME," not in text, f"{path.name} must not contain active PROCESS-NAME while disabled")

    validate_yaml_rule_order(rules)


def validate_yaml_rule_order(rules: list[str]) -> None:
    private_site = rule_index(rules, "GEOSITE,private,")
    private_ip = rule_index(rules, "GEOIP,private,")
    ssh_direct = rule_index(rules, "RULE-SET,SSH_Direct_Classical,")
    ssh_proxy = rule_index(rules, "RULE-SET,SSH_Proxy_Classical,")
    gaming = rule_index(rules, "RULE-SET,Gaming_Direct_Classical,")
    custom_direct_domain = rule_index(rules, "RULE-SET,Custom_Direct_Domain,")
    custom_direct_ip = rule_index(rules, "RULE-SET,Custom_Direct_Classical_IP,")
    custom_proxy_domain = rule_index(rules, "RULE-SET,Custom_Proxy_Domain,")
    custom_proxy_ip = rule_index(rules, "RULE-SET,Custom_Proxy_Classical_IP,")
    ai_all = rule_index(rules, "RULE-SET,AI_All_Classical,")
    geoip_hk = rule_index(rules, "GEOIP,HK,")
    match = rule_index(rules, "MATCH,")

    ensure(private_site < private_ip < ssh_direct < ssh_proxy < gaming, "Private and SSH/Gaming rule order is wrong")
    if ENABLE_PROCESS_RULES:
        process_indices = [rule_index(rules, f"RULE-SET,{key},") for key in PROCESS_PROVIDER_KEYS]
        ensure(all(gaming < idx < custom_direct_domain for idx in process_indices), "Process rules must sit after Gaming and before Custom_Direct_Domain")
    ensure(gaming < custom_direct_domain < custom_direct_ip < custom_proxy_domain < custom_proxy_ip, "Custom direct/proxy order is wrong")

    ai_indices = [rule_index(rules, f"RULE-SET,{key},") for key in AI_PROVIDER_KEYS]
    ensure(custom_proxy_ip < ai_indices[0], "Custom proxy rules must precede AI rules")
    ensure(ai_indices == sorted(ai_indices), "Specific AI rules are out of order")
    ensure(ai_indices[-1] < ai_all < geoip_hk < match, "AI_All / GEOIP HK / MATCH order is wrong")


def validate_ini(text: str) -> None:
    ensure("[custom]" in text, "INI missing [custom] section")
    ensure("rule-providers:" not in text, "INI must not contain YAML rule-providers syntax")
    ensure("ruleset=" in text, "INI missing ruleset lines")
    ensure("custom_proxy_group=" in text, "INI missing custom_proxy_group lines")
    ensure("enable_rule_generator=true" in text, "INI must preserve enable_rule_generator=true")
    ensure("overwrite_original_rules=true" in text, "INI must preserve overwrite_original_rules=true")
    ensure("AI_All_Classical.yaml" in text, "INI missing AI_All_Classical ruleset")
    ensure(f"ruleset={GROUP['reject']},clash-classic:" in text and "AI_All_Classical.yaml,28800" in text, "INI must route AI_All_Classical to reject")
    ensure("DST-PORT,80" not in text and "DST-PORT,443" not in text, "INI must not contain DST-PORT 80/443 catch-all rules")
    if ENABLE_PROCESS_RULES:
        for phrase in PROCESS_WARNING_PHRASES:
            ensure(phrase in text, "INI missing process warning comments")
    else:
        for key in PROCESS_PROVIDER_KEYS:
            ensure(key not in text, f"INI must not reference {key} while disabled")

    rulesets = extract_ini_rulesets(text)
    rule_index_map = {line: idx for idx, line in enumerate(rulesets)}

    def ini_rule_index(needle: str) -> int:
        for idx, line in enumerate(rulesets):
            if needle in line:
                return idx
        raise ValidationError(f"Missing INI ruleset containing: {needle}")

    private_site = ini_rule_index("[]GEOSITE,private")
    private_ip = ini_rule_index("[]GEOIP,private,no-resolve")
    ssh_direct = ini_rule_index("SSH_Direct_Classical.yaml")
    ssh_proxy = ini_rule_index("SSH_Proxy_Classical.yaml")
    gaming = ini_rule_index("Gaming_Direct_Classical.yaml")
    custom_direct_domain = ini_rule_index("Custom_Direct_Domain.yaml")
    custom_direct_ip = ini_rule_index("Custom_Direct_Classical_IP.yaml")
    custom_proxy_domain = ini_rule_index("Custom_Proxy_Domain.yaml")
    custom_proxy_ip = ini_rule_index("Custom_Proxy_Classical_IP.yaml")
    ai_all = ini_rule_index("AI_All_Classical.yaml")
    geoip_hk = ini_rule_index("[]GEOIP,HK,no-resolve")
    final_rule = ini_rule_index("[]FINAL")

    ensure(private_site < private_ip < ssh_direct < ssh_proxy < gaming, "INI private/SSH/Gaming order is wrong")
    if ENABLE_PROCESS_RULES:
        process_indices = [ini_rule_index(f"{key}.yaml") for key in PROCESS_PROVIDER_KEYS]
        ensure(all(gaming < idx < custom_direct_domain for idx in process_indices), "INI Process_* rules must sit after Gaming and before Custom direct rules")
    ensure(gaming < custom_direct_domain < custom_direct_ip < custom_proxy_domain < custom_proxy_ip, "INI custom direct/proxy order is wrong")
    ai_indices = [ini_rule_index(f"{key}.yaml") for key in AI_PROVIDER_KEYS]
    ensure(ai_indices == sorted(ai_indices), "INI AI rules are out of order")
    ensure(ai_indices[-1] < ai_all < geoip_hk < final_rule, "INI AI_All / GEOIP HK / FINAL order is wrong")


def validate_ai_all() -> None:
    path = RULE_DIR / "AI_All_Classical.yaml"
    data = load_yaml(path)
    payload = data.get("payload")
    ensure(isinstance(payload, list), "AI_All_Classical payload must be a list")
    keywords: set[str] = set()
    for entry in payload:
        ensure(isinstance(entry, str) and entry.startswith("DOMAIN-KEYWORD,"), "AI_All_Classical must contain only DOMAIN-KEYWORD entries")
        keyword = entry.split(",", 1)[1]
        keywords.add(keyword)
    ensure(keywords == AI_ALL_ALLOWED_KEYWORDS, "AI_All_Classical keywords do not match the required set")
    banned_terms = {"ai", "x", "google", "microsoft", "bing"}
    ensure(not (keywords & banned_terms), "AI_All_Classical contains forbidden broad keywords")


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
            current_key = stripped[:-1]
            seen_local = set()
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
        data = load_yaml(path)
        payload = data.get("payload")
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
    for entry in [
        "+.tailscale.com",
        "+.tailscaled.com",
        "login.tailscale.com",
        "controlplane.tailscale.com",
        "log.tailscale.com",
    ]:
        ensure(entry in custom_direct_domain, f"Custom_Direct_Domain.yaml missing Tailscale entry {entry}")

    docs = {path.name: read_text(path) for path in DOC_PATHS}
    ensure("TProxy bypass" in docs["ssh-routing.md"] or "TProxy bypass" in docs["ai-profile-generator.md"], "Docs must mention TProxy bypass for Tailscale")
    ensure("UDP 41641" in docs["ssh-routing.md"], "Docs must mention Tailscale UDP 41641")
    ensure("UDP 3478" in docs["ssh-routing.md"], "Docs must mention Tailscale STUN UDP 3478")
    ensure("gaming CDN" in docs["node-normalization.md"].lower() or "cdn" in docs["node-normalization.md"].lower(), "Docs must mention gaming CDN direct rationale")


def validate_gaming_rule() -> None:
    path = RULE_DIR / "Gaming_Direct_Classical.yaml"
    text = read_text(path)
    data = load_yaml(path)
    payload = data.get("payload")
    ensure(isinstance(payload, list), "Gaming_Direct_Classical payload must be a list")
    ensure("DOMAIN-SUFFIX,ea.com" not in payload, "Gaming_Direct_Classical must not contain ea.com by default")
    if any(line.strip() == "- DOMAIN-SUFFIX,ea.com" for line in text.splitlines()):
        ensure("ALLOW_BROAD_EA_DIRECT_CONFIRMED" in text, "ea.com requires ALLOW_BROAD_EA_DIRECT_CONFIRMED comment")


def main() -> None:
    texts = {
        RELAXED_YAML.name: read_text(RELAXED_YAML),
        STRICT_YAML.name: read_text(STRICT_YAML),
        INI_PATH.name: read_text(INI_PATH),
        "AI_All_Classical.yaml": read_text(RULE_DIR / "AI_All_Classical.yaml"),
        "SSH_Direct_Classical.yaml": read_text(RULE_DIR / "SSH_Direct_Classical.yaml"),
        "SSH_Proxy_Classical.yaml": read_text(RULE_DIR / "SSH_Proxy_Classical.yaml"),
        "SSH_Process_Classical.yaml": read_text(RULE_DIR / "SSH_Process_Classical.yaml"),
        "Gaming_Direct_Classical.yaml": read_text(RULE_DIR / "Gaming_Direct_Classical.yaml"),
    }
    if ENABLE_PROCESS_RULES:
        for key in PROCESS_PROVIDER_KEYS:
            texts[f"{key}.yaml"] = read_text(RULE_DIR / f"{key}.yaml")

    validate_general_text(texts)
    validate_yaml_profile(RELAXED_YAML, strict=False)
    validate_yaml_profile(STRICT_YAML, strict=True)
    validate_ini(texts[INI_PATH.name])
    validate_ai_all()
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
