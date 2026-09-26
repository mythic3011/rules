from __future__ import annotations

import json
import shlex
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "internal" / "config" / "openclash-guard" / "uci-runtime-contract.json"
UCI_DEFAULTS = ROOT / "apps" / "luci-app-openclash-guard" / "root" / "etc" / "config" / "openclash_guard"
POLICY = ROOT / "cfg" / "runtime" / "openclash-guard.json"
REGIONS = ROOT / "internal" / "config" / "ai-routing" / "catalogs" / "regions.json"
VIEWS = ROOT / "apps" / "luci-app-openclash-guard" / "htdocs" / "luci-static" / "resources" / "view" / "openclash-guard"


def parse_uci_defaults(path: Path) -> dict[str, dict[str, object]]:
    sections: dict[str, dict[str, object]] = {}
    current: dict[str, object] | None = None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = shlex.split(line, comments=True, posix=True)
        if not parts:
            continue
        if parts[0] == "config":
            if len(parts) != 3:
                raise AssertionError(f"unsupported UCI config line: {line}")
            section_type, name = parts[1], parts[2]
            if name in sections:
                raise AssertionError(f"duplicate named UCI section: {name}")
            current = {"type": section_type, "options": {}, "lists": {}}
            sections[name] = current
            continue
        if current is None:
            raise AssertionError(f"UCI value appears before a section: {line}")
        if parts[0] == "option":
            if len(parts) != 3:
                raise AssertionError(f"unsupported UCI option line: {line}")
            current["options"][parts[1]] = parts[2]
        elif parts[0] == "list":
            if len(parts) != 3:
                raise AssertionError(f"unsupported UCI list line: {line}")
            current["lists"].setdefault(parts[1], []).append(parts[2])
        else:
            raise AssertionError(f"unsupported UCI directive: {line}")
    return sections


class OpenClashGuardUciRuntimeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
        cls.defaults = parse_uci_defaults(UCI_DEFAULTS)
        cls.policy = json.loads(POLICY.read_text(encoding="utf-8"))
        cls.regions = json.loads(REGIONS.read_text(encoding="utf-8"))

    def test_contract_is_versioned_and_release_wiring_is_deferred(self) -> None:
        self.assertEqual(self.contract["schemaVersion"], 1)
        self.assertEqual(self.contract["package"], "openclash_guard")
        self.assertEqual(self.contract["configPath"], "/etc/config/openclash_guard")
        self.assertEqual(self.contract["releaseWiring"], "deferred")

    def test_contract_vocabulary_is_closed_and_defaults_are_valid(self) -> None:
        allowed_phases = {"effective", "next-release", "luci-only"}
        allowed_authorities = {
            "uci-runtime",
            "uci-overlay",
            "signed-policy-gated",
            "live-capability-gated",
            "signed-policy-floor",
            "monitor-service",
        }
        for section_name, section in self.contract["sections"].items():
            for option_name, spec in section["options"].items():
                label = f"{section_name}.{option_name}"
                self.assertIn(spec["phase"], allowed_phases, label)
                self.assertIn(spec["authority"], allowed_authorities, label)
                values = spec.get("values")
                if values is not None:
                    self.assertEqual(len(values), len(set(values)), label)
                    if "default" in spec:
                        self.assertIn(spec["default"], values, label)
                if spec["type"] == "boolean" and "default" in spec:
                    self.assertIn(spec["default"], {"0", "1"}, label)

    def test_contract_covers_every_shipped_uci_section_and_option(self) -> None:
        contract_sections = self.contract["sections"]
        self.assertEqual(set(self.defaults), set(contract_sections))
        for name, actual in self.defaults.items():
            spec = contract_sections[name]
            self.assertEqual(actual["type"], spec["type"], name)
            covered = set(spec["options"])
            self.assertTrue(set(actual["options"]).issubset(covered), name)
            self.assertTrue(set(actual["lists"]).issubset(covered), name)

    def test_contract_defaults_match_packaged_uci_defaults(self) -> None:
        for section_name, section in self.contract["sections"].items():
            actual_options = self.defaults[section_name]["options"]
            for option_name, spec in section["options"].items():
                if "default" not in spec:
                    continue
                self.assertIn(option_name, actual_options, f"{section_name}.{option_name}")
                self.assertEqual(actual_options[option_name], spec["default"], f"{section_name}.{option_name}")

    def test_current_effective_surface_is_explicit_and_small(self) -> None:
        effective = {
            (section_name, option_name)
            for section_name, section in self.contract["sections"].items()
            for option_name, spec in section["options"].items()
            if spec["phase"] == "effective"
        }
        self.assertEqual(
            effective,
            {
                ("main", "enabled"),
                ("main", "kill_switch"),
                ("main", "dns_kill_switch"),
                ("udp", "enabled"),
                ("udp", "src_ip"),
            },
        )

    def test_next_release_routing_services_exist_in_signed_policy(self) -> None:
        signed_services = set(self.policy["services"])
        self.assertTrue(set(self.contract["services"]).issubset(signed_services))
        routing = self.contract["sections"]["routing"]["options"]
        for service in self.contract["services"]:
            self.assertIn(service, routing)
            self.assertEqual(routing[service]["type"], "service-route-mode")
            self.assertEqual(routing[service]["authority"], "signed-policy-gated")

    def test_region_defaults_respect_registry_scope(self) -> None:
        region_ids = {item["id"] for item in self.regions["regions"]}
        routable_ids = set(self.regions["primaryOrder"])
        self.assertTrue(routable_ids.issubset(region_ids))
        routing = self.contract["sections"]["routing"]["options"]
        direct = routing["direct_region"]
        proxy = routing["proxy_region"]
        self.assertEqual(direct["regionSet"], "registry")
        self.assertIn(direct["default"], region_ids)
        self.assertEqual(proxy["regionSet"], "primaryOrder")
        self.assertIn(proxy["default"], routable_ids)

    def test_luci_enum_choices_match_machine_contract(self) -> None:
        sources = {
            "main": (VIEWS / "profile.js").read_text(encoding="utf-8"),
            "routing": (VIEWS / "routing.js").read_text(encoding="utf-8"),
            "dns": (VIEWS / "dns.js").read_text(encoding="utf-8"),
            "monitoring": (VIEWS / "monitoring.js").read_text(encoding="utf-8"),
        }
        for section_name, source in sources.items():
            for option_name, spec in self.contract["sections"][section_name]["options"].items():
                values = spec.get("values")
                if not values:
                    continue
                for value in values:
                    self.assertIn(f".value('{value}'", source, f"{section_name}.{option_name}: {value}")

    def test_uci_overlay_cannot_widen_signed_authority(self) -> None:
        trust = self.contract["trust"]
        self.assertFalse(trust["uciMayWidenSignedCapabilities"])
        self.assertTrue(trust["directRoutingRequiresSignedPermission"])
        self.assertFalse(trust["localRulesMayBypassProtectedServicePolicy"])
        self.assertEqual(trust["invalidRuntimeValue"], "reject-reconcile")
        self.assertEqual(trust["unknownOption"], "ignore-and-report")
        self.assertIn("services", trust["signedPolicyAuthoritative"])
        self.assertIn("protectionClasses", trust["signedPolicyAuthoritative"])
        self.assertEqual(
            self.contract["sections"]["dns"]["options"]["fail_closed"]["authority"],
            "signed-policy-floor",
        )
        for option in ("direct_rule", "direct_source"):
            self.assertEqual(
                self.contract["sections"]["rules"]["options"][option]["authority"],
                "signed-policy-gated",
            )

    def test_monitoring_is_not_guard_core_policy(self) -> None:
        monitoring = self.contract["sections"]["monitoring"]
        self.assertEqual(monitoring["scope"], "luci-only")
        for spec in monitoring["options"].values():
            self.assertEqual(spec["phase"], "luci-only")
            self.assertEqual(spec["authority"], "monitor-service")


if __name__ == "__main__":
    unittest.main()
