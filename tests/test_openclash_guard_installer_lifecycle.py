from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
INSTALL = (ROOT / "shell/apps/openclash-guard/install.sh").read_text()
MANIFEST = (ROOT / "shell/manifest.json").read_text()


def function_body(name: str) -> str:
    match = re.search(rf"^{re.escape(name)}\(\) \{{\n(?P<body>.*?)(?=^\}}\n)", INSTALL, re.MULTILINE | re.DOTALL)
    if not match:
        raise AssertionError(f"missing function: {name}")
    return match.group("body")


class InstallerLifecycleTests(unittest.TestCase):
    def test_fw4_include_is_registered_and_validated(self):
        self.assertIn("uci_set firewall.openclash_guard include", INSTALL)
        self.assertIn("uci_set firewall.openclash_guard.type script", INSTALL)
        self.assertIn("uci_set firewall.openclash_guard.path \"$(_guard_install_fw4)\"", INSTALL)
        self.assertIn("uci_set firewall.openclash_guard.enabled 1", INSTALL)
        self.assertIn("fw4 include is not registered in firewall UCI", INSTALL)

    def test_openclash_supported_hook_uses_one_managed_block(self):
        self.assertIn("/etc/openclash/custom/openclash_custom_firewall_rules.sh", INSTALL)
        self.assertIn("# BEGIN OPENCLASH-GUARD MANAGED", INSTALL)
        self.assertIn("# END OPENCLASH-GUARD MANAGED", INSTALL)
        body = function_body("_guard_install_wire_openclash_hook")
        self.assertIn("grep -Fxc", body)
        self.assertIn("_guard_install_oc_hook", body)
        self.assertIn("refusing to modify malformed", body)

    def test_uninstall_removes_only_guard_lifecycle_ownership(self):
        body = function_body("_guard_install_unregister_lifecycle")
        self.assertIn("_guard_install_unwire_openclash_hook", body)
        self.assertIn("uci_delete firewall.openclash_guard", body)
        remove_body = function_body("_guard_install_unwire_openclash_hook")
        self.assertIn("!skip { print }", remove_body)
        self.assertNotIn("rm -f \"$_guard_iuoh_file\"", remove_body)

    def test_version_check_is_explicit_and_read_only(self):
        self.assertIn("--check-version", INSTALL)
        self.assertIn("WARNING: NO AUTO-UPGRADE AND NO AUTO-INSTALL", INSTALL)
        body = function_body("_guard_install_check_version")
        self.assertIn('autoUpgrade":false', body)
        self.assertIn('autoInstall":false', body)
        for forbidden in (
            "_guard_install_self",
            "guard_distribution_fetch_bundle",
            "file_atomic_replace",
            "uci_set",
            "uci_delete",
            "reconcile",
        ):
            self.assertNotIn(forbidden, body)
        dispatch = function_body("guard_cmd_install")
        self.assertLess(dispatch.index("_guard_install_check_version"), dispatch.index("guard_preflight_require_stage"))

    def test_guard_install_declares_fetch_dependency(self):
        block_text = MANIFEST.split('"guard-install":', 1)[1].split('"guard-menu":', 1)[0]
        self.assertIn('"fetch"', block_text)


if __name__ == "__main__":
    unittest.main()
