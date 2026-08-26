from __future__ import annotations

import json
from typing import TypedDict, cast
from urllib.parse import urlparse

from ..settings import INI_MVP_PLAN_PATH
class IniMvpRemoteRule(TypedDict):
    kind: str
    target: str
    url: str
    interval: int

class IniMvpGeositeRule(TypedDict):
    kind: str
    target: str
    value: str

IniMvpRuleRecord = TypedDict(
    "IniMvpRuleRecord",
    {"kind": str, "target": str, "url": str, "interval": int, "value": str},
)

class IniMvpPlan(TypedDict):
    """Declared shape of internal/generated/ai-routing/hk.ini-mvp-plan.json (validated at load)."""

    schemaVersion: int
    policyVersion: str
    profile: str
    externalGroups: list[str]
    migration: dict[str, list[str]]
    accountProtection: dict[str, str]
    rules: dict[str, list[dict[str, object]]]
    groups: list[dict[str, object]]

def load_ini_mvp_plan() -> IniMvpPlan:
    """Load the TypeScript-owned plan; Python only renders its declared shape."""
    try:
        value = json.loads(INI_MVP_PLAN_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"INI MVP plan is unavailable: {INI_MVP_PLAN_PATH}") from exc
    if not isinstance(value, dict) or set(value) != {"schemaVersion", "policyVersion", "profile", "externalGroups", "migration", "accountProtection", "rules", "groups"}:
        raise RuntimeError("INI MVP plan has an unknown or incomplete shape")
    if type(value.get("schemaVersion")) is not int or value.get("schemaVersion") != 1 or value.get("profile") != "hk" or not isinstance(value.get("policyVersion"), str) or not value["policyVersion"]:
        raise RuntimeError("INI MVP plan has an unsupported version or profile")
    external_groups = value["externalGroups"]
    if not isinstance(external_groups, list) or not external_groups or any(not isinstance(group, str) or not group for group in external_groups) or len(set(external_groups)) != len(external_groups):
        raise RuntimeError("INI MVP plan has invalid external groups")
    migration = value["migration"]
    if not isinstance(migration, dict) or set(migration) != {"migratedServiceIds", "legacyReplacementIds"}:
        raise RuntimeError("INI MVP plan has an invalid migration shape")
    migrated_ids = migration.get("migratedServiceIds")
    replacement_ids = migration.get("legacyReplacementIds")
    if not isinstance(migrated_ids, list) or not migrated_ids or any(not isinstance(item, str) or not item for item in migrated_ids) or len(set(migrated_ids)) != len(migrated_ids):
        raise RuntimeError("INI MVP plan has invalid migrated service IDs")
    if not isinstance(replacement_ids, list) or not replacement_ids or any(not isinstance(item, str) or not item for item in replacement_ids) or len(set(replacement_ids)) != len(replacement_ids) or not set(replacement_ids).issubset(migrated_ids):
        raise RuntimeError("INI MVP plan has invalid legacy replacement IDs")
    account = value["accountProtection"]
    if not isinstance(account, dict) or set(account) != {"protectedGroup", "rejectGroup"} or any(not isinstance(account.get(key), str) or not account[key] for key in ("protectedGroup", "rejectGroup")):
        raise RuntimeError("INI MVP plan has invalid account protection metadata")
    if account["rejectGroup"] not in external_groups:
        raise RuntimeError("INI MVP external groups must include the account reject group")
    rules = value["rules"]
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
    groups = validate_ini_mvp_groups(value["groups"])
    group_names = {str(group["name"]) for group in groups}
    if group_names.intersection(external_groups):
        raise RuntimeError("INI MVP plan groups must not collide with external groups")
    resolvable_groups = group_names | set(external_groups)
    for record in [*before_legacy, *after_legacy]:
        if record["target"] not in resolvable_groups:
            raise RuntimeError("INI MVP rule targets must resolve to plan or external groups")
    for group in groups:
        for candidate in cast(list[dict[str, object]], group["candidates"]):
            if candidate["kind"] == "group-ref" and candidate["value"] not in resolvable_groups:
                raise RuntimeError("INI MVP group references must resolve to plan or external groups")
    validate_ini_mvp_group_graph(groups, group_names)
    protected_group = next((group for group in groups if str(group["name"]) == account["protectedGroup"]), None)
    if protected_group is None or protected_group["candidates"] != [{"kind": "group-ref", "value": account["rejectGroup"]}]:
        raise RuntimeError("INI MVP protected group must be reject-only")
    for group in groups:
        candidates = cast(list[dict[str, object]], group["candidates"])
        if any(candidate["kind"] == "node-filter" for candidate in candidates):
            if len(candidates) != 2 or candidates[0] != {"kind": "group-ref", "value": account["rejectGroup"]} or candidates[1]["kind"] != "node-filter":
                raise RuntimeError("INI MVP stable group must be REJECT-first with exactly one node filter")
    return cast(IniMvpPlan, value)

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
        names.add(str(group["name"]))
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
        str(group["name"]): [
            candidate["value"]
            for candidate in cast(list[dict[str, object]], group["candidates"])
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
        for target in cast(list[str], graph[name]):
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
        fields = [f"[]{candidate['value']}" if candidate["kind"] == "group-ref" else str(candidate["value"]) for candidate in cast(list[dict[str, object]], group["candidates"])]
        lines.append(f"custom_proxy_group={group['name']}`select`" + "`".join(fields))
    return lines
