#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate AI profile outputs for OpenClash / Mihomo.

Outputs:
  - cfg/yaml/Custom_Clash_AI.yaml
  - cfg/yaml/Custom_Clash_AI_Strict.yaml
  - cfg/Custom_Clash_AI.ini
  - rule/AI_*_Classical.yaml
  - rule/SSH_*_Classical.yaml
  - rule/Gaming_Direct_Classical.yaml
  - optional rule/Process_*_Classical.yaml

The generator is the source of truth for the AI profile layout, kill-switch
behavior, rule-provider naming, and managed companion rules touched by the AI
profiles. Generated files must not be edited by hand.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
RULE_DIR = ROOT / "rule"
CFG_DIR = ROOT / "cfg"
YAML_DIR = CFG_DIR / "yaml"
DOCS_DIR = ROOT / "docs"
DATA_DIR = ROOT / "data"
INI_MVP_PLAN_PATH = ROOT / "generated" / "ai-routing" / "hk.ini-mvp-plan.json"

REPO_SLUG = "mythic3011/rules"
REPO_URL = f"https://github.com/{REPO_SLUG}"
BASE_URL = f"https://testingcf.jsdelivr.net/gh/{REPO_SLUG}@main"

OPENCLASH_SECRET = os.environ.get("OPENCLASH_SECRET", "").strip()
ENABLE_PROCESS_RULES = os.getenv("ENABLE_PROCESS_RULES", "false").lower() == "true"

PROVIDER_NOISE_EXCLUDE_TERMS = (
    r"剩余流量|剩餘流量|套餐到期|到期|流量[:：]|Traffic|Expire|Subscription|"
    r"官网|官方|客服|Telegram|TG群|网址|網站|更新|失效|Invalid|USE|USED|TOTAL|EXPIRE|"
    r"Panel|Channel|Author|公告|通知|邀请|邀請|返利|教程|使用说明|使用說明"
)
PROVIDER_NOISE_EXCLUDE_PATTERN = rf"(?i)({PROVIDER_NOISE_EXCLUDE_TERMS})"
AI_HK_EXCLUDE_TERMS = r"🇭🇰|香港|Hong Kong|Hong-Kong|\bHKG\b|\bHK\b"
AI_HK_EXCLUDE_PATTERN = rf"(?i)({AI_HK_EXCLUDE_TERMS})"
AI_POOL_FILTER = rf"(?i)^(?!.*(?:{AI_HK_EXCLUDE_TERMS}|{PROVIDER_NOISE_EXCLUDE_TERMS})).*$"

BUILTIN_DIRECT = "DIRECT"
BUILTIN_REJECT = "REJECT"

ZH_HK_TERMS = {
    "手动选择": "手動選擇",
    "自动选择": "自動選擇",
    "全球直连": "全球直連",
    "美国节点": "美國節點",
    "日本节点": "日本節點",
    "新加坡节点": "新加坡節點",
    "台湾节点": "台灣節點",
    "韩国节点": "韓國節點",
    "漏网之鱼": "漏網之魚",
    "拒绝": "拒絕",
    "专用": "專用",
    "严格版": "嚴格版",
    "节点": "節點",
    "订阅": "訂閱",
    "转换": "轉換",
    "设置": "設定",
    "项目地址": "項目地址",
    "作者": "作者",
    "分组": "分組",
}

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

REGION_TERMS = {
    "us": (
        r"🇺🇸|美國|美国|波特蘭|波特兰|達拉斯|达拉斯|俄勒岡|俄勒冈|鳳凰城|凤凰城|"
        r"費利蒙|费利蒙|硅谷|拉斯維加斯|拉斯维加斯|洛杉磯|洛杉矶|聖何塞|圣何塞|"
        r"聖克拉拉|圣克拉拉|西雅圖|西雅图|芝加哥|紐約|纽约|亞特蘭大|亚特兰大|"
        r"邁阿密|迈阿密|華盛頓|华盛顿|\bUS(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|"
        r"United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|"
        r"LAX|SFO|SEA|DFW|SJC"
    ),
    "jp": (
        r"🇯🇵|日本|東京|东京|大阪|關西|关西|埼玉|川日|泉日|滬日|沪日|深日|"
        r"\bJP(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|"
        r"Kansai"
    ),
    "sg": (
        r"🇸🇬|新加坡|獅城|狮城|\bSG(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|"
        r"Singapore|SIN"
    ),
    "tw": (
        r"🇹🇼|台灣|臺灣|台湾|台北|臺北|新北|台中|臺中|高雄|彰化|"
        r"\bTW(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|Taiwan|TWN|TPE|ROC"
    ),
    "kr": (
        r"🇰🇷|韓國|韩国|首爾|首尔|春川|"
        r"\bKR(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|Korea|KOR|Chuncheon|ICN"
    ),
}

PRIMARY_REGION_ORDER = ("us", "jp", "sg", "tw", "kr")
ALL_REGION_ORDER = (*PRIMARY_REGION_ORDER, "other")

REGION_FILTERS = {
    region: rf"(?i)(?:{terms})"
    for region, terms in REGION_TERMS.items()
}

KNOWN_REGION_TERMS = "|".join(
    rf"(?:{REGION_TERMS[region]})"
    for region in PRIMARY_REGION_ORDER
)
KNOWN_REGION_EXCLUDE_PATTERN = rf"(?i)(?:{KNOWN_REGION_TERMS})"

OTHER_REGION_FILTER = (
    rf"(?i)^(?!.*(?:"
    rf"{PROVIDER_NOISE_EXCLUDE_TERMS}|"
    rf"{AI_HK_EXCLUDE_TERMS}|"
    rf"{KNOWN_REGION_TERMS}"
    rf")).*$"
)

AI_SERVICES = [
    {
        "id": "chatgpt",
        "provider_key": "AI_ChatGPT_Classical",
        "group": GROUP["chatgpt"],
        "file": "AI_ChatGPT_Classical.yaml",
        "geosites": ("openai",),
        "payload": [],
        "regions": ("sg", "us", "jp", "tw", "kr"),
        "direct_relaxed": False,
    },
    {
        "id": "copilot",
        "provider_key": "AI_Copilot_Classical",
        "group": GROUP["copilot"],
        "file": "AI_Copilot_Classical.yaml",
        "geosites": ("github-copilot",),
        "payload": [
            "DOMAIN-SUFFIX,copilot.com",
            "DOMAIN-SUFFIX,copilot.microsoft.com",
            "DOMAIN-SUFFIX,copilot.cloud.microsoft",
        ],
        "regions": ("us", "sg", "jp", "tw", "kr"),
        "direct_relaxed": True,
    },
    {
        "id": "claude",
        "provider_key": "AI_Claude_Classical",
        "group": GROUP["claude"],
        "file": "AI_Claude_Classical.yaml",
        "geosites": ("anthropic",),
        "payload": [],
        "regions": ("sg", "us", "jp", "tw", "kr"),
        "direct_relaxed": False,
    },
    {
        "id": "gemini",
        "provider_key": "AI_Gemini_Classical",
        "group": GROUP["gemini"],
        "file": "AI_Gemini_Classical.yaml",
        "geosites": (),
        "payload": [
            "DOMAIN-SUFFIX,gemini.google",
            "DOMAIN-SUFFIX,ai.google.dev",
            "DOMAIN-SUFFIX,ai.studio",
            "DOMAIN-SUFFIX,aistudio.google.com",
            "DOMAIN-SUFFIX,gemini.gstatic.com",
            "DOMAIN-SUFFIX,generativeai.google",
            "DOMAIN-SUFFIX,makersuite.google.com",
            "DOMAIN,gemini.google.com",
            "DOMAIN,generativelanguage.googleapis.com",
            "DOMAIN,geller-pa.googleapis.com",
            "DOMAIN,proactivebackend-pa.googleapis.com",
            "DOMAIN,robinfrontend-pa.googleapis.com",
        ],
        "regions": ("sg", "us", "jp", "tw", "kr"),
        "direct_relaxed": True,
    },
    {
        "id": "notebooklm",
        "provider_key": "AI_NotebookLM_Classical",
        "group": GROUP["notebooklm"],
        "file": "AI_NotebookLM_Classical.yaml",
        "geosites": (),
        "payload": [
            "DOMAIN-SUFFIX,notebooklm.google.com",
            "DOMAIN-SUFFIX,notebooklm.google",
            "DOMAIN,notebooklm-pa.googleapis.com",
            "DOMAIN,notebooklm.googleapis.com",
        ],
        "regions": ("sg", "us", "jp", "tw", "kr"),
        "direct_relaxed": True,
    },
    {
        "id": "perplexity",
        "provider_key": "AI_Perplexity_Classical",
        "group": GROUP["perplexity"],
        "file": "AI_Perplexity_Classical.yaml",
        "geosites": ("perplexity",),
        "payload": [],
        "regions": ("sg", "us", "jp", "tw", "kr"),
        "direct_relaxed": True,
    },
    {
        "id": "grok",
        "provider_key": "AI_Grok_Classical",
        "group": GROUP["grok"],
        "file": "AI_Grok_Classical.yaml",
        "geosites": ("xai",),
        "payload": [],
        "regions": ("us", "sg", "jp", "tw", "kr"),
        "direct_relaxed": True,
    },
    {
        "id": "poe",
        "provider_key": "AI_Poe_Classical",
        "group": GROUP["poe"],
        "file": "AI_Poe_Classical.yaml",
        "geosites": ("poe",),
        "payload": [],
        "regions": ("sg", "us", "jp", "tw", "kr"),
        "direct_relaxed": False,
    },
]

# Only services with local delta entries need generated rule-provider files.
AI_RULESETS = [
    {
        "provider_key": service["provider_key"],
        "group": service["group"],
        "file": service["file"],
        "payload": service["payload"],
    }
    for service in AI_SERVICES
    if service["payload"]
]

AI_GUARD_GEOSITES = (
    "google-deepmind",
    "category-ai-!cn",
)

MANAGED_AI_RULE_FILES = {
    str(service["file"])
    for service in AI_SERVICES
} | {
    "AI_All_Classical.yaml",
}

SSH_RULESETS = [
    {
        "provider_key": "SSH_Direct_Classical",
        "group": GROUP["direct"],
        "file": "SSH_Direct_Classical.yaml",
        "payload": [],
        "comment_lines": [
            "# Generated by py/generate_ai_profiles.py",
            f"# REPO: {REPO_URL}",
            f"# SOURCE: {REPO_URL}/blob/main/py/generate_ai_profiles.py",
            "# Replace the exact /32 below with your real public SSH endpoint only.",
            "# Do not use broad provider subnets and do not add global DST-PORT,22.",
            "# Tailscale interface traffic should bypass TProxy at firewall/iptables level,",
            "# not only at rule level, because WireGuard UDP encapsulation is not visible",
            "# to domain-based rules.",
            "",
            "payload:",
            "  # - IP-CIDR,66.154.x.x/32,no-resolve",
        ],
    },
    {
        "provider_key": "SSH_Proxy_Classical",
        "group": GROUP["manual"],
        "file": "SSH_Proxy_Classical.yaml",
        "payload": [],
        "comment_lines": [
            "# Generated by py/generate_ai_profiles.py",
            f"# REPO: {REPO_URL}",
            f"# SOURCE: {REPO_URL}/blob/main/py/generate_ai_profiles.py",
            "# Use this file for intentionally proxied SSH endpoints only.",
            "# Add narrow DOMAIN, DOMAIN-SUFFIX, or IP-CIDR entries after testing.",
            "",
            "payload:",
            "  # - DOMAIN,vps.example.com",
            "  # - IP-CIDR,203.0.113.10/32,no-resolve",
        ],
    },
    {
        "provider_key": "SSH_Process_Classical",
        "group": GROUP["direct"],
        "file": "SSH_Process_Classical.yaml",
        "payload": [],
        "comment_lines": [
            "# Generated by py/generate_ai_profiles.py",
            f"# REPO: {REPO_URL}",
            f"# SOURCE: {REPO_URL}/blob/main/py/generate_ai_profiles.py",
            "# Desktop-only compatibility surface.",
            "# PROCESS-NAME rules only work when Mihomo/Clash runs on the same host",
            "# as the process. OpenClash router mode normally cannot see client",
            "# PROCESS-NAME values from LAN devices.",
            "",
            "payload:",
            "  # - PROCESS-NAME,ssh",
            "  # - PROCESS-NAME,scp",
        ],
    },
]

GAMING_RULESET = {
    "provider_key": "Gaming_Direct_Classical",
    "group": GROUP["direct"],
    "file": "Gaming_Direct_Classical.yaml",
    "payload": [
        "DOMAIN-SUFFIX,steamcontent.com",
        "DOMAIN-SUFFIX,steampipe.akamaized.net",
        "DOMAIN-SUFFIX,steamserver.net",
        "DOMAIN-SUFFIX,battle.net",
        "DOMAIN-SUFFIX,blizzard.com",
        "DOMAIN-SUFFIX,blzstatic.cn",
        "DOMAIN-SUFFIX,origin.com",
        "DOMAIN-SUFFIX,warframe.com",
        "DOMAIN-SUFFIX,square-enix.com",
        "DOMAIN-SUFFIX,finalfantasyxiv.com",
        "DOMAIN-SUFFIX,ffxiv.com",
        "DOMAIN-SUFFIX,nintendo.net",
        "DOMAIN-SUFFIX,srv.nintendo.net",
        "DOMAIN-SUFFIX,cdn.nintendo.net",
        "DOMAIN-SUFFIX,stun.playstation.net",
        "DOMAIN-SUFFIX,xboxlive.com",
        "DOMAIN-SUFFIX,uu.163.com",
        "DOMAIN-SUFFIX,n0808.com",
        "DOMAIN-SUFFIX,sandai.net",
        "DOMAIN-SUFFIX,epicgames.com",
        "DOMAIN-SUFFIX,epicgamescdn.com",
    ],
    "comments": [
        "# Game update CDN - direct for performance and UDP stability",
        "# EA caution:",
        "# Do not add DOMAIN-SUFFIX,ea.com by default.",
        "# ea.com can include account login/auth endpoints, not only CDN traffic.",
        "# Add narrower EA CDN/game domains only after testing your region/account behavior.",
    ],
}

PROCESS_RULESET_SPECS = [
    {
        "key": "p2p",
        "provider_key": "Process_P2P_Classical",
        "file": "Process_P2P_Classical.yaml",
        "group": GROUP["direct"],
    },
    {
        "key": "download",
        "provider_key": "Process_Download_Classical",
        "file": "Process_Download_Classical.yaml",
        "group": GROUP["direct"],
    },
    {
        "key": "proxy_tools",
        "provider_key": "Process_ProxyTools_Classical",
        "file": "Process_ProxyTools_Classical.yaml",
        "group": GROUP["manual"],
    },
    {
        "key": "gaming",
        "provider_key": "Process_Gaming_Classical",
        "file": "Process_Gaming_Classical.yaml",
        "group": GROUP["direct"],
    },
]

PROCESS_RULES_WARNING = [
    "# PROCESS-NAME rules only work when Mihomo runs on the same device as the process.",
    "# These rules have NO EFFECT in OpenClash router transparent proxy mode.",
    "# Enable only if deploying Mihomo directly on a desktop/server, not on a router.",
    "# Set ENABLE_PROCESS_RULES=true in generator env to regenerate these sections.",
]

MANAGED_TAILSCALE_DOMAIN_MARKER = "# Managed by py/generate_ai_profiles.py: Tailscale direct routing"
MANAGED_TAILSCALE_IP_MARKER = "# Managed by py/generate_ai_profiles.py: Tailscale IP verification note"
TAILSCALE_DOMAIN_ENTRIES = [
    "+.tailscale.com",
    "+.tailscaled.com",
    "login.tailscale.com",
    "controlplane.tailscale.com",
    "log.tailscale.com",
]


def zh_hk(text: str) -> str:
    for cn, hk in ZH_HK_TERMS.items():
        text = text.replace(cn, hk)
    return text


def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def indent(text: str, spaces: int) -> str:
    prefix = " " * spaces
    return "\n".join(f"{prefix}{line}" if line else "" for line in text.splitlines())


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8", newline="\n")


def load_process_rule_source() -> dict[str, list[str]]:
    if not ENABLE_PROCESS_RULES:
        return {}

    source_path = DATA_DIR / "process_rules.yaml"
    if not source_path.exists():
        raise FileNotFoundError(
            f"Missing process rules source: {source_path}. "
            "Create data/process_rules.yaml before enabling process rules."
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
    for spec in PROCESS_RULESET_SPECS:
        names = process_rules.get(spec["key"], [])
        unique_names: list[str] = []
        local_seen: set[str] = set()
        for name in sorted(names, key=str.casefold):
            key = name.casefold()
            if key in local_seen or key in seen:
                continue
            local_seen.add(key)
            seen.add(key)
            unique_names.append(name)
        deduped[spec["key"]] = unique_names
    return deduped


def render_rule_file(
    provider_key: str,
    group: str,
    payload: list[str],
    extra_comments: list[str] | None = None,
) -> str:
    lines = [
        "# Generated by py/generate_ai_profiles.py",
        f"# REPO: {REPO_URL}",
        f"# SOURCE: {REPO_URL}/blob/main/py/generate_ai_profiles.py",
        f"# RULE-PROVIDER: {provider_key}",
        f"# GROUP: {group}",
        f"# TOTAL: {len(payload)}",
    ]
    if extra_comments:
        lines.append("")
        lines.extend(extra_comments)
    lines.extend(["", "payload:"])
    lines.extend(f"  - {yaml_string(rule)}" for rule in payload)
    return "\n".join(lines)


def render_process_rule_file(provider_key: str, group: str, payload: list[str]) -> str:
    return render_rule_file(
        provider_key=provider_key,
        group=group,
        payload=[f"PROCESS-NAME,{name}" for name in payload],
        extra_comments=PROCESS_RULES_WARNING,
    )


def render_custom_comment_rule_file(comment_lines: list[str]) -> str:
    return "\n".join(comment_lines)


def append_domain_entries(path: Path, marker: str, comment_lines: list[str], entries: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    missing_entries = [entry for entry in entries if entry not in text]
    if not missing_entries and marker in text:
        return

    lines = text.rstrip().splitlines()
    if marker not in text:
        lines.extend(["", marker, *comment_lines])
    for entry in missing_entries:
        lines.append(f"  - '{entry}'")
    write_text(path, "\n".join(lines))


def append_comment_block(path: Path, marker: str, comment_lines: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    lines = text.rstrip().splitlines()
    lines.extend(["", marker, *comment_lines])
    write_text(path, "\n".join(lines))


def ensure_custom_direct_supporting_rules() -> None:
    custom_direct_domain = RULE_DIR / "Custom_Direct_Domain.yaml"
    append_domain_entries(
        custom_direct_domain,
        MANAGED_TAILSCALE_DOMAIN_MARKER,
        [
            "# Tailscale control-plane domains should route DIRECT.",
            "# fake-ip-filter only affects DNS handling. It does not force DIRECT routing.",
            "# Tailscale exit-node traffic still needs firewall-level TProxy bypass",
            "# for the tailscale interface on router deployments.",
        ],
        TAILSCALE_DOMAIN_ENTRIES,
    )

    custom_direct_classical_ip = RULE_DIR / "Custom_Direct_Classical_IP.yaml"
    append_comment_block(
        custom_direct_classical_ip,
        MANAGED_TAILSCALE_IP_MARKER,
        [
            "# Tailscale IP ranges and DERP relay destinations change over time.",
            "# Do not hardcode Tailscale CIDR ranges without a dated verification step.",
            "# Prefer domain DIRECT rules plus firewall-level TProxy bypass for the tailscale interface.",
            "# Verify current official Tailscale firewall guidance before adding static IP-CIDR rules.",
        ],
    )


def service_region_groups(service: dict[str, object]) -> list[str]:
    groups = [
        GROUP[str(region)]
        for region in service["regions"]
    ]
    groups.append(GROUP["other"])
    return groups


def all_region_groups() -> list[str]:
    return [GROUP[region] for region in ALL_REGION_ORDER]


def manual_group_proxies(strict: bool) -> list[str]:
    proxies = [
        GROUP["auto"],
        *all_region_groups(),
    ]
    if not strict:
        proxies.insert(1, GROUP["direct"])
    proxies.append(GROUP["reject"])
    return proxies


def service_auto_group_name(service_group: str) -> str:
    return f"{service_group} · 自動"


def service_auto_proxies(service: dict[str, object], strict: bool) -> list[str]:
    # DIRECT must not be part of an availability fallback. A generic HTTP
    # health check cannot determine whether an AI service is region-usable.
    proxies = service_region_groups(service)
    proxies.append(GROUP["reject"])
    return proxies


def service_ui_proxies(service: dict[str, object], strict: bool) -> list[str]:
    proxies = [
        service_auto_group_name(str(service["group"])),
        GROUP["manual"],
        GROUP["auto"],
    ]
    if service["direct_relaxed"] and not strict:
        proxies.append(GROUP["direct"])
    proxies.extend(service_region_groups(service))
    proxies.append(GROUP["reject"])
    return proxies


def render_ini_service_groups(service: dict[str, object]) -> list[str]:
    auto_proxies = service_region_groups(service)
    auto_proxies.append(GROUP["reject"])
    auto_candidates = ini_group_candidates(auto_proxies)

    ui_proxies = [
        service_auto_group_name(str(service["group"])),
        GROUP["manual"],
        GROUP["auto"],
    ]

    if service["direct_relaxed"]:
        ui_proxies.append(GROUP["direct"])

    ui_proxies.extend(service_region_groups(service))
    ui_proxies.append(GROUP["reject"])
    ui_candidates = ini_group_candidates(ui_proxies)

    return [
        (
            f"custom_proxy_group={service_auto_group_name(str(service['group']))}"
            f"`fallback`{auto_candidates}`https://cp.cloudflare.com/generate_204`300,,50"
        ),
        f"custom_proxy_group={service['group']}`select`{ui_candidates}",
    ]


def ini_group_candidates(groups: list[str]) -> str:
    return "`".join(f"[]{group}" for group in groups)


def yaml_proxy_list(groups: list[str], indent_level: int = 4) -> list[str]:
    prefix = " " * indent_level
    return [
        f"{prefix}- {yaml_string(group)}"
        for group in groups
    ]


def render_ini_manual_group() -> str:
    candidates = ini_group_candidates(
        [
            GROUP["auto"],
            GROUP["direct"],
            *all_region_groups(),
            GROUP["reject"],
        ]
    )
    return (
        f"custom_proxy_group={GROUP['manual']}"
        f"`select`{candidates}`{AI_POOL_FILTER}"
    )


def render_ini_global_auto_group() -> str:
    candidates = ini_group_candidates(
        [
            *all_region_groups(),
            GROUP["reject"],
        ]
    )
    return (
        f"custom_proxy_group={GROUP['auto']}"
        f"`fallback`{candidates}`https://cp.cloudflare.com/generate_204`300,,50"
    )


def render_proxy_groups(strict: bool) -> str:
    def group_block(name: str, group_type: str, lines: list[str]) -> str:
        block = [f'- name: "{name}"', f"  type: {group_type}"]
        block.extend(lines)
        return "\n".join(block)

    def fallback_group(name: str, proxies: list[str]) -> str:
        lines = [
            '  url: "https://cp.cloudflare.com/generate_204"',
            "  interval: 300",
            "  proxies:",
        ]
        lines.extend(yaml_proxy_list(proxies))
        return group_block(name, "fallback", lines)

    blocks = [
        group_block(
            GROUP["manual"],
            "select",
            [
                "  proxies:",
                *yaml_proxy_list(manual_group_proxies(strict)),
                f'  filter: "{AI_POOL_FILTER}"',
                "  use:",
                "    - provider1",
            ],
        ),
        group_block(
            GROUP["auto"],
            "url-test",
            [
                f'  filter: "{AI_POOL_FILTER}"',
                "  tolerance: 50",
                '  url: "https://cp.cloudflare.com/generate_204"',
                "  interval: 300",
                "  use:",
                "    - provider1",
            ],
        ),
    ]

    for service in AI_SERVICES:
        service_group = str(service["group"])
        blocks.append(
            group_block(
                service_group,
                "select",
                [
                    "  proxies:",
                    *yaml_proxy_list(service_ui_proxies(service, strict)),
                ],
            )
        )
        blocks.append(
            fallback_group(
                service_auto_group_name(service_group),
                service_auto_proxies(service, strict),
            )
        )

    blocks.append(group_block(GROUP["reject"], "select", ["  proxies:", "    - REJECT"]))

    fallback_proxies = [GROUP["manual"], GROUP["auto"], GROUP["reject"]]
    if not strict:
        fallback_proxies.insert(0, GROUP["direct"])
    blocks.append(
        group_block(
            GROUP["fallback"],
            "select",
            ["  proxies:", *(f'    - "{proxy}"' for proxy in fallback_proxies)],
        )
    )

    for region in PRIMARY_REGION_ORDER:
        blocks.append(
            group_block(
                GROUP[region],
                "url-test",
                [
                    '  url: "https://cp.cloudflare.com/generate_204"',
                    "  interval: 300",
                    "  tolerance: 50",
                    f"  filter: '{REGION_FILTERS[region]}'",
                    "  use:",
                    "    - provider1",
                ],
            )
        )

    blocks.append(
        group_block(
            GROUP["other"],
            "url-test",
            [
                '  url: "https://cp.cloudflare.com/generate_204"',
                "  interval: 300",
                "  tolerance: 50",
                f"  filter: {yaml_string(AI_POOL_FILTER)}",
                (
                    "  exclude-filter: "
                    f"{yaml_string(KNOWN_REGION_EXCLUDE_PATTERN)}"
                ),
                "  use:",
                "    - provider1",
            ],
        )
    )

    blocks.append(group_block(GROUP["direct"], "select", ["  proxies:", "    - DIRECT"]))
    return "\n".join(blocks).rstrip()


def render_ai_yaml_rules() -> list[str]:
    lines: list[str] = []

    for service in AI_SERVICES:
        if service["payload"]:
            lines.append(
                f'  - "RULE-SET,{service["provider_key"]},{service["group"]}"'
            )

        for geosite in service["geosites"]:
            lines.append(
                f'  - "GEOSITE,{geosite},{service["group"]}"'
            )

    for geosite in AI_GUARD_GEOSITES:
        lines.append(
            f'  - "GEOSITE,{geosite},{GROUP["reject"]}"'
        )

    return lines


def render_yaml_rules(strict: bool, include_process_rules: bool) -> str:
    lines = [
        f'  - "GEOSITE,private,{GROUP["direct"]}"',
        f'  - "GEOIP,private,{GROUP["direct"]},no-resolve"',
    ]

    # AI rules must precede user custom/direct rules so that strict routing
    # cannot be bypassed by a broad custom entry.
    lines.extend(render_ai_yaml_rules())

    if not strict:
        lines.extend(
            [
                f'  - "RULE-SET,SSH_Direct_Classical,{GROUP["direct"]}"',
                f'  - "RULE-SET,SSH_Proxy_Classical,{GROUP["manual"]}"',
                f'  - "RULE-SET,Gaming_Direct_Classical,{GROUP["direct"]}"',
            ]
        )

        if include_process_rules:
            lines.extend(PROCESS_RULES_WARNING)
            for spec in PROCESS_RULESET_SPECS:
                lines.append(
                    f'  - "RULE-SET,{spec["provider_key"]},{spec["group"]}"'
                )

        lines.extend(
            [
                f'  - "RULE-SET,Custom_Direct_Domain,{GROUP["direct"]}"',
                f'  - "RULE-SET,Custom_Direct_Classical_IP,{GROUP["direct"]}"',
                f'  - "RULE-SET,Custom_Proxy_Domain,{GROUP["manual"]}"',
                f'  - "RULE-SET,Custom_Proxy_Classical_IP,{GROUP["manual"]}"',
                f'  - "GEOIP,HK,{GROUP["direct"]},no-resolve"',
            ]
        )

    lines.append(
        f'  - "MATCH,{GROUP["reject"] if strict else GROUP["fallback"]}"'
    )
    return "\n".join(lines)


def render_rule_providers(include_process_rules: bool, strict: bool) -> str:
    providers: list[dict[str, str]] = []

    if not strict:
        providers.extend(
            [
                {
                    "name": "Custom_Direct_Domain",
                    "behavior": "domain",
                    "url": f"{BASE_URL}/rule/Custom_Direct_Domain.yaml",
                    "format": "yaml",
                },
                {
                    "name": "Custom_Direct_Classical_IP",
                    "behavior": "classical",
                    "url": f"{BASE_URL}/rule/Custom_Direct_Classical_IP.yaml",
                    "format": "yaml",
                },
                {
                    "name": "Custom_Proxy_Domain",
                    "behavior": "domain",
                    "url": f"{BASE_URL}/rule/Custom_Proxy_Domain.yaml",
                    "format": "yaml",
                },
                {
                    "name": "Custom_Proxy_Classical_IP",
                    "behavior": "classical",
                    "url": f"{BASE_URL}/rule/Custom_Proxy_Classical_IP.yaml",
                    "format": "yaml",
                },
                {
                    "name": "SSH_Direct_Classical",
                    "behavior": "classical",
                    "url": f"{BASE_URL}/rule/SSH_Direct_Classical.yaml",
                    "format": "yaml",
                },
                {
                    "name": "SSH_Proxy_Classical",
                    "behavior": "classical",
                    "url": f"{BASE_URL}/rule/SSH_Proxy_Classical.yaml",
                    "format": "yaml",
                },
                {
                    "name": "Gaming_Direct_Classical",
                    "behavior": "classical",
                    "url": f"{BASE_URL}/rule/Gaming_Direct_Classical.yaml",
                    "format": "yaml",
                },
            ]
        )

    if include_process_rules and not strict:
        for spec in PROCESS_RULESET_SPECS:
            providers.append(
                {
                    "name": spec["provider_key"],
                    "behavior": "classical",
                    "url": f"{BASE_URL}/rule/{spec['file']}",
                    "format": "yaml",
                }
            )

    for item in AI_RULESETS:
        providers.append(
            {
                "name": item["provider_key"],
                "behavior": "classical",
                "url": f"{BASE_URL}/rule/{item['file']}",
                "format": "yaml",
            }
        )

    blocks = []
    for provider in providers:
        blocks.append(
            "\n".join(
                [
                    f'{provider["name"]}:',
                    f'  behavior: {provider["behavior"]}',
                    "  interval: 10800",
                    "  type: http",
                    f'  url: "{provider["url"]}"',
                    f'  format: {provider["format"]}',
                ]
            )
        )
    return "\n\n".join(blocks)


def render_secret_lines() -> list[str]:
    if OPENCLASH_SECRET:
        return [f"secret: {yaml_string(OPENCLASH_SECRET)}"]
    return [
        "# WARNING: Set OPENCLASH_SECRET before deploying. Do not commit real secrets.",
        'secret: ""',
    ]


def render_yaml(strict: bool) -> str:
    title = zh_hk("YAML 配置文件（AI 专用严格版）" if strict else "YAML 配置文件（AI 专用）")

    lines = [
        "# Custom_OpenClash_Rules",
        f"# {title}",
        "# 適用於需要 AI 分流與 DNS 洩漏保護的 OpenWrt / OpenClash 場景",
        "# 基於 Custom_Clash.yaml 精簡：僅保留 AI 分流與基礎網路配置",
    ]
    if strict:
        lines.extend(
            [
                "# 嚴格版 AI kill-switch：",
                "# 1. 指定 AI 規則走對應服務組",
                "# 2. 上游 AI guard GEOSITE 命中後直落 ⛔ 拒絕",
                "# 3. 最終 MATCH 仍然直落 ⛔ 拒絕",
            ]
        )
    else:
        lines.append("# 寬鬆版最終 MATCH 會落到 🐟 漏網之魚，並以 ⛔ 拒絕作最後兜底。")
    lines.extend(
        [
            "# GENERATED by py/generate_ai_profiles.py. Do not edit manually.",
            "",
            "# ==================== 端口配置 Port Configuration ====================",
            "port: 7890",
            "socks-port: 7891",
            "mixed-port: 7893",
            "redir-port: 7892",
            "tproxy-port: 7895",
            "allow-lan: true",
            'bind-address: "*"',
            "mode: rule",
            "tcp-concurrent: true",
            "unified-delay: true",
            "",
            "# ==================== 代理提供者 Proxy Provider ====================",
            "proxy-providers:",
            "  provider1:",
            "    type: http",
            '    url: "url"',
            "    interval: 3600",
            "    path: ./proxy_provider/provider1.yaml",
            "    proxy: DIRECT",
            "    header:",
            "    health-check:",
            "      enable: true",
            "      interval: 600",
            "      url: https://cp.cloudflare.com/generate_204",
            "    override:",
            "      skip-cert-verify: true",
            "      udp: true",
            f"    exclude-filter: {yaml_string(PROVIDER_NOISE_EXCLUDE_PATTERN)}",
            "",
            "# ==================== 地理数据库配置 GeoData Configuration ====================",
            "geox-url:",
            "  mmdb: https://testingcf.jsdelivr.net/gh/alecthw/mmdb_china_ip_list@release/Country.mmdb",
            "  geoip: https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat",
            "  geosite: https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat",
            "  asn: https://testingcf.jsdelivr.net/gh/xishang0128/geoip@release/GeoLite2-ASN.mmdb",
            "geo-auto-update: true",
            "geo-update-interval: 24",
            "geodata-mode: true",
            "",
            "# ==================== 日志与控制 ====================",
            "log-level: info",
            "ipv6: true",
            "external-controller: 0.0.0.0:9090",
            *render_secret_lines(),
            "",
            "# ==================== 配置文件存储 Profile ====================",
            "profile:",
            "  store-selected: true",
            "  store-fake-ip: true",
            "",
            "# ==================== TUN 虚拟网卡配置 ====================",
            "tun:",
            "  enable: true",
            "  stack: system",
            "  dns-hijack:",
            "    - 0.0.0.0:53",
            "  auto-detect-interface: false",
            "  auto-route: false",
            "  auto-redirect: false",
            "  strict-route: false",
            "  endpoint-independent-nat: true",
            "",
            "# ==================== DNS 配置 ====================",
            "dns:",
            "  enable: true",
            "  listen: 0.0.0.0:7874",
            "  ipv6: true",
            "  enhanced-mode: fake-ip",
            "  fake-ip-range: 198.18.0.1/16",
            "  fake-ip-filter:",
            '    - "*.lan"',
            "    - localhost.ptlogin2.qq.com",
            "  fake-ip-filter-mode: blacklist",
            "  respect-rules: true",
            "  default-nameserver:",
            "    - 1.1.1.1",
            "    - 8.8.8.8",
            "  nameserver:",
            "    - https://1.1.1.1/dns-query",
            "    - https://dns.google/dns-query",
            "    - https://dns.adguard-dns.com/dns-query",
            "  proxy-server-nameserver:",
            "    - https://1.1.1.1/dns-query",
            "    - https://dns.google/dns-query",
            "    - https://dns.adguard-dns.com/dns-query",
            "  direct-nameserver:",
            "    - https://127.0.0.1:5053/dns-query",
            "  direct-nameserver-follow-policy: false",
            "  nameserver-policy:",
            '    "geosite:private":',
            "      - https://1.1.1.1/dns-query",
            "      - https://dns.google/dns-query",
            '    "geosite:cn":',
            "      - https://127.0.0.1:5053/dns-query",
            '    "geosite:openai":',
            "      - https://1.1.1.1/dns-query",
            "      - https://dns.google/dns-query",
            '    "geosite:bing":',
            "      - https://1.1.1.1/dns-query",
            "      - https://dns.google/dns-query",
            '    "geosite:category-ads-all":',
            "      - https://dns.adguard-dns.com/dns-query",
            "      - https://1.1.1.1/dns-query",
            '    "+.anthropic.com":',
            "      - https://1.1.1.1/dns-query",
            "      - https://dns.google/dns-query",
            '    "+.claude.ai":',
            "      - https://1.1.1.1/dns-query",
            "      - https://dns.google/dns-query",
            '    "+.perplexity.ai":',
            "      - https://1.1.1.1/dns-query",
            "      - https://dns.google/dns-query",
            '    "+.x.ai":',
            "      - https://1.1.1.1/dns-query",
            "      - https://dns.google/dns-query",
            '    "+.poe.com":',
            "      - https://1.1.1.1/dns-query",
            "      - https://dns.google/dns-query",
            "",
            "# ==================== 代理策略组 Proxy Groups ====================",
            "proxy-groups:",
            indent(render_proxy_groups(strict), 2),
            "",
            "# ==================== 分流规则 Rules ====================",
            "rules:",
            indent(render_yaml_rules(strict, ENABLE_PROCESS_RULES), 2),
            "",
            "# ==================== 规则提供者 Rule Providers ====================",
            "rule-providers:",
            indent(render_rule_providers(ENABLE_PROCESS_RULES, strict), 2),
        ]
    )
    return "\n".join(lines)


def render_ini() -> str:
    ini_mvp = load_ini_mvp_plan()
    lines = [
        ";Custom_OpenClash_Rules",
        f";{zh_hk('AI 专用订阅转换模板（YAML / INI 行为显式分离）')}",
        f";{zh_hk('作者')}：{REPO_URL}",
        f";{zh_hk('项目地址')}：{REPO_URL}",
        ";基於 Custom_Clash_AI.yaml 的寬鬆版路由策略，但維持 subconverter [custom] 方言。",
        ";YAML 使用 rule-providers；INI 只使用 ruleset= / custom_proxy_group=，不包含 YAML rule-providers 語法。",
        ";Provider-level exclude-filter only applies to YAML output. INI relies on group regex filtering and explicit comments.",
        ";Cloudflare generate_204 checks proxy reachability only. It does not validate SSH-to-VPS path quality.",
        ";GENERATED by py/generate_ai_profiles.py. Do not edit manually.",
        "",
        "[custom]",
        ";設定規則標誌位",
        ";以下規則按由上而下順序遍歷，優先命中上位規則，規則重複無影響",
        "",
        f"ruleset={GROUP['direct']},[]GEOSITE,private",
        f"ruleset={GROUP['direct']},[]GEOIP,private,no-resolve",
    ]

    lines.extend(render_ini_mvp_rules(ini_mvp["rules"]["beforeLegacy"]))

    for service in AI_SERVICES:
        if service["id"] in ini_mvp["migration"]["legacyReplacementIds"]:
            continue
        if service["payload"]:
            lines.append(
                f"ruleset={service['group']},"
                f"clash-classic:{BASE_URL}/rule/{service['file']},28800"
            )

        for geosite in service["geosites"]:
            lines.append(
                f"ruleset={service['group']},[]GEOSITE,{geosite}"
            )

    lines.extend(render_ini_mvp_rules(ini_mvp["rules"]["afterLegacy"]))

    lines.extend(
        [
            f"ruleset={GROUP['direct']},clash-classic:{BASE_URL}/rule/SSH_Direct_Classical.yaml,28800",
            f"ruleset={GROUP['manual']},clash-classic:{BASE_URL}/rule/SSH_Proxy_Classical.yaml,28800",
            f"ruleset={GROUP['direct']},clash-classic:{BASE_URL}/rule/Gaming_Direct_Classical.yaml,28800",
        ]
    )

    if ENABLE_PROCESS_RULES:
        lines.extend(PROCESS_RULES_WARNING)
        for spec in PROCESS_RULESET_SPECS:
            lines.append(
                f"ruleset={spec['group']},clash-classic:{BASE_URL}/rule/{spec['file']},28800"
            )

    lines.extend(
        [
            f"ruleset={GROUP['direct']},clash-domain:{BASE_URL}/rule/Custom_Direct_Domain.yaml,28800",
            f"ruleset={GROUP['direct']},clash-classic:{BASE_URL}/rule/Custom_Direct_Classical_IP.yaml,28800",
            f"ruleset={GROUP['manual']},clash-domain:{BASE_URL}/rule/Custom_Proxy_Domain.yaml,28800",
            f"ruleset={GROUP['manual']},clash-classic:{BASE_URL}/rule/Custom_Proxy_Classical_IP.yaml,28800",
        ]
    )

    lines.extend(
        [
            f"ruleset={GROUP['direct']},[]GEOIP,HK,no-resolve",
            f"ruleset={GROUP['fallback']},[]FINAL",
            ";設定節點分組標誌位",
            render_ini_manual_group(),
            render_ini_global_auto_group(),
        ]
    )

    for service in AI_SERVICES:
        if service["id"] in ini_mvp["migration"]["legacyReplacementIds"]:
            continue
        lines.extend(render_ini_service_groups(service))

    lines.extend(render_ini_mvp_groups(ini_mvp["groups"]))

    lines.extend(
        [
            f"custom_proxy_group={GROUP['reject']}`select`[]REJECT",
            f"custom_proxy_group={GROUP['fallback']}`select`[]{GROUP['direct']}`[]{GROUP['manual']}`[]{GROUP['auto']}`[]{GROUP['other']}`[]{GROUP['reject']}",
            f"custom_proxy_group={GROUP['us']}`url-test`{REGION_FILTERS['us']}`https://cp.cloudflare.com/generate_204`300,,50",
            f"custom_proxy_group={GROUP['jp']}`url-test`{REGION_FILTERS['jp']}`https://cp.cloudflare.com/generate_204`300,,50",
            f"custom_proxy_group={GROUP['sg']}`url-test`{REGION_FILTERS['sg']}`https://cp.cloudflare.com/generate_204`300,,50",
            f"custom_proxy_group={GROUP['tw']}`url-test`{REGION_FILTERS['tw']}`https://cp.cloudflare.com/generate_204`300,,50",
            f"custom_proxy_group={GROUP['kr']}`url-test`{REGION_FILTERS['kr']}`https://cp.cloudflare.com/generate_204`300,,50",
            f"custom_proxy_group={GROUP['other']}`url-test`{OTHER_REGION_FILTER}`https://cp.cloudflare.com/generate_204`300,,50",
            f"custom_proxy_group={GROUP['direct']}`select`[]DIRECT",
            ";下方參數請勿修改",
            "enable_rule_generator=true",
            "overwrite_original_rules=true",
        ]
    )
    return "\n".join(lines) + "\n"


def load_ini_mvp_plan() -> dict[str, object]:
    """Load the TypeScript-owned plan; Python only renders its declared shape."""
    try:
        value = json.loads(INI_MVP_PLAN_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"INI MVP plan is unavailable: {INI_MVP_PLAN_PATH}") from exc
    if not isinstance(value, dict) or set(value) != {"schemaVersion", "policyVersion", "profile", "externalGroups", "migration", "accountProtection", "rules", "groups"}:
        raise RuntimeError("INI MVP plan has an unknown or incomplete shape")
    if type(value.get("schemaVersion")) is not int or value.get("schemaVersion") != 1 or value.get("profile") != "hk" or not isinstance(value.get("policyVersion"), str) or not value["policyVersion"]:
        raise RuntimeError("INI MVP plan has an unsupported version or profile")
    external_groups = value.get("externalGroups")
    if not isinstance(external_groups, list) or not external_groups or any(not isinstance(group, str) or not group for group in external_groups) or len(set(external_groups)) != len(external_groups):
        raise RuntimeError("INI MVP plan has invalid external groups")
    migration = value.get("migration")
    if not isinstance(migration, dict) or set(migration) != {"migratedServiceIds", "legacyReplacementIds"}:
        raise RuntimeError("INI MVP plan has an invalid migration shape")
    migrated_ids = migration.get("migratedServiceIds")
    replacement_ids = migration.get("legacyReplacementIds")
    if not isinstance(migrated_ids, list) or not migrated_ids or any(not isinstance(item, str) or not item for item in migrated_ids) or len(set(migrated_ids)) != len(migrated_ids):
        raise RuntimeError("INI MVP plan has invalid migrated service IDs")
    if not isinstance(replacement_ids, list) or not replacement_ids or any(not isinstance(item, str) or not item for item in replacement_ids) or len(set(replacement_ids)) != len(replacement_ids) or not set(replacement_ids).issubset(migrated_ids):
        raise RuntimeError("INI MVP plan has invalid legacy replacement IDs")
    account = value.get("accountProtection")
    if not isinstance(account, dict) or set(account) != {"protectedGroup", "rejectGroup"} or any(not isinstance(account.get(key), str) or not account[key] for key in ("protectedGroup", "rejectGroup")):
        raise RuntimeError("INI MVP plan has invalid account protection metadata")
    if account["rejectGroup"] not in external_groups:
        raise RuntimeError("INI MVP external groups must include the account reject group")
    rules = value.get("rules")
    if not isinstance(rules, dict) or set(rules) != {"beforeLegacy", "afterLegacy"}:
        raise RuntimeError("INI MVP plan has an invalid rules shape")
    before_legacy = validate_ini_mvp_rules(rules.get("beforeLegacy"), "beforeLegacy")
    after_legacy = validate_ini_mvp_rules(rules.get("afterLegacy"), "afterLegacy")
    if len(before_legacy) != 2 or not after_legacy:
        raise RuntimeError("INI MVP plan requires ordered before/after legacy rules")
    all_rule_keys = [
        (record["kind"], record["target"], record.get("url"), record.get("interval"), record.get("value"))
        for record in [*before_legacy, *after_legacy]
    ]
    if len(set(all_rule_keys)) != len(all_rule_keys):
        raise RuntimeError("INI MVP plan rule records must be unique across sections")
    first_rule, terminal_reject = before_legacy[0], before_legacy[1]
    if first_rule["kind"] != "remote-classical" or terminal_reject["kind"] != "remote-classical" or first_rule["target"] != account["protectedGroup"] or terminal_reject["target"] != account["rejectGroup"] or first_rule["url"] != terminal_reject["url"] or first_rule["interval"] != terminal_reject["interval"]:
        raise RuntimeError("INI MVP protected terminal reject must immediately mirror the protected provider")
    protected_provider_records = [
        record
        for record in [*before_legacy, *after_legacy]
        if record["kind"] == "remote-classical" and record["url"] == first_rule["url"] and record["interval"] == first_rule["interval"]
    ]
    if protected_provider_records != [first_rule, terminal_reject]:
        raise RuntimeError("INI MVP protected provider may only emit its adjacent protected/reject pair")
    groups = validate_ini_mvp_groups(value.get("groups"))
    group_names = {group["name"] for group in groups}
    if group_names.intersection(external_groups):
        raise RuntimeError("INI MVP plan groups must not collide with external groups")
    resolvable_groups = group_names | set(external_groups)
    for record in [*before_legacy, *after_legacy]:
        if record["target"] not in resolvable_groups:
            raise RuntimeError("INI MVP rule targets must resolve to plan or external groups")
    for group in groups:
        for candidate in group["candidates"]:
            if candidate["kind"] == "group-ref" and candidate["value"] not in resolvable_groups:
                raise RuntimeError("INI MVP group references must resolve to plan or external groups")
    validate_ini_mvp_group_graph(groups, group_names)
    protected_group = next((group for group in groups if group["name"] == account["protectedGroup"]), None)
    if protected_group is None or protected_group["candidates"] != [{"kind": "group-ref", "value": account["rejectGroup"]}]:
        raise RuntimeError("INI MVP protected group must be reject-only")
    for group in groups:
        candidates = group["candidates"]
        if any(candidate["kind"] == "node-filter" for candidate in candidates):
            if len(candidates) != 2 or candidates[0] != {"kind": "group-ref", "value": account["rejectGroup"]} or candidates[1]["kind"] != "node-filter":
                raise RuntimeError("INI MVP stable group must be REJECT-first with exactly one node filter")
    return value


def validate_ini_mvp_rules(value: object, section: str) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise RuntimeError(f"INI MVP {section} rules must be a list")
    records: list[dict[str, object]] = []
    seen: set[tuple[object, ...]] = set()
    for record in value:
        if not isinstance(record, dict) or not isinstance(record.get("kind"), str) or not isinstance(record.get("target"), str) or not record["target"]:
            raise RuntimeError(f"INI MVP {section} has an invalid rule record")
        if record["kind"] == "remote-classical":
            if set(record) != {"kind", "target", "url", "interval"} or not isinstance(record.get("url"), str) or type(record.get("interval")) is not int or record["interval"] <= 0:
                raise RuntimeError(f"INI MVP {section} has an invalid remote rule")
            parsed_url = urlparse(record["url"])
            if parsed_url.scheme != "https" or not parsed_url.netloc or parsed_url.username or parsed_url.password or parsed_url.query or parsed_url.fragment:
                raise RuntimeError(f"INI MVP {section} URL must be credential-free HTTPS")
            key = (record["kind"], record["target"], record["url"], record["interval"])
        elif record["kind"] == "geosite":
            if set(record) != {"kind", "target", "value"} or not isinstance(record.get("value"), str) or not record["value"]:
                raise RuntimeError(f"INI MVP {section} has an invalid GEOSITE rule")
            key = (record["kind"], record["target"], record["value"])
        else:
            raise RuntimeError(f"INI MVP {section} rule kind is unsupported")
        if key in seen:
            raise RuntimeError(f"INI MVP {section} has duplicate rule records")
        seen.add(key)
        records.append(record)
    return records


def validate_ini_mvp_groups(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list) or not value:
        raise RuntimeError("INI MVP groups must be a non-empty list")
    groups: list[dict[str, object]] = []
    names: set[str] = set()
    for group in value:
        if not isinstance(group, dict) or set(group) != {"kind", "name", "candidates"} or group.get("kind") != "select" or not isinstance(group.get("name"), str) or not group["name"] or not isinstance(group.get("candidates"), list) or not group["candidates"]:
            raise RuntimeError("INI MVP group has an invalid shape")
        if group["name"] in names:
            raise RuntimeError("INI MVP group names must be unique")
        names.add(group["name"])
        candidates: list[dict[str, object]] = []
        candidate_keys: set[tuple[str, str]] = set()
        for candidate in group["candidates"]:
            if not isinstance(candidate, dict) or set(candidate) != {"kind", "value"} or candidate.get("kind") not in {"group-ref", "node-filter"} or not isinstance(candidate.get("value"), str) or not candidate["value"]:
                raise RuntimeError("INI MVP group has an invalid candidate")
            key = (candidate["kind"], candidate["value"])
            if key in candidate_keys:
                raise RuntimeError("INI MVP group candidates must be unique")
            candidate_keys.add(key)
            candidates.append(candidate)
        if any(candidate["kind"] == "node-filter" for candidate in candidates) and candidates[0]["kind"] != "group-ref":
            raise RuntimeError("INI MVP filtered select groups must start with a REJECT group reference")
        groups.append(group)
    return groups


def validate_ini_mvp_group_graph(groups: list[dict[str, object]], group_names: set[str]) -> None:
    """Reject recursive group references; external groups are terminal leaves."""
    graph = {
        group["name"]: [
            candidate["value"]
            for candidate in group["candidates"]
            if candidate["kind"] == "group-ref" and candidate["value"] in group_names
        ]
        for group in groups
    }
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(name: str) -> None:
        if name in visiting:
            raise RuntimeError("INI MVP group reference graph must be acyclic")
        if name in visited:
            return
        visiting.add(name)
        for target in graph[name]:
            visit(target)
        visiting.remove(name)
        visited.add(name)

    for name in group_names:
        visit(name)


def render_ini_mvp_rules(records: object) -> list[str]:
    return [
        f"ruleset={record['target']},clash-classic:{record['url']},{record['interval']}"
        if record["kind"] == "remote-classical"
        else f"ruleset={record['target']},[]GEOSITE,{record['value']}"
        for record in validate_ini_mvp_rules(records, "render")
    ]


def render_ini_mvp_groups(records: object) -> list[str]:
    lines: list[str] = []
    for group in validate_ini_mvp_groups(records):
        fields = [f"[]{candidate['value']}" if candidate["kind"] == "group-ref" else str(candidate["value"]) for candidate in group["candidates"]]
        lines.append(f"custom_proxy_group={group['name']}`select`" + "`".join(fields))
    return lines


def remove_stale_ai_rule_outputs() -> None:
    active_files = {
        str(item["file"])
        for item in AI_RULESETS
    }

    for file_name in sorted(MANAGED_AI_RULE_FILES - active_files):
        path = RULE_DIR / file_name
        if path.exists():
            path.unlink()


def write_rule_outputs() -> None:
    remove_stale_ai_rule_outputs()

    for item in AI_RULESETS:
        write_text(
            RULE_DIR / item["file"],
            render_rule_file(
                provider_key=item["provider_key"],
                group=item["group"],
                payload=item["payload"],
            ),
        )

    for item in SSH_RULESETS:
        write_text(RULE_DIR / item["file"], render_custom_comment_rule_file(item["comment_lines"]))

    write_text(
        RULE_DIR / GAMING_RULESET["file"],
        render_rule_file(
            provider_key=GAMING_RULESET["provider_key"],
            group=GAMING_RULESET["group"],
            payload=GAMING_RULESET["payload"],
            extra_comments=GAMING_RULESET["comments"],
        ),
    )

    if ENABLE_PROCESS_RULES:
        process_rules = dedupe_process_names(load_process_rule_source())
        for spec in PROCESS_RULESET_SPECS:
            write_text(
                RULE_DIR / spec["file"],
                render_process_rule_file(
                    provider_key=spec["provider_key"],
                    group=spec["group"],
                    payload=process_rules.get(spec["key"], []),
                ),
            )


def main() -> None:
    ensure_custom_direct_supporting_rules()
    write_rule_outputs()
    write_text(YAML_DIR / "Custom_Clash_AI.yaml", render_yaml(strict=False))
    write_text(YAML_DIR / "Custom_Clash_AI_Strict.yaml", render_yaml(strict=True))
    write_text(CFG_DIR / "Custom_Clash_AI.ini", render_ini())
    print("Generated AI profile outputs.")


if __name__ == "__main__":
    main()
