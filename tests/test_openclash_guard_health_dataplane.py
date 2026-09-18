from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NFT = ROOT / 'shell/lib/nft.sh'
DATAPLANE = ROOT / 'shell/apps/openclash-guard/dataplane.sh'
HEALTH = ROOT / 'shell/apps/openclash-guard/health.sh'


class OpenClashGuardHealthDataplaneTests(unittest.TestCase):
    def run_shell(self, body: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ['/bin/sh', '-c', body],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def probe(self, listing: str, *, source: int = 1, destination: int = 1, legacy_chain: bool = False) -> subprocess.CompletedProcess[str]:
        legacy_rc = 0 if legacy_chain else 1
        script = f'''
set -eu
. "{NFT}"
. "{DATAPLANE}"
. "{HEALTH}"
nft() {{
    case "$*" in
        "-a list chain inet fw4 openclash_mangle") cat <<'EOF'
{listing}
EOF
            ;;
        "list chain inet fw4 openclash_guard_gaming_direct") return {legacy_rc} ;;
        *) printf 'unexpected nft call: %s\\n' "$*" >&2; return 99 ;;
    esac
}}
rc=0
guard_health_dataplane_probe {source} {destination} 0 || rc=$?
printf 'rc=%s state=%s source=%s destination=%s reason=%s\\n' \
    "$rc" "$_GUARD_HEALTH_DP_STATE" "$_GUARD_HEALTH_DP_SOURCE_RULE" \
    "$_GUARD_HEALTH_DP_DESTINATION_RULE" "$_GUARD_HEALTH_DP_REASON"
'''
        return self.run_shell(script)

    def test_required_source_and_destination_rules_before_anchor_pass(self) -> None:
        listing = '''chain openclash_mangle {
    meta mark 0 ip saddr @openclash_guard_gaming_src udp dport != @openclash_guard_gaming_protected udp sport @openclash_guard_gaming_sport meta mark set 0x40000000 return comment "openclash-guard:gaming-direct:source" # handle 501
    meta mark 0 ip saddr @openclash_guard_gaming_src udp dport != @openclash_guard_gaming_protected udp dport @openclash_guard_gaming_dport meta mark set 0x40000000 return comment "openclash-guard:gaming-direct:destination" # handle 502
    ip protocol udp counter jump openclash_upnp # handle 88
}'''
        result = self.probe(listing)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('rc=0 state=ready source=present destination=present', result.stdout)

    def test_missing_required_rule_fails(self) -> None:
        listing = '''chain openclash_mangle {
    meta mark 0 ip saddr @openclash_guard_gaming_src udp dport != @openclash_guard_gaming_protected udp sport @openclash_guard_gaming_sport meta mark set 0x40000000 return comment "openclash-guard:gaming-direct:source" # handle 501
    ip protocol udp counter jump openclash_upnp # handle 88
}'''
        result = self.probe(listing)
        self.assertIn('rc=1 state=failed source=present destination=missing reason=destination-rule-missing', result.stdout)

    def test_required_rule_after_anchor_fails(self) -> None:
        listing = '''chain openclash_mangle {
    meta mark 0 ip saddr @openclash_guard_gaming_src udp dport != @openclash_guard_gaming_protected udp sport @openclash_guard_gaming_sport meta mark set 0x40000000 return comment "openclash-guard:gaming-direct:source" # handle 501
    ip protocol udp counter jump openclash_upnp # handle 88
    meta mark 0 ip saddr @openclash_guard_gaming_src udp dport != @openclash_guard_gaming_protected udp dport @openclash_guard_gaming_dport meta mark set 0x40000000 return comment "openclash-guard:gaming-direct:destination" # handle 502
}'''
        result = self.probe(listing)
        self.assertIn('destination=misordered reason=destination-rule-misordered', result.stdout)

    def test_stale_legacy_jump_or_child_chain_fails(self) -> None:
        listing = '''chain openclash_mangle {
    ip saddr @openclash_guard_gaming_src meta l4proto udp jump openclash_guard_gaming_direct comment "openclash-guard:gaming-direct:jump" # handle 77
    ip protocol udp counter jump openclash_upnp # handle 88
}'''
        result = self.probe(listing, legacy_chain=True)
        self.assertIn('rc=1 state=failed', result.stdout)
        self.assertIn('reason=stale-legacy-dataplane', result.stdout)

    def test_unexpected_directional_rule_fails(self) -> None:
        listing = '''chain openclash_mangle {
    meta mark 0 ip saddr @openclash_guard_gaming_src udp dport != @openclash_guard_gaming_protected udp sport @openclash_guard_gaming_sport meta mark set 0x40000000 return comment "openclash-guard:gaming-direct:source" # handle 501
    ip protocol udp counter jump openclash_upnp # handle 88
}'''
        result = self.probe(listing, source=0, destination=0)
        self.assertIn('source=unexpected', result.stdout)

    def test_unhealthy_openclash_is_inactive_and_never_touches_nft(self) -> None:
        script = f'''
set -eu
. "{NFT}"
. "{DATAPLANE}"
. "{HEALTH}"
guard_game_read_uci() {{ _GUARD_GAME_ENABLED=1; }}
guard_env_detect() {{ _GUARD_OC_HEALTHY=0; }}
nft() {{ printf 'nft must not be called\\n' >&2; return 99; }}
guard_health_dataplane_assess
printf 'expected=%s state=%s reason=%s\\n' \
    "$_GUARD_HEALTH_DP_EXPECTED" "$_GUARD_HEALTH_DP_STATE" "$_GUARD_HEALTH_DP_REASON"
'''
        result = self.run_shell(script)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'expected=0 state=inactive reason=openclash-unhealthy')

    def test_health_surface_preserves_existing_fields_and_adds_dataplane_json(self) -> None:
        text = HEALTH.read_text(encoding='utf-8')
        for field in ('"healthy"', '"service"', '"firewallHooks"', '"rules"', '"dataplane"'):
            self.assertIn(field, text)
        for field in ('"expected"', '"state"', '"sourceRule"', '"destinationRule"', '"reason"'):
            self.assertIn(field, text)
        self.assertNotIn('0x162', text)
        for forbidden in ('4950', '4955', '26500', '26600', '27000', '27250', '29523'):
            self.assertNotIn(forbidden, text)


if __name__ == '__main__':
    unittest.main()
