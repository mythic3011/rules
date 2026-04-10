#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate adblock outputs from upstream sources.

Outputs per category:
  - dns/<category>.dnsmasq.conf
  - dns/<category>.hosts.txt
  - rule/<lite rule-provider>.yaml

Source of truth:
  - data/categories.yaml
  - data/*_sources.yaml
  - data/domain_policies.yaml
  - data/*_lite_seed.txt
  - dns/local_*list.txt
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DNS_DIR = ROOT / "dns"
RULE_DIR = ROOT / "rule"
REPORTS_DIR = ROOT / "reports"

REPO_SLUG = "mythic3011/rules"
REPO_URL = f"https://github.com/{REPO_SLUG}"

CATEGORY_CONFIG = DATA_DIR / "categories.yaml"
POLICY_CONFIG = DATA_DIR / "domain_policies.yaml"

DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
)


def read_simple_list(path: Path) -> list[str]:
    if not path.exists():
        return []
    items: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip().lower()
        if not line or line.startswith("#"):
            continue
        items.append(line)
    return items


def normalize_domain(raw: str) -> str | None:
    value = raw.strip().lower()
    if not value or value.startswith("#"):
        return None

    for prefix in ("||", "|", "*.", ".", "address=/.", "address=/", "server=/.", "server=/"):
        if value.startswith(prefix):
            value = value[len(prefix) :]

    value = value.split("^", 1)[0]
    value = value.split("/", 1)[0]
    value = value.split("#", 1)[0]
    value = value.strip(".")

    if not value or any(ch in value for ch in " *!@[]()%:,\\"):
        return None
    if not DOMAIN_RE.match(value):
        return None
    return value


def fetch_text(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "mythic3011-rules-adblock-generator/1.0",
            "Accept": "text/plain, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_domainswild2(text: str) -> set[str]:
    domains: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("!"):
            continue
        domain = normalize_domain(line)
        if domain:
            domains.add(domain)
    return domains


def parse_dnsmasq_conf(text: str) -> set[str]:
    domains: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r"^(?:address|server)=/\.?([^/]+)/", line)
        if not match:
            continue
        domain = normalize_domain(match.group(1))
        if domain:
            domains.add(domain)
    return domains


def parse_hosts(text: str) -> set[str]:
    domains: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        for candidate in parts[1:]:
            domain = normalize_domain(candidate)
            if domain:
                domains.add(domain)
    return domains


PARSERS = {
    "domainswild2": parse_domainswild2,
    "dnsmasq_conf": parse_dnsmasq_conf,
    "hosts": parse_hosts,
}


def parse_simple_yaml_sources(text: str) -> list[dict[str, object]]:
    sources: list[dict[str, object]] = []
    current: dict[str, object] | None = None

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped == "sources:":
            continue
        if stripped.startswith("- "):
            if current:
                sources.append(current)
            current = {}
            stripped = stripped[2:].strip()
            if stripped:
                key, value = [part.strip() for part in stripped.split(":", 1)]
                current[key] = value
            continue
        if current is None or ":" not in stripped:
            continue
        key, value = [part.strip() for part in stripped.split(":", 1)]
        if value.lower() == "true":
            current[key] = True
        elif value.lower() == "false":
            current[key] = False
        else:
            current[key] = value

    if current:
        sources.append(current)
    return sources


def parse_adblock_domains(text: str) -> set[str]:
    domains: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("!") or line.startswith("[") or line.startswith("#"):
            continue
        if line.startswith("@@"):
            continue
        if "$" in line:
            line = line.split("$", 1)[0]
        domain = normalize_domain(line)
        if domain:
            domains.add(domain)
    return domains


def parse_plain_domains(text: str) -> set[str]:
    domains: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        domain = normalize_domain(line)
        if domain:
            domains.add(domain)
    return domains


PARSERS["adblock_domains"] = parse_adblock_domains
PARSERS["plain_domains"] = parse_plain_domains


def load_sources(config_path: Path, custom_config_path: Path | None = None) -> list[dict]:
    sources: list[dict] = []
    config_text = config_path.read_text(encoding="utf-8")
    sources.extend(parse_simple_yaml_sources(config_text))
    if custom_config_path and custom_config_path.exists():
        sources.extend(parse_simple_yaml_sources(custom_config_path.read_text(encoding="utf-8")))
    sources = [item for item in sources if item.get("enabled", True)]
    return sorted(sources, key=lambda item: int(item.get("priority", 100)))


def load_policies() -> dict[str, object]:
    return parse_yaml_tree(POLICY_CONFIG.read_text(encoding="utf-8"))


def resolve_path(path_value: object) -> Path:
    return ROOT / str(path_value)


def load_categories() -> dict[str, dict[str, object]]:
    raw = parse_yaml_tree(CATEGORY_CONFIG.read_text(encoding="utf-8"))
    categories = raw.get("categories", {})
    if not isinstance(categories, dict):
        return {}
    return categories


def parse_scalar(value: str) -> object:
    value = value.strip()
    if value == "[]":
        return []
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [part.strip().strip("'\"").lower() for part in inner.split(",") if part.strip()]
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    return value


def parse_yaml_tree(text: str) -> dict[str, object]:
    root: dict[str, object] = {}
    stack: list[tuple[int, dict[str, object]]] = [(-1, root)]

    for raw_line in text.splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        stripped = raw_line.strip()
        if ":" not in stripped:
            continue
        key, raw_value = stripped.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()

        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]

        if raw_value == "":
            new_node: dict[str, object] = {}
            parent[key] = new_node
            stack.append((indent, new_node))
        else:
            parent[key] = parse_scalar(raw_value)
    return root


def to_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip().lower() for item in value]
    return []


def should_exclude(domain: str, include: dict[str, list[str]], exclude: dict[str, list[str]]) -> bool:
    if domain in include["exact"]:
        return False
    if any(domain == suffix or domain.endswith(f".{suffix}") for suffix in include["suffix"]):
        return False
    if any(keyword in domain for keyword in include["keyword"]):
        return False

    if domain in exclude["exact"]:
        return True
    if any(domain == suffix or domain.endswith(f".{suffix}") for suffix in exclude["suffix"]):
        return True
    if any(keyword in domain for keyword in exclude["keyword"]):
        return True
    return False


def apply_policies(domains: set[str], category: str, policies: dict[str, object]) -> set[str]:
    global_rules = policies.get("global", {})
    category_rules = policies.get("categories", {}).get(category, {})

    include = {
        "exact": set(to_list(global_rules.get("include_exact")) + to_list(category_rules.get("include_exact"))),
        "suffix": set(to_list(global_rules.get("include_suffix")) + to_list(category_rules.get("include_suffix"))),
        "keyword": set(to_list(global_rules.get("include_keyword")) + to_list(category_rules.get("include_keyword"))),
    }
    exclude = {
        "exact": set(to_list(global_rules.get("exclude_exact")) + to_list(category_rules.get("exclude_exact"))),
        "suffix": set(to_list(global_rules.get("exclude_suffix")) + to_list(category_rules.get("exclude_suffix"))),
        "keyword": set(to_list(global_rules.get("exclude_keyword")) + to_list(category_rules.get("exclude_keyword"))),
    }

    result: set[str] = set()
    for domain in domains:
        if not should_exclude(domain, include, exclude):
            result.add(domain)

    result.update(include["exact"])
    return result


def collect_domains(
    config_path: Path, custom_config_path: Path | None = None
) -> tuple[set[str], list[dict[str, object]], dict[str, int]]:
    all_domains: set[str] = set()
    source_entries: list[dict[str, object]] = []
    counts: dict[str, int] = {}
    for source in load_sources(config_path, custom_config_path):
        parser_name = source["format"]
        parser = PARSERS[parser_name]
        text = fetch_text(source["url"])
        domains = parser(text)
        counts[source["id"]] = len(domains)
        all_domains.update(domains)
        source_entries.append(
            {
                "id": str(source["id"]),
                "format": str(source["format"]),
                "priority": int(source.get("priority", 100)),
                "url": str(source["url"]),
                "homepage": str(source.get("homepage", "")),
                "count": len(domains),
            }
        )
    return all_domains, source_entries, counts


def build_header_lines(summary: dict[str, object], format_label: str) -> list[str]:
    lines = [
        "# Generated by py/generate_adblock_outputs.py",
        f"# REPO: {REPO_URL}",
        f"# SOURCE: {REPO_URL}/blob/main/py/generate_adblock_outputs.py",
        f"# CATEGORY: {summary['category']}",
        f"# GENERATED_AT: {summary['generated_at']}",
        f"# TOTAL: {summary['final_domain_count']}",
        f"# FORMAT: {format_label}",
    ]
    for source in summary["sources"]:
        source_id = source["id"]
        source_count = source["count"]
        source_homepage = source["homepage"] or source["url"]
        lines.append(f"# UPSTREAM {source_id}: {source_count}")
        lines.append(f"# UPSTREAM {source_id} HOMEPAGE: {source_homepage}")
    return lines


def build_dnsmasq(domains: list[str], summary: dict[str, object]) -> str:
    header = [
        *build_header_lines(summary, "dnsmasq conf"),
    ]
    body = [f"address=/{domain}/" for domain in domains]
    return "\n".join(header + [""] + body)


def build_hosts(domains: list[str], summary: dict[str, object]) -> str:
    header = [
        *build_header_lines(summary, "hosts"),
        "",
    ]
    body = [f"0.0.0.0 {domain}" for domain in domains]
    return "\n".join(header + body)


def build_clash_lite(domains: list[str], name: str, summary: dict[str, object]) -> str:
    payload = [f"  - '+.{domain}'" for domain in domains]
    header = [
        *build_header_lines(summary, f"Clash Domain Rule Provider ({name})"),
        "",
        "payload:",
    ]
    return "\n".join(header + payload)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8", newline="\n")


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def main() -> int:
    policies = load_policies()
    categories = load_categories()
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    index_payload: dict[str, object] = {
        "generated_at": generated_at,
        "repo": REPO_URL,
        "generator": f"{REPO_URL}/blob/main/py/generate_adblock_outputs.py",
        "categories": [],
    }
    for category, raw_meta in categories.items():
        meta = {
            "source_config": resolve_path(raw_meta["source_config"]),
            "custom_source_config": resolve_path(raw_meta["custom_source_config"]),
            "lite_seed": resolve_path(raw_meta["lite_seed"]),
            "allowlist": resolve_path(raw_meta["allowlist"]),
            "blocklist": resolve_path(raw_meta["blocklist"]),
            "dnsmasq_output": resolve_path(raw_meta["dnsmasq_output"]),
            "hosts_output": resolve_path(raw_meta["hosts_output"]),
            "clash_output": resolve_path(raw_meta["clash_output"]),
            "clash_name": raw_meta["clash_name"],
        }
        try:
            upstream_domains, source_entries, source_counts = collect_domains(
                meta["source_config"], meta["custom_source_config"]
            )
        except Exception as exc:  # fail loudly so CI and cron can stop
            print(f"[error] Failed to collect upstream blocklists for {category}: {exc}", file=sys.stderr)
            return 1

        allowlist = set(read_simple_list(meta["allowlist"]))
        local_blocklist = set(read_simple_list(meta["blocklist"]))

        merged_domains = upstream_domains | local_blocklist
        post_allowlist_domains = merged_domains - allowlist
        final_domains = apply_policies(post_allowlist_domains, category, policies)
        sorted_domains = sorted(final_domains)

        clash_seed = set(read_simple_list(meta["lite_seed"]))
        clash_domains_set = (clash_seed | local_blocklist) - allowlist
        clash_domains_set = apply_policies(clash_domains_set, category, policies)
        clash_domains = sorted(clash_domains_set)

        summary = {
            "category": category,
            "generated_at": generated_at,
            "source_config": str(meta["source_config"].relative_to(ROOT)),
            "custom_source_config": str(meta["custom_source_config"].relative_to(ROOT)),
            "allowlist": str(meta["allowlist"].relative_to(ROOT)),
            "blocklist": str(meta["blocklist"].relative_to(ROOT)),
            "dnsmasq_output": str(meta["dnsmasq_output"].relative_to(ROOT)),
            "hosts_output": str(meta["hosts_output"].relative_to(ROOT)),
            "clash_output": str(meta["clash_output"].relative_to(ROOT)),
            "clash_name": str(meta["clash_name"]),
            "upstream_unique_count": len(upstream_domains),
            "local_blocklist_count": len(local_blocklist),
            "allowlist_count": len(allowlist),
            "merged_pre_allowlist_count": len(merged_domains),
            "post_allowlist_count": len(post_allowlist_domains),
            "final_domain_count": len(sorted_domains),
            "clash_seed_count": len(clash_seed),
            "clash_domain_count": len(clash_domains),
            "sources": source_entries,
        }

        write_text(meta["dnsmasq_output"], build_dnsmasq(sorted_domains, summary))
        write_text(meta["hosts_output"], build_hosts(sorted_domains, summary))
        write_text(meta["clash_output"], build_clash_lite(clash_domains, meta["clash_name"], summary))
        write_json(REPORTS_DIR / f"{category}.summary.json", summary)

        index_payload["categories"].append(
            {
                "category": category,
                "final_domain_count": len(sorted_domains),
                "clash_domain_count": len(clash_domains),
                "source_count": len(source_entries),
                "report": f"reports/{category}.summary.json",
                "dnsmasq_output": str(meta["dnsmasq_output"].relative_to(ROOT)),
                "hosts_output": str(meta["hosts_output"].relative_to(ROOT)),
                "clash_output": str(meta["clash_output"].relative_to(ROOT)),
            }
        )

        print(
            f"Generated {meta['dnsmasq_output'].relative_to(ROOT)} with {len(sorted_domains)} domains."
        )
        print(f"Generated {meta['hosts_output'].relative_to(ROOT)} with {len(sorted_domains)} domains.")
        print(f"Generated {meta['clash_output'].relative_to(ROOT)} with {len(clash_domains)} domains.")
        print(f"Generated reports/{category}.summary.json with {len(source_entries)} sources.")
    write_json(REPORTS_DIR / "index.json", index_payload)
    print("Generated reports/index.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
