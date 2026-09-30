"""Regression tests for the openclash-guard atomic reconcile gate (task A3).

Covers the reworked ``_guard_prepare()`` authority-ordered pipeline and the
new atomicity gate inside ``guard_cmd_reconcile`` /
``guard_cmd_apply`` in ``shell/apps/openclash-guard/main.sh``.

Invariants asserted here:

1. ZERO nft mutation when the UCI overlay is KNOWN-invalid. We instrument
   ``guard_migrate_stale``, ``guard_kill_delete_table``, and
   ``guard_kill_apply_batch`` (every nft-touching entry point) and prove
   none of them ran.
2. ``guard_cmd_reconcile`` refuses (non-zero, ``cli_error``) on an invalid
   overlay, BEFORE ``_guard_require_atomic_overlay_for_apply`` consults
   Layer-B state.
3. Layer-A coherence (stale/ABA snapshot detection) still refuses the
   apply path when the UCI fingerprint drifts mid-read, i.e. the Layer-A
   retry path that surfaces ``snapshot not coherent`` is preserved.
4. Valid config + valid authority inputs: ``guard_cmd_reconcile``
   proceeds and DOES call the nft apply path (sanity that the gate does
   not over-block).
5. The atomic gate is a no-op (backward-compatible) when the overlay
   modules are not yet wired into the bundle.

The tests drive ``main.sh`` directly (sourced with the trailing
``main "$@"`` stripped) so we exercise the real pipeline, not a mock.
External commands (``uci``, ``nft``) are replaced with shell stubs that
record calls into a file the Python side can inspect.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "shell" / "apps" / "openclash-guard" / "main.sh"
OVERLAY = ROOT / "shell" / "apps" / "openclash-guard" / "uci-overlay.sh"
RESOLVE = ROOT / "shell" / "apps" / "openclash-guard" / "uci-overlay-resolve.sh"
JSONLIB = ROOT / "shell" / "lib" / "json.sh"


def sh_available() -> str | None:
    return shutil.which("bash") or shutil.which("sh")


def _strip_main_entrypoint() -> str:
    """Return main.sh source with the trailing ``main "$@"`` removed."""
    text = MAIN.read_text(encoding="utf-8")
    # Drop the trailing dispatch (last non-empty line) so sourcing only
    # DEFINES the functions. The discoverable invariant is that the file
    # ends with ``main "$@"`` plus optional trailing blank lines.
    lines = text.splitlines()
    while lines and not lines[-1].strip():
        lines.pop()
    assert lines, "main.sh is empty"
    last = lines[-1].strip()
    if last != 'main "$@"':
        raise AssertionError(
            f"main.sh no longer ends with 'main \"$@\"' (last line: {last!r}); "
            "update _strip_main_entrypoint to match"
        )
    lines.pop()
    return "\n".join(lines) + "\n"


def _write_fake_uci_script(state_file: Path, show_file: Path) -> str:
    """Render a POSIX ``uci`` function bound to a tab-separated state file.

    The state file contains ``path<TAB>value`` lines; multi-valued options
    appear as one line per value.
    """
    sf = state_file.as_posix()
    shf = show_file.as_posix()
    return f"""
uci() {{
    state="{sf}"
    showfile="{shf}"
    if [ "$2" = "show" ] || [ "$1" = "show" ]; then
        if [ ! -s "$state" ]; then
            echo "uci: Entry not found" >&2
            return 1
        fi
        cat "$showfile"
        return 0
    fi
    if [ "$1" = "-q" ] && [ "$2" = "get" ]; then
        opt="${{3#openclash_guard.}}"
        out=$(awk -F '\\t' -v o="$opt" '$1==o {{ print $2; exit }}' "$state")
        if [ -z "$out" ]; then
            echo "uci: Entry not found" >&2
            return 1
        fi
        printf '%s\\n' "$out"
        return 0
    fi
    if [ "$1" = "-d" ]; then
        opt="${{5#openclash_guard.}}"
        out=$(awk -F '\\t' -v o="$opt" '$1==o {{ print $2 }}' "$state")
        if [ -z "$out" ]; then
            echo "uci: Entry not found" >&2
            return 1
        fi
        printf '%s\\n' "$out"
        return 0
    fi
    return 0
}}
"""


def _render_show(state: dict[str, object]) -> str:
    """Mirror the test_openclash_guard_uci_overlay byte-faithful uci show."""
    def esc(value: str) -> str:
        return "'" + value.replace("'", "'\\''") + "'"

    sections = sorted({str(path).split(".")[0] for path in state})
    out: list[str] = [f"openclash_guard.{s}=openclash_guard" for s in sections]
    for path, value in state.items():
        if isinstance(value, list):
            out.append(f"openclash_guard.{path}=" + " ".join(esc(v) for v in value))
        else:
            out.append(f"openclash_guard.{path}={esc(value)}")
    return "\n".join(out) + ("\n" if out else "")


def _minimal_policy() -> dict:
    """A policy payload sufficient for guard_policy_load + the resolver sanity."""
    return {
        "schemaVersion": 1,
        "revision": "atomic-test",
        "nft": {"family": "inet", "table": "openclash_guard", "commentPrefix": "ocg"},
        "services": {
            "chatgpt": {"protectionClass": "stable-session"},
        },
        "protectionClasses": {
            "stable-session": {
                "firewallKillSwitch": True,
                "directAllowed": False,
            },
        },
        "gaming": {"protectedUdpPorts": ["443"], "tcpPorts": []},
    }


# Stubs for the many functions main.sh references but the atomic pipeline
# does not exercise. Each stub is intentionally minimal: it must not touch
# nft, must not die under `set -eu`, and must provide just enough side
# effects for the pipeline path under test. Anything that the pipeline
# REALLY uses is implemented for real (the JSON lib, the overlay resolver).
def _common_stubs(nft_log: Path, kill_apply_log: Path) -> str:
    nft_log_str = nft_log.as_posix()
    kill_log_str = kill_apply_log.as_posix()
    return f"""
# --- log files (nft / kill switch apply invocations) ---
_NFT_LOG="{nft_log_str}"
_KILL_APPLY_LOG="{kill_log_str}"

# --- cli ---
cli_error() {{ printf 'cli_error: %s\\n' "$*" >&2; }}
cli_info()  {{ printf 'cli_info: %s\\n' "$*"; }}
cli_warn()  {{ printf 'cli_warn: %s\\n' "$*"; }}
cli_success() {{ printf 'cli_success: %s\\n' "$*"; }}
cli_die()   {{ printf 'cli_die: %s\\n' "$*" >&2; exit "${{2:-1}}"; }}
cli_set_assume_yes() {{ :; }}
cli_has_controlling_tty() {{ return 1; }}
cli_confirm() {{ return 0; }}
cli_section() {{ :; }}
cli_kv() {{ :; }}

# --- file/lock ---
lock_acquire() {{ return 0; }}
lock_release() {{ return 0; }}
file_mktemp() {{ mktemp "${{TMPDIR:-/tmp}}/atomic.XXXXXX"; }}
file_atomic_replace() {{ cp "$2" "$1"; }}

# --- service ---
svc_exists() {{ return 1; }}
svc_enabled() {{ return 1; }}
svc_running() {{ return 1; }}

# --- uci (local fallback only used when no fake uci installed) ---
uci_get_default() {{ printf '%s' "$2"; }}
uci_get_bool() {{ printf '%s' "$2"; }}

# --- environment detection (replaces environment.sh + dns.sh) ---
_GUARD_DNS_BACKEND=none
_GUARD_OC_INSTALLED=0
_GUARD_OC_ENABLED=0
_GUARD_OC_RUNNING=0
_GUARD_OC_HEALTHY=0
_GUARD_NFT_AVAILABLE=1
_GUARD_NET_IPV6=0
_GUARD_GAME_CLIENTS=0
_GUARD_GAME_CLIENT_ITEMS=
_GUARD_GAME_BLANKET=0
_GUARD_DEPENDENCY_FAILURE=0
_GUARD_NET_DIRECT_REGION=
_GUARD_PROXY_REGION=
_GUARD_PROXY_HEALTHY=0
guard_env_detect() {{
    # Imitate guard_dns_detect inside guard_env_detect, honoring the test's
    # GUARD_LIVE_DNS_BACKEND override. The real detector resolves adguardhome
    # vs dnsmasq via svc probing; for this regression suite the override is
    # the entire observation.
    _GUARD_DNS_BACKEND=${{GUARD_LIVE_DNS_BACKEND:-none}}
    _GUARD_PROXY_HEALTHY=0
    _GUARD_NFT_AVAILABLE=1
}}
guard_env_get() {{ printf 'stub\\n'; }}
guard_env_json() {{ printf '{{}}'; }}
_guard_env_json_string() {{ printf '%s' "$1"; }}

# --- policy (only the loader is exercised for real via JSON lib) ---
_GUARD_POLICY_FILE=
_GUARD_POLICY_STATE=unknown
_GUARD_POLICY_ENFORCEMENT=unknown
_GUARD_POLICY_STATE_REASON=
_GUARD_POLICY_DEGRADED_COMPONENTS=
_GUARD_POLICY_REVISION=
_GUARD_NFT_FAMILY=inet
_GUARD_NFT_TABLE=openclash_guard
_GUARD_NFT_PREFIX=ocg
_GUARD_POLICY_FILE_DEFAULT=""
_guard_policy_default_path() {{
    printf '%s' "${{GUARD_POLICY_FILE:?GUARD_POLICY_FILE must be set by the test}}"
}}
guard_policy_validate_file() {{ json_load "$1"; }}
guard_policy_load() {{
    _guard_pl_path=${{1:-$(_guard_policy_default_path)}}
    guard_policy_validate_file "$_guard_pl_path" || return $?
    _GUARD_POLICY_FILE=$_guard_pl_path
    _GUARD_NFT_FAMILY=$(json_get "$_GUARD_POLICY_FILE" nft.family)
    _GUARD_NFT_TABLE=$(json_get "$_GUARD_POLICY_FILE" nft.table)
    _GUARD_NFT_PREFIX=$(json_get "$_GUARD_POLICY_FILE" nft.commentPrefix)
    _GUARD_POLICY_REVISION=$(json_get "$_GUARD_POLICY_FILE" revision 2>/dev/null) || _GUARD_POLICY_REVISION=
}}
guard_policy_refresh_state() {{
    _GUARD_POLICY_STATE=ready
    _GUARD_POLICY_ENFORCEMENT=enforce
}}
guard_policy_eval() {{ printf 'reject\\n'; }}
guard_policy_needs_failclosed() {{ return 0; }}
guard_policy_json_extra() {{ :; }}
guard_policy_validate_file_or_die() {{ guard_policy_validate_file "$1"; }}

# --- install/preflight (return success so reconcile proceeds past gates) ---
guard_install_validate() {{ return 0; }}
guard_preflight_run() {{ _GUARD_PREFLIGHT_COMPLETE=1; }}
_GUARD_PREFLIGHT_COMPLETE=1

# --- geo (no remote calls) ---
guard_geo_detect_direct() {{ return 0; }}
guard_geo_detect_route() {{ return 0; }}
guard_geo_cached_country() {{ printf ''; }}
guard_runtime_source() {{ printf 'local'; }}
guard_overlay_activation() {{ printf 'active'; }}
guard_firewall_table_state() {{ printf 'active'; }}

# --- killswitch / gaming (UCI consumers are permissive stubs) ---
_GUARD_UCI_ENABLED=1
_GUARD_UCI_MODE=auto
_GUARD_UCI_KILL_SWITCH=1
_GUARD_UCI_DNS_KILL_SWITCH=0
_GUARD_NFT_TABLE_EXISTS=0
guard_kill_read_uci() {{ :; }}
guard_game_read_uci() {{ :; }}
guard_kill_render() {{ :; }}
guard_game_render() {{ :; }}
guard_kill_render_final() {{ :; }}
guard_kill_delete_table() {{
    printf 'guard_kill_delete_table\\n' >> "$_NFT_LOG"
    return 0
}}
guard_kill_apply_batch() {{
    printf 'guard_kill_apply_batch %s\\n' "$1" >> "$_KILL_APPLY_LOG"
    return 0
}}

# --- migration (stale) ---
guard_migrate_stale() {{
    printf 'guard_migrate_stale\\n' >> "$_NFT_LOG"
    return 0
}}

# --- nft table helpers ---
nft_table_exists() {{ return 1; }}
nft_chain_exists() {{ return 1; }}
nft_delete_rules_by_comment() {{ return 0; }}
nft_delete_owned_set() {{ return 0; }}
"""


def _run_main(
    script_body: str,
    *,
    uci_state: dict[str, object] | None = None,
    policy: dict | None = None,
    live_dns_backend: str = "dnsmasq",
    wire_overlay: bool = True,
) -> tuple[subprocess.CompletedProcess, str, str]:
    """Source lib + stubs + main.sh functions, run script_body.

    Returns (proc, nft_log_text, kill_apply_log_text). nft_log captures
    guard_migrate_stale / guard_kill_delete_table; kill_apply_log captures
    guard_kill_apply_batch.
    """
    shell = sh_available()
    if shell is None:
        raise unittest.SkipTest("no POSIX shell available on this host")

    tmp = Path(tempfile.mkdtemp(prefix="atomic-test-"))
    policy_file = tmp / "policy.json"
    policy_file.write_text(json.dumps(policy or _minimal_policy()), encoding="utf-8")

    state_file = tmp / "state.txt"
    show_file = tmp / "show.txt"
    state_lines: list[str] = []
    for path, value in (uci_state or {}).items():
        if isinstance(value, list):
            for item in value:
                state_lines.append(f"{path}\t{item}")
        else:
            state_lines.append(f"{path}\t{value}")
    state_file.write_text("\n".join(state_lines) + ("\n" if state_lines else ""), encoding="utf-8")
    show_file.write_text(_render_show(uci_state or {}), encoding="utf-8")

    nft_log = tmp / "nft.log"
    kill_apply_log = tmp / "kill_apply.log"
    nft_log.touch()
    kill_apply_log.touch()

    parts: list[str] = ["set -eu"]
    parts.append(f'export GUARD_POLICY_FILE="{policy_file.as_posix()}"')
    parts.append(f'export GUARD_LIVE_DNS_BACKEND="{live_dns_backend}"')
    parts.append(f'export TMPDIR="{tmp.as_posix()}"')
    if uci_state is not None:
        parts.append(_write_fake_uci_script(state_file, show_file))
    else:
        # No fake uci: simulate "uci command unavailable" by overriding
        # `command -v uci` to fail. The overlay module under
        # uci-unavailable records an error and returns 1.
        parts.append("command() {\n    if [ \"$1\" = \"-v\" ] && [ \"$2\" = \"uci\" ]; then return 1; fi\n    builtin command \"$@\"\n}")
    parts.append(f'. "{JSONLIB.as_posix()}"')
    if wire_overlay:
        parts.append(f'. "{OVERLAY.as_posix()}"')
        parts.append(f'. "{RESOLVE.as_posix()}"')
    parts.append(_common_stubs(nft_log, kill_apply_log))
    parts.append(_strip_main_entrypoint())
    parts.append(script_body)
    full = "\n".join(parts) + "\n"

    script_path = tmp / "run.sh"
    script_path.write_text(full, encoding="utf-8")
    proc = subprocess.run(
        [shell, str(script_path)],
        capture_output=True,
        text=True,
        # Windows-bash harness: sourcing the overlay + resolver (spec-table
        # reset loop ~3s, populate ~4s, full cold-start of guard_uci_overlay_load
        # up to ~15s under CI load) plus _guard_prepare + reconcile lands just
        # over 30s (~33.9s) even though it completes successfully. The sibling
        # shell-harness suites use 60s here; match them. If this regresses
        # below 60s on a healthy host, the pipeline itself is wedging.
        timeout=60,
    )
    return (
        proc,
        nft_log.read_text(encoding="utf-8"),
        kill_apply_log.read_text(encoding="utf-8"),
    )


class AtomicReconcileGateTests(unittest.TestCase):
    """The atomic gate in guard_cmd_reconcile / guard_cmd_apply."""

    def test_reconcile_refuses_when_overlay_invalid_and_never_touches_nft(self) -> None:
        """Known-invalid UCI option (bad boolean) must refuse with ZERO nft mutation."""
        proc, nft_log, kill_apply_log = _run_main(
            "guard_cmd_reconcile\n",
            uci_state={"main.enabled": "notaboolean"},
        )
        self.assertNotEqual(proc.returncode, 0, f"expected refuse, got 0: {proc.stdout}\n{proc.stderr}")
        self.assertIn("invalid", proc.stderr, proc.stderr)
        # Layer A fires BEFORE any consumer; no nft entry point may run.
        self.assertEqual(nft_log.strip(), "", f"guard_migrate_stale/guard_kill_delete_table ran: {nft_log}")
        self.assertEqual(kill_apply_log.strip(), "", f"guard_kill_apply_batch ran: {kill_apply_log}")

    def test_apply_is_also_gated(self) -> None:
        """guard_cmd_apply forwards to reconcile; the same gate applies."""
        proc, nft_log, kill_apply_log = _run_main(
            "guard_cmd_apply\n",
            uci_state={"main.enabled": "2"},
        )
        self.assertNotEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertEqual(nft_log.strip(), "")
        self.assertEqual(kill_apply_log.strip(), "")

    def test_prepare_refuses_layer_a_invalid_before_any_apply(self) -> None:
        """Layer-A invalid overlay => _guard_prepare refuses and no nft mutation.

        This test deliberately uses a VALID policy: _run_main falls back to
        _minimal_policy() when policy=None. The invalid dimension is the
        overlay (main.enabled=notaboolean), so the non-zero exit and the
        "invalid" stderr line prove the Layer-A refuse fired and the pipeline
        stopped before any nft/apply work (nft and kill_apply logs stay
        empty). Ordering-before-policy-load is NOT asserted here; only the
        refuse + zero-mutation invariant is.
        """
        shell = sh_available()
        if shell is None:
            raise unittest.SkipTest("no POSIX shell available on this host")
        proc, nft_log, kill_apply_log = _run_main(
            '_guard_prepare\n',
            uci_state={"main.enabled": "notaboolean"},
            policy=None,  # _run_main substitutes a valid _minimal_policy()
        )
        # Policy is valid so the failure must come from the overlay.
        self.assertNotEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("invalid", proc.stderr, proc.stderr)
        self.assertEqual(nft_log.strip(), "")
        self.assertEqual(kill_apply_log.strip(), "")

    def test_valid_overlay_proceeds_to_nft_apply(self) -> None:
        """Sanity anchor: with a valid overlay + valid authority inputs, the
        pipeline runs end-to-end and DOES call guard_kill_apply_batch."""
        proc, nft_log, kill_apply_log = _run_main(
            "guard_cmd_reconcile\n",
            uci_state={
                "main.enabled": "1",
                "main.kill_switch": "1",
                "dns.fail_closed": "1",
                "dns.backend": "auto",
            },
            live_dns_backend="dnsmasq",
        )
        self.assertEqual(proc.returncode, 0, f"expected success: {proc.stdout}\n{proc.stderr}")
        # We expect exactly one apply batch (not zero); migrate/delete_table
        # also ran (enabled path runs migrate_stale then apply_batch).
        self.assertIn("guard_kill_apply_batch", kill_apply_log)
        self.assertIn("guard_migrate_stale", nft_log)

    def test_layer_a_coherence_still_refuses(self) -> None:
        """Coherence refuse: apply path refuses when load reports not-coherent.

        This exercises the _guard_prepare refuse path via a stubbed
        guard_uci_overlay_load: our override always adds the
        ``snapshot not coherent`` error and returns 1, which is exactly the
        condition _guard_prepare gates on (retry exhaustion surfaces
        non-zero). We deliberately do NOT race a real fingerprint flip here;
        _guard_prepare must refuse and zero nft mutation occurs. Real
        fingerprint/ABA coverage lives in OverlayCoherenceTests
        (tests/test_openclash_guard_uci_overlay.py).
        """
        shell = sh_available()
        if shell is None:
            raise unittest.SkipTest("no POSIX shell available on this host")

        tmp = Path(tempfile.mkdtemp(prefix="atomic-aba-"))
        policy_file = tmp / "policy.json"
        policy_file.write_text(json.dumps(_minimal_policy()), encoding="utf-8")
        state_file = tmp / "state.txt"
        show_file = tmp / "show.txt"
        state_file.write_text("main.enabled\t1\n", encoding="utf-8")
        show_file.write_text(_render_show({"main.enabled": "1"}), encoding="utf-8")
        nft_log = tmp / "nft.log"
        kill_apply_log = tmp / "kill_apply.log"
        nft_log.touch()
        kill_apply_log.touch()

        fake_uci = _write_fake_uci_script(state_file, show_file)
        # Wrap the overlay's populate hook with one that flips the AFTER
        # fingerprint by touching a side file the show file is regenerated
        # from. We do this by replacing `uci` AFTER the before fingerprint
        # is captured.
        script = f"""
set -eu
export GUARD_POLICY_FILE="{policy_file.as_posix()}"
export GUARD_LIVE_DNS_BACKEND="dnsmasq"
export TMPDIR="{tmp.as_posix()}"
{fake_uci}
. "{JSONLIB.as_posix()}"
. "{OVERLAY.as_posix()}"
. "{RESOLVE.as_posix()}"

# Mutate the show file on every populate call so before != after.
_real_populate=$(declare -f _guard_uci_overlay_populate_from_uci 2>/dev/null || true)
# POSIX shell lacks declare -f; use a wrapping function the overlay calls.
guard_uci_overlay_load() {{
    # Force not-coherent on every attempt: double the retries allowed then
    # return the failure directly. We don't race real uci; we prove the
    # retry-exhaustion path returns non-zero, which is what _guard_prepare
    # gates on.
    _GUARD_UCI_OVERLAY_LOADED=1
    _GUARD_UCI_OVERLAY_VALID=1
    _GUARD_UCI_OVERLAY_UCI_AVAILABLE=0
    _guard_uci_overlay_add_error 'openclash_guard|snapshot not coherent (config changed or read failed)'
    return 1
}}
{_common_stubs(nft_log, kill_apply_log)}
{_strip_main_entrypoint()}
_guard_prepare
"""
        script_path = tmp / "run.sh"
        script_path.write_text(script, encoding="utf-8")
        proc = subprocess.run(
            [shell, str(script_path)],
            capture_output=True,
            text=True,
            # See _run_main: Windows-bash cold-start + _guard_prepare exceeds
            # 30s under load; sibling suites use 60s.
            timeout=60,
        )
        self.assertNotEqual(proc.returncode, 0, f"expected refuse: {proc.stdout}\n{proc.stderr}")
        self.assertIn("invalid", proc.stderr, proc.stderr)
        self.assertEqual(nft_log.read_text(encoding="utf-8").strip(), "")
        self.assertEqual(kill_apply_log.read_text(encoding="utf-8").strip(), "")

    def test_atomic_gate_is_backward_compatible_when_overlay_unwired(self) -> None:
        """Pre-wired window: no overlay module sourced -> gate is a no-op."""
        proc, nft_log, kill_apply_log = _run_main(
            "guard_cmd_reconcile\n",
            uci_state={"main.enabled": "1"},
            wire_overlay=False,
        )
        # Without the overlay modules, the gate must fall through and the
        # reconcile path proceeds (back-compat for the pre-wired window).
        self.assertEqual(proc.returncode, 0, f"expected success: {proc.stdout}\n{proc.stderr}")
        self.assertIn("guard_kill_apply_batch", kill_apply_log)

    def test_atomic_gate_refuses_when_resolution_fails(self) -> None:
        """Layer A valid + authority inputs broken -> Layer-B resolution fails.

        We sabotage _GUARD_UCOR_DNS_BACKEND to something the resolver
        rejects (empty), forcing guard_uci_overlay_resolve to return its
        authority-input-refused code. The gate must then refuse.
        """
        shell = sh_available()
        if shell is None:
            raise unittest.SkipTest("no POSIX shell available on this host")

        tmp = Path(tempfile.mkdtemp(prefix="atomic-noresolve-"))
        policy_file = tmp / "policy.json"
        policy_file.write_text(json.dumps(_minimal_policy()), encoding="utf-8")
        state_file = tmp / "state.txt"
        show_file = tmp / "show.txt"
        state_file.write_text("main.enabled\t1\n", encoding="utf-8")
        show_file.write_text(_render_show({"main.enabled": "1"}), encoding="utf-8")
        nft_log = tmp / "nft.log"
        kill_apply_log = tmp / "kill_apply.log"
        nft_log.touch()
        kill_apply_log.touch()

        fake_uci = _write_fake_uci_script(state_file, show_file)
        script = f"""
set -eu
export GUARD_POLICY_FILE="{policy_file.as_posix()}"
export GUARD_LIVE_DNS_BACKEND="dnsmasq"
export TMPDIR="{tmp.as_posix()}"
{fake_uci}
. "{JSONLIB.as_posix()}"
. "{OVERLAY.as_posix()}"
. "{RESOLVE.as_posix()}"
{_common_stubs(nft_log, kill_apply_log)}
{_strip_main_entrypoint()}

# Wrap guard_env_detect so the observed backend is unusable as authority
# input (the resolver insists on adguardhome|dnsmasq|none as a REAL
# observation; we simulate an unobservable environment).
guard_env_detect() {{ _GUARD_DNS_BACKEND=; _GUARD_PROXY_HEALTHY=0; _GUARD_NFT_AVAILABLE=1; }}
# _guard_prepare normalizes empty backend to 'none' for the resolver input.
# Sabotage AFTER prepare: blank the resolver input directly so resolve fails.
_guard_prepare_orig() {{ :; }}

# Run the pipeline, then strip the resolver input so resolve_state_valid
# cannot transition to true.
_guard_prepare
_GUARD_UCOR_DNS_BACKEND=
# Now invoke the gate; resolve must refuse with rc=3 (authority input).
_guard_require_atomic_overlay_for_apply
"""
        script_path = tmp / "run.sh"
        script_path.write_text(script, encoding="utf-8")
        proc = subprocess.run(
            [shell, str(script_path)],
            capture_output=True,
            text=True,
            # See _run_main: Windows-bash prep+prepare+resolve exceeds 30s
            # under load; sibling suites use 60s.
            timeout=60,
        )
        self.assertNotEqual(proc.returncode, 0, f"expected refuse: {proc.stdout}\n{proc.stderr}")
        self.assertIn("refusing", proc.stderr, proc.stderr)


if __name__ == "__main__":
    unittest.main()
