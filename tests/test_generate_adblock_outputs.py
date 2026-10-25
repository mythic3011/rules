import unittest
from unittest.mock import patch
from pathlib import Path
import tempfile

from internal.python.generate_adblock_outputs import (
    ROOT,
    apply_policies,
    classify_rule_asset,
    collect_domains,
    normalize_domain,
    parse_domainswild2,
    parse_dnsmasq_conf,
    parse_hosts,
    parse_adblock_domains,
    parse_plain_domains,
)


class TestGenerateAdblockOutputs(unittest.TestCase):
    def test_normalize_domain(self):
        self.assertEqual(normalize_domain("||example.com^"), "example.com")
        self.assertEqual(normalize_domain("0.0.0.0 bad-site.com"), None)  # Invalid characters
        self.assertEqual(normalize_domain("address=/domain.com/"), "domain.com")
        self.assertIsNone(normalize_domain("# comment"))
        self.assertIsNone(normalize_domain("invalid_domain!"))

    def test_parsers(self):
        wild_text = "||example.com^\n!comment\n#comment\nsub.example.org"
        self.assertEqual(parse_domainswild2(wild_text), {"example.com", "sub.example.org"})

        dnsmasq_text = "address=/ad1.com/\nserver=/ad2.org/\n#comment"
        self.assertEqual(parse_dnsmasq_conf(dnsmasq_text), {"ad1.com", "ad2.org"})

        hosts_text = "127.0.0.1 ad3.com ad4.org\n#comment"
        self.assertEqual(parse_hosts(hosts_text), {"ad3.com", "ad4.org"})

        adblock_text = "||ad5.com^\n!comment\n@@||allowed.com^\nad6.org$script"
        self.assertEqual(parse_adblock_domains(adblock_text), {"ad5.com", "ad6.org"})

        plain_text = "ad7.com\nad8.org\n#comment"
        self.assertEqual(parse_plain_domains(plain_text), {"ad7.com", "ad8.org"})

    @patch("internal.python.generate_adblock_outputs.fetch_text")
    def test_collect_domains_concurrent(self, mock_fetch_text):
        def mock_fetch(url):
            if "source1" in url:
                return "||domain1.com^\n||domain2.com^"
            if "source2" in url:
                return "address=/domain3.com/"
            return ""

        mock_fetch_text.side_effect = mock_fetch

        yaml_content = """sources:
  - id: s1
    enabled: true
    priority: 10
    format: domainswild2
    url: https://example.com/source1.txt
  - id: s2
    enabled: true
    priority: 20
    format: dnsmasq_conf
    url: https://example.com/source2.txt
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "sources.yaml"
            config_path.write_text(yaml_content, encoding="utf-8")

            all_domains, source_entries, counts = collect_domains(config_path)

            self.assertEqual(all_domains, {"domain1.com", "domain2.com", "domain3.com"})
            self.assertEqual(len(source_entries), 2)
            self.assertEqual(source_entries[0]["id"], "s1")
            self.assertEqual(source_entries[0]["count"], 2)
            self.assertEqual(source_entries[1]["id"], "s2")
            self.assertEqual(source_entries[1]["count"], 1)
            self.assertEqual(counts, {"s1": 2, "s2": 1})

    def test_classify_rule_asset_covers_dns_and_rule_layouts(self):
        cases = {
            "dns/adblock.hosts.txt": ("domain", "adblock_pipeline", True),
            "dns/adblock.dnsmasq.conf": ("domain", "adblock_pipeline", True),
            "dns/local_allowlist.txt": ("domain", "local_override", True),
            "rule/Ads_Lite_Domain.mrs": ("unsupported", "binary_rule_provider", False),
            "rule/Custom_Direct_Domain.yaml": ("domain", "domain_rule_provider", True),
            "rule/Custom_Direct_IP.yaml": ("cidr", "ip_rule_provider", True),
            "rule/Custom_Direct_Classical.yaml": ("mixed", "classical_rule_provider", True),
            "rule/Custom_Direct_Classical_Port.yaml": ("unsupported", "port_rule_provider", False),
            "rule/IPTVMainland_Domain.list": ("domain", "raw_rule_list", True),
            "rule/Custom_Direct.list": ("unsupported", "raw_rule_list", False),
        }
        for rel, (asset_class, rule_source, searchable) in cases.items():
            classified = classify_rule_asset(ROOT / rel)
            self.assertEqual(classified["asset_class"], asset_class, rel)
            self.assertEqual(classified["rule_source"], rule_source, rel)
            self.assertEqual(classified["searchable"], searchable, rel)
            self.assertEqual(classified["path"], rel)

        unknown = classify_rule_asset(ROOT / "README.md")
        self.assertEqual(unknown["asset_class"], "unsupported")
        self.assertEqual(unknown["rule_source"], "unknown")

    def test_apply_policies_include_overrides_exclude_and_adds_exact(self):
        policies = {
            "global": {
                "include_exact": ["keep.example"],
                "include_suffix": ["allowed.test"],
                "include_keyword": ["keepme"],
                "exclude_exact": ["drop.example", "keep.example"],
                "exclude_suffix": ["blocked.test"],
                "exclude_keyword": ["tracker"],
            },
            "categories": {
                "adblock": {
                    "include_exact": ["force.example"],
                    "exclude_keyword": ["ads"],
                }
            },
        }
        domains = {
            "keep.example",
            "drop.example",
            "ok.allowed.test",
            "bad.blocked.test",
            "foo-keepme.com",
            "ads.vendor.com",
            "clean.example",
        }
        result = apply_policies(domains, "adblock", policies)
        self.assertIn("keep.example", result)
        self.assertIn("force.example", result)
        self.assertIn("ok.allowed.test", result)
        self.assertIn("foo-keepme.com", result)
        self.assertIn("clean.example", result)
        self.assertNotIn("drop.example", result)
        self.assertNotIn("bad.blocked.test", result)
        self.assertNotIn("ads.vendor.com", result)


if __name__ == "__main__":
    unittest.main()
