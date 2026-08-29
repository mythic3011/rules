from __future__ import annotations

import importlib.util
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "shbundle.py"
FIXTURE_SIMPLE = ROOT / "tests" / "fixtures" / "synthetic" / "shell-bundle" / "simple"
SPEC = importlib.util.spec_from_file_location("shbundle", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load module from {MODULE_PATH}")
shbundle = importlib.util.module_from_spec(SPEC)
sys.modules["shbundle"] = shbundle
SPEC.loader.exec_module(shbundle)


def _write_tree(base: Path, files: dict[str, str]) -> None:
    for rel, content in files.items():
        path = base / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")


def _module(
    path: str,
    depends: list[str] | None = None,
    before: list[str] | None = None,
    after: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "path": path,
        "depends": depends or [],
        "before": before or [],
        "after": after or [],
    }


def _app(entry: str, output: str, depends: list[str] | None = None) -> dict[str, Any]:
    return {"entry": entry, "depends": depends or [], "output": output}


def _lib(name: str, extra: str = "") -> str:
    body = extra.rstrip() + "\n" if extra else ""
    return f"{body}{name}_fn() {{\n  :\n}}\n"


def _entry(name: str = "main") -> str:
    return f"{name}() {{\n  :\n}}\n"


def write_repo(
    base: Path,
    *,
    modules: dict[str, dict[str, Any]],
    apps: dict[str, dict[str, Any]],
    files: dict[str, str],
    generated_root: str = "dist",
    extra_manifest: dict[str, Any] | None = None,
) -> Path:
    manifest: dict[str, Any] = {
        "schemaVersion": 1,
        "generatedRoot": generated_root,
        "modules": modules,
        "apps": apps,
    }
    if extra_manifest:
        manifest.update(extra_manifest)
    man_path = base / "shell" / "manifest.json"
    man_path.parent.mkdir(parents=True, exist_ok=True)
    man_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    _write_tree(base, files)
    return man_path


def run_main(argv: list[str]) -> tuple[int, str, str]:
    stdout = io.StringIO()
    stderr = io.StringIO()
    with redirect_stdout(stdout), redirect_stderr(stderr):
        code = shbundle.main(argv)
    return code, stdout.getvalue(), stderr.getvalue()


class ShbundleTests(unittest.TestCase):
    def test_repo_skeleton_check_passes(self) -> None:
        code, stdout, stderr = run_main(["check"])
        self.assertEqual(code, 0, stderr)
        self.assertIn("ok", stdout)
        self.assertEqual(stderr, "")

    def test_simple_dependency_resolution(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "util": _module("shell/lib/util.sh"),
                    "main": _module("shell/apps/demo/main.sh", depends=["util"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["util"])},
                files={
                    "shell/lib/util.sh": _lib("util"),
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            loaded = shbundle.load_manifest(manifest)
            order, entry, included = shbundle.topological_order(loaded, "demo")
            self.assertEqual(entry, "main")
            self.assertEqual(order, ["util", "main"])
            self.assertEqual(included, {"util", "main"})

    def test_synthetic_fixture_builds(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            shutil.copytree(FIXTURE_SIMPLE, base, dirs_exist_ok=True)
            manifest = base / "shell" / "manifest.json"
            code, stdout, stderr = run_main(
                ["build", "demo", "--manifest", str(manifest)]
            )
            self.assertEqual(code, 0, stderr)
            output = (base / "dist" / "demo.sh").read_text(encoding="utf-8")
            self.assertIn("# BEGIN MODULE: util", output)
            self.assertIn("util_id()", output)
            self.assertIn("# BEGIN MODULE: main", output)
            self.assertTrue(stdout.startswith("wrote dist/demo.sh"))

    def test_transitive_deduplication(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "core": _module("shell/lib/core.sh"),
                    "a": _module("shell/lib/a.sh", depends=["core"]),
                    "b": _module("shell/lib/b.sh", depends=["core"]),
                    "main": _module("shell/apps/demo/main.sh", depends=["a", "b"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["a", "b"])},
                files={
                    "shell/lib/core.sh": _lib("core"),
                    "shell/lib/a.sh": _lib("a"),
                    "shell/lib/b.sh": _lib("b"),
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            loaded = shbundle.load_manifest(manifest)
            order, _, included = shbundle.topological_order(loaded, "demo")
            self.assertEqual(included, {"core", "a", "b", "main"})
            self.assertEqual(order.count("core"), 1)
            self.assertEqual(order[0], "core")
            self.assertEqual(order[-1], "main")
            self.assertEqual(sorted(order[1:3]), ["a", "b"])
            rendered = shbundle.render_bundle(loaded, "demo")
            self.assertEqual(rendered.count("# BEGIN MODULE: core"), 1)

    def test_deterministic_ordering(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            names = ["zeta", "alpha", "mu"]
            modules = {name: _module(f"shell/lib/{name}.sh") for name in names}
            modules["main"] = _module("shell/apps/demo/main.sh", depends=names)
            files = {f"shell/lib/{name}.sh": _lib(name) for name in names}
            files["shell/apps/demo/main.sh"] = _entry()
            manifest = write_repo(
                base,
                modules=modules,
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", names)},
                files=files,
            )
            loaded = shbundle.load_manifest(manifest)
            first, _, _ = shbundle.topological_order(loaded, "demo")
            second, _, _ = shbundle.topological_order(loaded, "demo")
            self.assertEqual(first, ["alpha", "mu", "zeta", "main"])
            self.assertEqual(first, second)

    def test_before_after_ordering_without_pulling(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "gaming": _module("shell/lib/gaming.sh", after=["killswitch"]),
                    "killswitch": _module("shell/lib/killswitch.sh", before=["unused"]),
                    "unused": _module("shell/lib/unused.sh"),
                    "main": _module("shell/apps/demo/main.sh"),
                },
                apps={
                    "demo": _app(
                        "shell/apps/demo/main.sh",
                        "dist/demo.sh",
                        ["gaming", "killswitch"],
                    )
                },
                files={
                    "shell/lib/gaming.sh": _lib("gaming"),
                    "shell/lib/killswitch.sh": _lib("killswitch"),
                    "shell/lib/unused.sh": _lib("unused"),
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            loaded = shbundle.load_manifest(manifest)
            order, _, included = shbundle.topological_order(loaded, "demo")
            self.assertEqual(order, ["killswitch", "gaming", "main"])
            self.assertNotIn("unused", included)

    def test_missing_dependency(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "main": _module("shell/apps/demo/main.sh", depends=["missing"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh")},
                files={"shell/apps/demo/main.sh": _entry()},
            )
            with self.assertRaisesRegex(shbundle.ShbundleError, "unknown dependency: 'missing'"):
                shbundle.load_manifest(manifest)

    def test_cycle_detection(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "a": _module("shell/lib/a.sh", depends=["b"]),
                    "b": _module("shell/lib/b.sh", depends=["c"]),
                    "c": _module("shell/lib/c.sh", depends=["a"]),
                    "main": _module("shell/apps/demo/main.sh", depends=["a"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["a"])},
                files={
                    "shell/lib/a.sh": _lib("a"),
                    "shell/lib/b.sh": _lib("b"),
                    "shell/lib/c.sh": _lib("c"),
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            with self.assertRaisesRegex(
                shbundle.ShbundleError, r"dependency cycle: a -> b -> c -> a"
            ):
                shbundle.load_manifest(manifest)

    def test_duplicate_output(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "one": _module("shell/apps/one/main.sh"),
                    "two": _module("shell/apps/two/main.sh"),
                },
                apps={
                    "one": _app("shell/apps/one/main.sh", "dist/shared.sh"),
                    "two": _app("shell/apps/two/main.sh", "dist/shared.sh"),
                },
                files={
                    "shell/apps/one/main.sh": _entry(),
                    "shell/apps/two/main.sh": _entry(),
                },
            )
            with self.assertRaisesRegex(shbundle.ShbundleError, "duplicate output path: dist/shared.sh"):
                shbundle.load_manifest(manifest)

    def test_one_shebang_and_one_entrypoint(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "cli": _module("shell/lib/cli.sh"),
                    "main": _module("shell/apps/demo/main.sh", depends=["cli"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["cli"])},
                files={
                    "shell/lib/cli.sh": "#!/bin/sh\nset -eu\n\ncli_fn() {\n  :\n}\n",
                    "shell/apps/demo/main.sh": "#!/bin/sh\nset -eu\n\nmain() {\n  cli_fn\n}\n",
                },
            )
            loaded = shbundle.load_manifest(manifest)
            rendered = shbundle.render_bundle(loaded, "demo")
            self.assertEqual(rendered.count("#!/bin/sh"), 1)
            self.assertTrue(rendered.startswith("#!/bin/sh\nset -eu\n"))
            self.assertEqual(rendered.count("set -eu"), 1)
            self.assertEqual(rendered.count('main "$@"'), 1)
            self.assertTrue(rendered.endswith('main "$@"\n'))
            self.assertIn("# GENERATED FILE — DO NOT EDIT", rendered)
            self.assertNotIn("#!/bin/sh", rendered.split("\n", 2)[2])

    def test_entry_main_dispatch_is_not_duplicated(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={"main": _module("shell/apps/demo/main.sh")},
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh")},
                files={"shell/apps/demo/main.sh": 'main() {\n  :\n}\n\nmain "$@"\n'},
            )
            rendered = shbundle.render_bundle(shbundle.load_manifest(manifest), "demo")
            self.assertEqual(rendered.count('main "$@"'), 1)
            self.assertTrue(rendered.endswith('main "$@"\n'))

    def test_consecutive_builds_are_byte_identical(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "util": _module("shell/lib/util.sh"),
                    "main": _module("shell/apps/demo/main.sh", depends=["util"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["util"])},
                files={
                    "shell/lib/util.sh": _lib("util"),
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            first = shbundle.build_app(shbundle.load_manifest(manifest), "demo").read_bytes()
            second = shbundle.build_app(shbundle.load_manifest(manifest), "demo").read_bytes()
            self.assertEqual(first, second)
            leftovers = list((base / "dist").glob(".shbundle-*"))
            self.assertEqual(leftovers, [])

    def test_build_all(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "shared": _module("shell/lib/shared.sh"),
                    "alpha": _module("shell/apps/alpha/main.sh", depends=["shared"]),
                    "beta": _module("shell/apps/beta/main.sh", depends=["shared"]),
                },
                apps={
                    "beta": _app("shell/apps/beta/main.sh", "dist/beta.sh", ["shared"]),
                    "alpha": _app("shell/apps/alpha/main.sh", "dist/alpha.sh", ["shared"]),
                },
                files={
                    "shell/lib/shared.sh": _lib("shared"),
                    "shell/apps/alpha/main.sh": _entry(),
                    "shell/apps/beta/main.sh": _entry(),
                },
            )
            code, stdout, stderr = run_main(["build", "--all", "--manifest", str(manifest)])
            self.assertEqual(code, 0, stderr)
            self.assertEqual(
                stdout.splitlines(),
                ["wrote dist/alpha.sh", "wrote dist/beta.sh"],
            )
            self.assertTrue((base / "dist" / "alpha.sh").is_file())
            self.assertTrue((base / "dist" / "beta.sh").is_file())

    def test_check_rejects_output_escaping_generated_root(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={"main": _module("shell/apps/demo/main.sh")},
                apps={
                    "demo": _app(
                        "shell/apps/demo/main.sh",
                        "setup/openclash/scripts/demo.sh",
                    )
                },
                files={"shell/apps/demo/main.sh": _entry()},
            )
            with self.assertRaisesRegex(
                shbundle.ShbundleError, "output escapes generatedRoot"
            ):
                shbundle.load_manifest(manifest)

    def test_check_rejects_relative_escape_output(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            man_path = base / "shell" / "manifest.json"
            man_path.parent.mkdir(parents=True)
            man_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "generatedRoot": "dist",
                        "modules": {
                            "main": {
                                "path": "shell/apps/demo/main.sh",
                                "depends": [],
                                "before": [],
                                "after": [],
                            }
                        },
                        "apps": {
                            "demo": {
                                "entry": "shell/apps/demo/main.sh",
                                "depends": [],
                                "output": "dist/../evil.sh",
                            }
                        },
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            (base / "shell" / "apps" / "demo").mkdir(parents=True)
            (base / "shell" / "apps" / "demo" / "main.sh").write_text(_entry(), encoding="utf-8")
            code, _, stderr = run_main(["check", "--manifest", str(man_path)])
            self.assertEqual(code, 1)
            self.assertRegex(stderr, r"output escapes generatedRoot|escapes the repository root")

    def test_check_rejects_non_entry_main_dispatch(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "cli": _module("shell/lib/cli.sh"),
                    "main": _module("shell/apps/demo/main.sh", depends=["cli"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["cli"])},
                files={
                    "shell/lib/cli.sh": 'cli_fn() {\n  :\n}\n\nmain "$@"\n',
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            with self.assertRaisesRegex(
                shbundle.ShbundleError, r'non-entry module \'cli\' invokes main "\$@"'
            ):
                shbundle.load_manifest(manifest)

    def test_duplicate_function_names(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "a": _module("shell/lib/a.sh"),
                    "b": _module("shell/lib/b.sh"),
                    "main": _module("shell/apps/demo/main.sh", depends=["a", "b"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["a", "b"])},
                files={
                    "shell/lib/a.sh": "shared_fn() {\n  :\n}\n",
                    "shell/lib/b.sh": "shared_fn() {\n  :\n}\n",
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            with self.assertRaisesRegex(
                shbundle.ShbundleError,
                r"duplicate function name 'shared_fn' in modules: a, b",
            ):
                shbundle.load_manifest(manifest)

    def test_top_level_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "nft": _module("shell/lib/nft.sh"),
                    "main": _module("shell/apps/demo/main.sh", depends=["nft"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["nft"])},
                files={
                    "shell/lib/nft.sh": "nft_fn() {\n  :\n}\n\nnft add rule inet filter input drop\n",
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            with self.assertRaisesRegex(
                shbundle.ShbundleError,
                r"top-level side effect in non-entry module 'nft': nft add",
            ):
                shbundle.load_manifest(manifest)

    def test_missing_module_path(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={"ghost": _module("shell/lib/ghost.sh")},
                apps={},
                files={},
            )
            with self.assertRaisesRegex(
                shbundle.ShbundleError, r"missing module path: ghost \(shell/lib/ghost.sh\)"
            ):
                shbundle.load_manifest(manifest)

    def test_unknown_before_after_reference(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={"cli": _module("shell/lib/cli.sh", before=["nope"])},
                apps={},
                files={"shell/lib/cli.sh": _lib("cli")},
            )
            with self.assertRaisesRegex(
                shbundle.ShbundleError,
                r"unknown before/after reference: 'nope' \(module 'cli' before\)",
            ):
                shbundle.load_manifest(manifest)

    def test_invalid_manifest_json(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            path = base / "shell" / "manifest.json"
            path.parent.mkdir(parents=True)
            path.write_text("{not json", encoding="utf-8")
            with self.assertRaisesRegex(shbundle.ShbundleError, "invalid manifest"):
                shbundle.load_manifest(path)

    def test_app_without_entrypoint_file(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={"cli": _module("shell/lib/cli.sh")},
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh")},
                files={"shell/lib/cli.sh": _lib("cli")},
            )
            with self.assertRaisesRegex(
                shbundle.ShbundleError, r"app 'demo' has no valid entrypoint"
            ):
                shbundle.load_manifest(manifest)

    def test_graph_and_list(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "a": _module("shell/lib/a.sh"),
                    "b": _module("shell/lib/b.sh", depends=["a"]),
                    "main": _module("shell/apps/demo/main.sh", depends=["b"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["b"])},
                files={
                    "shell/lib/a.sh": _lib("a"),
                    "shell/lib/b.sh": _lib("b"),
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            code, stdout, stderr = run_main(["graph", "demo", "--manifest", str(manifest)])
            self.assertEqual(code, 0, stderr)
            self.assertIn("app: demo", stdout)
            self.assertIn("order: a, b, main", stdout)
            self.assertIn("b -> a", stdout)
            self.assertIn("main -> b", stdout)

            code, stdout, stderr = run_main(["list", "--manifest", str(manifest)])
            self.assertEqual(code, 0, stderr)
            self.assertIn("modules:", stdout)
            self.assertIn("  a  shell/lib/a.sh", stdout)
            self.assertIn("apps:", stdout)
            self.assertIn("  demo  dist/demo.sh", stdout)

    def test_cli_script_check_subprocess(self) -> None:
        result = subprocess.run(
            [sys.executable, str(MODULE_PATH), "check"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ok", result.stdout)

    def test_every_module_once_and_entry_last(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(
                base,
                modules={
                    "z": _module("shell/lib/z.sh"),
                    "a": _module("shell/lib/a.sh"),
                    "main": _module("shell/apps/demo/main.sh", depends=["z", "a"]),
                },
                apps={"demo": _app("shell/apps/demo/main.sh", "dist/demo.sh", ["z", "a"])},
                files={
                    "shell/lib/z.sh": _lib("z"),
                    "shell/lib/a.sh": _lib("a"),
                    "shell/apps/demo/main.sh": _entry(),
                },
            )
            rendered = shbundle.render_bundle(shbundle.load_manifest(manifest), "demo")
            begins = [
                line.split(": ", 1)[1]
                for line in rendered.splitlines()
                if line.startswith("# BEGIN MODULE:")
            ]
            self.assertEqual(begins, ["a", "z", "main"])
            self.assertEqual(len(begins), len(set(begins)))

    def test_build_all_empty_apps(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            base = Path(raw)
            manifest = write_repo(base, modules={}, apps={}, files={})
            code, stdout, stderr = run_main(["build", "--all", "--manifest", str(manifest)])
            self.assertEqual(code, 0, stderr)
            self.assertIn("built 0 apps", stdout)


if __name__ == "__main__":
    unittest.main()
