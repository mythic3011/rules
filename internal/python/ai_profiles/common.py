from __future__ import annotations

import json

from .static_rules import ZH_HK_TERMS

def zh_hk(text: str) -> str:
    for cn, hk in ZH_HK_TERMS.items():
        text = text.replace(cn, hk)
    return text

def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)

def indent(text: str, spaces: int) -> str:
    prefix = " " * spaces
    return "\n".join(f"{prefix}{line}" if line else "" for line in text.splitlines())
