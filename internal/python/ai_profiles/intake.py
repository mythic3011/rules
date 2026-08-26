"""GitHub Issue Form -> canonical region/service registry intake.

The issue is an observation UI, not a code-generation API. This module accepts
only bounded matcher/region data, validates it, and mutates source-of-truth JSON.
Generated cfg/rule artifacts remain owned by the normal generators.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONFIG_DIR = ROOT / "internal/config/ai-routing"
REGIONS_PATH = CONFIG_DIR / "regions.json"
SERVICES_PATH = CONFIG_DIR / "services.json"

MATCHER_TYPES = {"DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "IP-CIDR", "PROCESS-NAME", "PROCESS-PATH"}
DOMAIN_RE = re.compile(r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
REGION_CODE_RE = re.compile(r"^[A-Z]{2,3}$")
RESERVED_HOSTS = {"localhost", "localhost.localdomain"}
MAX_ADDITIONAL_REGIONS = 3
MAX_REGION_TERMS = 40


@dataclass(frozen=True, slots=True)
class RegionProposal:
    slot: int
    name: str
    code: str
    status: str
    routable: bool
    aliases: tuple[str, ...]
    keywords: tuple[str, ...]


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    if not value or not SLUG_RE.fullmatch(value):
        raise ValueError("service id must resolve to 1-63 lowercase letters/digits/hyphens")
    return value


def _section(body: str, heading: str) -> str:
    pattern = rf"(?ms)^### {re.escape(heading)}\s*\n(.*?)(?=\n### |\Z)"
    match = re.search(pattern, body)
    if not match:
        return ""
    value = match.group(1).strip()
    return "" if value.casefold() in {"_no response_", "no response"} else value


def _checkbox_selected(text: str) -> bool:
    return any(re.match(r"^- \[[xX]\]", line.strip()) for line in text.splitlines())


def _selected_ids(text: str) -> list[str]:
    if not text or text.casefold() in {"_no response_", "none", "unknown"}:
        return []
    parts = re.split(r"[,\n]+", text)
    out: list[str] = []
    for raw in parts:
        item = raw.strip().lstrip("- ").strip()
        if not item:
            continue
        region_id = item.split(" — ", 1)[0].strip().casefold()
        if region_id and region_id not in out:
            out.append(region_id)
    return out


def _matcher_values(kind: str, raw: str) -> list[str]:
    kind = kind.strip().upper()
    if kind not in MATCHER_TYPES:
        raise ValueError(f"unsupported matcher type: {kind}")
    values = [line.strip() for line in raw.splitlines() if line.strip() and not line.strip().startswith("#")]
    if not values:
        raise ValueError("at least one matcher value is required")
    if len(values) > 100:
        raise ValueError("at most 100 matcher values per intake")
    result: list[str] = []
    for value in values:
        if kind in {"DOMAIN", "DOMAIN-SUFFIX"}:
            value = value.casefold().rstrip(".")
            if value in RESERVED_HOSTS or not DOMAIN_RE.fullmatch(value):
                raise ValueError(f"invalid public domain matcher: {value}")
        elif kind == "DOMAIN-KEYWORD":
            if len(value) < 3 or len(value) > 80 or any(ch in value for ch in "*/\\"):
                raise ValueError(f"unsafe/broad domain keyword: {value!r}")
        elif kind == "IP-CIDR":
            network = ipaddress.ip_network(value, strict=False)
            if network.is_private or network.is_loopback or network.is_link_local or network.is_reserved:
                raise ValueError(f"private/reserved CIDR is not accepted from public intake: {value}")
            value = str(network)
        elif kind == "PROCESS-NAME":
            if "/" in value or "\\" in value or len(value) > 120:
                raise ValueError(f"invalid process name: {value!r}")
        elif kind == "PROCESS-PATH":
            if "\x00" in value or len(value) > 300:
                raise ValueError("invalid process path")
        if value not in result:
            result.append(value)
    return result


def _unique_lines(raw: str, *, field: str, max_items: int = MAX_REGION_TERMS) -> list[str]:
    values: list[str] = []
    for line in raw.splitlines():
        value = line.strip()
        if not value or value.startswith("#"):
            continue
        if len(value) > 80:
            raise ValueError(f"{field} entry is too long: {value[:32]!r}")
        if value not in values:
            values.append(value)
    if len(values) > max_items:
        raise ValueError(f"{field} accepts at most {max_items} entries")
    return values


def _validate_region_keyword(value: str) -> None:
    if any(ch in value for ch in "\x00\r\n"):
        raise ValueError("region node keyword contains a control character")
    # One/two ASCII alphanumeric characters make unsafe loose regex terms.
    # Country/region codes are handled separately with explicit boundaries.
    if value.isascii() and value.isalnum() and len(value) < 3:
        raise ValueError(f"region node keyword is too broad: {value!r}; use the region code field instead")


def _identity_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    return re.sub(r"[^\w]+", "", normalized, flags=re.UNICODE)


def _flag_emoji(code: str) -> str:
    if len(code) != 2 or not code.isalpha():
        return "🌐"
    return "".join(chr(0x1F1E6 + ord(ch) - ord("A")) for ch in code.upper())


def _region_terms(country_codes: list[str], aliases: list[str], keywords: list[str]) -> str:
    parts: list[str] = []
    codes = [code.strip().upper() for code in country_codes if code.strip()]
    for code in codes:
        if not REGION_CODE_RE.fullmatch(code):
            raise ValueError(f"invalid country/region code: {code}")
    for value in [*aliases, *keywords]:
        value = value.strip()
        if not value or value.upper() in codes:
            continue
        _validate_region_keyword(value)
        parts.append(re.escape(value))
    for code in codes:
        # Delimit short region codes so e.g. HK matches HK-01 but not CHUNK.
        parts.append(rf"\b{re.escape(code)}(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{{2,}})?)?\b")
    if not parts:
        raise ValueError("new region needs a country/region code, alias, or node keyword")
    return "|".join(dict.fromkeys(parts))


def _parse_region_proposals(body: str) -> list[RegionProposal]:
    proposals: list[RegionProposal] = []
    for slot in range(1, MAX_ADDITIONAL_REGIONS + 1):
        prefix = f"Additional region {slot}"
        status = _section(body, f"{prefix} status").strip().casefold()
        code = _section(body, f"{prefix} code").strip().upper()
        name = _section(body, f"{prefix} name").strip()
        aliases = _unique_lines(_section(body, f"{prefix} aliases"), field=f"{prefix} aliases")
        keywords = _unique_lines(_section(body, f"{prefix} node keywords"), field=f"{prefix} node keywords")
        routable_raw = _section(body, f"{prefix} routing exit").strip().casefold()
        any_metadata = bool(code or name or aliases or keywords)

        if not status or status.startswith("not used"):
            if any_metadata:
                raise ValueError(f"{prefix} has metadata but its status is Not used")
            continue
        if not (status.startswith("works") or status.startswith("blocked")):
            raise ValueError(f"{prefix} has unsupported status: {status!r}")
        if not code or not REGION_CODE_RE.fullmatch(code):
            raise ValueError(f"{prefix} needs a 2-3 letter country/region code")
        if not name or len(name) > 80 or any(ord(ch) < 32 for ch in name):
            raise ValueError(f"{prefix} needs a single-line region name up to 80 characters")
        for keyword in keywords:
            _validate_region_keyword(keyword)
        proposals.append(
            RegionProposal(
                slot=slot,
                name=name,
                code=code,
                status="works" if status.startswith("works") else "blocked",
                routable=routable_raw.startswith("yes"),
                aliases=tuple(aliases),
                keywords=tuple(keywords),
            )
        )
    return proposals


def _find_existing_region(regions: list[dict[str, object]], proposal: RegionProposal) -> dict[str, object] | None:
    code = proposal.code.upper()
    name_key = _identity_key(proposal.name)
    matches: list[dict[str, object]] = []
    for record in regions:
        record_codes = {str(x).upper() for x in record.get("countryCodes", [])}
        identity_values = [str(record.get("id", "")), str(record.get("name", "")), *[str(x) for x in record.get("aliases", [])]]
        identity_keys = {_identity_key(value) for value in identity_values if value}
        if code in record_codes or code.casefold() == str(record.get("id", "")).casefold() or name_key in identity_keys:
            matches.append(record)
    unique = {str(record["id"]): record for record in matches}
    if len(unique) > 1:
        raise ValueError(
            f"Additional region {proposal.slot} is ambiguous; it matches existing regions {sorted(unique)}"
        )
    return next(iter(unique.values()), None)


def _merge_region_metadata(record: dict[str, object], proposal: RegionProposal) -> bool:
    """Merge safe aliases/keywords into an existing region without rewriting legacy terms."""
    changed = False
    aliases = [str(x) for x in record.get("aliases", [])]
    for value in [proposal.name, *proposal.aliases]:
        if value and value not in aliases:
            aliases.append(value)
            changed = True
    keywords = [str(x) for x in record.get("keywords", [])]
    for value in proposal.keywords:
        if value not in keywords:
            keywords.append(value)
            changed = True
    if changed:
        record["aliases"] = aliases
        record["keywords"] = keywords
        extra_terms = _region_terms([], [proposal.name, *proposal.aliases], list(proposal.keywords))
        existing_terms = str(record.get("terms", ""))
        record["terms"] = f"{existing_terms}|{extra_terms}" if existing_terms else extra_terms
    return changed


def _apply_region_proposal(
    regions_doc: dict[str, object], proposal: RegionProposal
) -> tuple[str, str, bool]:
    regions = regions_doc["regions"]
    assert isinstance(regions, list)
    primary_order = regions_doc["primaryOrder"]
    assert isinstance(primary_order, list)

    existing = _find_existing_region(regions, proposal)
    if existing is not None:
        region_id = str(existing["id"])
        existing_codes = {str(x).upper() for x in existing.get("countryCodes", [])}
        if existing_codes and proposal.code not in existing_codes:
            raise ValueError(
                f"Additional region {proposal.slot} code {proposal.code} conflicts with existing region "
                f"{region_id} codes {sorted(existing_codes)}"
            )
        # Public service intake may enrich an existing region's match metadata,
        # but it must not promote an observation-only region into a routing exit.
        if proposal.routable and region_id not in primary_order:
            raise ValueError(
                f"existing region {region_id} is observation-only; routing-exit promotion requires a maintainer change"
            )
        changed = _merge_region_metadata(existing, proposal)
        return region_id, "updated" if changed else "reused", changed

    region_id = proposal.code.casefold()
    if not SLUG_RE.fullmatch(region_id):
        region_id = slugify(proposal.name)
    if any(str(record.get("id")) == region_id for record in regions):
        raise ValueError(f"new region id collides with existing region: {region_id}")

    aliases = list(dict.fromkeys([proposal.name, *proposal.aliases]))
    keywords = list(proposal.keywords)
    regions.append(
        {
            "id": region_id,
            "group": f"{_flag_emoji(proposal.code)} {proposal.name} 節點",
            "terms": _region_terms([proposal.code], aliases, keywords),
            "name": proposal.name,
            "countryCodes": [proposal.code],
            "aliases": aliases,
            "keywords": keywords,
        }
    )
    if proposal.routable:
        primary_order.append(region_id)
    return region_id, "created", True


def _merge_observation(existing: dict[str, object], working: list[str], blocked: list[str]) -> None:
    availability = existing.setdefault("availability", {"workingRegions": [], "blockedRegions": []})
    assert isinstance(availability, dict)
    current_working = list(availability.get("workingRegions", []))
    current_blocked = list(availability.get("blockedRegions", []))

    # The current ticket is an explicit observation update: a touched region
    # moves to the submitted state rather than becoming contradictory forever.
    current_working = [region for region in current_working if region not in blocked]
    current_blocked = [region for region in current_blocked if region not in working]
    availability["workingRegions"] = list(dict.fromkeys([*current_working, *working]))
    availability["blockedRegions"] = list(dict.fromkeys([*current_blocked, *blocked]))


def apply_issue(body: str) -> dict[str, object]:
    service_name = _section(body, "Service name")
    if not service_name:
        raise ValueError("Service name is required")
    explicit_id = _section(body, "Service ID (optional)")
    service_id = slugify(explicit_id or service_name)
    matcher_kind = _section(body, "Matcher type").upper()
    values = _matcher_values(matcher_kind, _section(body, "Matcher values"))
    working = _selected_ids(_section(body, "Confirmed working regions"))
    blocked = _selected_ids(_section(body, "Confirmed blocked regions"))

    regions_doc = json.loads(REGIONS_PATH.read_text(encoding="utf-8"))
    known = {item["id"] for item in regions_doc["regions"]}
    unknown = (set(working) | set(blocked)) - known
    if unknown:
        raise ValueError(f"unknown regions selected: {sorted(unknown)}")
    overlap = set(working) & set(blocked)
    if overlap:
        raise ValueError(f"regions cannot be both working and blocked: {sorted(overlap)}")

    region_changes: list[dict[str, object]] = []
    proposals = _parse_region_proposals(body)
    if _checkbox_selected(_section(body, "Other / new region")) and not proposals:
        raise ValueError("Other / new region was selected but no Additional region slot was completed")
    seen_proposals: set[str] = set()
    for proposal in proposals:
        proposal_key = proposal.code.casefold()
        if proposal_key in seen_proposals:
            raise ValueError(f"additional region {proposal.code} was submitted more than once")
        seen_proposals.add(proposal_key)
        region_id, region_action, metadata_changed = _apply_region_proposal(regions_doc, proposal)
        known.add(region_id)
        if proposal.status == "works":
            if region_id in blocked:
                blocked.remove(region_id)
            if region_id not in working:
                working.append(region_id)
        else:
            if region_id in working:
                working.remove(region_id)
            if region_id not in blocked:
                blocked.append(region_id)
        region_changes.append(
            {
                "region": region_id,
                "action": region_action,
                "status": proposal.status,
                "routable": region_id in regions_doc["primaryOrder"],
                "metadataChanged": metadata_changed,
            }
        )

    services_doc = json.loads(SERVICES_PATH.read_text(encoding="utf-8"))
    existing = next((item for item in services_doc["services"] if item["id"] == service_id), None)
    payload = [f"{matcher_kind},{value}" for value in values]
    routable = set(regions_doc["primaryOrder"])

    if existing is None:
        candidate_regions = [region for region in working if region in routable]
        if not candidate_regions:
            raise ValueError("new service needs at least one confirmed working routable region")
        token = "".join(part.capitalize() for part in service_id.split("-"))
        existing = {
            "id": service_id,
            "providerKey": f"Community_{token}_Classical",
            "group": f"🌐 {service_name}",
            "file": f"Community_{token}_Classical.yaml",
            "payload": payload,
            "regions": candidate_regions,
            "availability": {"workingRegions": working, "blockedRegions": blocked},
            "directRelaxed": False,
            "dnsPolicies": [],
            "subconverter": {},
            "upstreamRules": [],
            "projections": ["mihomo", "subconverter"],
        }
        services_doc["services"].append(existing)
        action = "created"
    else:
        existing.setdefault("payload", [])
        existing["payload"] = list(dict.fromkeys([*existing["payload"], *payload]))
        _merge_observation(existing, working, blocked)
        # Preserve legacy explicit region candidates, but remove any region the
        # intake now explicitly marks blocked and add newly confirmed exits.
        existing_regions = [region for region in existing.get("regions", []) if region not in blocked]
        existing["regions"] = list(dict.fromkeys([*existing_regions, *(r for r in working if r in routable)]))
        action = "updated"

    REGIONS_PATH.write_text(json.dumps(regions_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    SERVICES_PATH.write_text(json.dumps(services_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "action": action,
        "service": service_id,
        "working": working,
        "blocked": blocked,
        "matchers": payload,
        "regions": region_changes,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--issue-body-file", type=Path, required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = apply_issue(args.issue_body_file.read_text(encoding="utf-8"))
    print(json.dumps(result, ensure_ascii=False) if args.json else f"{result['action']} service {result['service']}")


if __name__ == "__main__":
    main()
