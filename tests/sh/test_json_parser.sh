#!/bin/sh
set -eu

_test_root=$(CDPATH= cd "$(dirname "$0")/../.." && pwd)
. "$_test_root/shell/lib/json.sh"
JSON_FORCE_AWK=1
export JSON_FORCE_AWK

_test_tmp=$(mktemp -d)
trap 'rm -f "$_test_tmp"/*.json; rmdir "$_test_tmp"' 0

_test_doc=$_test_tmp/valid.json
printf '%s\n' '{"message":"first\tsecond\nthird\\tail","after":"safe","url":"https:\/\/example.invalid","items":["tab\tvalue","plain"]}' > "$_test_doc"
_test_message=$(json_get "$_test_doc" message)
_test_expected=$(printf 'first\tsecond\nthird\\tail')
[ "$_test_message" = "$_test_expected" ]
[ "$(json_get "$_test_doc" after)" = safe ]
[ "$(json_get "$_test_doc" url)" = https://example.invalid ]
_test_items=$(json_list "$_test_doc" items)
_test_expected_items=$(printf 'tab\tvalue\nplain')
[ "$_test_items" = "$_test_expected_items" ]

for _test_literal in truely nulll 123abc 01 1.2.3 +1 NaN 1e -
do
    _test_invalid=$_test_tmp/invalid-$_test_literal.json
    printf '{"value":%s}\n' "$_test_literal" > "$_test_invalid"
    if json_load "$_test_invalid"; then
        printf '%s\n' "json parser accepted invalid literal" >&2
        exit 1
    fi
done

_test_invalid_key=$_test_tmp/invalid-key.json
printf '%s\n' '{"bad\tkey":1}' > "$_test_invalid_key"
if json_load "$_test_invalid_key"; then
    printf '%s\n' "json parser accepted an unsupported key" >&2
    exit 1
fi
printf '%s\n' '{"unicode\u0009key":1}' > "$_test_invalid_key"
if json_load "$_test_invalid_key"; then
    printf '%s\n' "json parser accepted an unsupported escaped key" >&2
    exit 1
fi

_test_deep=$_test_tmp/deep.json
_test_deep_json=0
_test_depth=0
while [ "$_test_depth" -lt 80 ]
do
    _test_deep_json="[$_test_deep_json]"
    _test_depth=$((_test_depth + 1))
done
printf '%s\n' "$_test_deep_json" > "$_test_deep"
if json_load "$_test_deep"; then
    printf '%s\n' "json parser accepted excessive nesting" >&2
    exit 1
fi

printf '%s\n' "json parser tests passed"
