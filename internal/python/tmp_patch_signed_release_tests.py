from __future__ import annotations

from pathlib import Path


def main() -> None:
    path = Path("tests/test_distribution_manifest.py")
    text = path.read_text()
    text = text.replace(
        '        self.assertNotIn("| sh", readme)\n        self.assertNotIn("| sh", guide)\n',
        '        self.assertNotRegex(readme, r"curl[^\\n|]*\\|\\s*(?:/bin/)?sh(?:\\s|$)")\n'
        '        self.assertNotRegex(guide, r"curl[^\\n|]*\\|\\s*(?:/bin/)?sh(?:\\s|$)")\n',
        1,
    )
    path.write_text(text)

    path = Path("tests/test_openclash_guard.py")
    text = path.read_text()
    if "import hashlib\n" not in text:
        text = text.replace("import importlib.util\n", "import importlib.util\nimport hashlib\n", 1)

    anchor = "'''\n\n\ndef _write_exec(path: Path, content: str) -> None:\n"
    fake_usign = """'''\n\nFAKE_USIGN = r'''#!/bin/sh\ncase \"${1:-}\" in\n    -V) exit 0 ;;\n    -F) printf '%s\\n' '0123456789abcdef0123456789abcdef' ; exit 0 ;;\n    *) exit 2 ;;\nesac\n'''\n\n\ndef _write_exec(path: Path, content: str) -> None:\n"""
    if "FAKE_USIGN =" not in text:
        if anchor not in text:
            raise SystemExit("fake command insertion anchor not found")
        text = text.replace(anchor, fake_usign, 1)

    old = '''        _write_exec(self.bin / "nft", FAKE_NFT)
        _write_exec(self.bin / "curl", FAKE_CURL)
        self._write_uci({})
'''
    new = '''        _write_exec(self.bin / "nft", FAKE_NFT)
        _write_exec(self.bin / "curl", FAKE_CURL)
        _write_exec(self.bin / "usign", FAKE_USIGN)
        self.trusted_release_key = self.base / "trusted-release-key.pub"
        self.trusted_release_key.write_text("test release public key\\n", encoding="utf-8")
        self._write_uci({})
'''
    if old in text:
        text = text.replace(old, new, 1)

    old = '''            "FETCH_FAKE_LOG": str(self.fetch_log),
            "GUARD_POLICY_FILE": str(POLICY),
'''
    new = '''            "FETCH_FAKE_LOG": str(self.fetch_log),
            "GUARD_TRUSTED_RELEASE_KEY": str(self.trusted_release_key),
            "GUARD_POLICY_FILE": str(POLICY),
'''
    if old in text:
        text = text.replace(old, new, 1)

    old = '''    def artifact_path(self, role: str) -> str:
        return DISTRIBUTION.artifact(role).path

    def published_guard_fetch_map(self) -> dict[str, dict[str, str]]:
        result: dict[str, dict[str, str]] = {}
        for artifact in DISTRIBUTION.artifacts:
            path = ROOT / artifact.path
            if path.is_file():
                result[self.distribution_url("github-raw", artifact.path)] = {
                    "body": path.read_text(encoding="utf-8")
                }
        return result
'''
    new = '''    def artifact_path(self, role: str) -> str:
        return DISTRIBUTION.artifact(role).path

    def signed_release_body(
        self,
        *,
        policy_body: str | None = None,
        templates_body: str | None = None,
    ) -> str:
        policy_body = policy_body if policy_body is not None else RUNTIME_POLICY.read_text(encoding="utf-8")
        templates_body = templates_body if templates_body is not None else RUNTIME_TEMPLATES.read_text(encoding="utf-8")
        bootstrap = ROOT / self.artifact_path("bootstrap-installer")
        payload = {
            "schemaVersion": 1,
            "sequence": 1,
            "revision": "test-release",
            "artifacts": {
                "guardBundle": {
                    "path": self.artifact_path("guard-bundle"),
                    "sha256": hashlib.sha256(BUNDLE.read_bytes()).hexdigest(),
                },
                "bootstrapInstaller": {
                    "path": self.artifact_path("bootstrap-installer"),
                    "sha256": hashlib.sha256(bootstrap.read_bytes()).hexdigest(),
                },
                "runtimePolicy": {
                    "path": self.artifact_path("runtime-policy"),
                    "sha256": hashlib.sha256(policy_body.encode()).hexdigest(),
                },
                "runtimeTemplates": {
                    "path": self.artifact_path("runtime-templates"),
                    "sha256": hashlib.sha256(templates_body.encode()).hexdigest(),
                },
            },
        }
        return json.dumps(payload, sort_keys=True) + "\\n"

    def add_signed_release_fetches(
        self,
        mapping: dict[str, dict[str, str]],
        *,
        policy_body: str | None = None,
        templates_body: str | None = None,
    ) -> dict[str, dict[str, str]]:
        mapping[self.distribution_url("github-raw", DISTRIBUTION.release_metadata_path)] = {
            "body": self.signed_release_body(policy_body=policy_body, templates_body=templates_body)
        }
        mapping[self.distribution_url("github-raw", DISTRIBUTION.release_signature_path)] = {
            "body": "test detached signature\\n"
        }
        return mapping

    def published_guard_fetch_map(self) -> dict[str, dict[str, str]]:
        result: dict[str, dict[str, str]] = {}
        for artifact in DISTRIBUTION.artifacts:
            path = ROOT / artifact.path
            if path.is_file():
                result[self.distribution_url("github-raw", artifact.path)] = {
                    "body": path.read_text(encoding="utf-8")
                }
        return self.add_signed_release_fetches(result)
'''
    if old in text:
        text = text.replace(old, new, 1)

    old = '''        mapping[self.distribution_url("github-raw", self.artifact_path("runtime-policy"))] = {
            "body": POLICY.read_text(encoding="utf-8")
        }
        self.fetch_map.write_text(json.dumps(mapping) + "\\n", encoding="utf-8")
'''
    new = '''        mapping[self.distribution_url("github-raw", self.artifact_path("runtime-policy"))] = {
            "body": POLICY.read_text(encoding="utf-8")
        }
        self.add_signed_release_fetches(mapping, policy_body=POLICY.read_text(encoding="utf-8"))
        self.fetch_map.write_text(json.dumps(mapping) + "\\n", encoding="utf-8")
'''
    if old in text:
        text = text.replace(old, new, 1)

    old = '''        self.fetch_map.write_text(
            json.dumps({
                raw_url: {"body": POLICY.read_text(encoding="utf-8")},
                templates_url: {"body": (ROOT / "cfg/runtime/openclash-guard-templates.json").read_text(encoding="utf-8")},
            }) + "\\n",
            encoding="utf-8",
        )
        result = self.run_guard_tty(
            "1\\ny\\nn\\n0\\n",
'''
    new = '''        mapping = self.published_guard_fetch_map()
        mapping[raw_url] = {"body": POLICY.read_text(encoding="utf-8")}
        mapping[templates_url] = {"body": (ROOT / "cfg/runtime/openclash-guard-templates.json").read_text(encoding="utf-8")}
        self.add_signed_release_fetches(mapping, policy_body=POLICY.read_text(encoding="utf-8"))
        self.fetch_map.write_text(json.dumps(mapping) + "\\n", encoding="utf-8")
        result = self.run_guard_tty(
            "1\\ny\\nn\\n0\\n",
'''
    if old in text:
        text = text.replace(old, new, 1)

    old = '''        self.fetch_map.write_text(
            json.dumps({
                raw_url: {"body": POLICY.read_text(encoding="utf-8")},
                templates_url: {"body": (ROOT / "cfg/runtime/openclash-guard-templates.json").read_text(encoding="utf-8")},
            }) + "\\n",
            encoding="utf-8",
        )
        result = self.run_guard(
            "refresh",
'''
    new = '''        mapping = {
            raw_url: {"body": POLICY.read_text(encoding="utf-8")},
            templates_url: {"body": (ROOT / "cfg/runtime/openclash-guard-templates.json").read_text(encoding="utf-8")},
        }
        self.add_signed_release_fetches(mapping, policy_body=POLICY.read_text(encoding="utf-8"))
        self.fetch_map.write_text(json.dumps(mapping) + "\\n", encoding="utf-8")
        result = self.run_guard(
            "refresh",
'''
    if old in text:
        text = text.replace(old, new, 1)

    path.write_text(text)


if __name__ == "__main__":
    main()
