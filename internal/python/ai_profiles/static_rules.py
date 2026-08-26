from __future__ import annotations

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

# Companion SSH/Gaming/Process declarations live in internal/config/ai-routing/companion-rules.json.

MANAGED_TAILSCALE_DOMAIN_MARKER = "# Managed by internal/python/generate_ai_profiles.py: Tailscale direct routing"
MANAGED_TAILSCALE_IP_MARKER = "# Managed by internal/python/generate_ai_profiles.py: Tailscale IP verification note"
TAILSCALE_DOMAIN_ENTRIES = [
    "+.tailscale.com",
    "+.tailscaled.com",
    "login.tailscale.com",
    "controlplane.tailscale.com",
    "log.tailscale.com",
]
