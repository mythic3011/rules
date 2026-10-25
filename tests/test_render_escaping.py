from __future__ import annotations

import unittest

import yaml

from ai_profiles.catalog import load_catalog
from ai_profiles.common import (
    ini_comment_line,
    ini_string,
    yaml_plain_key,
    yaml_plain_string,
    yaml_single_string,
    yaml_string,
)
from ai_profiles.models import (
    IniCandidate,
    IniProxyGroup,
    IniRulesSection,
    IniSelectGroup,
    IniRule,
    RuleProviderPlan,
    RoutingRule,
    SubconverterPlan,
)
from ai_profiles.render.mihomo import (
    _group_block,
    _render_provider,
    _render_routing_rule,
    _render_rule_provider_plans,
    render_yaml,
)
from ai_profiles.render.subconverter import (
    _render_ini,
    _render_ini_rule,
    _render_proxy_group,
    _render_select_group,
)


class RendererEscapingTest(unittest.TestCase):
    def test_yaml_double_quoted_scalar_round_trips_structural_characters(self) -> None:
        value = 'comma, colon: quote " slash \\ line\nbreak\x85\u2028\u2029 東京 🧪'
        self.assertEqual(yaml.safe_load(yaml_string(value)), value)

    def test_yaml_single_quoted_scalar_round_trips_quotes_and_unicode(self) -> None:
        value = "it's, \"quoted\" \\ 東京"
        self.assertEqual(yaml.safe_load(yaml_single_string(value)), value)
        with self.assertRaisesRegex(ValueError, "one line"):
            yaml_single_string("line one\nline two")

    def test_yaml_plain_fields_reject_ambiguous_scalars_and_keys(self) -> None:
        plain_values = (
            "domain",
            "https://rules.example.test/rules?format=yaml&region=jp",
            "192.0.2.1",
            "2001:db8::1",
        )
        for value in plain_values:
            with self.subTest(value=value):
                self.assertEqual(yaml.safe_load(yaml_plain_string(value)), value)

        plain_keys = ("AI_Claude_Classical", "Provider_1")
        for key in plain_keys:
            with self.subTest(key=key):
                self.assertEqual(yaml_plain_key(key), key)
                parsed = yaml.safe_load(f"{key}: null")
                self.assertEqual(tuple(parsed), (key,))

        ambiguous = (
            ".5",
            "1:20",
            "1_000",
            "2001-01-01",
            "true",
            "false",
            "null",
            "~",
            "yes",
            "on",
        )
        for value in (*ambiguous, "two words", "#comment", "a: b"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                yaml_plain_string(value)
        for value in (*ambiguous, "bad key", "provider:\n  injected: true"):
            with self.subTest(key=value), self.assertRaises(ValueError):
                yaml_plain_key(value)

    def test_group_name_cannot_create_an_additional_yaml_group(self) -> None:
        name = 'North "America":\n  - name: injected #'
        block = _group_block(name, "select", ["  proxies:", '    - "DIRECT"'])
        document = yaml.safe_load("proxy-groups:\n" + "\n".join(f"  {line}" for line in block.splitlines()))
        self.assertEqual(len(document["proxy-groups"]), 1)
        self.assertEqual(document["proxy-groups"][0]["name"], name)

    def test_manual_filter_keeps_regex_word_boundaries_as_literal_backslashes(self) -> None:
        manual_name = load_catalog().group("manual")
        for strict in (False, True):
            with self.subTest(strict=strict):
                document = yaml.safe_load(render_yaml(strict))
                manual = next(group for group in document["proxy-groups"] if group["name"] == manual_name)
                self.assertIn(r"\bHKG\b", manual["filter"])
                self.assertNotIn("\x08", manual["filter"])

    def test_routing_rule_field_delimiters_are_rejected_before_yaml_encoding(self) -> None:
        rule = RoutingRule("DOMAIN", 'host"\\東京.example', "service-group", options=("no-resolve",))
        rendered = _render_routing_rule(rule)
        scalar = yaml.safe_load("rules:\n  " + rendered.strip())
        self.assertEqual(scalar["rules"][0].split(","), ["DOMAIN", rule.value, rule.target, "no-resolve"])

        for value in ("domain.example,REJECT", "line\nbreak"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                _render_routing_rule(RoutingRule("DOMAIN", value, "service-group"))

    def test_provider_yaml_round_trips_and_rejects_invalid_metadata(self) -> None:
        provider = RuleProviderPlan(
            name="Provider_1",
            behavior="classical",
            url="https://rules.example.test/rules?format=yaml&name=東京",
            interval=120,
        )
        rendered = _render_rule_provider_plans((provider,))
        document = yaml.safe_load(rendered)
        self.assertEqual(
            document[provider.name],
            {
                "behavior": "classical",
                "interval": 120,
                "type": "http",
                "url": provider.url,
                "format": "yaml",
            },
        )

        invalid = (
            RuleProviderPlan("bad key", "classical", "https://rules.example.test/a"),
            RuleProviderPlan("Good", "unsupported", "https://rules.example.test/a"),
            RuleProviderPlan("Good", "classical", "http://rules.example.test/a"),
            RuleProviderPlan("Good", "classical", "https://user:pass@rules.example.test/a"),
            RuleProviderPlan("Good", "classical", "https://rules.example.test/a#fragment"),
            RuleProviderPlan("Good", "classical", "https://rules.example.test/a", interval=True),
            RuleProviderPlan("Good", "classical", "https://rules.example.test/a", format="json"),
        )
        for item in invalid:
            with self.subTest(provider=item), self.assertRaises(ValueError):
                _render_provider(item)
        with self.assertRaisesRegex(ValueError, "unique"):
            _render_rule_provider_plans((provider, provider))

    def test_ini_group_fields_round_trip_without_backtick_delimiter_injection(self) -> None:
        name = 'Group, "東京" \\ 1'
        candidate = 'Node, "東京" \\ 2'
        rendered = _render_select_group(
            IniSelectGroup(name, (IniCandidate("node-filter", candidate),))
        )
        fields = rendered.removeprefix("custom_proxy_group=").split("`")
        self.assertEqual(fields, [name, "select", candidate])
        for unsafe in ("bad`field", "line\nbreak", "line\u2028break"):
            with self.subTest(value=unsafe), self.assertRaises(ValueError):
                ini_string(unsafe)

    def test_ini_rule_csv_fields_reject_comma_and_round_trip_https_url(self) -> None:
        rule = IniRule(
            "remote-classical",
            "Service Group",
            url="https://rules.example.test/rules?format=yaml&region=東京",
            interval=28800,
        )
        rendered = _render_ini_rule(rule)
        self.assertEqual(
            rendered.split(","),
            ["ruleset=Service Group", f"clash-classic:{rule.url}", "28800"],
        )
        with self.assertRaises(ValueError):
            _render_ini_rule(IniRule("geosite", "Service,REJECT", value="google"))
        with self.assertRaises(ValueError):
            _render_ini_rule(IniRule("remote-domain", "service", url="https://rules.example.test/a,b", interval=5))
        with self.assertRaises(ValueError):
            _render_ini_rule(IniRule("remote-domain", "service", url="https://rules.example.test/a", interval=True))

    def test_ini_url_test_fields_round_trip_and_validate_health_metadata(self) -> None:
        group = IniProxyGroup(
            name="Latency",
            kind="url-test",
            candidates=(IniCandidate("node-filter", "US, West"),),
            filter_pattern="(?i)US,(West|East)",
            health_check_url="https://www.gstatic.com/generate_204",
            interval=300,
            tolerance=50,
        )
        fields = _render_proxy_group(group).removeprefix("custom_proxy_group=").split("`")
        self.assertEqual(
            fields,
            [
                "Latency",
                "url-test",
                "US, West",
                "(?i)US,(West|East)",
                "https://www.gstatic.com/generate_204",
                "300,,50",
            ],
        )
        invalid = (
            IniProxyGroup(
                "Latency",
                "url-test",
                filter_pattern="US",
                health_check_url="http://www.gstatic.com/generate_204",
                interval=300,
                tolerance=50,
            ),
            IniProxyGroup(
                "Latency",
                "fallback",
                health_check_url="https://www.gstatic.com/generate_204",
                interval=0,
                tolerance=50,
            ),
        )
        for item in invalid:
            with self.subTest(group=item), self.assertRaises(ValueError):
                _render_proxy_group(item)

    def test_catalog_comments_cannot_escape_the_ini_comment_channel(self) -> None:
        self.assertEqual(ini_comment_line("plain comment"), "; plain comment")
        self.assertEqual(ini_comment_line("; existing comment"), "; existing comment")
        with self.assertRaises(ValueError):
            ini_comment_line("comment\u2029injected")
        plan = SubconverterPlan(
            sections=(IniRulesSection("foundation-rules", comments=("; safe\n[custom]",)),)
        )
        with self.assertRaisesRegex(ValueError, "one line"):
            _render_ini(plan)


if __name__ == "__main__":
    unittest.main()
