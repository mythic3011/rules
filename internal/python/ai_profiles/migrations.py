from __future__ import annotations

from pathlib import Path

from .static_rules import (
    MANAGED_TAILSCALE_DOMAIN_MARKER, MANAGED_TAILSCALE_IP_MARKER, TAILSCALE_DOMAIN_ENTRIES,
)
from .settings import RULE_DIR
from .writer import write_text

def append_domain_entries(path: Path, marker: str, comment_lines: list[str], entries: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    missing_entries = [entry for entry in entries if entry not in text]
    if not missing_entries and marker in text:
        return

    lines = text.rstrip().splitlines()
    if marker not in text:
        lines.extend(["", marker, *comment_lines])
    for entry in missing_entries:
        lines.append(f"  - '{entry}'")
    write_text(path, "\n".join(lines))

def append_comment_block(path: Path, marker: str, comment_lines: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    lines = text.rstrip().splitlines()
    lines.extend(["", marker, *comment_lines])
    write_text(path, "\n".join(lines))

def migrate_custom_direct_supporting_rules() -> None:
    custom_direct_domain = RULE_DIR / "Custom_Direct_Domain.yaml"
    append_domain_entries(
        custom_direct_domain,
        MANAGED_TAILSCALE_DOMAIN_MARKER,
        [
            "# Tailscale control-plane domains should route DIRECT.",
            "# fake-ip-filter only affects DNS handling. It does not force DIRECT routing.",
            "# Tailscale exit-node traffic still needs firewall-level TProxy bypass",
            "# for the tailscale interface on router deployments.",
        ],
        TAILSCALE_DOMAIN_ENTRIES,
    )

    custom_direct_classical_ip = RULE_DIR / "Custom_Direct_Classical_IP.yaml"
    append_comment_block(
        custom_direct_classical_ip,
        MANAGED_TAILSCALE_IP_MARKER,
        [
            "# Tailscale IP ranges and DERP relay destinations change over time.",
            "# Do not hardcode Tailscale CIDR ranges without a dated verification step.",
            "# Prefer domain DIRECT rules plus firewall-level TProxy bypass for the tailscale interface.",
            "# Verify current official Tailscale firewall guidance before adding static IP-CIDR rules.",
        ],
    )
