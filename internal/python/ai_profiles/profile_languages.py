from __future__ import annotations

import json
from types import MappingProxyType

from .settings import CATALOG_PATHS

_EXPECTED_LANGUAGES = {"en", "zh-Hant", "zh-Hans"}
_EXPECTED_YAML_COPY = {"header", "titles", "policyNotes", "optionalProviderNotes", "comments"}
_EXPECTED_YAML_COMMENTS = {"profileMarker", "description", "generated", "secretWarning", "sections"}
_EXPECTED_YAML_SECTIONS = {
    "ports", "proxyProviders", "geodata", "logging", "profile", "tun",
    "proxyGroups", "rules", "ruleProviders",
}


def _is_yaml_comment(value: object) -> bool:
    return (
        isinstance(value, str)
        and value.startswith("#")
        and not any(
            ord(character) < 0x20
            or 0x7F <= ord(character) <= 0x9F
            or character in "\u2028\u2029"
            for character in value
        )
    )


def _is_ini_comment(value: object) -> bool:
    return (
        isinstance(value, str)
        and value.startswith(";")
        and not any(
            ord(character) < 0x20
            or 0x7F <= ord(character) <= 0x9F
            or character in "\u2028\u2029"
            for character in value
        )
    )


def _load_profile_languages() -> tuple[str, MappingProxyType]:
    path = CATALOG_PATHS.resolve("profile-languages")
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict) or document.get("schemaVersion") != 1:
        raise RuntimeError("Profile language catalog must use schemaVersion 1")
    default_language = document.get("defaultLanguage")
    languages = document.get("languages")
    if not isinstance(languages, dict) or set(languages) != _EXPECTED_LANGUAGES:
        raise RuntimeError("Profile language catalog must define en, zh-Hant, and zh-Hans")
    if default_language not in languages:
        raise RuntimeError("Profile language catalog default is unknown")

    frozen = {}
    for language, entry in languages.items():
        if not isinstance(entry, dict) or set(entry) != {
            "header", "footer", "sections", "optionalProviderNotes", "yaml"
        }:
            raise RuntimeError(f"Profile language entry is invalid: {language}")
        header = entry["header"]
        footer = entry["footer"]
        sections = entry["sections"]
        ini_provider_notes = entry["optionalProviderNotes"]
        yaml_copy = entry["yaml"]
        if not isinstance(header, list) or not header or any(not isinstance(line, str) for line in header):
            raise RuntimeError(f"Profile language header is invalid: {language}")
        if (
            not isinstance(footer, list)
            or not footer
            or any(not isinstance(line, str) or not line.startswith(";") for line in footer)
        ):
            raise RuntimeError(f"Profile language footer must contain semicolon-prefixed comments: {language}")
        if not isinstance(sections, dict) or any(
            not isinstance(key, str) or not isinstance(value, str)
            for key, value in sections.items()
        ):
            raise RuntimeError(f"Profile language section names are invalid: {language}")
        if (
            not isinstance(ini_provider_notes, dict)
            or set(ini_provider_notes) != {"adblock", "customRuleProviders"}
            or any(not _is_ini_comment(line) for line in ini_provider_notes.values())
        ):
            raise RuntimeError(f"Profile INI provider notes must contain safe comment lines: {language}")
        if not isinstance(yaml_copy, dict) or set(yaml_copy) != _EXPECTED_YAML_COPY:
            raise RuntimeError(f"Profile YAML language entry is invalid: {language}")
        yaml_header = yaml_copy["header"]
        titles = yaml_copy["titles"]
        policy_notes = yaml_copy["policyNotes"]
        optional_provider_notes = yaml_copy["optionalProviderNotes"]
        comments = yaml_copy["comments"]
        if (
            not isinstance(yaml_header, list)
            or not yaml_header
            or any(not _is_yaml_comment(line) for line in yaml_header)
        ):
            raise RuntimeError(f"Profile YAML header must contain safe comment lines: {language}")
        if (
            not isinstance(titles, dict)
            or set(titles) != {"balanced", "strict"}
            or any(
                not isinstance(title, str)
                or not title
                or any(
                    ord(character) < 0x20
                    or 0x7F <= ord(character) <= 0x9F
                    or character in "\u2028\u2029"
                    for character in title
                )
                for title in titles.values()
            )
        ):
            raise RuntimeError(f"Profile YAML titles are invalid: {language}")
        if (
            not isinstance(policy_notes, dict)
            or set(policy_notes) != {"balanced", "strict"}
            or any(
                not isinstance(lines, list)
                or not lines
                or any(not _is_yaml_comment(line) for line in lines)
                for lines in policy_notes.values()
            )
        ):
            raise RuntimeError(f"Profile YAML policy notes must contain safe comment lines: {language}")
        if (
            not isinstance(optional_provider_notes, dict)
            or set(optional_provider_notes) != {"adblock", "customRuleProviders"}
            or any(not _is_yaml_comment(line) for line in optional_provider_notes.values())
        ):
            raise RuntimeError(f"Profile YAML provider notes must contain safe comment lines: {language}")
        if not isinstance(comments, dict) or set(comments) != _EXPECTED_YAML_COMMENTS:
            raise RuntimeError(f"Profile YAML comments are invalid: {language}")
        description = comments["description"]
        section_comments = comments["sections"]
        if (
            not _is_yaml_comment(comments["profileMarker"])
            or not _is_yaml_comment(comments["generated"])
            or not _is_yaml_comment(comments["secretWarning"])
            or not isinstance(description, list)
            or not description
            or any(not _is_yaml_comment(line) for line in description)
            or not isinstance(section_comments, dict)
            or set(section_comments) != _EXPECTED_YAML_SECTIONS
            or any(not _is_yaml_comment(line) for line in section_comments.values())
        ):
            raise RuntimeError(f"Profile YAML comment lines are invalid: {language}")
        frozen[language] = MappingProxyType({
            "header": tuple(header),
            "footer": tuple(footer),
            "sections": MappingProxyType(dict(sections)),
            "optionalProviderNotes": MappingProxyType(dict(ini_provider_notes)),
            "yaml": MappingProxyType({
                "header": tuple(yaml_header),
                "titles": MappingProxyType(dict(titles)),
                "policyNotes": MappingProxyType({
                    key: tuple(lines) for key, lines in policy_notes.items()
                }),
                "optionalProviderNotes": MappingProxyType(dict(optional_provider_notes)),
                "comments": MappingProxyType({
                    "profileMarker": comments["profileMarker"],
                    "description": tuple(description),
                    "generated": comments["generated"],
                    "secretWarning": comments["secretWarning"],
                    "sections": MappingProxyType(dict(section_comments)),
                }),
            }),
        })
    return default_language, MappingProxyType(frozen)


PROFILE_DEFAULT_LANGUAGE, PROFILE_COMMENT_COPY = _load_profile_languages()
PROFILE_LANGUAGES = tuple(PROFILE_COMMENT_COPY)
