from __future__ import annotations

import unittest

from ai_profiles_test_support import load_generator
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import (
    compile_ai_routing_rules,
    compile_routing_entries,
    compile_rule_providers,
    compile_subconverter_plan,
)
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


if __name__ == "__main__":
    unittest.main()
