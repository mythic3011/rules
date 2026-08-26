from __future__ import annotations

import os
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from internal.python.local_profile_compose import (
    LocalComposeError,
    compose_mihomo_config,
    dump_yaml,
    write_private_yaml,
)


class LocalProfileComposeTests(unittest.TestCase):
    def test_should_replace_named_entries_and_append_new_groups(self) -> None:
        public = {
            "proxy-groups": [
                {"name": "service", "type": "select", "proxies": ["public-auto"]},
                {"name": "reject", "type": "select", "proxies": ["REJECT"]},
            ],
            "rules": ["MATCH,reject"],
        }
        overlay = {
            "proxies": [{"name": "private-node", "type": "socks5"}],
            "proxy-groups": [
                {"name": "service", "type": "fallback", "proxies": ["private-node"]},
                {"name": "service-us", "type": "url-test", "use": ["provider1"]},
            ],
        }

        merged = compose_mihomo_config(public, overlay)

        self.assertEqual([group["name"] for group in merged["proxy-groups"]], ["service", "reject", "service-us"])
        self.assertEqual(merged["proxy-groups"][0]["type"], "fallback")
        self.assertEqual(merged["proxies"][0]["name"], "private-node")
        self.assertEqual(merged["rules"], ["MATCH,reject"])

    def test_should_reject_unknown_keys_and_duplicate_names(self) -> None:
        public = {"proxy-groups": [{"name": "service", "type": "select"}]}

        with self.assertRaises(LocalComposeError):
            compose_mihomo_config(public, {"rules": []})
        with self.assertRaises(LocalComposeError):
            compose_mihomo_config(
                public,
                {
                    "proxy-groups": [
                        {"name": "duplicate", "type": "select"},
                        {"name": "duplicate", "type": "select"},
                    ]
                },
            )
        with self.assertRaises(LocalComposeError):
            compose_mihomo_config(
                {"proxy-groups": [{"name": "duplicate"}, {"name": "duplicate"}]},
                {},
            )

    def test_should_not_mutate_inputs_or_accept_unsafe_values(self) -> None:
        public = {
            "proxy-groups": [{"name": "service", "type": "select", "proxies": ["public"]}],
            "rules": ["MATCH,reject"],
        }
        overlay = {
            "proxies": [{"name": "private", "type": "socks5", "port": 1080}],
            "proxy-groups": [{"name": "service", "type": "select", "proxies": ["private"]}],
        }
        original_public = deepcopy(public)
        original_overlay = deepcopy(overlay)

        merged = compose_mihomo_config(public, overlay)
        merged["proxy-groups"][0]["proxies"].append("mutated")

        self.assertEqual(public, original_public)
        self.assertEqual(overlay, original_overlay)
        with self.assertRaises(LocalComposeError):
            compose_mihomo_config(public, {"proxies": [{"name": "unsafe", "value": object()}]})
        with self.assertRaises(LocalComposeError):
            dump_yaml({"unsafe": {"value": object()}})

    def test_should_reject_duplicate_public_or_overlay_proxy_names(self) -> None:
        with self.assertRaises(LocalComposeError):
            compose_mihomo_config(
                {"proxies": [{"name": "duplicate"}, {"name": "duplicate"}]},
                {},
            )

    def test_should_not_replace_structurally_locked_selector_regardless_of_name(self) -> None:
        with self.assertRaisesRegex(LocalComposeError, "private materializer"):
            compose_mihomo_config(
                {
                    "proxy-groups": [
                        {
                            "name": "Future renamed account or mode lock",
                            "type": "select",
                            "proxies": ["REJECT"],
                            "empty-fallback": "REJECT",
                        }
                    ]
                },
                {
                    "proxy-groups": [
                        {
                            "name": "Future renamed account or mode lock",
                            "type": "select",
                            "proxies": ["DIRECT"],
                        }
                    ]
                },
            )
        with self.assertRaises(LocalComposeError):
            compose_mihomo_config(
                {"proxies": [{"name": "public"}]},
                {"proxies": [{"name": "public"}]},
            )

    def test_should_render_deterministically_and_write_mode_0600(self) -> None:
        value = {
            "proxies": [
                {"name": "private-node", "type": "http", "server": "private-host", "port": 8443}
            ]
        }
        first = dump_yaml(value)
        second = dump_yaml(value)
        self.assertEqual(first, second)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private.yaml"
            write_private_yaml(path, value)

            self.assertEqual(path.read_text(encoding="utf-8"), first)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
