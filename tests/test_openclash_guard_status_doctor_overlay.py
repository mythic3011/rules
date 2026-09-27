"""Positive tests for the canonical UCI overlay diagnostics wired into
`status --json` and `doctor` (guard-side `guard_status_uci_overlay_json` /
`guard_doctor_uci_overlay`). Verify:

  1. status JSON carries a top-level `uciOverlay` block whose `errors[]` and
     `unknownOptions[]` are redacted (path + reason only). Raw values,
     profile URLs, credentials, query strings, and profile tokens NEVER
     appear anywhere in the payload.
  2. `authorityInputs` is present and boolean-only.
  3. Bounded `effective` includes only the resolved keys (routing.chatgpt /
     claude / grok, dns.fail_closed, dns.backend) when a completed Layer-B
     resolution exists, and never leaks DEFERRED:* values.
  4. Doctor (human-readable) prints invalid known options as
     "<path>: <reason>" and unknown options as
     "unknown option ignored: <path>", without printing raw values.
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
OVERLAY = ROOT / "shell" / "apps" / "openclash-guard" / "uci-overlay.sh"
RESOLVE = ROOT / "shell" / "apps" / "openclash-guard" / "uci-overlay-resolve.sh"
JSONLIB = ROOT / "shell" / "lib" / "json.sh"
MAIN = ROOT / "shell" / "apps" / "openclash-guard" / "main.sh"
ENV_SH = ROOT / "shell" / "apps" / "openclash-guard" / "environment.sh"
CLI = ROOT / "shell" / "lib" / "cli.sh"


def sh_available() -> str | None:
    return shutil.which("bash") or shutil.which("sh")


def make_fake_uci(state: dict[str, object], tmp: Path) -> str:
    """Build a `uci()` shell function that serves the given UCI state.
    State is written to on-disk files in tmp so the in-shell state is never
    escaped through a single shell variable (which would lose newlines /.).

    Three files are written:
      - show.txt  : byte-faithful `uci show` output (sections + option lines)
      - get.txt   : "path\\tvalue" rows for `uci -q get`
      - list.txt  : "path\\tvalue" rows for `uci -d <nl> -q get` (one per item)
    """
    lines_show: list[str] = []
    sections = sorted({path.split(".")[0] for path in state})
    for s in sections:
        lines_show.append(f"openclash_guard.{s}=openclash_guard")

    get_rows: list[str] = []
    list_rows: list[str] = []
    for path, value in state.items():
        if isinstance(value, list):
            for item in value:
                list_rows.append(f"{path}\t{item}")
                safe = str(item).replace("'", "'\\''")
                lines_show.append(f"openclash_guard.{path}='{safe}'")
        else:
            get_rows.append(f"{path}\t{value}")
            safe = str(value).replace("'", "'\\''")
            lines_show.append(f"openclash_guard.{path}='{safe}'")
    show_text = "\n".join(lines_show) + ("\n" if lines_show else "")
    get_text = "\n".join(get_rows) + ("\n" if get_rows else "")
    list_text = "\n".join(list_rows) + ("\n" if list_rows else "")

    show_path = (tmp / "show.txt").as_posix()
    get_path = (tmp / "get.txt").as_posix()
    list_path = (tmp / "list.txt").as_posix()
    Path(tmp / "show.txt").write_text(show_text, encoding="utf-8")
    Path(tmp / "get.txt").write_text(get_text, encoding="utf-8")
    Path(tmp / "list.txt").write_text(list_text, encoding="utf-8")

    return f"""
GUARD_SHOW_FILE='{show_path}'
GUARD_GET_FILE='{get_path}'
GUARD_LIST_FILE='{list_path}'
uci() {{
    case "$1" in
        show)
            if [ "$2" = openclash_guard ] || [ -z "$2" ]; then
                if [ ! -s "$GUARD_SHOW_FILE" ]; then
                    printf 'uci: Entry not found\\n' >&2
                    return 1
                fi
                cat "$GUARD_SHOW_FILE"
                return 0
            fi
            printf 'uci: Entry not found\\n' >&2
            return 1
            ;;
        -q)
            if [ "$2" = get ]; then
                opt="${{3#openclash_guard.}}"
                line=$(awk -F '\\t' -v o="$opt" '$1==o {{ print $2; exit }}' "$GUARD_GET_FILE")
                if [ -z "$line" ]; then
                    printf 'uci: Entry not found\\n' >&2
                    return 1
                fi
                printf '%s\\n' "$line"
                return 0
            fi
            ;;
        -d)
            opt="${{5#openclash_guard.}}"
            got=$(awk -F '\\t' -v o="$opt" '$1==o {{ print $2 }}' "$GUARD_LIST_FILE")
            if [ -z "$got" ]; then
                printf 'uci: Entry not found\\n' >&2
                return 1
            fi
            printf '%s\\n' "$got"
            return 0
            ;;
    esac
    return 0
}}
"""


def _main_stripped_path(tmp: Path) -> Path:
    """Write main.sh to tmp with the trailing `main "$@"` dispatch line
    stripped, so it can be sourced as a library without invoking dispatch."""
    main_text = MAIN.read_text(encoding="utf-8")
    for terminator in ('main "$@"\n', 'main "$@"'):
        if main_text.endswith(terminator):
            main_text = main_text[: -len(terminator)]
            break
    out = tmp / "main-nodispatch.sh"
    out.write_text(main_text, encoding="utf-8")
    return out


def _bundle_with_stubs(tmp: Path) -> str:
    """Build the minimal shell bundle needed to call guard_status_uci_overlay_json
    / guard_doctor_uci_overlay."""
    main_p = _main_stripped_path(tmp)
    return (
        "set -eu\n"
        f'. "{JSONLIB.as_posix()}"\n'
        f'. "{CLI.as_posix()}"\n'
        f'. "{ENV_SH.as_posix()}"\n'
        f'. "{OVERLAY.as_posix()}"\n'
        f'. "{RESOLVE.as_posix()}"\n'
        f'. "{main_p.as_posix()}"\n'
    )


def run_status_overlay(
    uci_state: dict[str, object],
    policy: dict | None,
    dns_backend: str,
    script_body: str,
) -> subprocess.CompletedProcess:
    shell = sh_available()
    if shell is None:
        raise unittest.SkipTest("no POSIX shell available on this host")
    tmp = Path(tempfile.mkdtemp(prefix="uco-status-doctor-"))
    policy_env = ""
    if policy is not None:
        policy_file = tmp / "policy.json"
        policy_file.write_text(json.dumps(policy), encoding="utf-8")
        policy_env = f'_GUARD_UCOR_POLICY_FILE="{policy_file.as_posix()}"\n'
    fake = make_fake_uci(uci_state, tmp)
    full = (
        "set -eu\n"
        + fake
        + _bundle_with_stubs(tmp)
        + policy_env
        + f'_GUARD_UCOR_DNS_BACKEND="{dns_backend}"\n'
        + script_body
        + "\n"
    )
    return subprocess.run(
        [shell, "-c", full],
        capture_output=True,
        text=True,
        timeout=60,
        env={**os.environ, "GUARD_NO_COLOR": "1"},
    )


def base_policy() -> dict:
    return {
        "schemaVersion": 1,
        "services": {
            "chatgpt": {"protectionClass": "default", "allowedRegions": ["us"]},
            "claude": {"protectionClass": "default", "allowedRegions": ["us"]},
            "grok": {"protectionClass": "default", "allowedRegions": ["us"]},
        },
        "protectionClasses": {
            "default": {
                "directAllowed": True,
                "firewallKillSwitch": False,
                "failMode": "reject",
            }
        },
    }


def status_overlay_json(
    uci_state: dict[str, object],
    policy: dict | None = None,
    dns_backend: str = "none",
    resolve: bool = False,
) -> dict:
    """Run guard_status_uci_overlay_json against the given UCI state and
    return the parsed inner uciOverlay object."""
    body = "guard_uci_overlay_load || true\n"
    if resolve:
        body += "guard_uci_overlay_resolve 2>/dev/null || true\n"
    body += 'printf "{%s}\\n" "$(guard_status_uci_overlay_json)"\n'
    proc = run_status_overlay(uci_state, policy, dns_backend, body)
    if proc.returncode != 0:
        raise AssertionError(
            f"shell failed: rc={proc.returncode}\nstdout={proc.stdout}\nstderr={proc.stderr}"
        )
    return json.loads(proc.stdout.strip())


class StatusOverlayJsonTests(unittest.TestCase):
    def test_envelope_shape_and_redaction_with_invalid_sensitive_url(self) -> None:
        """Invalid known option (sensitive URL) -> error surfaces path+reason
        only; never the URL, credentials, query, or token."""
        secret_url = "http://user:secret@example.com/path?profileToken=abc123foo"
        state = {
            "main.enabled": "1",
            # http (not https) + creds + query: triple-sensitive; must be rejected
            "main.profile_url": secret_url,
        }
        out = status_overlay_json(state)
        overlay = out["uciOverlay"]
        self.assertFalse(overlay["valid"])
        self.assertTrue(overlay["available"])
        # Exactly one error path+reason; the URL is not in it.
        paths = [e["option"] for e in overlay["errors"]]
        self.assertIn("main.profile_url", paths)
        text = json.dumps(out)
        for needle in (
            "example.com",
            "secret",
            "abc123",
            "profileToken",
            "user:",
            secret_url,
        ):
            self.assertNotIn(needle, text, f"sensitive substring leaked: {needle!r}")
        self.assertIn("authorityInputs", overlay)
        self.assertIn("policy", overlay["authorityInputs"])
        self.assertIn("dns", overlay["authorityInputs"])
        self.assertIn("effective", overlay)
        self.assertEqual(overlay["effective"], {})

    def test_unknown_option_does_not_invalidate_and_is_reported(self) -> None:
        state = {"main.enabled": "1", "main.unknown_knob": "zzz"}
        out = status_overlay_json(state)
        overlay = out["uciOverlay"]
        self.assertTrue(overlay["valid"])
        unknown = [u["option"] for u in overlay["unknownOptions"]]
        self.assertIn("main.unknown_knob", unknown)
        # The unknown value must NOT be surfaced.
        text = json.dumps(out)
        self.assertNotIn("zzz", text)

    def test_effective_is_bounded_and_skips_deferred(self) -> None:
        """When a completed Layer-B resolution exists, `effective` is bounded
        to routing.chatgpt/claude/grok, dns.fail_closed, dns.backend. DEFERRED:*
        contract-gap options (udp.enabled, udp.src_ip, routing.direct_region,
        routing.proxy_region, dns.resolver_sync) are never emitted."""
        state = {
            "main.enabled": "1",
            "routing.chatgpt": "direct",
            "routing.direct_region": "hk",
            "dns.fail_closed": "1",
            "dns.backend": "auto",
            "udp.enabled": "1",
            "udp.src_ip": ["192.168.1.10", "192.168.1.11"],
            "dns.resolver_sync": "1",
        }
        out = status_overlay_json(state, policy=base_policy(), dns_backend="dnsmasq", resolve=True)
        overlay = out["uciOverlay"]
        # Bounded effective surface
        effective = overlay.get("effective", {})
        text = json.dumps(out)
        self.assertNotIn("DEFERRED", text)
        # The bounded set may include any of the resolved keys; ensure no
        # contract-gap options appear via the *effective* projection. The
        # overlay errors/unknown arrays carry PATHS only (no raw values), so
        # they WILL include strings like 'udp.enabled' or 'udp.src_ip' as
        # PATHS if those options were invalid. Our state is valid, so the
        # errors array remains empty.
        self.assertEqual(overlay["errors"], [])
        # Effective is either empty (resolver not resolved) or one of the
        # bounded resolved keys — never contains DEFERRED-marker strings.
        for k, v in effective.items():
            self.assertIn(
                k,
                {
                    "routing_chatgpt",
                    "routing_claude",
                    "routing_grok",
                    "dns_fail_closed",
                    "dns_backend",
                },
                f"effective contains an unbounded key: {k}",
            )
            self.assertFalse(str(v).startswith("DEFERRED"))
        # The src_ip value list must not appear in effective.
        self.assertNotIn("192.168.1.10", text)
        self.assertNotIn("192.168.1.11", text)

    def test_no_profile_token_or_query_under_any_path(self) -> None:
        """Even when an option is unknown, raw values containing tokens
        must not be surfaced."""
        state = {
            "main.enabled": "1",
            "main.profile_url_x": "https://example.com/x?profileToken=zzz999",
        }
        out = status_overlay_json(state)
        text = json.dumps(out)
        self.assertNotIn("zzz999", text)
        self.assertNotIn("profileToken=", text)


class DoctorOverlayHumanTests(unittest.TestCase):
    def _run_doctor_overlay(self, uci_state: dict[str, object]) -> subprocess.CompletedProcess:
        body = "guard_doctor_uci_overlay\n"
        return run_status_overlay(uci_state, base_policy(), "none", body)

    def test_invalid_known_option_is_printed_as_path_reason(self) -> None:
        proc = self._run_doctor_overlay({"main.enabled": "1", "routing.claude": "bogus"})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        # cli_warn writes to stderr; cli_info to stdout. Combine both.
        out = proc.stdout + proc.stderr
        # Must warn with "<path>: <reason>" pattern; the invalid raw value
        # ("bogus") must NOT appear in the human-readable output.
        self.assertIn("routing.claude", out)
        self.assertIn("warn:", out)
        # The enumeration of allowed values IS the reason text (not sensitive).
        # But the literal raw value the operator supplied must not be echoed.
        self.assertNotIn(": bogus", out)
        self.assertNotIn("'", out)

    def test_unknown_option_is_printed_as_unknown_ignored(self) -> None:
        proc = self._run_doctor_overlay(
            {"main.enabled": "1", "main.unknown_knob": "zzz"}
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        out = proc.stdout
        self.assertIn("unknown option ignored: main.unknown_knob", out)
        # The raw value must not appear.
        self.assertNotIn("zzz", out)

    def test_no_secret_leakage_in_doctor_output(self) -> None:
        secret = "abc123XYZ"
        secret_url = f"http://u:p@example.com/x?profileToken={secret}"
        state = {
            "main.enabled": "1",
            "main.profile_url": secret_url,
        }
        proc = self._run_doctor_overlay(state)
        out = proc.stdout + proc.stderr
        for needle in ("example.com", secret, "profileToken"):
            self.assertNotIn(needle, out, f"doctor leaked {needle!r}")


if __name__ == "__main__":
    unittest.main()
