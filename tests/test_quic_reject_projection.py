from __future__ import annotations

from pathlib import Path
import unittest

import yaml

from ai_profiles_test_support import ROOT, load_generator
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import (
    compile_ai_routing_rules,
    compile_routing_entries,
    compile_rule_providers,
    compile_subconverter_plan,
)
from ai_profiles.models import RoutingRule
from ai_profiles.plans.ini_mvp import load_ini_mvp_plan
from ai_profiles.validation import is_host_scoped_quic_reject, validate_companion_rule_payload_scope
from validate_generated_profiles import (
    ValidationError,
    is_catchall_dst_port_line,
    validate_general_text,
)

load_generator("generate_ai_profiles_quic_reject")


QUIC_PAYLOAD = "AND,((NETWORK,UDP),(DST-PORT,443),(DOMAIN-SUFFIX,googleapis.com))"
QUIC_PROVIDER = "GoogleAPIs_QUIC_Reject_Classical"
QUIC_FILE = "GoogleAPIs_QUIC_Reject_Classical.yaml"

NAMED_AI_GOOGLEAPIS_HOSTS = (
    ("generativelanguage.googleapis.com", "🤖 Gemini", "AI_Gemini_Classical"),
    ("jules.googleapis.com", "🤖 Jules", "AI_Jules_Classical"),
    ("aiplatform.googleapis.com", "🤖 Vertex AI", "AI_VertexAI_Classical"),
)
GEOSITE_BEFORE_QUIC = (
    ("private", "🎯 全球直連"),
    ("openai", "🤖 ChatGPT"),
    ("github-copilot", "🧑‍💻 Copilot"),
    ("anthropic", "🤖 Claude"),
    ("perplexity", "🤖 Perplexity"),
    ("xai", "🤖 Grok"),
    ("poe", "🤖 Poe"),
    ("google-deepmind", "🤖 AI Other"),
    ("category-ai-!cn", "🤖 AI Other"),
    ("category-ai-cn", "🤖 AI CN Other"),
)
YAML_PROFILES = (
    (False, ROOT / "cfg" / "yaml" / "Custom_Clash_AI.yaml"),
    (True, ROOT / "cfg" / "yaml" / "Custom_Clash_AI_Strict.yaml"),
)


def _domain_suffix_matches(host: str, suffix: str) -> bool:
    return host == suffix or host.endswith(f".{suffix}")


def _payload_matches(entry: str, *, host: str, network: str, port: int) -> bool:
    if is_host_scoped_quic_reject(entry):
        suffix = entry.rsplit("DOMAIN-SUFFIX,", 1)[1].rstrip(")")
        return network == "udp" and port == 443 and _domain_suffix_matches(host, suffix)
    kind, _, rest = entry.partition(",")
    if kind == "DOMAIN":
        return host == rest
    if kind == "DOMAIN-SUFFIX":
        return _domain_suffix_matches(host, rest)
    if kind == "DOMAIN-KEYWORD":
        return rest in host
    return False


def _provider_payloads(catalog) -> dict[str, tuple[str, ...]]:
    payloads: dict[str, tuple[str, ...]] = {}
    for service in catalog.services:
        payloads[service.provider_key] = service.payload
    for rule in catalog.companion_rulesets:
        payloads[rule.provider_key] = rule.payload
    return payloads


def first_match_target(
    catalog,
    *,
    host: str,
    network: str,
    port: int,
    strict: bool,
) -> tuple[str, str]:
    """Return (kind, target) of the first compiled rule that matches this flow.

    Evaluates catalog-owned RULE-SET payloads (DOMAIN / DOMAIN-SUFFIX /
    DOMAIN-KEYWORD / host-scoped QUIC AND) and MATCH. GEOSITE/GEOIP and
    remote/external RULE-SETs without a catalog payload are skipped: they
    do not name these googleapis hosts in this repo.
    """
    payloads = _provider_payloads(catalog)
    entries = compile_routing_entries(
        strict=strict,
        include_process_rules=False,
        catalog=catalog,
    )
    for entry in entries:
        if not isinstance(entry, RoutingRule) or entry.target is None:
            continue
        if entry.kind == "MATCH":
            return entry.kind, entry.target
        if entry.kind != "RULE-SET":
            continue
        for payload in payloads.get(entry.value, ()):
            if _payload_matches(payload, host=host, network=network, port=port):
                return entry.kind, entry.target
    raise AssertionError(f"no compiled rule matched {network}/{port} {host}")


def _yaml_first_match(
    rules: list[str],
    payloads: dict[str, tuple[str, ...]],
    *,
    host: str,
    network: str,
    port: int,
) -> tuple[str, str]:
    for line in rules:
        kind, _, rest = line.partition(",")
        if kind == "MATCH":
            return kind, rest
        if kind == "GEOSITE":
            continue
        if kind != "RULE-SET":
            continue
        provider, _, target = rest.partition(",")
        for payload in payloads.get(provider, ()):
            if _payload_matches(payload, host=host, network=network, port=port):
                return kind, target
    raise AssertionError(f"no generated YAML rule matched {network}/{port} {host}")


class QuicRejectProjectionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.rule = next(rule for rule in cls.catalog.companion_rulesets if rule.id == "googleapis-quic-reject")

    def test_catalog_declares_host_scoped_quic_reject(self) -> None:
        self.assertEqual(self.rule.provider_key, QUIC_PROVIDER)
        self.assertEqual(self.rule.file, QUIC_FILE)
        self.assertEqual(self.rule.group, self.catalog.group("reject"))
        self.assertEqual(self.rule.payload, (QUIC_PAYLOAD,))
        self.assertTrue(self.rule.mihomo)
        self.assertEqual(self.rule.mihomo_when, "always")
        self.assertTrue(is_host_scoped_quic_reject(QUIC_PAYLOAD))
        validate_companion_rule_payload_scope(self.rule)

    def test_ai_interval_emits_quic_reject_before_match_in_both_profiles(self) -> None:
        ai_rules = compile_ai_routing_rules(self.catalog)
        self.assertEqual(ai_rules[-1].kind, "RULE-SET")
        self.assertEqual(ai_rules[-1].value, QUIC_PROVIDER)
        self.assertEqual(ai_rules[-1].target, self.catalog.group("reject"))

        for strict in (False, True):
            with self.subTest(strict=strict):
                entries = compile_routing_entries(
                    strict=strict,
                    include_process_rules=False,
                    catalog=self.catalog,
                )
                prefixes = [
                    f"{entry.kind},{entry.value},{entry.target}"
                    for entry in entries
                    if getattr(entry, "kind", None) is not None
                ]
                quic = f"RULE-SET,{QUIC_PROVIDER},{self.catalog.group('reject')}"
                match = next(prefix for prefix in prefixes if prefix.startswith("MATCH,"))
                self.assertIn(quic, prefixes)
                self.assertLess(prefixes.index(quic), prefixes.index(match))
                providers = {
                    plan.name
                    for plan in compile_rule_providers(
                        strict=strict,
                        include_process_rules=False,
                        catalog=self.catalog,
                    )
                }
                self.assertIn(QUIC_PROVIDER, providers)

    def test_ini_projects_remote_classical_quic_reject(self) -> None:
        plan = compile_subconverter_plan(
            load_ini_mvp_plan(),
            include_process_rules=False,
            catalog=self.catalog,
        )
        companion_urls = [
            rule.url.rsplit("/", 1)[-1]
            for cluster in plan.companion_rule_clusters
            for rule in cluster.rules
        ]
        self.assertIn(QUIC_FILE, companion_urls)
        quic_rule = next(
            rule
            for cluster in plan.companion_rule_clusters
            for rule in cluster.rules
            if rule.url.endswith(QUIC_FILE)
        )
        self.assertEqual(quic_rule.kind, "remote-classical")
        self.assertEqual(quic_rule.target, self.catalog.group("reject"))

    def test_catchall_dst_port_still_fails_and_and_scoped_passes(self) -> None:
        self.assertTrue(is_catchall_dst_port_line("DST-PORT,443"))
        self.assertTrue(is_catchall_dst_port_line('  - "DST-PORT,80"'))
        self.assertTrue(is_catchall_dst_port_line("DST-PORT,443,DIRECT"))
        self.assertFalse(is_catchall_dst_port_line(QUIC_PAYLOAD))
        self.assertFalse(is_catchall_dst_port_line(f'  - "{QUIC_PAYLOAD}"'))

        validate_general_text({"ok.yaml": f"payload:\n  - {QUIC_PAYLOAD}\n"})
        with self.assertRaisesRegex(ValidationError, "Forbidden DST-PORT catch-all"):
            validate_general_text({"bad.yaml": "rules:\n  - DST-PORT,443\n"})
        with self.assertRaisesRegex(ValidationError, "Forbidden DST-PORT catch-all"):
            validate_general_text({"bad.yaml": '  - "DST-PORT,80,DIRECT"\n'})

    def test_named_ai_googleapis_udp_443_keeps_service_group(self) -> None:
        reject = self.catalog.group("reject")
        for host, group, provider in NAMED_AI_GOOGLEAPIS_HOSTS:
            for strict in (False, True):
                with self.subTest(host=host, strict=strict):
                    kind, target = first_match_target(
                        self.catalog, host=host, network="udp", port=443, strict=strict
                    )
                    self.assertEqual(kind, "RULE-SET")
                    self.assertEqual(target, group)
                    self.assertNotEqual(target, reject)
                    payloads = _provider_payloads(self.catalog)
                    self.assertTrue(
                        any(
                            _payload_matches(entry, host=host, network="udp", port=443)
                            for entry in payloads[provider]
                        )
                    )

    def test_storage_googleapis_udp_443_hits_quic_reject(self) -> None:
        reject = self.catalog.group("reject")
        for host in (
            "storage.googleapis.com",
            "producer-app-public.storage.googleapis.com",
        ):
            for strict in (False, True):
                with self.subTest(host=host, strict=strict):
                    kind, target = first_match_target(
                        self.catalog, host=host, network="udp", port=443, strict=strict
                    )
                    self.assertEqual(kind, "RULE-SET")
                    self.assertEqual(target, reject)

    def test_storage_googleapis_tcp_443_falls_through_to_match(self) -> None:
        reject = self.catalog.group("reject")
        for strict, match_target in (
            (False, self.catalog.group("fallback")),
            (True, reject),
        ):
            with self.subTest(strict=strict):
                kind, target = first_match_target(
                    self.catalog,
                    host="storage.googleapis.com",
                    network="tcp",
                    port=443,
                    strict=strict,
                )
                self.assertEqual(kind, "MATCH")
                self.assertEqual(target, match_target)
                if not strict:
                    self.assertNotEqual(target, reject)

    def test_geosite_before_quic_is_pinned_and_does_not_name_googleapis(self) -> None:
        for strict in (False, True):
            with self.subTest(strict=strict):
                entries = compile_routing_entries(
                    strict=strict,
                    include_process_rules=False,
                    catalog=self.catalog,
                )
                geosites: list[tuple[str, str]] = []
                saw_quic = False
                for entry in entries:
                    if not isinstance(entry, RoutingRule):
                        continue
                    if entry.kind == "RULE-SET" and entry.value == QUIC_PROVIDER:
                        saw_quic = True
                        break
                    if entry.kind == "GEOSITE":
                        geosites.append((entry.value, entry.target or ""))
                self.assertTrue(saw_quic)
                self.assertEqual(tuple(geosites), GEOSITE_BEFORE_QUIC)
                self.assertFalse(any("googleapis" in value for value, _ in geosites))

    def test_generated_yaml_first_match_matches_compiler(self) -> None:
        payloads = _provider_payloads(self.catalog)
        cases = [
            *(
                (host, "udp", 443, "RULE-SET", group)
                for host, group, _ in NAMED_AI_GOOGLEAPIS_HOSTS
            ),
            ("storage.googleapis.com", "udp", 443, "RULE-SET", self.catalog.group("reject")),
            (
                "storage.googleapis.com",
                "tcp",
                443,
                "MATCH",
                None,
            ),
        ]
        for strict, path in YAML_PROFILES:
            doc = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
            rules = list(doc["rules"])
            for host, network, port, kind, group in cases:
                with self.subTest(path=path.name, host=host, network=network, port=port):
                    expected_group = (
                        self.catalog.group("fallback")
                        if group is None and not strict
                        else self.catalog.group("reject")
                        if group is None
                        else group
                    )
                    yaml_kind, yaml_target = _yaml_first_match(
                        rules, payloads, host=host, network=network, port=port
                    )
                    ir_kind, ir_target = first_match_target(
                        self.catalog, host=host, network=network, port=port, strict=strict
                    )
                    self.assertEqual((yaml_kind, yaml_target), (kind, expected_group))
                    self.assertEqual((ir_kind, ir_target), (yaml_kind, yaml_target))


if __name__ == "__main__":
    unittest.main()
