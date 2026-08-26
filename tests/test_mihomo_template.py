from __future__ import annotations

import unittest

from ai_profiles_test_support import load_generator
from ai_profiles.render.template import load_template, render_template
from ai_profiles.settings import TEMPLATE_DIR


MODULE = load_generator("generate_ai_profiles_template")


class MihomoTemplateTest(unittest.TestCase):
    def test_template_declares_only_renderer_owned_slots(self) -> None:
        template = load_template(TEMPLATE_DIR / "Custom_Clash_AI.yaml.tpl")
        expected = {
            "TITLE",
            "PROFILE_POLICY_NOTES",
            "PROVIDER_NOISE_EXCLUDE_PATTERN",
            "SECRET_LINES",
            "DNS_POLICIES",
            "PROXY_GROUPS",
            "RULES",
            "RULE_PROVIDERS",
        }
        actual = {
            token.split("}}", 1)[0]
            for token in template.split("{{")[1:]
        }
        self.assertEqual(actual, expected)

    def test_render_template_rejects_contract_mismatch(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "missing=.*VALUE"):
            render_template("before {{VALUE}} after", {})
        with self.assertRaisesRegex(RuntimeError, "unexpected=.*EXTRA"):
            render_template("before {{VALUE}} after", {"VALUE": "ok", "EXTRA": "no"})

    def test_rendered_profiles_have_no_template_placeholders(self) -> None:
        for strict in (False, True):
            rendered = MODULE.render_yaml(strict=strict)
            self.assertNotIn("{{", rendered)
            self.assertNotIn("}}", rendered)
            self.assertIn('name: "🤖 Jules"', rendered)
            self.assertIn('"jules.googleapis.com":', rendered)


if __name__ == "__main__":
    unittest.main()
