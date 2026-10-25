from __future__ import annotations

import ipaddress
from pathlib import Path
import tempfile
import unittest
from urllib.parse import urlsplit

import yaml

from ai_profiles_test_support import copy_catalog, read_json, write_json
from ai_profiles.catalog import load_catalog
from ai_profiles.compiler import compile_mihomo_profile
from ai_profiles.dns import render_dns_config
from ai_profiles.paths import CatalogPaths


class DnsPrivacyTest(unittest.TestCase):
    def test_public_resolvers_are_pinned_and_only_proxy_nodes_use_direct_bootstrap(self) -> None:
        catalog = load_catalog()
        plan = compile_mihomo_profile(strict=False, include_process_rules=False, catalog=catalog)
        dns = yaml.safe_load(render_dns_config(catalog, plan.dns_policies))["dns"]
        dns_group = catalog.group("dns")

        self.assertFalse(dns["ipv6"])
        self.assertFalse(dns["respect-rules"])
        self.assertFalse(dns["use-system-hosts"])
        self.assertNotIn("fallback", dns)
        for key in ("default-nameserver", "nameserver"):
            self.assertTrue(dns[key])
            for resolver in dns[key]:
                self.assertTrue(resolver.endswith(f"#{dns_group}"), (key, resolver))
                self.assertNotIn("#DIRECT", resolver)

        for resolver in dns["proxy-server-nameserver"]:
            self.assertTrue(resolver.endswith("#DIRECT"), resolver)
            parsed = urlsplit(resolver.rsplit("#", 1)[0])
            self.assertIn(parsed.scheme, {"https", "tls", "quic"})
            address = ipaddress.ip_address(parsed.hostname or "")
            self.assertTrue(address.is_global)

        policy_resolvers = [
            resolver
            for resolvers in dns["nameserver-policy"].values()
            for resolver in resolvers
        ]
        self.assertTrue(policy_resolvers)
        for resolver in policy_resolvers:
            plain_resolver, separator, route = resolver.rpartition("#")
            self.assertEqual(separator, "#")
            host = urlsplit(plain_resolver).hostname
            try:
                address = ipaddress.ip_address(host) if host is not None else None
            except ValueError:
                address = None
            if address is not None and address.is_loopback:
                self.assertEqual(route, "DIRECT")
            else:
                self.assertEqual(route, dns_group)

    def test_dns_config_rejects_unknown_resolver_set(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            catalog = load_catalog(catalog_dir)
            paths = CatalogPaths(catalog_dir)
            settings_path = paths.resolve("dns")
            settings = read_json(settings_path)
            settings["bootstrapResolverSet"] = "missing"
            write_json(settings_path, settings)

            with self.assertRaisesRegex(RuntimeError, "unknown resolver set: bootstrapResolverSet=missing"):
                render_dns_config(catalog, catalog.base_dns_policies)

    def test_dns_group_rejects_direct_escape_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as raw_tmp:
            catalog_dir = copy_catalog(Path(raw_tmp))
            profile_path = CatalogPaths(catalog_dir).resolve("profile")
            profile = read_json(profile_path)
            dns_group = next(group for group in profile["policyGroups"] if group["id"] == "dns-egress")
            dns_group["candidates"].append({"kind": "builtin", "value": "DIRECT"})
            write_json(profile_path, profile)

            catalog = load_catalog(catalog_dir)
            with self.assertRaisesRegex(RuntimeError, "must select only auto and reject"):
                render_dns_config(catalog, catalog.base_dns_policies)


if __name__ == "__main__":
    unittest.main()
