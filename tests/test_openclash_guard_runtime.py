from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from internal.python.generate_openclash_guard_runtime import (  # noqa: E402
    OUTPUT_PATH,
    SCHEMA_PATH,
    compile_openclash_guard_runtime,
    dumps_runtime,
    load_schema,
    validate_runtime_document,
)


GUARD_YAML = """\
nft:
  family: inet
  table: openclash_guard
  commentPrefix: openclash-guard
gaming:
  udpPorts: [3074]
  tcpPorts: []
  protectedUdpPorts: []
  destinationCidrs: []
geoProviders:
  - id: lookup
    url: https://example.invalid/lookup
    timeoutSeconds: 3
    fields:
      ip: ip
      country: country_code
"""

ROUTES_YAML = """\
routeTargets:
  direct:
    kind: direct
    group: DIRECT
  reject:
    kind: reject
    group: REJECT
  aa-stable:
    kind: region-stable
    group: AA
    region: aa
    dynamic: false
  bb-stable:
    kind: region-stable
    group: BB
    region: bb
    dynamic: false
  pin-aa:
    kind: pinned-egress
    group: Pin
    approvedNodes: [N1]
    emptyFallback: REJECT
    dynamic: false
"""

CLASSES_YAML = """\
protectionClasses:
  proxy-required:
    kind: proxy-required
    directAllowed: false
    dynamicRouteAllowed: true
  direct-capable:
    kind: direct-capable
    directAllowed: true
    dynamicRouteAllowed: true
  kill-switch:
    directAllowed: false
    firewallKillSwitch: true
"""

SERVICES_YAML = """\
services:
  alpha:
    protectionClass: proxy-required
    allowedRoutes: [aa-stable, bb-stable, reject]
  beta:
    protectionClass: kill-switch
    allowedRoutes: [reject, pin-aa]
  gamma:
    protectionClass: direct-capable
    allowedRoutes: [direct, aa-stable, reject]
"""

SERVICES_JSON = {
    "schemaVersion": 1,
    "services": [
        {
            "id": "alpha",
            "payload": ["DOMAIN-SUFFIX,alpha.example", "DOMAIN,exact.alpha.example"],
            "regions": ["zz", "yy"],
            "upstreamRules": [{"kind": "geosite", "value": "alpha-site"}],
        }
    ],
}


def _write(path: Path, content: str | dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, dict):
        path.write_text(json.dumps(content, indent=2) + "\n", encoding="utf-8")
    else:
        path.write_text(content, encoding="utf-8")


def _catalog(
    tmp: Path,
    *,
    routes: str = ROUTES_YAML,
    classes: str = CLASSES_YAML,
    services: str = SERVICES_YAML,
    services_json: dict | None = SERVICES_JSON,
    guard: str = GUARD_YAML,
) -> tuple[Path, Path]:
    ai_dir = tmp / "ai-routing"
    guard_dir = tmp / "openclash-guard"
    _write(ai_dir / "10-route-targets.yaml", routes)
    _write(ai_dir / "20-protection-classes.yaml", classes)
    _write(ai_dir / "30-services.yaml", services)
    if services_json is not None:
        _write(ai_dir / "services.json", services_json)
    _write(guard_dir / "guard.yaml", guard)
    return ai_dir, guard_dir


def _compile(tmp: Path, **kwargs) -> dict:
    ai_dir, guard_dir = _catalog(tmp, **kwargs)
    return compile_openclash_guard_runtime(
        ai_routing_dir=ai_dir,
        guard_config_dir=guard_dir,
        schema_path=SCHEMA_PATH,
    )


class SyntheticCatalogTest(unittest.TestCase):
    def test_regions_come_from_allowed_routes_not_services_json(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            document = _compile(Path(raw))

        alpha = document["services"]["alpha"]
        self.assertEqual(alpha["allowedRegions"], ["aa", "bb"])
        self.assertNotIn("zz", alpha["allowedRegions"])
        self.assertEqual(alpha["matchers"]["geosite"], ["alpha-site"])
        self.assertEqual(alpha["matchers"]["domainSuffixes"], ["alpha.example"])
        self.assertEqual(alpha["protectionClass"], "proxy-required")

        beta = document["services"]["beta"]
        self.assertEqual(beta["allowedRegions"], [])
        self.assertEqual(beta["matchers"], {"geosite": [], "domainSuffixes": []})
        self.assertTrue(document["protectionClasses"]["kill-switch"]["firewallKillSwitch"])
        self.assertEqual(document["protectionClasses"]["kill-switch"]["failMode"], "reject")

        gamma = document["services"]["gamma"]
        self.assertEqual(gamma["allowedRegions"], ["aa"])
        self.assertEqual(gamma["matchers"], {"geosite": [], "domainSuffixes": []})
        self.assertEqual(document["protectionClasses"]["direct-capable"]["failMode"], "allow")
        self.assertEqual(document["protectionClasses"]["direct-capable"]["quic"], "allow")
        self.assertEqual(document["protectionClasses"]["proxy-required"]["quic"], "proxy-or-reject")
        self.assertIn(443, document["gaming"]["protectedUdpPorts"])
        self.assertNotIn(443, document["gaming"]["udpPorts"])
        self.assertEqual(document["gaming"]["udpPorts"], [3074])

    def test_missing_protection_class_is_rejected(self) -> None:
        services = """\
services:
  alpha:
    protectionClass: missing-class
    allowedRoutes: [aa-stable]
"""
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaisesRegex(RuntimeError, "unknown protection class: missing-class"):
                _compile(Path(raw), services=services)

    def test_unknown_route_is_rejected(self) -> None:
        services = """\
services:
  alpha:
    protectionClass: proxy-required
    allowedRoutes: [moon-stable]
"""
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaisesRegex(RuntimeError, "unknown route: moon-stable"):
                _compile(Path(raw), services=services)

    def test_duplicate_yaml_service_ids_are_rejected(self) -> None:
        services = """\
services:
  alpha:
    protectionClass: proxy-required
    allowedRoutes: [aa-stable]
  alpha:
    protectionClass: direct-capable
    allowedRoutes: [direct]
"""
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaisesRegex(RuntimeError, "duplicate mapping key"):
                _compile(Path(raw), services=services)

    def test_duplicate_json_service_ids_are_rejected(self) -> None:
        catalog = {
            "schemaVersion": 1,
            "services": [
                {"id": "alpha", "payload": [], "upstreamRules": []},
                {"id": "alpha", "payload": [], "upstreamRules": []},
            ],
        }
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaisesRegex(RuntimeError, "duplicate service id 'alpha'"):
                _compile(Path(raw), services_json=catalog)

    def test_duplicate_geo_provider_ids_are_rejected(self) -> None:
        guard = """\
nft:
  family: inet
  table: openclash_guard
  commentPrefix: openclash-guard
gaming:
  udpPorts: []
  tcpPorts: []
  protectedUdpPorts: [443]
  destinationCidrs: []
geoProviders:
  - id: lookup
    url: https://example.invalid/a
    timeoutSeconds: 3
    fields: {ip: ip, country: country_code}
  - id: lookup
    url: https://example.invalid/b
    timeoutSeconds: 3
    fields: {ip: ip, country: country_code}
"""
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaisesRegex(RuntimeError, "duplicate geo provider id"):
                _compile(Path(raw), guard=guard)

    def test_yaml_service_without_json_twin_emits_empty_matchers(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            document = _compile(Path(raw), services_json={"schemaVersion": 1, "services": []})
        self.assertEqual(
            document["services"]["alpha"]["matchers"],
            {"geosite": [], "domainSuffixes": []},
        )

    def test_secret_fields_are_refused(self) -> None:
        guard = GUARD_YAML + "\n    apiKey: hunter2\n"
        with tempfile.TemporaryDirectory() as raw:
            with self.assertRaisesRegex(RuntimeError, "refusing secret field"):
                _compile(Path(raw), guard=guard)

    def test_firewall_kill_switch_defaults_fail_mode_to_reject(self) -> None:
        classes = """\
protectionClasses:
  kill-switch:
    directAllowed: false
    firewallKillSwitch: true
  proxy-required:
    kind: proxy-required
    directAllowed: false
    dynamicRouteAllowed: true
  direct-capable:
    kind: direct-capable
    directAllowed: true
    dynamicRouteAllowed: true
"""
        with tempfile.TemporaryDirectory() as raw:
            document = _compile(Path(raw), classes=classes)
        self.assertEqual(document["protectionClasses"]["kill-switch"]["failMode"], "reject")


class ProductionContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.generated = compile_openclash_guard_runtime()
        cls.checked_in = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))

    def test_schema_version_present(self) -> None:
        self.assertEqual(self.checked_in["schemaVersion"], 1)
        self.assertEqual(self.generated["schemaVersion"], 1)

    def test_checked_in_artifact_matches_schema(self) -> None:
        validate_runtime_document(self.checked_in, load_schema())

    def test_every_service_protection_class_resolves(self) -> None:
        classes = self.checked_in["protectionClasses"]
        self.assertTrue(classes)
        for service_id, service in self.checked_in["services"].items():
            self.assertIn(service["protectionClass"], classes, service_id)

    def test_every_allowed_region_is_a_string(self) -> None:
        for service_id, service in self.checked_in["services"].items():
            regions = service["allowedRegions"]
            self.assertIsInstance(regions, list, service_id)
            for region in regions:
                self.assertIsInstance(region, str, f"{service_id}:{region!r}")
                self.assertTrue(region, service_id)

    def test_no_duplicate_service_ids(self) -> None:
        ids = list(self.checked_in["services"])
        self.assertEqual(ids, sorted(set(ids)))

    def test_protected_udp_ports_contain_443(self) -> None:
        self.assertIn(443, self.checked_in["gaming"]["protectedUdpPorts"])

    def test_revision_is_deterministic_hex(self) -> None:
        revision = self.checked_in["revision"]
        self.assertEqual(len(revision), 64)
        self.assertRegex(revision, r"^[a-f0-9]{64}$")

    def test_two_consecutive_generator_runs_are_byte_identical(self) -> None:
        first = dumps_runtime(compile_openclash_guard_runtime())
        second = dumps_runtime(compile_openclash_guard_runtime())
        self.assertEqual(first, second)

    def test_checked_in_file_matches_running_the_generator(self) -> None:
        self.assertEqual(OUTPUT_PATH.read_text(encoding="utf-8"), dumps_runtime(self.generated))

    def test_no_secret_keys_in_runtime_artifact(self) -> None:
        blob = json.dumps(self.checked_in)
        for needle in ("apiKey", "token", "password"):
            self.assertNotIn(f'"{needle}"', blob)


if __name__ == "__main__":
    unittest.main()
