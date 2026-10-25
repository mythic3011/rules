"""Named catalog documents and their paths, including alternate catalog roots."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Literal

CatalogDocument = Literal[
    "profile", "dns", "regions", "regions-source", "services", "companion-rules",
    "process-rules", "distribution", "upstream-sources", "adguard-upstream", "external-routing",
    "profile-templates", "profile-languages",
]

_DOCUMENT_PATHS = MappingProxyType({
    "profile": "profile.json",
    "dns": "dns.json",
    "regions": "catalogs/regions.json",
    "regions-source": "catalogs/regions.source.json",
    "services": "catalogs/services.json",
    "companion-rules": "catalogs/companion-rules.json",
    "external-routing": "catalogs/external-routing.json",
    "process-rules": "catalogs/process-rules.yaml",
    "distribution": "catalogs/distribution.json",
    "upstream-sources": "sources/upstream-sources.json",
    "adguard-upstream": "sources/adguard-upstream.json",
    "profile-templates": "catalogs/profile-templates.json",
    "profile-languages": "catalogs/profile-languages.json",
})


@dataclass(frozen=True, slots=True)
class CatalogPaths:
    root: Path

    def resolve(self, document: CatalogDocument) -> Path:
        try:
            return self.root / _DOCUMENT_PATHS[document]
        except KeyError as exc:
            raise ValueError(f"Unknown AI catalog document: {document}") from exc
