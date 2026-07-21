from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from py.local_transport_inventory import (
    TransportConfigError,
    compile_service_transport_plan,
    load_service_candidate_policy,
    load_transport_inventory,
)


SERVICES = ("chat", "code")
REGIONS = ("us", "jp")


def write_config(directory: str, name: str, content: str) -> Path:
    path = Path(directory) / name
    path.write_text(content, encoding="utf-8")
    return path


def inventory_yaml(extra: str = "") -> str:
    return f"""transports:
  alpha:
    type: socks5
    server_env: ALPHA_SERVER
    port_env: ALPHA_PORT
    allowed_services: [chat]
    allowed_profiles: [relaxed, strict]
    metadata:
      region: us
      trusted: true
      supports_udp: true
{extra}"""


def policy_yaml(candidates: str = """      - ref: region:us
        role: preferred
""") -> str:
    return f"""services:
  chat:
    candidates:
{candidates}"""


class LocalTransportInventoryTests(unittest.TestCase):
    def load(self, inventory: str, policy: str) -> tuple[object, object]:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        inventory_path = write_config(directory.name, "transports.yaml", inventory)
        policy_path = write_config(directory.name, "policy.yaml", policy)
        return (
            load_transport_inventory(inventory_path, SERVICES, REGIONS),
            load_service_candidate_policy(policy_path, SERVICES, REGIONS),
        )

    def test_duplicate_transport_key_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = write_config(directory, "transports.yaml", "transports:\n  alpha: {}\n  alpha: {}\n")
            with self.assertRaises(TransportConfigError):
                load_transport_inventory(path, SERVICES, REGIONS)

    def test_missing_transport_ref_and_disallowed_service_fail(self) -> None:
        inventory, policy = self.load(inventory_yaml(), policy_yaml("      - ref: transport:missing\n        role: preferred\n"))
        with self.assertRaises(TransportConfigError):
            compile_service_transport_plan(inventory, policy, "chat", "relaxed", {})
        policy = self.load(inventory_yaml(), """services:
  code:
    candidates:
      - ref: transport:alpha
        role: preferred
""")[1]
        with self.assertRaises(TransportConfigError):
            compile_service_transport_plan(inventory, policy, "code", "relaxed", {})
        policy = self.load(inventory_yaml(), policy_yaml("      - ref: transport:alpha\n        role: preferred\n"))[1]
        with self.assertRaises(TransportConfigError):
            compile_service_transport_plan(inventory, policy, "chat", "unknown", {})

    def test_region_uses_metadata_not_display_name_and_authorization(self) -> None:
        inventory_text = inventory_yaml("""  opaque:
    type: http
    display_name: proxy-without-location
    server_env: OPAQUE_SERVER
    port_env: OPAQUE_PORT
    allowed_services: [chat]
    allowed_profiles: [relaxed]
    metadata:
      region: us
      trusted: true
      supports_udp: false
  fake-us:
    type: socks5
    display_name: US-looking-name
    server_env: FAKE_SERVER
    port_env: FAKE_PORT
    allowed_services: [code]
    allowed_profiles: [relaxed]
    metadata:
      trusted: false
      supports_udp: true
""")
        inventory, policy = self.load(inventory_text, policy_yaml())
        env = {"ALPHA_SERVER": "a", "ALPHA_PORT": "1", "OPAQUE_SERVER": "b", "OPAQUE_PORT": "2"}
        plan = compile_service_transport_plan(inventory, policy, "chat", "relaxed", env)
        self.assertEqual(plan.region_transport_membership["us"], ("alpha", "opaque"))
        self.assertEqual([proxy.transport_id for proxy in plan.materialized_proxies], ["alpha", "opaque"])

    def test_unused_and_unrelated_transports_are_not_materialized(self) -> None:
        inventory, policy = self.load(inventory_yaml("""  unused:
    type: http
    server_env: UNUSED_SERVER
    port_env: UNUSED_PORT
    allowed_services: [chat]
    allowed_profiles: [relaxed]
    metadata:
      trusted: true
      supports_udp: false
"""), policy_yaml("      - ref: transport:alpha\n        role: preferred\n"))
        plan = compile_service_transport_plan(inventory, policy, "chat", "relaxed", {"ALPHA_SERVER": "a", "ALPHA_PORT": "1"})
        self.assertEqual([proxy.transport_id for proxy in plan.materialized_proxies], ["alpha"])

    def test_transport_does_not_flow_to_an_unrelated_service(self) -> None:
        inventory, policy = self.load(
            inventory_yaml(),
            """services:
  code:
    candidates:
      - ref: region:jp
        role: fallback
""",
        )

        plan = compile_service_transport_plan(inventory, policy, "code", "relaxed", {})

        self.assertEqual(plan.auto_candidates, ("region:jp",))
        self.assertEqual(plan.region_transport_membership["jp"], ())
        self.assertEqual(plan.materialized_proxies, ())

    def test_shared_transport_requires_explicit_authorization_for_each_service(self) -> None:
        shared_inventory = inventory_yaml().replace("allowed_services: [chat]", "allowed_services: [chat, code]")
        policy_text = """services:
  chat:
    candidates:
      - ref: transport:alpha
        role: preferred
  code:
    candidates:
      - ref: transport:alpha
        role: preferred
"""
        inventory, policy = self.load(shared_inventory, policy_text)
        env = {"ALPHA_SERVER": "a", "ALPHA_PORT": "1"}

        self.assertEqual(
            compile_service_transport_plan(inventory, policy, "chat", "relaxed", env).auto_candidates,
            ("alpha",),
        )
        self.assertEqual(
            compile_service_transport_plan(inventory, policy, "code", "relaxed", env).auto_candidates,
            ("alpha",),
        )

    def test_explicit_transport_is_deduped_from_later_region(self) -> None:
        inventory, policy = self.load(inventory_yaml(), policy_yaml("""      - ref: transport:alpha
        role: preferred
      - ref: region:us
        role: fallback
"""))
        plan = compile_service_transport_plan(inventory, policy, "chat", "relaxed", {"ALPHA_SERVER": "a", "ALPHA_PORT": "1"})
        self.assertEqual(plan.region_transport_membership["us"], ())
        self.assertEqual(plan.auto_candidates, ("alpha", "region:us"))

    def test_duplicate_and_reserved_display_name_fail(self) -> None:
        inventory, policy = self.load(inventory_yaml(), policy_yaml())
        env = {"ALPHA_SERVER": "a", "ALPHA_PORT": "1"}
        with self.assertRaises(TransportConfigError):
            compile_service_transport_plan(inventory, policy, "chat", "relaxed", env, reserved_names=("alpha",))
        duplicate_inventory, duplicate_policy = self.load(inventory_yaml("""  duplicate:
    type: http
    display_name: alpha
    server_env: DUP_SERVER
    port_env: DUP_PORT
    allowed_services: [chat]
    allowed_profiles: [relaxed]
    metadata:
      trusted: true
      supports_udp: false
"""), policy_yaml("""      - ref: transport:alpha
        role: preferred
      - ref: transport:duplicate
        role: fallback
"""))
        with self.assertRaises(TransportConfigError):
            compile_service_transport_plan(duplicate_inventory, duplicate_policy, "chat", "relaxed", {"ALPHA_SERVER": "a", "ALPHA_PORT": "1", "DUP_SERVER": "b", "DUP_PORT": "2"})

    def test_missing_env_and_invalid_port_do_not_leak_values(self) -> None:
        inventory, policy = self.load(inventory_yaml(), policy_yaml())
        with self.assertRaisesRegex(TransportConfigError, "ALPHA_SERVER") as missing:
            compile_service_transport_plan(inventory, policy, "chat", "relaxed", {})
        self.assertNotIn("secret", str(missing.exception))
        with self.assertRaises(TransportConfigError) as invalid:
            compile_service_transport_plan(inventory, policy, "chat", "relaxed", {"ALPHA_SERVER": "secret-server", "ALPHA_PORT": "secret-port"})
        self.assertNotIn("secret", str(invalid.exception))

    def test_http_socks_rendering_and_explanation_are_redacted(self) -> None:
        inventory_text = inventory_yaml("""  http-auth:
    type: http
    server_env: HTTP_SERVER
    port_env: HTTP_PORT
    username_env: HTTP_USER
    password_env: HTTP_PASS
    allowed_services: [chat]
    allowed_profiles: [relaxed]
    metadata:
      trusted: false
      supports_udp: true
""")
        inventory, policy = self.load(inventory_text, policy_yaml("      - ref: transport:http-auth\n        role: preferred\n"))
        plan = compile_service_transport_plan(inventory, policy, "chat", "relaxed", {"HTTP_SERVER": "server-secret", "HTTP_PORT": "9", "HTTP_USER": "user-secret", "HTTP_PASS": "password-secret"})
        proxy = plan.materialized_proxies[0]
        self.assertIsNone(proxy.udp)
        self.assertEqual(proxy.username, "user-secret")
        self.assertNotIn("password-secret", repr(plan.explanation))
        self.assertNotIn("server-secret", repr(plan.explanation))
        self.assertIn("HTTP_SERVER", repr(plan.explanation))
        self.assertIn("HTTP_PASS", repr(plan.explanation))

        socks_inventory, socks_policy = self.load(inventory_yaml(), policy_yaml("      - ref: transport:alpha\n        role: preferred\n"))
        socks_plan = compile_service_transport_plan(socks_inventory, socks_policy, "chat", "relaxed", {"ALPHA_SERVER": "socks-server", "ALPHA_PORT": "3"})
        self.assertTrue(socks_plan.materialized_proxies[0].udp)

    def test_deterministic_proxy_order_and_duplicate_candidate_ref(self) -> None:
        inventory_text = inventory_yaml("""  beta:
    type: socks5
    server_env: BETA_SERVER
    port_env: BETA_PORT
    allowed_services: [chat]
    allowed_profiles: [relaxed]
    metadata:
      trusted: true
      supports_udp: false
""")
        policy = policy_yaml("""      - ref: transport:beta
        role: preferred
      - ref: transport:alpha
        role: preferred
""")
        inventory, policy_obj = self.load(inventory_text, policy)
        env = {"ALPHA_SERVER": "a", "ALPHA_PORT": "1", "BETA_SERVER": "b", "BETA_PORT": "2"}
        plan = compile_service_transport_plan(inventory, policy_obj, "chat", "relaxed", env)
        self.assertEqual([proxy.transport_id for proxy in plan.materialized_proxies], ["alpha", "beta"])
        with self.assertRaises(TransportConfigError):
            self.load(inventory_text, policy_yaml("""      - ref: transport:alpha
        role: preferred
      - ref: transport:alpha
        role: fallback
"""))


if __name__ == "__main__":
    unittest.main()
