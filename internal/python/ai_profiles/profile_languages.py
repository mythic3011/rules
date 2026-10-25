from __future__ import annotations

import json
from types import MappingProxyType

from .settings import CATALOG_PATHS

_EXPECTED_LANGUAGES = {"en", "zh-Hant", "zh-Hans"}


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
        if not isinstance(entry, dict) or set(entry) != {"header", "footer", "sections"}:
            raise RuntimeError(f"Profile language entry is invalid: {language}")
        header = entry["header"]
        footer = entry["footer"]
        sections = entry["sections"]
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
        frozen[language] = MappingProxyType({
            "header": tuple(header),
            "footer": tuple(footer),
            "sections": MappingProxyType(dict(sections)),
        })
    return default_language, MappingProxyType(frozen)


PROFILE_DEFAULT_LANGUAGE, PROFILE_COMMENT_COPY = _load_profile_languages()
PROFILE_LANGUAGES = tuple(PROFILE_COMMENT_COPY)
