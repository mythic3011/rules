from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Mapping

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from internal.python.generate_openclash_guard_runtime import (  # noqa: E402
    KNOWN_ENV_PATHS,
    KNOWN_TEMPLATE_APPLY_KEYS,
    MATCHER_COMBINATORS,
    MATCHER_OPS,
    SECRET_KEY_RE,
    SERVICE_FACT_KEYS,
    TEMPLATES_OUTPUT_PATH,
    compile_openclash_guard_templates,
    compile_templates,
    dumps_runtime,
)

SHBUNDLE_PATH = ROOT / "tools" / "shbundle.py"
BUNDLE = ROOT / "dist" / "openclash-guard.sh"
LIB_JSON = ROOT / "shell" / "lib" / "json.sh"
LIB_FILE = ROOT / "shell" / "lib" / "file.sh"
APP_TEMPLATE = ROOT / "shell" / "apps" / "openclash-guard" / "template.sh"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "synthetic" / "openclash-guard"
ENV_AGH = FIXTURE_DIR / "env-agh.json"
ENV_GAMING = FIXTURE_DIR / "env-gaming.json"
ENV_PLAIN = FIXTURE_DIR / "env-plain.json"
MATCHER_CATALOG = FIXTURE_DIR / "templates-matcher.json"
POLICY = FIXTURE_DIR / "policy.json"
POLICY_GEO = FIXTURE_DIR / "policy-geo.json"

SPEC = importlib.util.spec_from_file_location("shbundle", SHBUNDLE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load module from {SHBUNDLE_PATH}")
shbundle = importlib.util.module_from_spec(SPEC)
sys.modules.setdefault("shbundle", shbundle)
SPEC.loader.exec_module(shbundle)

GUARD_SPEC = importlib.util.spec_from_file_location(
    "test_openclash_guard_mod",
    Path(__file__).with_name("test_openclash_guard.py"),
)
if GUARD_SPEC is None or GUARD_SPEC.loader is None:
    raise RuntimeError("unable to load test_openclash_guard.py")
guard_tests = importlib.util.module_from_spec(GUARD_SPEC)
GUARD_SPEC.loader.exec_module(guard_tests)

FAKE_UCI = guard_tests.FAKE_UCI
FAKE_NFT = guard_tests.FAKE_NFT
FAKE_CURL = guard_tests.FAKE_CURL
FAKE_INITD = guard_tests.FAKE_INITD
_write_exec = guard_tests._write_exec


def _matches(catalog: Path, env: Path) -> list[str]:
    script = f"""
set -eu
. "{LIB_JSON}"
. "{LIB_FILE}"
. "{APP_TEMPLATE}"
guard_template_matches "{catalog}" "{env}"
"""
    result = subprocess.run(
        ["/bin/sh", "-c", script],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
        env={**os.environ, "JSON_FORCE_AWK": "1", "LC_ALL": "C"},
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)
    return [line for line in result.stdout.splitlines() if line]


def _match(catalog: Path, template_id: str, env: Path) -> bool:
    script = f"""
set -eu
. "{LIB_JSON}"
. "{LIB_FILE}"
. "{APP_TEMPLATE}"
if guard_template_match "{catalog}" "{template_id}" "{env}"; then echo yes; else echo no; fi
"""
    result = subprocess.run(
        ["/bin/sh", "-c", script],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
        env={**os.environ, "JSON_FORCE_AWK": "1", "LC_ALL": "C"},
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)
    return result.stdout.strip() == "yes"


class MatcherUnitTests(unittest.TestCase):
    def test_eq_all_any_not_in_contains_exists_gte_ne_lte(self) -> None:
        self.assertTrue(_match(MATCHER_CATALOG, "match-eq", ENV_AGH))
        self.assertFalse(_match(MATCHER_CATALOG, "match-eq", ENV_GAMING))
        self.assertFalse(_match(MATCHER_CATALOG, "match-eq", ENV_PLAIN))

        self.assertTrue(_match(MATCHER_CATALOG, "match-all", ENV_GAMING))
        self.assertFalse(_match(MATCHER_CATALOG, "match-all", ENV_AGH))
        self.assertFalse(_match(MATCHER_CATALOG, "match-all", ENV_PLAIN))

        self.assertTrue(_match(MATCHER_CATALOG, "match-any", ENV_AGH))
        self.assertTrue(_match(MATCHER_CATALOG, "match-any", ENV_PLAIN))
        self.assertFalse(_match(MATCHER_CATALOG, "match-any", ENV_GAMING))

        self.assertTrue(_match(MATCHER_CATALOG, "match-not", ENV_PLAIN))
        self.assertFalse(_match(MATCHER_CATALOG, "match-not", ENV_AGH))

        self.assertTrue(_match(MATCHER_CATALOG, "match-in", ENV_AGH))
        self.assertTrue(_match(MATCHER_CATALOG, "match-in", ENV_GAMING))
        self.assertFalse(_match(MATCHER_CATALOG, "match-in", ENV_PLAIN))

        self.assertTrue(_match(MATCHER_CATALOG, "match-contains", ENV_GAMING))
        self.assertFalse(_match(MATCHER_CATALOG, "match-contains", ENV_AGH))

        self.assertTrue(_match(MATCHER_CATALOG, "match-exists", ENV_AGH))
        self.assertTrue(_match(MATCHER_CATALOG, "match-exists", ENV_PLAIN))

        self.assertTrue(_match(MATCHER_CATALOG, "match-ne-lte", ENV_PLAIN))
        self.assertFalse(_match(MATCHER_CATALOG, "match-ne-lte", ENV_AGH))

    def test_plain_env_does_not_match_gaming_or_agh_eq(self) -> None:
        ids = set(_matches(MATCHER_CATALOG, ENV_PLAIN))
        self.assertIn("match-not", ids)
        self.assertIn("match-any", ids)
        self.assertNotIn("match-eq", ids)
        self.assertNotIn("match-all", ids)
        self.assertNotIn("match-contains", ids)


class CatalogContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.generated = compile_openclash_guard_templates()
        cls.checked_in = json.loads(TEMPLATES_OUTPUT_PATH.read_text(encoding="utf-8"))

    def test_unique_template_ids(self) -> None:
        ids = list(self.checked_in["templates"])
        self.assertEqual(ids, sorted(set(ids)))
        for required in ("agh-openclash", "gaming-safe", "failclosed-strict", "dns-kill-switch-off"):
            self.assertIn(required, self.checked_in["templates"])

    def test_known_matcher_ops_and_env_paths(self) -> None:
        def walk(node: Any, loc: str) -> None:
            self.assertIsInstance(node, dict, loc)
            keys = set(node)
            combinators = keys & MATCHER_COMBINATORS
            if combinators:
                self.assertEqual(len(combinators), 1, loc)
                combinator = next(iter(combinators))
                if combinator in {"all", "any"}:
                    self.assertIsInstance(node[combinator], list)
                    for index, child in enumerate(node[combinator]):
                        walk(child, f"{loc}.{combinator}[{index}]")
                    return
                walk(node["not"], f"{loc}.not")
                return
            self.assertIn("path", node, loc)
            self.assertIn(node["path"], KNOWN_ENV_PATHS, loc)
            ops = keys & MATCHER_OPS
            self.assertEqual(len(ops), 1, loc)

        for template_id, spec in self.checked_in["templates"].items():
            walk(spec["when"], template_id)

    def test_known_apply_keys_only(self) -> None:
        for template_id, spec in self.checked_in["templates"].items():
            apply = spec["apply"]
            self.assertTrue(apply, template_id)
            extra = set(apply) - KNOWN_TEMPLATE_APPLY_KEYS
            self.assertEqual(extra, set(), template_id)

    def test_no_secret_fields(self) -> None:
        def walk(value: Any) -> None:
            if isinstance(value, dict):
                for key, item in value.items():
                    self.assertIsNone(SECRET_KEY_RE.match(str(key)), key)
                    walk(item)
            elif isinstance(value, list):
                for item in value:
                    walk(item)

        walk(self.checked_in)

    def test_no_service_region_copies(self) -> None:
        blob = json.dumps(self.checked_in).lower()
        for needle in SERVICE_FACT_KEYS:
            self.assertNotIn(f'"{needle}"', blob)
        for template in self.checked_in["templates"].values():
            for value in template["apply"].values():
                self.assertFalse(isinstance(value, list), "apply values must be scalars")

    def test_checked_in_matches_generator(self) -> None:
        self.assertEqual(
            TEMPLATES_OUTPUT_PATH.read_text(encoding="utf-8"),
            dumps_runtime(self.generated),
        )

    def test_unknown_apply_key_rejected(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "unknown apply key"):
            compile_templates(
                {
                    "bad": {
                        "title": "Bad",
                        "description": "nope",
                        "when": {"path": "nft.available", "eq": True},
                        "recommendation": {
                            "severity": "info",
                            "confidence": "high",
                            "reason": "x",
                            "risk": "y",
                        },
                        "apply": {"allowedRegions": ["aa"]},
                    }
                }
            )


class TemplateAndInstallCliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        loaded = shbundle.load_manifest(ROOT / "shell" / "manifest.json")
        shbundle.build_app(loaded, "openclash-guard")
        if not BUNDLE.is_file():
            raise RuntimeError(f"missing bundle {BUNDLE}")

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.bin = self.base / "bin"
        self.initd = self.base / "init.d"
        self.svc_state = self.base / "svc-state"
        self.work = self.base / "work"
        self.prefix = self.base / "prefix"
        self.geo_cache = self.base / "geo"
        for path in (self.bin, self.initd, self.svc_state, self.work, self.prefix, self.geo_cache):
            path.mkdir()
        self.uci_state = self.base / "uci-state.json"
        self.nft_state = self.base / "nft-state.json"
        self.fetch_map = self.base / "fetch-map.json"
        self.fetch_log = self.base / "fetch.log"
        self.lock_path = self.work / "openclash-guard.lock"
        self.stale_dir = self.work / "dnsmasq.d"
        self.stale_dir.mkdir()
        _write_exec(self.bin / "uci", FAKE_UCI)
        _write_exec(self.bin / "nft", FAKE_NFT)
        _write_exec(self.bin / "curl", FAKE_CURL)
        self._write_uci({})
        self._write_nft()
        self.fetch_map.write_text("{}\n", encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write_uci(self, committed: dict[str, Any], pending: dict | None = None) -> None:
        self.uci_state.write_text(
            json.dumps({"committed": committed, "pending": pending or {}}, indent=2)
            + "\n",
            encoding="utf-8",
        )

    def _write_nft(self, tables: dict | None = None) -> None:
        self.nft_state.write_text(
            json.dumps(
                {"tables": tables or {}, "batches": [], "next_handle": 1},
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    def _default_uci(self, **overrides: Any) -> dict[str, Any]:
        data: dict[str, Any] = {
            "openclash_guard.main.enabled": "1",
            "openclash_guard.main.mode": "auto",
            "openclash_guard.main.kill_switch": "1",
            "openclash_guard.main.dns_kill_switch": "0",
            "openclash_guard.udp.enabled": "1",
            "openclash_guard.udp.src_ip": ["10.0.0.11"],
        }
        data.update(overrides)
        return data

    def _install_service(self, name: str, *, enabled: bool = False, running: bool = False) -> None:
        _write_exec(self.initd / name, FAKE_INITD)
        if enabled:
            (self.svc_state / f"{name}.enabled").write_text("", encoding="utf-8")
        if running:
            (self.svc_state / f"{name}.running").write_text("", encoding="utf-8")

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
            "UCI_FAKE_STATE": str(self.uci_state),
            "NFT_FAKE_STATE": str(self.nft_state),
            "FETCH_FAKE_MAP": str(self.fetch_map),
            "FETCH_FAKE_LOG": str(self.fetch_log),
            "GUARD_POLICY_FILE": str(POLICY),
            "GUARD_TEMPLATES_FILE": str(TEMPLATES_OUTPUT_PATH),
            "GUARD_LOCK_PATH": str(self.lock_path),
            "GUARD_STALE_CONF_DIRS": str(self.stale_dir),
            "GUARD_IPV6": "0",
            "GUARD_DIRECT_REGION": "zz",
            "GUARD_PROXY_REGION": "aa",
            "GUARD_PREFIX": str(self.prefix),
            "GUARD_GEO_CACHE_DIR": str(self.geo_cache),
            "NO_COLOR": "1",
        }
        if extra:
            env.update(extra)
        return env

    def run_guard(
        self,
        *args: str,
        extra: Mapping[str, str] | None = None,
        stdin: str | None = None,
        timeout: int = 10,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["/bin/sh", str(BUNDLE), *args],
            capture_output=True,
            text=True,
            env=self.env(extra),
            timeout=timeout,
            cwd=str(self.work),
            check=False,
            input=stdin,
        )

    def load_uci(self) -> dict[str, Any]:
        return json.loads(self.uci_state.read_text(encoding="utf-8"))

    def load_nft(self) -> dict[str, Any]:
        return json.loads(self.nft_state.read_text(encoding="utf-8"))

    def test_agh_env_suggests_agh_template_without_applying(self) -> None:
        self._install_service("adguardhome", enabled=True, running=True)
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        before = self.load_uci()
        result = self.run_guard(
            "template",
            "suggest",
            "--json",
            extra={"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"},
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        payload = json.loads(result.stdout)
        ids = [item["id"] for item in payload["suggestions"]]
        self.assertIn("agh-openclash", ids)
        self.assertIn("dns-kill-switch-off", ids)
        after = self.load_uci()
        self.assertEqual(after, before)
        self.assertEqual(self.load_nft()["tables"], {})

    def test_gaming_client_suggests_gaming_safe_without_applying(self) -> None:
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        before = self.load_uci()
        result = self.run_guard(
            "template",
            "suggest",
            "--json",
            extra={"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"},
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        ids = [item["id"] for item in json.loads(result.stdout)["suggestions"]]
        self.assertIn("gaming-safe", ids)
        self.assertEqual(self.load_uci(), before)

    def test_no_gaming_client_does_not_suggest_gaming_safe(self) -> None:
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci(**{"openclash_guard.udp.src_ip": []}))
        result = self.run_guard(
            "template",
            "suggest",
            "--json",
            extra={"GUARD_OPENCLASH_HEALTHY": "1"},
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        ids = [item["id"] for item in json.loads(result.stdout)["suggestions"]]
        self.assertNotIn("gaming-safe", ids)

    def test_template_apply_dry_run_does_not_write_uci(self) -> None:
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci(**{"openclash_guard.main.kill_switch": "0"}))
        before = self.load_uci()
        result = self.run_guard(
            "template",
            "apply",
            "failclosed-strict",
            "--dry-run",
            extra={"GUARD_OPENCLASH_HEALTHY": "1"},
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertEqual(self.load_uci(), before)
        self.assertEqual(self.load_nft()["tables"], {})
        self.assertIn("would set", result.stdout)

    def test_template_apply_yes_writes_uci_then_reconcile(self) -> None:
        self._install_service("adguardhome", enabled=True, running=True)
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci(**{"openclash_guard.main.kill_switch": "0"}))
        result = self.run_guard(
            "template",
            "apply",
            "failclosed-strict",
            "--yes",
            extra={"GUARD_OPENCLASH_HEALTHY": "1", "GUARD_PROXY_HEALTHY": "1"},
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        uci = self.load_uci()
        self.assertEqual(uci["committed"]["openclash_guard.main.kill_switch"], "1")
        self.assertEqual(uci["committed"]["openclash_guard.main.mode"], "strict")
        self.assertTrue(self.load_nft()["tables"].get("inet openclash_guard"))

    def test_headless_install_yes_mode_auto_never_reads_stdin(self) -> None:
        self._install_service("adguardhome", enabled=True, running=True)
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci({})
        result = self.run_guard(
            "install",
            "--yes",
            "--mode",
            "auto",
            extra={
                "GUARD_OPENCLASH_HEALTHY": "1",
                "GUARD_PROXY_HEALTHY": "1",
                "GUARD_POLICY_FILE": str(POLICY),
                "GUARD_TEMPLATES_SOURCE": str(TEMPLATES_OUTPUT_PATH),
            },
            stdin="n\n" * 20,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        uci = self.load_uci()["committed"]
        self.assertEqual(uci["openclash_guard.main.enabled"], "1")
        self.assertEqual(uci["openclash_guard.main.mode"], "auto")
        self.assertEqual(uci["openclash_guard.main.kill_switch"], "1")
        self.assertEqual(uci["openclash_guard.main.dns_kill_switch"], "0")
        self.assertEqual(uci["openclash_guard.udp.blanket_udp_bypass"], "0")
        self.assertTrue((self.prefix / "usr/bin/openclash-guard").is_file())
        self.assertTrue((self.prefix / "etc/init.d/openclash-guard").is_file())
        self.assertTrue((self.prefix / "etc/hotplug.d/firewall/99-openclash-guard").is_file())
        self.assertIn("suggestions are not auto-applied", result.stdout)

    def test_install_without_yes_on_non_tty_fails(self) -> None:
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci({})
        result = self.run_guard(
            "install",
            "--mode",
            "auto",
            extra={"GUARD_POLICY_FILE": str(POLICY)},
            stdin="y\n",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("pass --yes", result.stderr)
        uci = self.load_uci()
        self.assertEqual(uci["committed"], {})
        self.assertFalse((self.prefix / "usr/bin/openclash-guard").exists())

    def test_bad_policy_fetch_keeps_last_known_good(self) -> None:
        self._install_service("openclash", enabled=True, running=True)
        dest_dir = self.work / "policy-dir"
        dest_dir.mkdir()
        dest = dest_dir / "openclash-guard.json"
        dest.write_text(POLICY.read_text(encoding="utf-8"), encoding="utf-8")
        self.fetch_map.write_text(
            json.dumps({"https://policy.test/bad": {"body": "{not-json"}}) + "\n",
            encoding="utf-8",
        )
        self._write_uci(self._default_uci())
        apply = self.run_guard(
            "apply",
            extra={
                "GUARD_POLICY_FILE": str(dest),
                "GUARD_OPENCLASH_HEALTHY": "1",
                "GUARD_PROXY_HEALTHY": "1",
            },
        )
        self.assertEqual(apply.returncode, 0, apply.stderr + apply.stdout)
        before_nft = self.load_nft()
        before_policy = dest.read_text(encoding="utf-8")
        refresh = self.run_guard(
            "refresh",
            extra={
                "GUARD_POLICY_FILE": str(dest),
                "GUARD_POLICY_URL": "https://policy.test/bad",
                "GUARD_OPENCLASH_HEALTHY": "1",
            },
        )
        self.assertNotEqual(refresh.returncode, 0)
        self.assertIn("keeping the installed runtime pair", refresh.stderr)
        self.assertEqual(dest.read_text(encoding="utf-8"), before_policy)
        after_nft = self.load_nft()
        self.assertEqual(after_nft["tables"], before_nft["tables"])

    def test_geo_fallback_and_malformed_does_not_mutate_nft(self) -> None:
        self._install_service("openclash", enabled=True, running=True)
        self._write_uci(self._default_uci())
        self.fetch_map.write_text(
            json.dumps(
                {
                    "https://geo.test/primary": {"body": "{not json"},
                    "https://geo.test/fallback": {
                        "body": json.dumps(
                            {"ip": "203.0.113.8", "country_code": "ZZ", "asn": 64500}
                        )
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        before = self.load_nft()
        result = self.run_guard(
            "geo",
            "direct",
            extra={
                "GUARD_POLICY_FILE": str(POLICY_GEO),
                "GUARD_DIRECT_REGION": "",
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        payload = json.loads(result.stdout)
        self.assertEqual(set(payload) >= {"ip", "country", "provider"}, True)
        self.assertRegex(payload["country"], r"^[a-z]{2}$")
        self.assertEqual(payload["provider"], "fallback")
        self.assertEqual(payload["ip"], "203.0.113.8")
        self.assertEqual(self.load_nft()["tables"], before["tables"])
        self.assertEqual(self.load_nft()["batches"], before["batches"])

        self.fetch_map.write_text(
            json.dumps(
                {
                    "https://geo.test/primary": {"fail": True},
                    "https://geo.test/fallback": {"body": "[]"},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        cached = self.run_guard(
            "geo",
            "direct",
            extra={
                "GUARD_POLICY_FILE": str(POLICY_GEO),
                "GUARD_DIRECT_REGION": "",
            },
        )
        self.assertEqual(cached.returncode, 0, cached.stderr + cached.stdout)
        cached_payload = json.loads(cached.stdout)
        self.assertEqual(cached_payload["country"], payload["country"])
        self.assertEqual(cached_payload["provider"], "fallback")
        self.assertEqual(self.load_nft()["tables"], before["tables"])

    def test_geo_route_uses_separate_cache(self) -> None:
        self.fetch_map.write_text(
            json.dumps(
                {
                    "https://geo.test/primary": {
                        "body": json.dumps({"ip": "198.51.100.8", "country_code": "AA", "asn": 1})
                    }
                }
            )
            + "\n",
            encoding="utf-8",
        )
        result = self.run_guard(
            "geo",
            "route",
            "aa-stable",
            extra={
                "GUARD_POLICY_FILE": str(POLICY_GEO),
                "GUARD_OPENCLASH_PROXY_URL": "http://127.0.0.1:7890",
            },
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["country"], "aa")
        self.assertTrue((self.geo_cache / "route-aa-stable.json").is_file())
        self.assertFalse((self.geo_cache / "direct.json").is_file())


if __name__ == "__main__":
    unittest.main()
