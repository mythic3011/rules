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

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "catalog.json"


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


def cmd_doctor(_: argparse.Namespace) -> None:
    failures = 0
    for path in ("catalog.json", "cfg", "rule", "dns", "apps/profile-service", "internal/config", "internal/python", "tests"):
        ok = (ROOT / path).exists()
        print(f"{'OK' if ok else 'FAIL':<4} {path}")
        failures += not ok
    for tool in ("python3", "node", "npm"):
        resolved = shutil.which(tool)
        print(f"{'OK' if resolved else 'MISS':<4} {tool}{' -> ' + resolved if resolved else ''}")
    if failures:
        raise SystemExit(1)


def cmd_check(args: argparse.Namespace) -> None:
    run([sys.executable, "-m", "compileall", "-q", "internal/python", "tests", "tools"])
    run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"])
    if not shutil.which("node"):
        raise SystemExit("node is required for the zero-dependency profile-service contract suite")
    profile_service_tests = [
        str(path.relative_to(ROOT))
        for path in sorted((ROOT / "apps/profile-service/test").glob("*.test.mjs"))
    ]
    run(["node", "--test", *profile_service_tests])
    if args.node:
        if not shutil.which("npm"):
            raise SystemExit("npm is required for --node")
        run(["npm", "run", "validate:routing"])
        run(["npm", "run", "typecheck"])
        run(["npm", "run", "test:routing"])


def cmd_generate(_: argparse.Namespace) -> None:
    run([sys.executable, "internal/python/generate_service_intake_form.py"])
    run([sys.executable, "internal/python/generate_ai_profiles.py"])
    if shutil.which("npm") and (ROOT / "node_modules" / ".bin" / "tsx").exists():
        run(["npm", "run", "export:routing-artifacts"])
        run(["npm", "run", "export:shadow-profile"])
    else:
        print("note: Node dependencies are not installed; TypeScript-owned generated artifacts were skipped", file=sys.stderr)
    run([sys.executable, "internal/python/generate_profile_service_runtime.py"])


def cmd_refresh(args: argparse.Namespace) -> None:
    if not args.yes:
        raise SystemExit("refresh moves upstream pins and fetches network data; rerun with --yes")
    run([sys.executable, "internal/python/generate_ai_profiles.py", "--refresh-upstream-sources"])
    run([sys.executable, "internal/python/generate_ai_profiles.py", "--refresh-upstream-hosts"])
    run([sys.executable, "internal/python/generate_ai_profiles.py"])
    run([sys.executable, "internal/python/generate_adblock_outputs.py"])
    if shutil.which("npm") and (ROOT / "node_modules" / ".bin" / "tsx").exists():
        run(["npm", "run", "export:routing-artifacts"])
        run(["npm", "run", "export:shadow-profile"])
    run([sys.executable, "internal/python/generate_profile_service_runtime.py"])


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
