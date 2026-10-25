from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import unittest
from unittest.mock import patch

from ai_profiles import intake_contract
from ai_profiles.intake_contract import MATCHER_REGISTRY, parse_matcher_values, resolve_matcher
from ai_profiles.paths import CatalogPaths


class IntakeRegistryTest(unittest.TestCase):
    def test_catalog_resolver_keeps_alternate_roots_and_rejects_unknown_names(self) -> None:
        paths = CatalogPaths(Path("alternate-catalog"))
        self.assertEqual(paths.resolve("services"), paths.root / "catalogs/services.json")
        self.assertEqual(paths.resolve("profile"), paths.root / "profile.json")
        with self.assertRaisesRegex(ValueError, "Unknown AI catalog document"):
            paths.resolve("../services.json")  # type: ignore[arg-type]

    def test_registry_normalizes_supported_matchers(self) -> None:
        examples = {
            "DOMAIN": ("API.Example.COM.", "api.example.com"),
            "DOMAIN-SUFFIX": ("Example.COM.", "example.com"),
            "DOMAIN-KEYWORD": ("example", "example"),
            "IP-CIDR": ("8.8.8.8/24", "8.8.8.0/24"),
            "PROCESS-NAME": ("example.exe", "example.exe"),
            "PROCESS-PATH": ("/opt/example/bin/app", "/opt/example/bin/app"),
        }
        self.assertEqual(set(examples), set(MATCHER_REGISTRY))
        for kind, (source, expected) in examples.items():
            with self.subTest(kind=kind):
                self.assertEqual(parse_matcher_values(kind, f"# comment\n{source}\n{source}"), [expected])
        self.assertIs(resolve_matcher(" domain "), resolve_matcher("DOMAIN"))

    def test_unknown_matchers_and_rule_delimiters_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported matcher type"):
            resolve_matcher("MATCH")
        for value in ("example,REJECT", "example`select", "example\x00"):
            with self.subTest(value=repr(value)):
                with self.assertRaisesRegex(ValueError, "rule delimiter or control character"):
                    parse_matcher_values("DOMAIN-KEYWORD", value)

    def test_matcher_limit_is_resolved_from_the_shared_contract(self) -> None:
        limits = replace(intake_contract.INTAKE_LIMITS, matcher_values=1)
        with patch.object(intake_contract, "INTAKE_LIMITS", limits):
            with self.assertRaisesRegex(ValueError, "at most 1 matcher"):
                parse_matcher_values("DOMAIN", "one.example\ntwo.example")


if __name__ == "__main__":
    unittest.main()
