#!/bin/sh
# Deliberately non-mutating Phase 4 controller entrypoint.
#
# There is no safe authority for a POSIX shell to trust a mutable local plan,
# deployment JSON, egress binding file, and live Mihomo response as one atomic
# proof. In particular, a shell must never infer an account lock path or target
# from those files and then issue a GET/PUT. The typed validator can prepare
# evidence, but a future adapter must verify a signed/prevalidated live-proof
# artifact before this entrypoint is allowed to reconcile.
set -eu

die() { printf '%s\n' "ai-routing-controller: $*" >&2; exit 1; }

preview() {
  printf '%s\n' "DRY-RUN controller reconciliation is disabled pending a prevalidated live-proof artifact"
  printf '%s\n' "DRY-RUN no controller API, secret file, local binding, or runtime-state input is read"
  printf '%s\n' "DRY-RUN account-protected selectors remain REJECT; no node can be activated"
}

case "${1:-}" in
  --dry-run) preview ;;
  --reconcile) die "reconcile is disabled until a separately validated live-proof artifact authorizes an immutable REJECT-only lock plan" ;;
  *) die "use --dry-run; --reconcile is intentionally disabled" ;;
esac
