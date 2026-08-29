#!/usr/bin/env python3
"""Small zero-dependency entrypoint for consuming and maintaining this repo."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any, Mapping

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "catalog.json"
RULESCTL_CONFIG_PATH = ROOT / "internal" / "config" / "rulesctl.json"

ALLOWED_TOP_KEYS = frozenset({"schemaVersion", "doctor", "compilePaths", "pipelines"})
ALLOWED_STEP_KEYS = frozenset(
    {
        "argv",
        "kind",
        "glob",
        "requiredWhich",
        "missingMessage",
        "when",
        "otherwise",
        "skipMessage",
        "steps",
    }
)
PIPELINE_NAMES = ("check", "checkNode", "generate", "refresh")


def load_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def profiles_by_id() -> dict[str, dict]:
    return {item["id"]: item for item in load_catalog()["profiles"]}


def artifact_url(profile: dict, channel: str) -> str:
    catalog = load_catalog()
    try:
        template = catalog["channels"][channel]
    except KeyError as exc:
        raise SystemExit(f"unknown channel: {channel}") from exc
    return template.format(path=profile["path"])


def cmd_list(_: argparse.Namespace) -> None:
    for item in load_catalog()["profiles"]:
        marker = " (recommended)" if item.get("recommended") else ""
        print(f"{item['id']:<24} {item['kind']:<22} {item['label']}{marker}")


def require_profile(profile_id: str) -> dict:
    try:
        return profiles_by_id()[profile_id]
    except KeyError as exc:
        valid = ", ".join(profiles_by_id())
        raise SystemExit(f"unknown profile {profile_id!r}; choose one of: {valid}") from exc


def cmd_url(args: argparse.Namespace) -> None:
    print(artifact_url(require_profile(args.profile), args.channel))


def cmd_download(args: argparse.Namespace) -> None:
    profile = require_profile(args.profile)
    url = artifact_url(profile, args.channel)
    output = Path(args.output) if args.output else Path(profile["path"]).name
    req = urllib.request.Request(url, headers={"User-Agent": "mythic3011-rulesctl/1"})
    with urllib.request.urlopen(req, timeout=30) as response:
        output.write_bytes(response.read())
    print(output)


def run(command: list[str]) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def _require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SystemExit(f"invalid rulesctl config: {label} must be an object")
    return value


def _require_string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
        raise SystemExit(f"invalid rulesctl config: {label} must be an array of strings")
    return list(value)


def _unknown_keys(value: Mapping[str, Any], allowed: frozenset[str], label: str) -> None:
    extra = sorted(set(value) - allowed)
    if extra:
        raise SystemExit(f"invalid rulesctl config: {label} unknown keys: {', '.join(extra)}")


def load_rulesctl_config(path: Path | None = None) -> dict[str, Any]:
    config_path = path or RULESCTL_CONFIG_PATH
    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise SystemExit(f"invalid rulesctl config: cannot read {config_path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid rulesctl config: {exc}") from exc
    data = _require_object(raw, "root")
    _unknown_keys(data, ALLOWED_TOP_KEYS, "root")
    if data.get("schemaVersion") != 1:
        raise SystemExit("invalid rulesctl config: schemaVersion must be 1")
    doctor = _require_object(data.get("doctor", {}), "doctor")
    _require_string_list(doctor.get("paths", []), "doctor.paths")
    _require_string_list(doctor.get("tools", []), "doctor.tools")
    _require_string_list(data.get("compilePaths", []), "compilePaths")
    pipelines = _require_object(data.get("pipelines", {}), "pipelines")
    for name in PIPELINE_NAMES:
        if name not in pipelines:
            raise SystemExit(f"invalid rulesctl config: missing pipelines.{name}")
        _validate_pipeline(pipelines[name], f"pipelines.{name}")
    extra = sorted(set(pipelines) - set(PIPELINE_NAMES))
    if extra:
        raise SystemExit(f"invalid rulesctl config: unknown pipelines: {', '.join(extra)}")
    return data


def _validate_pipeline(value: Any, label: str) -> None:
    if not isinstance(value, list):
        raise SystemExit(f"invalid rulesctl config: {label} must be an array")
    for index, step in enumerate(value):
        _validate_step(step, f"{label}[{index}]")


def _validate_step(value: Any, label: str) -> None:
    step = _require_object(value, label)
    _unknown_keys(step, ALLOWED_STEP_KEYS, label)
    if "steps" in step:
        if step.get("otherwise") not in (None, "skip"):
            raise SystemExit(f"invalid rulesctl config: {label}.otherwise must be skip")
        _validate_pipeline(step["steps"], f"{label}.steps")
        return
    kind = step.get("kind", "argv")
    if kind == "argv":
        argv = step.get("argv")
        if not isinstance(argv, list) or not argv or not all(isinstance(item, str) and item for item in argv):
            raise SystemExit(f"invalid rulesctl config: {label}.argv must be a non-empty string array")
        return
    if kind == "node-test-glob":
        if not isinstance(step.get("glob"), str) or not step["glob"]:
            raise SystemExit(f"invalid rulesctl config: {label}.glob must be a string")
        return
    raise SystemExit(f"invalid rulesctl config: {label}.kind {kind!r} is not supported")


def _expand_argv(argv: list[str]) -> list[str]:
    mapping = {"{python}": sys.executable}
    return [mapping.get(item, item) for item in argv]


def _when_matches(condition: Mapping[str, Any] | None, root: Path) -> bool:
    if not condition:
        return True
    required_which = condition.get("which")
    if required_which and not shutil.which(str(required_which)):
        return False
    required_path = condition.get("exists")
    if required_path and not (root / str(required_path)).exists():
        return False
    return True


def _run_node_test_glob(step: Mapping[str, Any], root: Path) -> None:
    tool = str(step.get("requiredWhich") or "node")
    if not shutil.which(tool):
        raise SystemExit(str(step.get("missingMessage") or f"{tool} is required"))
    matches = sorted(path.relative_to(root).as_posix() for path in root.glob(str(step["glob"])))
    if not matches:
        raise SystemExit(f"no files matched {step['glob']}")
    run([tool, "--test", *matches])


def run_pipeline(
    config: Mapping[str, Any],
    name: str,
    *,
    root: Path | None = None,
) -> list[str]:
    root = root or ROOT
    pipeline = config["pipelines"][name]
    notes: list[str] = []

    def walk(steps: list[Any]) -> None:
        for step in steps:
            if "steps" in step:
                if _when_matches(step.get("when"), root):
                    walk(step["steps"])
                    continue
                if step.get("otherwise") == "skip":
                    message = str(step.get("skipMessage") or f"skipped {name} optional steps")
                    notes.append(message)
                    continue
                raise SystemExit(f"rulesctl pipeline {name} condition failed")
            kind = step.get("kind", "argv")
            if kind == "node-test-glob":
                _run_node_test_glob(step, root)
                continue
            run(_expand_argv(list(step["argv"])))

    walk(pipeline)
    return notes


def cmd_doctor(_: argparse.Namespace) -> None:
    config = load_rulesctl_config()
    doctor = config["doctor"]
    failures = 0
    for path in doctor["paths"]:
        ok = (ROOT / path).exists()
        print(f"{'OK' if ok else 'FAIL':<4} {path}")
        failures += not ok
    for tool in doctor["tools"]:
        resolved = shutil.which(tool)
        print(f"{'OK' if resolved else 'MISS':<4} {tool}{' -> ' + resolved if resolved else ''}")
    if failures:
        raise SystemExit(1)


def cmd_check(args: argparse.Namespace) -> None:
    config = load_rulesctl_config()
    run([sys.executable, "-m", "compileall", "-q", *config["compilePaths"]])
    run_pipeline(config, "check")
    if args.node:
        if not shutil.which("npm"):
            raise SystemExit("npm is required for --node")
        run_pipeline(config, "checkNode")


def cmd_generate(_: argparse.Namespace) -> None:
    config = load_rulesctl_config()
    for note in run_pipeline(config, "generate"):
        print(note, file=sys.stderr)


def cmd_refresh(args: argparse.Namespace) -> None:
    if not args.yes:
        raise SystemExit("refresh moves upstream pins and fetches network data; rerun with --yes")
    config = load_rulesctl_config()
    for note in run_pipeline(config, "refresh"):
        print(note, file=sys.stderr)


def cmd_managed_paths(_: argparse.Namespace) -> None:
    from ai_profiles.distribution import managed_git_pathspecs
    from ai_profiles.settings import AI_SOURCES_DIR, INI_MVP_PLAN_PATH, ROOT
    paths = list(managed_git_pathspecs())
    paths.extend(
        path.relative_to(ROOT).as_posix()
        for path in (AI_SOURCES_DIR, INI_MVP_PLAN_PATH.parent)
    )
    paths.append("apps/profile-service/worker/generated/runtime-data.mjs")
    shell_manifest = json.loads((ROOT / "shell" / "manifest.json").read_text(encoding="utf-8"))
    for app in shell_manifest.get("apps", {}).values():
        if not isinstance(app, dict):
            continue
        for key in ("output", "manifest", "checksum"):
            value = app.get(key)
            if isinstance(value, str):
                paths.append(value)
    print("\n".join(dict.fromkeys(paths)))


def cmd_ci(_: argparse.Namespace) -> None:
    config = load_rulesctl_config()
    run([sys.executable, "-m", "compileall", "-q", *config["compilePaths"]])
    run_pipeline(config, "checkNode")
    run_pipeline(config, "generate")
    run_pipeline(config, "check")
    result = subprocess.run(["git", "diff", "--quiet"], cwd=ROOT)
    if result.returncode:
        raise SystemExit("generated output drift detected; run make generate and commit the outputs")


def _csv_regions(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(item.strip() for item in value.split(",") if item.strip())


def cmd_profile_render(args: argparse.Namespace) -> None:
    from ai_profiles.profile_spec import ProfileSpec
    from ai_profiles.render.subconverter import render_ini

    spec = ProfileSpec(
        disabled_node_regions=_csv_regions(args.disable),
        only_node_regions=_csv_regions(args.only),
        preferred_node_regions=_csv_regions(args.prefer),
    )
    rendered = render_ini(spec)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
        print(args.output)
    else:
        sys.stdout.write(rendered)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="rulesctl", description="Access and maintain mythic3011/rules")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="list published profiles").set_defaults(func=cmd_list)
    u = sub.add_parser("url", help="print a published profile URL")
    u.add_argument("profile")
    u.add_argument("--channel", choices=("rolling", "cdn", "raw"), default="rolling")
    u.set_defaults(func=cmd_url)
    d = sub.add_parser("download", help="download a published profile")
    d.add_argument("profile")
    d.add_argument("-o", "--output")
    d.add_argument("--channel", choices=("rolling", "cdn", "raw"), default="rolling")
    d.set_defaults(func=cmd_download)
    sub.add_parser("doctor", help="check local repository prerequisites").set_defaults(func=cmd_doctor)
    c = sub.add_parser("check", help="run repository checks")
    c.add_argument("--node", action="store_true", help="also run TypeScript checks")
    c.set_defaults(func=cmd_check)
    sub.add_parser("generate", help="regenerate deterministic profile artifacts and intake UI").set_defaults(func=cmd_generate)
    r = sub.add_parser("refresh", help="refresh network-backed upstream inputs and regenerate")
    r.add_argument("--yes", action="store_true", help="confirm network-backed refresh")
    r.set_defaults(func=cmd_refresh)
    sub.add_parser("managed-paths", help="print generated paths from repository manifests").set_defaults(func=cmd_managed_paths)
    sub.add_parser("ci", help="run repository CI validation and generated-output drift checks").set_defaults(func=cmd_ci)

    profile = sub.add_parser("profile", help="resolve parameterized OpenClash custom templates")
    profile_sub = profile.add_subparsers(dest="profile_command", required=True)
    render = profile_sub.add_parser("render", help="render a custom subconverter INI locally")
    render.add_argument("--disable", help="comma-separated node regions to exclude")
    render.add_argument("--only", help="comma-separated routable regions to allow")
    render.add_argument("--prefer", help="comma-separated preferred region order")
    render.add_argument("-o", "--output")
    render.set_defaults(func=cmd_profile_render)
    return p


def main() -> None:
    args = parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
