#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import tempfile
from pathlib import Path

from endpoint_device_profiles import OUTPUT_PATH, ROOT, render_device_catalog


def _write_atomically(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the pinned router device profile catalog.")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--check", action="store_true", help="fail when the checked-in package projection differs")
    args = parser.parse_args()
    rendered = render_device_catalog()
    if args.check:
        try:
            current = args.output.read_text(encoding="utf-8")
        except OSError as exc:
            raise SystemExit(f"generated device catalog is unavailable: {args.output}") from exc
        if current != rendered:
            raise SystemExit("generated device catalog is out of date")
        print(args.output.relative_to(ROOT) if args.output.is_relative_to(ROOT) else args.output)
        return 0
    _write_atomically(args.output, rendered)
    print(args.output.relative_to(ROOT) if args.output.is_relative_to(ROOT) else args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
