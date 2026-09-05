"""End-to-end checks for the built OpenClash Guard bundle.

This deliberately exercises ``dist/openclash-guard.sh`` through its public
CLI, with only the OpenWrt command surfaces replaced by small fakes.  A real
OpenWrt + OpenClash container is not used in CI because no published,
deterministic OpenClash image exists; the community images require privileged
and macvlan networking and are heavy and flaky for a deterministic test job.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import Any, Mapping


ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "tests"
for import_path in (ROOT, TESTS, ROOT / "internal" / "python"):
    if str(import_path) not in sys.path:
        sys.path.insert(0, str(import_path))

from guard_test_helpers import BUNDLE, POLICY, TEMPLATES_FILE  # noqa: E402
from test_openclash_guard import (  # noqa: E402
    FAKE_CURL,
    FAKE_INITD,
    FAKE_NFT,
    FAKE_UCI,
    _write_exec,
)


SHBUNDLE_PATH = ROOT / "tools" / "shbundle.py"
SHBUNDLE_SPEC = importlib.util.spec_from_file_location("shbundle_e2e", SHBUNDLE_PATH)
if SHBUNDLE_SPEC is None or SHBUNDLE_SPEC.loader is None:
    raise RuntimeError(f"unable to load module from {SHBUNDLE_PATH}")
shbundle = importlib.util.module_from_spec(SHBUNDLE_SPEC)
sys.modules.setdefault("shbundle_e2e", shbundle)
SHBUNDLE_SPEC.loader.exec_module(shbundle)


FAKE_SERVICE_CONTROL = r"""#!/bin/sh
set -eu
state=${SVC_FAKE_STATE:?}
name=${SVC_FAKE_SERVICE_NAME:-openclash-guard}
mkdir -p "$state"
case ${1:-} in
    enabled)
        [ -f "$state/$name.enabled" ]
        ;;
    running|status)
        if [ -f "$state/$name.running" ]; then
            [ "${1:-}" = status ] && printf '%s\n' running
            exit 0
        fi
        [ "${1:-}" = status ] && printf '%s\n' inactive
        exit 1
        ;;
    enable)
        : > "$state/$name.enabled"
        ;;
    disable)
        rm -f "$state/$name.enabled"
        ;;
    start)
        : > "$state/$name.running"
        ;;
    stop)
        rm -f "$state/$name.running"
        ;;
    restart)
        : > "$state/$name.log"
        ;;
    *)
        printf '%s\n' "unsupported service command" >&2
        exit 2
        ;;
esac
"""

CUSTOM_OVERWRITE = """#!/bin/sh
# Existing user-owned OpenClash custom-overwrite hook.
CONFIG_FILE=$1
CUSTOM_DIRECT_DOMAIN_PROVIDER=remote-direct-domain
CUSTOM_DIRECT_CLASSICAL_IP_PROVIDER=remote-direct-ip
CUSTOM_PROXY_DOMAIN_PROVIDER=remote-proxy-domain
CUSTOM_PROXY_CLASSICAL_IP_PROVIDER=remote-proxy-ip
exit 0
"""

ACTIVE_CONFIG = """port: 7890
mode: rule
proxies:
  - name: keep-user-proxy
    type: socks5
    server: 127.0.0.1
    port: 1080
rule-providers:
  Custom_Direct_Domain:
    type: http
    behavior: domain
    url: https://example.invalid/direct.yaml
  Custom_Direct_Classical_IP:
    type: http
    behavior: classical
    url: https://example.invalid/direct-ip.yaml
  Custom_Proxy_Domain:
    type: http
    behavior: domain
    url: https://example.invalid/proxy.yaml
  Custom_Proxy_Classical_IP:
    type: http
    behavior: classical
    url: https://example.invalid/proxy-ip.yaml
  Unrelated_Provider:
    type: http
    behavior: domain
    url: https://example.invalid/unrelated.yaml
rules:
  - RULE-SET,Unrelated_Provider,Proxy
  - MATCH,DIRECT
"""


class OpenClashGuardBundleE2ETest(unittest.TestCase):
    """Exercise install, staging, safe sync, overlay, and uninstall together."""

    @classmethod
    def setUpClass(cls) -> None:
        loaded = shbundle.load_manifest(ROOT / "shell" / "manifest.json")
        shbundle.build_app(loaded, "openclash-guard")
        if not BUNDLE.is_file():
            raise RuntimeError(f"missing built bundle {BUNDLE}")

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.bin = self.base / "bin"
        self.initd = self.base / "init.d"
        self.svc_state = self.base / "svc-state"
        self.work = self.base / "work"
        self.prefix = self.base / "prefix"
        self.rules_dir = self.base / "guard-rules"
        self.rules_config = self.base / "guard-rules.tsv"
        self.geo_cache = self.base / "geo-cache"
        for path in (
            self.bin,
            self.initd,
            self.svc_state,
            self.work,
            self.prefix,
            self.rules_dir,
            self.geo_cache,
        ):
            path.mkdir(parents=True)

        self.uci_state = self.base / "uci-state.json"
        self.nft_state = self.base / "nft-state.json"
        self.fetch_map = self.base / "fetch-map.json"
        self.fetch_log = self.base / "fetch.log"
        self.lock_path = self.work / "openclash-guard.lock"
        self.distribution_state = self.base / "distribution-state"
        self.sentinel = self.base / "remote-content-executed"
        self.service_control = self.base / "guard-service-control"
        self.custom_overwrite = self.base / "openclash_custom_overwrite.sh"
        self.bad_overwrite = self.base / "bad_custom_overwrite.sh"
        self.active_config = self.base / "active.yaml"

        _write_exec(self.bin / "uci", FAKE_UCI)
        _write_exec(self.bin / "nft", FAKE_NFT)
        _write_exec(self.bin / "curl", FAKE_CURL)
        _write_exec(self.initd / "openclash", FAKE_INITD)
        _write_exec(self.service_control, FAKE_SERVICE_CONTROL)
        self._write_uci({})
        self._write_nft()
        self.fetch_map.write_text("{}\n", encoding="utf-8")

        self.svc_state.joinpath("openclash.enabled").write_text("", encoding="utf-8")
        self.svc_state.joinpath("openclash.running").write_text("", encoding="utf-8")
        self.active_config.write_text(ACTIVE_CONFIG, encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write_uci(self, committed: dict[str, Any], pending: dict[str, Any] | None = None) -> None:
        self.uci_state.write_text(
            json.dumps({"committed": committed, "pending": pending or {}}, indent=2) + "\n",
            encoding="utf-8",
        )

    def _write_nft(self, tables: dict[str, Any] | None = None) -> None:
        self.nft_state.write_text(
            json.dumps(
                {"tables": tables or {}, "batches": [], "next_handle": 1},
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    def env(self, extra: Mapping[str, str] | None = None) -> dict[str, str]:
        env = {
            "PATH": f"{self.bin}{os.pathsep}{os.environ.get('PATH', '/usr/bin:/bin')}",
            "HOME": str(self.base),
            "TMPDIR": str(self.work),
            "LC_ALL": "C",
            "LANG": "C",
            "JSON_FORCE_AWK": "1",
            "SVC_INITD_DIR": str(self.initd),
            "SVC_FAKE_STATE": str(self.svc_state),
            "SVC_FAKE_SERVICE_NAME": "openclash-guard",
            "UCI_FAKE_STATE": str(self.uci_state),
            "NFT_FAKE_STATE": str(self.nft_state),
            "FETCH_FAKE_MAP": str(self.fetch_map),
            "FETCH_FAKE_LOG": str(self.fetch_log),
            "GUARD_POLICY_FILE": str(POLICY),
            "GUARD_TEMPLATES_FILE": str(TEMPLATES_FILE),
            "GUARD_TEMPLATES_SOURCE": str(TEMPLATES_FILE),
            "GUARD_DISTRIBUTION_STATE_FILE": str(self.distribution_state),
            "GUARD_LOCK_PATH": str(self.lock_path),
            "GUARD_PREFIX": str(self.prefix),
            "GUARD_RULES_DIR": str(self.rules_dir),
            "GUARD_RULES_CONFIG": str(self.rules_config),
            "GUARD_OPENCLASH_CUSTOM_OVERWRITE": str(self.custom_overwrite),
            "GUARD_OVERLAY_RUNTIME_BIN": str(self.prefix / "usr/bin/openclash-guard"),
            "GUARD_SERVICE_CONTROL": str(self.service_control),
            "GUARD_STALE_CONF_DIRS": str(self.work / "dnsmasq.d"),
            "GUARD_GEO_CACHE_DIR": str(self.geo_cache),
            "GUARD_IPV6": "0",
            "GUARD_DIRECT_REGION": "zz",
            "GUARD_PROXY_REGION": "aa",
            "GUARD_OPENCLASH_HEALTHY": "1",
            "GUARD_PROXY_HEALTHY": "1",
            "NO_COLOR": "1",
        }
        Path(env["GUARD_STALE_CONF_DIRS"]).mkdir(parents=True, exist_ok=True)
        if extra:
            env.update(extra)
        return env

    def run_guard(
        self,
        *args: str,
        extra: Mapping[str, str] | None = None,
        timeout: int = 20,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", str(BUNDLE), *args],
            capture_output=True,
            text=True,
            env=self.env(extra),
            timeout=timeout,
            cwd=str(self.work),
            check=False,
        )

    def _assert_ok(self, result: subprocess.CompletedProcess[str], context: str) -> None:
        self.assertEqual(
            result.returncode,
            0,
            f"{context} failed ({result.returncode})\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}",
        )

    def _assert_failed(self, result: subprocess.CompletedProcess[str], context: str) -> None:
        self.assertNotEqual(
            result.returncode,
            0,
            f"{context} unexpectedly succeeded\nstdout:\n{result.stdout}",
        )

    def _load_uci(self) -> dict[str, Any]:
        return json.loads(self.uci_state.read_text(encoding="utf-8"))

    def _load_nft(self) -> dict[str, Any]:
        return json.loads(self.nft_state.read_text(encoding="utf-8"))

    def _load_yaml(self, path: Path) -> dict[str, Any]:
        script = """
require 'yaml'
require 'json'
text = File.binread(ARGV[0])
begin
  value = YAML.safe_load(text, permitted_classes: [], permitted_symbols: [], aliases: true)
rescue ArgumentError
  value = YAML.safe_load(text, [], [], true)
end
abort 'not a mapping' unless value.is_a?(Hash)
puts JSON.generate(value)
"""
        result = subprocess.run(
            ["ruby", "-e", script, str(path)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        return json.loads(result.stdout)

    def _rule_files_snapshot(self) -> dict[str, bytes]:
        return self._files_snapshot(self.rules_dir)

    @staticmethod
    def _files_snapshot(root: Path) -> dict[str, bytes]:
        if not root.exists():
            return {}
        return {
            str(path.relative_to(root)): path.read_bytes()
            for path in root.rglob("*")
            if path.is_file()
        }

    def _set_fetch_body(self, url: str, body: str) -> None:
        self.fetch_map.write_text(
            json.dumps({url: {"body": body}}) + "\n", encoding="utf-8"
        )

    def test_full_built_bundle_lifecycle(self) -> None:
        install = self.run_guard("install", "--yes", "--mode", "auto", "--no-refresh")
        self._assert_ok(install, "initial install")

        installed_paths = (
            self.prefix / "usr/bin/openclash-guard",
            self.prefix / "etc/init.d/openclash-guard",
            self.prefix / "etc/hotplug.d/firewall/99-openclash-guard",
            self.prefix / "etc/openclash-guard/fw4.include",
            self.prefix / "usr/lib/openclash-guard/on-openclash-restart",
        )
        for path in installed_paths:
            self.assertTrue(path.is_file(), f"missing installed Guard path: {path}")

        first_install_tree = self._files_snapshot(self.prefix)
        first_uci = self.uci_state.read_bytes()
        first_hooks = {path: path.read_bytes() for path in installed_paths}
        second_install = self.run_guard(
            "install", "--yes", "--mode", "auto", "--no-refresh"
        )
        self._assert_ok(second_install, "idempotent second install")
        self.assertEqual(self._files_snapshot(self.prefix), first_install_tree)
        self.assertEqual(self.uci_state.read_bytes(), first_uci)
        for path, content in first_hooks.items():
            self.assertEqual(path.read_bytes(), content, path)
        committed = self._load_uci()["committed"]
        self.assertEqual(committed.get("openclash_guard.udp.src_ip", []), [])

        status = self.run_guard("status", "--json")
        self._assert_ok(status, "status after install")
        status_payload = json.loads(status.stdout)
        self.assertTrue(status_payload["openclash"]["installed"])

        health = self.run_guard("health-check")
        self._assert_ok(health, "health-check after install")
        self.assertRegex(f"{health.stdout}\n{health.stderr}".lower(), r"health|healthy|pass|ok")

        apply = self.run_guard("apply")
        self._assert_ok(apply, "initial firewall reconcile")
        self.assertIn("inet openclash_guard", self._load_nft()["tables"])

        add_local = self.run_guard("rules", "add-direct", "DOMAIN-SUFFIX,example.com")
        self._assert_ok(add_local, "add local rule")
        add_duplicate = self.run_guard(
            "rules", "add-direct", "DOMAIN-SUFFIX,example.com"
        )
        self._assert_ok(add_duplicate, "idempotent local rule")
        listed = self.run_guard("rules", "list")
        self._assert_ok(listed, "list local rules")
        self.assertEqual(listed.stdout.strip().splitlines(), ["DOMAIN-SUFFIX,example.com"])
        local_state = self.rules_dir / "local-direct.tsv"
        self.assertEqual(local_state.read_text(encoding="utf-8").splitlines(), [
            "DOMAIN-SUFFIX,example.com"
        ])
        direct_provider = self.rules_dir / "providers/Custom_Direct_Domain.yaml"
        self.assertIn("+.example.com", direct_provider.read_text(encoding="utf-8"))
        invalid_local = self.run_guard(
            "rules", "add-direct", "DOMAIN-KEYWORD,example"
        )
        self._assert_failed(invalid_local, "reject remote-only local matcher kind")
        self.assertEqual(local_state.read_text(encoding="utf-8").splitlines(), [
            "DOMAIN-SUFFIX,example.com"
        ])
        remove_local = self.run_guard(
            "rules", "remove-direct", "DOMAIN-SUFFIX,example.com"
        )
        self._assert_ok(remove_local, "remove local rule")
        listed_after_remove = self.run_guard("rules", "list", "direct")
        self._assert_ok(listed_after_remove, "list local rules after removal")
        self.assertEqual(listed_after_remove.stdout, "")
        self.assertNotIn(
            "+.example.com", direct_provider.read_text(encoding="utf-8")
        )
        readd_local = self.run_guard(
            "rules", "add-direct", "DOMAIN-SUFFIX,example.com"
        )
        self._assert_ok(readd_local, "re-add local rule for activation")

        self.custom_overwrite.write_text(CUSTOM_OVERWRITE, encoding="utf-8")
        original_hook = self.custom_overwrite.read_bytes()
        activate = self.run_guard("rules", "activate", "--yes")
        self._assert_ok(activate, "activate custom-overwrite overlay")
        activated_hook = self.custom_overwrite.read_text(encoding="utf-8")
        self.assertEqual(activated_hook.count("# BEGIN openclash-guard rules"), 1)
        self.assertEqual(activated_hook.count("# END openclash-guard rules"), 1)
        self.assertIn(original_hook.decode("utf-8").replace("exit 0\n", ""), activated_hook)
        backup = self.prefix / "etc/openclash-guard/backups/openclash_custom_overwrite.sh"
        self.assertEqual(backup.read_bytes(), original_hook)

        before_config = self._load_yaml(self.active_config)
        apply_overlay = subprocess.run(
            ["/bin/sh", str(self.custom_overwrite), str(self.active_config)],
            capture_output=True,
            text=True,
            env=self.env(),
            timeout=20,
            cwd=str(self.work),
            check=False,
        )
        self._assert_ok(apply_overlay, "execute installed overlay hook")
        after_config = self._load_yaml(self.active_config)
        reserved = {
            "Custom_Direct_Domain": ("domain", "Custom_Direct_Domain.yaml"),
            "Custom_Direct_Classical_IP": ("classical", "Custom_Direct_Classical_IP.yaml"),
            "Custom_Proxy_Domain": ("domain", "Custom_Proxy_Domain.yaml"),
            "Custom_Proxy_Classical_IP": ("classical", "Custom_Proxy_Classical_IP.yaml"),
        }
        self.assertEqual(set(after_config), set(before_config))
        self.assertEqual(after_config["port"], before_config["port"])
        self.assertEqual(after_config["proxies"], before_config["proxies"])
        self.assertEqual(after_config["rules"], before_config["rules"])
        providers_before = before_config["rule-providers"]
        providers_after = after_config["rule-providers"]
        self.assertEqual(set(providers_after), set(providers_before))
        for name, (behavior, filename) in reserved.items():
            self.assertEqual(
                providers_after[name],
                {
                    "type": "file",
                    "behavior": behavior,
                    "format": "yaml",
                    "path": str(self.rules_dir / "providers" / filename),
                },
            )
        for name in set(providers_before) - set(reserved):
            self.assertEqual(providers_after[name], providers_before[name])

        activate_again = self.run_guard("rules", "activate", "--yes")
        self._assert_ok(activate_again, "idempotent overlay activation")
        self.assertEqual(self.custom_overwrite.read_text(encoding="utf-8"), activated_hook)

        sync_url = "https://gist.githubusercontent.com/test/abc/raw/rules.list"
        valid_remote = "# valid remote data\nDOMAIN-SUFFIX,remote.example.com\n"
        self._set_fetch_body(sync_url, valid_remote)
        add_source = self.run_guard("rules", "sync", "add-proxy", sync_url)
        self._assert_ok(add_source, "configure HTTPS gist source")
        sync = self.run_guard("rules", "sync", "run")
        self._assert_ok(sync, "sync valid remote source")
        fetch_invocation = self.fetch_log.read_text(encoding="utf-8")
        self.assertIn("--proto =https", fetch_invocation)
        self.assertIn("--proto-redir =https", fetch_invocation)
        self.assertIn("--max-redirs 0", fetch_invocation)
        self.assertIn("--max-filesize 262144", fetch_invocation)
        proxy_provider = self.rules_dir / "providers/Custom_Proxy_Domain.yaml"
        last_good = proxy_provider.read_bytes()
        self.assertIn("+.remote.example.com", last_good.decode("utf-8"))
        self.assertIn("proxy\t" + sync_url, self.rules_config.read_text(encoding="utf-8"))

        fetch_count = len(self.fetch_log.read_text(encoding="utf-8").splitlines())
        watch_env = self.env(
            {
                "GUARD_RULES_ALLOW_WATCH": "1",
                "GUARD_RULES_SYNC_INTERVAL": "1",
            }
        )
        watcher = subprocess.Popen(
            ["/bin/sh", str(BUNDLE), "rules", "sync", "watch"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=watch_env,
            cwd=str(self.work),
        )
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                current_count = len(
                    self.fetch_log.read_text(encoding="utf-8").splitlines()
                )
                if current_count > fetch_count and not self.lock_path.exists():
                    break
                time.sleep(0.05)
            else:
                self.fail("scheduled sync did not release the Guard lock before sleeping")
            concurrent_add = self.run_guard(
                "rules", "add-proxy", "DOMAIN,watch-lock.example", timeout=5
            )
            self._assert_ok(concurrent_add, "mutate rules while scheduled sync sleeps")
            concurrent_remove = self.run_guard(
                "rules", "remove-proxy", "DOMAIN,watch-lock.example", timeout=5
            )
            self._assert_ok(concurrent_remove, "remove rule while scheduled sync sleeps")
        finally:
            watcher.terminate()
            try:
                watcher.wait(timeout=3)
            except subprocess.TimeoutExpired:
                watcher.kill()
                watcher.wait(timeout=3)

        http_url = "http://gist.githubusercontent.com/test/abc/raw/rules.list"
        self.fetch_log.unlink(missing_ok=True)
        rejected_http = self.run_guard("rules", "sync", "add-proxy", http_url)
        self._assert_failed(rejected_http, "reject non-HTTPS source")
        self.assertFalse(self.fetch_log.exists(), "HTTP rejection must precede curl")

        self._set_fetch_body(sync_url, "this is not matcher data\n")
        malformed = self.run_guard("rules", "sync", "run")
        self._assert_failed(malformed, "reject malformed remote source")
        self.assertEqual(proxy_provider.read_bytes(), last_good)

        oversized = "DOMAIN-SUFFIX,large.example\n" * 12000
        self._set_fetch_body(sync_url, oversized)
        too_large = self.run_guard("rules", "sync", "run")
        self._assert_failed(too_large, "reject oversized remote source")
        self.assertEqual(proxy_provider.read_bytes(), last_good)

        malicious = f"#!/bin/sh\ntouch {self.sentinel}\n"
        self._set_fetch_body(sync_url, malicious)
        malicious_result = self.run_guard("rules", "sync", "run")
        self._assert_failed(malicious_result, "reject executable remote content")
        self.assertEqual(proxy_provider.read_bytes(), last_good)
        self.assertFalse(self.sentinel.exists(), "fetched rule data was executed")

        bad_original = (
            "#!/bin/sh\n"
            "# unexpected duplicate marker shape\n"
            "CONFIG_FILE=$1\n"
            "# BEGIN openclash-guard rules\n"
            "# BEGIN openclash-guard rules\n"
            "exit 0\n"
        )
        self.bad_overwrite.write_text(bad_original, encoding="utf-8")
        before_bad = self.bad_overwrite.read_bytes()
        bad_activation = self.run_guard(
            "rules",
            "activate",
            "--yes",
            extra={"GUARD_OPENCLASH_CUSTOM_OVERWRITE": str(self.bad_overwrite)},
        )
        self._assert_failed(bad_activation, "fail-safe unexpected hook shape")
        self.assertEqual(self.bad_overwrite.read_bytes(), before_bad)

        rules_before_uninstall = self._rule_files_snapshot()
        uninstall = self.run_guard("uninstall", "--yes")
        self._assert_ok(uninstall, "uninstall")
        self.assertEqual(self.custom_overwrite.read_bytes(), original_hook)
        self.assertNotIn("openclash-guard rules", self.custom_overwrite.read_text(encoding="utf-8"))
        self.assertEqual(self._rule_files_snapshot(), rules_before_uninstall)
        self.assertNotIn("inet openclash_guard", self._load_nft()["tables"])
        service_enabled = self.svc_state / "openclash-guard.enabled"
        self.assertFalse(service_enabled.exists(), "Guard service remained enabled")
        self.assertFalse((self.svc_state / "openclash-guard.running").exists())
        committed_after = self._load_uci()["committed"]
        self.assertNotEqual(committed_after.get("openclash_guard.main.enabled"), "1")
        self.assertFalse(
            any(path.exists() for path in installed_paths),
            "uninstall left Guard-owned runtime hooks behind",
        )


if __name__ == "__main__":
    unittest.main()
