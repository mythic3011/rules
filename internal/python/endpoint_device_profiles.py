from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from ai_profiles.paths import CatalogPaths
from ai_profiles.profile_templates import PROFILE_TEMPLATE_ID_RE
from ai_profiles.settings import CATALOG_PATHS, DATA_DIR, ROOT

CONFIG_PATH = DATA_DIR / "openclash-guard/device-profiles.json"
ENDPOINT_SCHEMA_PATH = DATA_DIR / "openclash-guard/device-role-observation.v1.json"
OUTPUT_PATH = ROOT / "apps/luci-app-openclash-guard/root/usr/share/openclash-guard/device-profiles.json"

EXPECTED_CONFIG_KEYS = frozenset(
    {
        "schemaVersion",
        "uci",
        "deviceId",
        "limits",
        "kinds",
        "roleLabels",
        "profileFormatLabels",
        "profileIdEncoding",
        "endpointSource",
        "reportPolicy",
        "cache",
    }
)
EXPECTED_REPORT_KEYS = (
    "schema_version",
    "role_catalog_version",
    "platform",
    "observed_at_ms",
    "ttl_ms",
    "window",
    "collection_status",
    "reason_code",
    "role_suggestions",
    "authority",
)
EXPECTED_SEMANTIC_INVARIANTS = (
    "role_ids_unique",
    "active_bucket_count_lte_window_bucket_count",
    "unsupported_or_blocked_requires_empty_role_suggestions",
    "observed_at_ms_plus_ttl_ms_within_timestampMs",
)
EXPECTED_UCI_FIELDS = ("label", "kind", "manual_roles", "profile_id")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _read_json(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_bytes()
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"unable to read JSON input: {path.name}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"JSON input must be an object: {path.name}")
    return value


def _require_keys(value: dict[str, Any], expected: set[str] | frozenset[str], label: str) -> None:
    actual = set(value)
    if actual != set(expected):
        missing = sorted(set(expected) - actual)
        extra = sorted(actual - set(expected))
        raise ValueError(f"{label} keys differ (missing={missing}, extra={extra})")


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string")
    return value


def _integer(value: Any, label: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise ValueError(f"{label} must be an integer >= {minimum}")
    return value


def _enum_definition(schema: dict[str, Any], name: str) -> list[str]:
    definition = _object(schema.get("$defs", {}).get(name), f"$defs.{name}")
    values = definition.get("enum")
    if not isinstance(values, list) or not values or not all(isinstance(item, str) and item for item in values):
        raise ValueError(f"$defs.{name}.enum must contain strings")
    if len(values) != len(set(values)):
        raise ValueError(f"$defs.{name}.enum must be unique")
    return list(values)


def _constant_definition(schema: dict[str, Any], name: str) -> int | str:
    definition = _object(schema.get("$defs", {}).get(name), f"$defs.{name}")
    if "const" not in definition:
        raise ValueError(f"$defs.{name}.const is required")
    return definition["const"]


def _integer_definition(schema: dict[str, Any], name: str) -> dict[str, int]:
    definition = _object(schema.get("$defs", {}).get(name), f"$defs.{name}")
    if definition.get("type") != "integer":
        raise ValueError(f"$defs.{name} must declare integer type")
    minimum = _integer(definition.get("minimum"), f"$defs.{name}.minimum")
    maximum = _integer(definition.get("maximum"), f"$defs.{name}.maximum")
    if maximum < minimum:
        raise ValueError(f"$defs.{name} maximum is below minimum")
    return {"minimum": minimum, "maximum": maximum}


def _ref_name(value: Any, label: str) -> str:
    value = _object(value, label)
    reference = value.get("$ref")
    prefix = "#/$defs/"
    if not isinstance(reference, str) or not reference.startswith(prefix):
        raise ValueError(f"{label} must reference a local definition")
    return reference[len(prefix):]


def _object_shape(schema: dict[str, Any], name: str, expected: set[str]) -> None:
    definition = _object(schema.get("$defs", {}).get(name), f"$defs.{name}")
    _require_keys(definition, {"type", "additionalProperties", "required", "properties"}, f"$defs.{name}")
    if definition["type"] != "object" or definition["additionalProperties"] is not False:
        raise ValueError(f"$defs.{name} must be a closed object")
    required = definition["required"]
    properties = _object(definition["properties"], f"$defs.{name}.properties")
    if not isinstance(required, list) or set(required) != expected or set(properties) != expected:
        raise ValueError(f"$defs.{name} fields changed")


def _resolve_property_ref(schema: dict[str, Any], property_name: str, expected_definition: str) -> dict[str, Any]:
    properties = _object(schema.get("properties"), "properties")
    actual = _ref_name(properties.get(property_name), f"properties.{property_name}")
    if actual != expected_definition:
        raise ValueError(f"properties.{property_name} reference changed")
    return _object(schema["$defs"].get(actual), f"$defs.{actual}")


def _validate_endpoint_schema(schema: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    if schema.get("$id") != source["schemaId"]:
        raise ValueError("endpoint schema ID does not match its pin")
    if schema.get("type") != "object" or schema.get("additionalProperties") is not False:
        raise ValueError("endpoint report must be a strict object")
    properties = _object(schema.get("properties"), "properties")
    if set(properties) != set(EXPECTED_REPORT_KEYS):
        raise ValueError("endpoint report field set changed")
    required = schema.get("required")
    if not isinstance(required, list) or set(required) != set(EXPECTED_REPORT_KEYS):
        raise ValueError("endpoint report required fields changed")

    schema_version = _constant_definition(schema, "schemaVersion")
    role_catalog_version = _constant_definition(schema, "roleCatalogVersion")
    max_report_bytes = _constant_definition(schema, "maxReportBytes")
    ttl_ms = _constant_definition(schema, "ttlMs")
    bucket_ms = _constant_definition(schema, "bucketMs")
    stale_after_buckets = _constant_definition(schema, "staleAfterBuckets")
    max_socket_owners = _constant_definition(schema, "maxSocketOwners")
    if not all(isinstance(value, int) and not isinstance(value, bool) for value in (schema_version, role_catalog_version, max_report_bytes, ttl_ms, bucket_ms, stale_after_buckets, max_socket_owners)):
        raise ValueError("endpoint contract constants must be integers")

    timestamp = _integer_definition(schema, "timestampMs")
    roles = _enum_definition(schema, "roleId")
    platforms = _enum_definition(schema, "platform")
    collection_statuses = _enum_definition(schema, "collectionStatus")
    reason_codes = _enum_definition(schema, "reasonCode")
    freshness_values = _enum_definition(schema, "freshness")
    confidence_values = _enum_definition(schema, "confidence")
    if len(roles) > max_report_bytes:
        raise ValueError("endpoint role count exceeds the report byte bound")

    _object_shape(schema, "window", {"bucket_ms", "bucket_count", "freshness"})
    _object_shape(schema, "roleSuggestion", {"role", "active_bucket_count", "confidence"})
    suggestions = _object(schema["$defs"].get("roleSuggestions"), "$defs.roleSuggestions")
    if suggestions.get("type") != "array" or suggestions.get("uniqueItems") is not True:
        raise ValueError("role_suggestions must be a unique-item array")
    max_suggestions = _integer(suggestions.get("maxItems"), "$defs.roleSuggestions.maxItems", minimum=1)

    contract_extension = _object(schema.get("x-device-role-contract"), "x-device-role-contract")
    semantic_invariants = contract_extension.get("semantic_invariants")
    if not isinstance(semantic_invariants, list) or tuple(semantic_invariants) != EXPECTED_SEMANTIC_INVARIANTS:
        raise ValueError("endpoint semantic invariants changed")
    reason_mapping = _object(contract_extension.get("reason_mapping"), "x-device-role-contract.reason_mapping")
    if any(not isinstance(key, str) or not key or value not in reason_codes for key, value in reason_mapping.items()):
        raise ValueError("endpoint reason mapping must target canonical reason codes")
    platform_handling = contract_extension.get("platform_handling")
    if not isinstance(platform_handling, list):
        raise ValueError("endpoint platform handling must be an array")
    normalized_platform_handling: list[dict[str, str]] = []
    seen_platforms: set[str] = set()
    for index, item in enumerate(platform_handling):
        item = _object(item, f"platform_handling[{index}]")
        _require_keys(item, {"platform", "collection_status", "reason_code"}, f"platform_handling[{index}]")
        platform = _string(item["platform"], "platform_handling.platform")
        status = _string(item["collection_status"], "platform_handling.collection_status")
        reason = _string(item["reason_code"], "platform_handling.reason_code")
        if platform not in platforms or status not in collection_statuses or reason not in reason_codes or platform in seen_platforms:
            raise ValueError("endpoint platform handling contains an invalid or duplicate entry")
        seen_platforms.add(platform)
        normalized_platform_handling.append(
            {"platform": platform, "collection_status": status, "reason_code": reason}
        )
    if seen_platforms != set(platforms):
        raise ValueError("endpoint platform handling must cover every platform")

    return {
        "schemaVersion": schema_version,
        "roleCatalogVersion": role_catalog_version,
        "requiredKeys": list(EXPECTED_REPORT_KEYS),
        "windowKeys": ["bucket_ms", "bucket_count", "freshness"],
        "roleSuggestionKeys": ["role", "active_bucket_count", "confidence"],
        "roles": roles,
        "platforms": platforms,
        "collectionStatuses": collection_statuses,
        "reasonCodes": reason_codes,
        "freshnessValues": freshness_values,
        "confidenceValues": confidence_values,
        "authority": _constant_definition(schema, "authority"),
        "reasonMapping": reason_mapping,
        "platformHandling": normalized_platform_handling,
        "semanticInvariants": list(semantic_invariants),
        "limits": {
            "maxReportBytes": max_report_bytes,
            "ttlMs": ttl_ms,
            "bucketMs": bucket_ms,
            "bucketCountMin": _integer_definition(schema, "bucketCount")["minimum"],
            "bucketCountMax": _integer_definition(schema, "bucketCount")["maximum"],
            "maxSuggestions": max_suggestions,
            "timestampMin": timestamp["minimum"],
            "timestampMax": timestamp["maximum"],
            "maxSocketOwners": max_socket_owners,
            "staleAfterBuckets": stale_after_buckets,
        },
    }


def _validate_labeled_entries(value: Any, label: str, *, max_label_length: int) -> list[dict[str, str]]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"{label} must be a non-empty array")
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for index, raw in enumerate(value):
        entry = _object(raw, f"{label}[{index}]")
        _require_keys(entry, {"id", "label"}, f"{label}[{index}]")
        item_id = _string(entry["id"], f"{label}[{index}].id")
        item_label = _string(entry["label"], f"{label}[{index}].label")
        if item_id in seen or len(item_label) > max_label_length or any(ord(ch) < 0x20 for ch in item_label):
            raise ValueError(f"{label} contains a duplicate ID or invalid label")
        seen.add(item_id)
        result.append({"id": item_id, "label": item_label})
    return result


def _resolve_repo_file(root: Path, relative: Any, label: str) -> Path:
    relative_path = _string(relative, label)
    candidate = (root / relative_path).resolve()
    if not candidate.is_relative_to(root.resolve()) or not candidate.is_file():
        raise ValueError(f"{label} must resolve to a checked-in file")
    return candidate


def _profile_catalog_paths(root: Path) -> CatalogPaths:
    resolved_root = root.resolve()
    if resolved_root == ROOT.resolve():
        return CATALOG_PATHS
    return CatalogPaths(resolved_root / "internal" / "config" / "ai-routing")


def _load_profile_templates(path: Path, format_labels: dict[str, str]) -> list[dict[str, str]]:
    document = _read_json(path)
    if document.get("schemaVersion") != 1:
        raise ValueError("profile template catalog must use schemaVersion 1")
    templates = document.get("templates")
    if not isinstance(templates, list):
        raise ValueError("profile template catalog must define templates")
    profiles: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for index, raw in enumerate(templates):
        template = _object(raw, f"templates[{index}]")
        template_id = _string(template.get("id"), f"templates[{index}].id")
        output_format = _string(template.get("outputFormat"), f"templates[{index}].outputFormat")
        name = _string(template.get("name"), f"templates[{index}].name")
        if not PROFILE_TEMPLATE_ID_RE.fullmatch(template_id) or output_format not in format_labels:
            raise ValueError(f"invalid profile template identity at index {index}")
        key = (output_format, template_id)
        if key in seen:
            raise ValueError(f"duplicate profile template identity: {output_format}:{template_id}")
        seen.add(key)
        profiles.append(
            {
                "id": f"{output_format}:{template_id}",
                "label": f"{name} ({format_labels[output_format]})",
            }
        )
    if not profiles:
        raise ValueError("profile template catalog cannot be empty")
    return profiles


def build_device_catalog(
    *,
    root: Path = ROOT,
    config_path: Path | None = None,
    endpoint_schema_path: Path | None = None,
    profile_templates_path: Path | None = None,
) -> dict[str, Any]:
    config_path = config_path or (root / "internal/config/openclash-guard/device-profiles.json")
    endpoint_schema_path = endpoint_schema_path or (
        root / "internal/config/openclash-guard/device-role-observation.v1.json"
    )
    profile_templates_path = profile_templates_path or _profile_catalog_paths(root).resolve("profile-templates")
    config = _read_json(config_path)
    _require_keys(config, EXPECTED_CONFIG_KEYS, "device profile config")
    if config["schemaVersion"] != 1:
        raise ValueError("device profile config must use schemaVersion 1")

    uci = _object(config["uci"], "uci")
    _require_keys(uci, {"package", "sectionType", "fields"}, "uci")
    if uci["package"] != "openclash_guard_devices" or uci["sectionType"] != "device":
        raise ValueError("device UCI package and section type changed")
    if uci["fields"] != list(EXPECTED_UCI_FIELDS):
        raise ValueError("device UCI field set changed")

    device_id = _object(config["deviceId"], "deviceId")
    _require_keys(device_id, {"pattern", "maxLength"}, "deviceId")
    id_pattern = _string(device_id["pattern"], "deviceId.pattern")
    max_id_length = _integer(device_id["maxLength"], "deviceId.maxLength", minimum=1)
    if id_pattern != rf"^[A-Za-z0-9_]{{1,{max_id_length}}}$":
        raise ValueError("device ID pattern must match its declared maximum length")

    limits = _object(config["limits"], "limits")
    _require_keys(limits, {"maxDevices", "maxLabelLength", "maxRolesSource"}, "limits")
    max_devices = _integer(limits["maxDevices"], "limits.maxDevices", minimum=1)
    max_label_length = _integer(limits["maxLabelLength"], "limits.maxLabelLength", minimum=1)
    if limits["maxRolesSource"] != "endpoint.roleId.enum":
        raise ValueError("maxRoles must derive from the pinned endpoint role enum")

    source = _object(config["endpointSource"], "endpointSource")
    _require_keys(source, {"path", "schemaId", "schemaVersion", "sha256"}, "endpointSource")
    schema_path = endpoint_schema_path
    if schema_path == root / "internal/config/openclash-guard/device-role-observation.v1.json":
        schema_path = _resolve_repo_file(root, source["path"], "endpointSource.path")
    try:
        source_bytes = schema_path.read_bytes()
    except OSError as exc:
        raise ValueError("pinned endpoint schema is unavailable") from exc
    digest = hashlib.sha256(source_bytes).hexdigest()
    expected_digest = _string(source["sha256"], "endpointSource.sha256")
    if not SHA256_RE.fullmatch(expected_digest) or digest != expected_digest:
        raise ValueError("pinned endpoint schema SHA-256 does not match")
    schema = _read_json(schema_path)
    if schema.get("$id") != source["schemaId"] or source["schemaVersion"] != 1:
        raise ValueError("endpoint schema identity/version does not match its pin")
    report_contract = _validate_endpoint_schema(schema, source)

    role_labels = _validate_labeled_entries(config["roleLabels"], "roleLabels", max_label_length=max_label_length)
    role_ids = [item["id"] for item in role_labels]
    if role_ids != report_contract["roles"]:
        raise ValueError("role labels must match the endpoint role enum in canonical order")
    kinds = _validate_labeled_entries(config["kinds"], "kinds", max_label_length=max_label_length)

    profile_format_labels = _object(config["profileFormatLabels"], "profileFormatLabels")
    if set(profile_format_labels) != {"ini", "yaml"}:
        raise ValueError("profile format labels must cover INI and YAML")
    format_labels = {
        key: _string(value, f"profileFormatLabels.{key}")
        for key, value in profile_format_labels.items()
    }
    if config["profileIdEncoding"] != "${outputFormat}:${id}":
        raise ValueError("profile ID encoding must qualify canonical IDs by format")
    templates_path = _resolve_repo_file(root, "internal/config/ai-routing/catalogs/profile-templates.json", "profile template catalog") if profile_templates_path == _profile_catalog_paths(root).resolve("profile-templates") else profile_templates_path
    profiles = _load_profile_templates(templates_path, format_labels)

    report_policy = _object(config["reportPolicy"], "reportPolicy")
    _require_keys(report_policy, {"maxFutureClockSkewMs", "receiveTimeoutSeconds"}, "reportPolicy")
    max_future_skew = _integer(report_policy["maxFutureClockSkewMs"], "reportPolicy.maxFutureClockSkewMs")
    receive_timeout = _integer(report_policy["receiveTimeoutSeconds"], "reportPolicy.receiveTimeoutSeconds", minimum=1)
    if receive_timeout > 120:
        raise ValueError("report receive timeout cannot exceed 120 seconds")
    cache = _object(config["cache"], "cache")
    _require_keys(cache, {"root", "volatile", "pruneIntervalSeconds"}, "cache")
    cache_root = _string(cache["root"], "cache.root")
    if not cache_root.startswith("/tmp/") or ".." in Path(cache_root).parts or cache["volatile"] is not True:
        raise ValueError("device observation cache must be volatile and under /tmp")
    prune_interval = _integer(cache["pruneIntervalSeconds"], "cache.pruneIntervalSeconds", minimum=1)

    return {
        "version": 1,
        "source": {
            "schemaId": source["schemaId"],
            "schemaVersion": source["schemaVersion"],
            "sha256": digest,
        },
        "uci": {
            "package": uci["package"],
            "sectionType": uci["sectionType"],
            "fields": list(uci["fields"]),
        },
        "roles": role_labels,
        "profiles": profiles,
        "kinds": kinds,
        "limits": {
            "maxDevices": max_devices,
            "maxLabelLength": max_label_length,
            "maxRoles": len(role_labels),
            "deviceIdPattern": id_pattern,
            "maxDeviceIdLength": max_id_length,
        },
        "reportContract": report_contract,
        "reportPolicy": {
            "maxFutureClockSkewMs": max_future_skew,
            "receiveTimeoutSeconds": receive_timeout,
        },
        "cache": {
            "root": cache_root,
            "volatile": True,
            "pruneIntervalSeconds": prune_interval,
        },
    }


def render_device_catalog(**kwargs: Any) -> str:
    document = build_device_catalog(**kwargs)
    return json.dumps(document, indent=2, sort_keys=True) + "\n"
