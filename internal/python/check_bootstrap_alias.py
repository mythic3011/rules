#!/usr/bin/env python3
"""External publication smoke check for the human-facing Guard bootstrap alias."""
from __future__ import annotations

import argparse
import hashlib
import urllib.error
import urllib.request
from pathlib import Path

from ai_profiles.distribution import load_distribution
from ai_profiles.settings import AI_DISTRIBUTION_PATH

MAX_REDIRECTS = 8
MAX_ARTIFACT_BYTES = 2 * 1024 * 1024


class RedirectTracker(urllib.request.HTTPRedirectHandler):
    def __init__(self, initial_url: str) -> None:
        super().__init__()
        self.seen = {initial_url}
        self.redirects: list[str] = []

    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: object,
        code: int,
        message: str,
        headers: object,
        new_url: str,
    ) -> urllib.request.Request | None:
        if new_url in self.seen:
            raise urllib.error.HTTPError(new_url, code, "redirect loop", headers, None)
        if len(self.redirects) >= MAX_REDIRECTS:
            raise urllib.error.HTTPError(new_url, code, "too many redirects", headers, None)
        self.seen.add(new_url)
        self.redirects.append(new_url)
        return super().redirect_request(
            request, file_pointer, code, message, headers, new_url
        )


def validate_guard_artifact(body: bytes) -> str:
    if len(body) > MAX_ARTIFACT_BYTES:
        raise RuntimeError("bootstrap artifact exceeds the publication size limit")
    if not body.startswith(b"#!/bin/sh\n"):
        raise RuntimeError("bootstrap artifact is missing the POSIX shell shebang")
    if body.count(b"#!/bin/sh\n") != 1:
        raise RuntimeError("bootstrap artifact has multiple shebangs")
    if b"# GENERATED FILE" not in body or b"# App: openclash-guard" not in body:
        raise RuntimeError("bootstrap response is not the generated OpenClash Guard artifact")
    if body.count(b'\nmain "$@"\n') != 1:
        raise RuntimeError("bootstrap artifact has an invalid entrypoint")
    return hashlib.sha256(body).hexdigest()


def check_alias(catalog_path: Path, timeout: int) -> tuple[str, str, int]:
    catalog = load_distribution(catalog_path)
    tracker = RedirectTracker(catalog.bootstrap_alias)
    opener = urllib.request.build_opener(tracker)
    request = urllib.request.Request(
        catalog.bootstrap_alias,
        headers={"User-Agent": "mythic3011-rules-bootstrap-smoke/1"},
    )
    with opener.open(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"bootstrap final response returned HTTP {response.status}")
        final_url = response.geturl()
        body = response.read(MAX_ARTIFACT_BYTES + 1)
    if not tracker.redirects:
        raise RuntimeError("bootstrap alias did not redirect")
    digest = validate_guard_artifact(body)
    return final_url, digest, len(tracker.redirects)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=AI_DISTRIBUTION_PATH)
    parser.add_argument("--timeout", type=int, default=20)
    args = parser.parse_args()
    final_url, digest, redirects = check_alias(args.catalog, args.timeout)
    print(f"ok redirects={redirects} final={final_url} sha256={digest}")


if __name__ == "__main__":
    main()
