from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "internal" / "python"))

from ai_profiles.upstream_sources import (
    load_upstream_source_manifest,
    refresh_upstream_source_manifest,
)


class UpstreamSourceManifestTest(unittest.TestCase):
    def test_live_manifest_loads_as_single_authority(self) -> None:
        manifest = load_upstream_source_manifest(catalog_dir=ROOT / "internal" / "config" / "ai-routing")
        source = manifest.by_id()["vpsdance"]
        self.assertEqual(source.repository, "VPSDance/ai-proxy-rules")
        self.assertEqual(source.tracking_ref, "main")
        self.assertRegex(source.revision, r"^[0-9a-f]{40}$")

    def test_refresh_updates_only_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            path = catalog_dir / "upstream-sources.json"
            before = json.loads(path.read_text(encoding="utf-8"))
            new_sha = "1" * 40
            refresh_upstream_source_manifest(
                catalog_dir=catalog_dir,
                fetch_json=lambda url: {"sha": new_sha},
            )
            after = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(after["sources"]["vpsdance"]["revision"], new_sha)
            expected = json.loads(json.dumps(before))
            expected["sources"]["vpsdance"]["revision"] = new_sha
            self.assertEqual(after, expected)

    def test_refresh_is_noop_when_revision_is_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            path = catalog_dir / "upstream-sources.json"
            first = path.read_bytes()
            current = load_upstream_source_manifest(catalog_dir=catalog_dir).by_id()["vpsdance"].revision
            refresh_upstream_source_manifest(
                catalog_dir=catalog_dir,
                fetch_json=lambda url: {"sha": current},
            )
            self.assertEqual(path.read_bytes(), first)

    def test_invalid_commit_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            with self.assertRaisesRegex(RuntimeError, "invalid commit"):
                refresh_upstream_source_manifest(
                    catalog_dir=catalog_dir,
                    fetch_json=lambda url: {"sha": "main"},
                )


    def test_python_catalog_remote_source_can_resolve_the_shared_lock(self) -> None:
        from ai_profiles.catalog import load_catalog
        from ai_profiles.models import RemoteRuleSource

        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            services_path = catalog_dir / "services.json"
            services = json.loads(services_path.read_text(encoding="utf-8"))
            services["services"][0]["upstreamRules"] = [
                {
                    "kind": "remote",
                    "providerKey": "Upstream_OpenAI_Test",
                    "source": "vpsdance",
                    "path": "rules/clash/openai.yaml",
                    "behavior": "classical",
                    "format": "yaml",
                    "interval": 10800,
                    "iniInterval": 28800
                }
            ]
            services["services"][0].pop("geosites", None)
            services_path.write_text(json.dumps(services, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            catalog = load_catalog(catalog_dir)
            remote = next(source for source in catalog.services[0].upstream_rules if isinstance(source, RemoteRuleSource))
            locked = load_upstream_source_manifest(catalog_dir=catalog_dir).by_id()["vpsdance"]
            self.assertEqual(
                remote.url,
                f"{locked.raw_base_url}/{locked.revision}/rules/clash/openai.yaml",
            )

    def test_manifest_rejects_credentials_in_raw_base_url(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            catalog_dir = Path(temp) / "ai-routing"
            shutil.copytree(ROOT / "internal" / "config" / "ai-routing", catalog_dir)
            path = catalog_dir / "upstream-sources.json"
            value = json.loads(path.read_text(encoding="utf-8"))
            value["sources"]["vpsdance"]["rawBaseUrl"] = "https://token@example.com/raw"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "credential-free HTTPS"):
                load_upstream_source_manifest(catalog_dir=catalog_dir)


if __name__ == "__main__":
    unittest.main()
