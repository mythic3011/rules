"""
Shared helpers and constants for OpenClash Guard integration tests.

Import from here instead of duplicating values across test modules.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "internal" / "python") not in sys.path:
    sys.path.insert(0, str(ROOT / "internal" / "python"))

from ai_profiles.distribution import load_distribution  # noqa: E402
from ai_profiles.settings import AI_DISTRIBUTION_PATH  # noqa: E402
from internal.python.generate_openclash_guard_runtime import (  # noqa: E402
    TEMPLATES_OUTPUT_PATH,
)

DISTRIBUTION = load_distribution(AI_DISTRIBUTION_PATH)

BUNDLE = ROOT / DISTRIBUTION.artifact("guard-bundle").path
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "synthetic" / "openclash-guard"
POLICY = FIXTURE_DIR / "policy.json"
POLICY_GEO = FIXTURE_DIR / "policy-geo.json"
TEMPLATES_FILE = Path(TEMPLATES_OUTPUT_PATH)

# ── Distribution URL helpers ────────────────────────────────────────────────

def distribution_url(source_id: str, path: str) -> str:
    """Return the full fetch URL for *path* on *source_id* channel."""
    source = DISTRIBUTION.channel_by_type(source_id)
    base = source.base_url.format(
        repository=DISTRIBUTION.repository,
        version=DISTRIBUTION.default_ref,
    )
    return f"{base}/{path}"


def artifact_path(role: str) -> str:
    return DISTRIBUTION.artifact(role).path


def policy_url(source_id: str = "github-raw") -> str:
    return distribution_url(source_id, artifact_path("runtime-policy"))


def templates_url(source_id: str = "github-raw") -> str:
    """URL for the companion template catalog on *source_id*."""
    # Templates are a sibling of the runtime policy in the same distribution tree.
    templates_rel = "cfg/runtime/openclash-guard-templates.json"
    return distribution_url(source_id, templates_rel)


def policy_and_templates_fetch_map(
    source_id: str = "github-raw",
    policy_body: str | None = None,
    templates_body: str | None = None,
) -> dict[str, dict[str, str]]:
    """
    Return a fetch-map dict that satisfies the policy+templates pair check that
    preflight performs before any Setup action.
    """
    if policy_body is None:
        policy_body = POLICY.read_text(encoding="utf-8")
    if templates_body is None:
        templates_body = TEMPLATES_FILE.read_text(encoding="utf-8")
    return {
        policy_url(source_id): {"body": policy_body},
        templates_url(source_id): {"body": templates_body},
    }


# ── Menu action numbers ─────────────────────────────────────────────────────
# These mirror the choices printed by guard_menu() in menu.sh.
# Two separate menus exist: one for uninitialized state, one for valid state.

class MenuUninitialized:
    """Choices shown when guard runtime is not yet provisioned."""
    SETUP = "1"
    STATUS = "2"
    DOCTOR = "3"
    EXIT = "0"


class MenuReady:
    """Choices shown when guard runtime is fully provisioned and valid."""
    REFRESH = "1"
    APPLY = "2"
    STATUS = "3"
    DOCTOR = "4"
    REMOVE = "5"
    EXIT = "0"


# ── Menu text anchors ───────────────────────────────────────────────────────

MENU_HEADER = "OpenClash Guard"
MENU_PROMPT = "Select an action"
MENU_SETUP_LABEL = "Setup"           # label shown in uninitialized menu
MENU_APPLY_LABEL = "Apply / reconcile"
MENU_REFRESH_LABEL = "Refresh runtime assets"
MENU_REMOVE_LABEL = "Remove firewall rules"

# ── CLI output anchors ──────────────────────────────────────────────────────

MSG_SETUP_COMPLETE = "setup complete"
MSG_RECONCILED = "reconciled table"
MSG_REFRESH_KEPT = "keeping the installed runtime pair"  # on refresh failure

# ── JSON environment field sets ─────────────────────────────────────────────
# Exact key sets that guard_env_json() emits for each top-level object.

OPENCLASH_JSON_KEYS = {"installed", "enabled", "running", "healthy"}
DNS_JSON_KEYS = {
    "backend",
    "dnsmasqEnabled",
    "dnsmasqRunning",
    "adguardhomeEnabled",
    "adguardhomeRunning",
    "domainSetBackend",
}
NETWORK_JSON_KEYS = {"ipv6", "directRegion", "directRegionReason"}
PROXY_JSON_KEYS = {"healthy", "region", "regionReason", "route"}


def assert_env_json_shape(test_case: Any, payload: dict[str, Any]) -> None:
    """Assert that every top-level env-json object has the correct key set."""
    test_case.assertEqual(set(payload["openclash"]), OPENCLASH_JSON_KEYS)
    test_case.assertEqual(set(payload["dns"]), DNS_JSON_KEYS)
    test_case.assertEqual(set(payload["network"]), NETWORK_JSON_KEYS)
    test_case.assertEqual(set(payload["proxy"]), PROXY_JSON_KEYS)
