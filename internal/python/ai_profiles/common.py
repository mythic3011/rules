from __future__ import annotations

import json
import re
from urllib.parse import urlsplit

import yaml

from .static_rules import ZH_HK_TERMS

_PLAIN_KEY = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]*\Z")
_LINE_BREAKS = "\n\r\x85\u2028\u2029"


def _text(value: str, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text")
    for character in value:
        codepoint = ord(character)
        if not (
            codepoint in {0x09, 0x0A, 0x0D, 0x85}
            or 0x20 <= codepoint <= 0x7E
            or 0xA0 <= codepoint <= 0xD7FF
            or 0xE000 <= codepoint <= 0xFFFD
            or 0x10000 <= codepoint <= 0x10FFFF
        ):
            raise ValueError(f"{field} contains a character that YAML cannot represent")
    return value


def _parsed_yaml_string(source: str, expected: str, field: str) -> str:
    try:
        parsed = yaml.safe_load(source)
    except yaml.YAMLError as exc:
        raise ValueError(f"{field} is not a valid plain YAML scalar") from exc
    if type(parsed) is not str or parsed != expected:
        raise ValueError(f"{field} would not round-trip as the same YAML string")
    return expected


def _parsed_yaml_key(value: str) -> str:
    try:
        parsed = yaml.safe_load(f"{value}: null")
    except yaml.YAMLError as exc:
        raise ValueError("YAML mapping key is not a valid plain key") from exc
    if not isinstance(parsed, dict) or len(parsed) != 1:
        raise ValueError("YAML mapping key does not produce exactly one mapping entry")
    key = next(iter(parsed))
    if type(key) is not str or key != value:
        raise ValueError("YAML mapping key would not round-trip as the same string")
    return value


def zh_hk(text: str) -> str:
    for cn, hk in ZH_HK_TERMS.items():
        text = text.replace(cn, hk)
    return text


def yaml_string(value: str) -> str:
    """Quote a YAML scalar using JSON-compatible double-quoted syntax."""
    quoted = json.dumps(_text(value, "YAML scalar"), ensure_ascii=False)
    for line_break in ("\x85", "\u2028", "\u2029"):
        quoted = quoted.replace(line_break, f"\\u{ord(line_break):04x}")
    return quoted


def yaml_single_string(value: str) -> str:
    """Quote a single-line YAML scalar with YAML's doubled-quote escaping."""
    value = _text(value, "YAML single-quoted scalar")
    if any(character in value for character in _LINE_BREAKS):
        raise ValueError("YAML single-quoted scalar must fit on one line")
    return "'" + value.replace("'", "''") + "'"


def yaml_plain_string(value: str) -> str:
    """Validate a plain YAML scalar without changing its published bytes."""
    value = _text(value, "YAML plain scalar")
    if (
        not value
        or any(character.isspace() for character in value)
        or value[0] in "-?:,[]{}#&*!|>'\"%@`"
        or value.endswith(":")
        or ": " in value
        or " #" in value
        or any(character in value for character in "[]{}")
    ):
        raise ValueError("YAML plain scalar is ambiguous or requires quoting")
    return _parsed_yaml_string(value, value, "YAML plain scalar")


def yaml_plain_key(value: str) -> str:
    """Validate a provider-style YAML mapping key emitted without quotes."""
    value = _text(value, "YAML mapping key")
    if (
        not _PLAIN_KEY.fullmatch(value)
    ):
        raise ValueError("YAML mapping key is not a safe plain key")
    return _parsed_yaml_key(value)


def rule_field(value: str) -> str:
    """Validate one comma-delimited Mihomo routing-rule field."""
    value = _text(value, "Mihomo routing-rule field")
    if not value or any(character in value for character in ",\t\x7f" + _LINE_BREAKS):
        raise ValueError("Mihomo routing-rule field is empty or contains a delimiter")
    return value


def ini_string(value: str, *, delimiters: str = ",`") -> str:
    """Validate one subconverter field; its grammar has no general escaping."""
    value = _text(value, "INI field")
    if not value or any(character in value for character in delimiters):
        raise ValueError("INI field is empty or contains a field delimiter")
    if any(character in value for character in "\t\x7f" + _LINE_BREAKS):
        raise ValueError("INI field must stay on one line")
    return value


def ini_comment_line(value: str) -> str:
    """Keep arbitrary catalog text inside exactly one INI comment line."""
    value = _text(value, "INI comment")
    if any(character in value for character in "\t\x7f" + _LINE_BREAKS):
        raise ValueError("INI comment must stay on one line")
    if not value:
        return ""
    return value if value.startswith(";") else f"; {value}"


def yaml_comment_line(value: str) -> str:
    """Keep arbitrary catalog text inside exactly one YAML comment line."""
    value = _text(value, "YAML comment")
    if any(character in value for character in _LINE_BREAKS):
        raise ValueError("YAML comment must stay on one line")
    if not value:
        return ""
    return value if value.startswith("#") else f"# {value}"


def https_url(value: str, *, field: str = "URL") -> str:
    """Validate an absolute credential-free HTTPS URL for a remote provider."""
    value = _text(value, field)
    if not value or "\\" in value or any(character.isspace() for character in value):
        raise ValueError(f"{field} is not a safe HTTPS URL")
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        parsed.port  # Access validates malformed and out-of-range ports.
    except ValueError as exc:
        raise ValueError(f"{field} is not a valid HTTPS URL") from exc
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
    ):
        raise ValueError(f"{field} must be an absolute HTTPS URL without credentials or fragment")
    return value


def positive_integer(value: int, *, field: str) -> str:
    if type(value) is not int or value <= 0:
        raise ValueError(f"{field} must be a positive integer")
    return str(value)


def nonnegative_integer(value: int, *, field: str) -> str:
    if type(value) is not int or value < 0:
        raise ValueError(f"{field} must be a non-negative integer")
    return str(value)


def indent(text: str, spaces: int) -> str:
    prefix = " " * spaces
    return "\n".join(f"{prefix}{line}" if line else "" for line in text.splitlines())
