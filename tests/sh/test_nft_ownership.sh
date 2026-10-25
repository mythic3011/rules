#!/bin/sh
set -eu

_test_root=$(CDPATH= cd "$(dirname "$0")/../.." && pwd)
. "$_test_root/shell/lib/nft.sh"

_nft_owned_name guard guard
if _nft_owned_name guardian_data guard; then
    printf '%s\n' "bare prefix claimed a foreign object" >&2
    exit 1
fi
_nft_owned_name guard-v6 guard
_nft_owned_name guard_backup guard
_nft_owned_name guard.v6 guard
if _nft_owned_name guard- guard; then
    printf '%s\n' "empty separator suffix was accepted" >&2
    exit 1
fi
_nft_owned_name guard-v6 guard-

_nft_comment_owned openclash-guard:rule openclash-guard
if _nft_comment_owned openclash-guardian:rule openclash-guard; then
    printf '%s\n' "comment prefix collision was accepted" >&2
    exit 1
fi

printf '%s\n' "nft ownership tests passed"
