#!/bin/sh
# Restricted JSON get/keys/list. Prefers jsonfilter; POSIX awk fallback.
# Prefix: json_
set -eu

_JSON_MAX_DEPTH=64

_json_normalize_path() {
    printf '%s\n' "$1" | sed -e 's/^\$\.//' -e 's/^@\.//' -e 's/^\.//' -e 's/\[\([0-9][0-9]*\)\]/.\1/g'
}

_json_require_file() {
    if [ -z "${1:-}" ] || [ ! -f "$1" ]; then
        printf '%s\n' "json: not a file: ${1:-}" >&2
        return 1
    fi
}

_json_path_simple() {
    case $1 in
        ''|*[!A-Za-z0-9._]*)
            return 1
            ;;
        .*)
            return 1
            ;;
    esac
    return 0
}

_json_flatten_awk() {
    awk -v max_depth="$_JSON_MAX_DEPTH" '
        {
            src = src $0 "\n"
        }
        function peek() {
            return substr(src, pos, 1)
        }
        function skip(    c) {
            while (pos <= n) {
                c = substr(src, pos, 1)
                if (c == " " || c == "\t" || c == "\n" || c == "\r") {
                    pos++
                } else {
                    break
                }
            }
        }
        function fail(msg) {
            printf "json: %s\n", msg > "/dev/stderr"
            bad = 1
            exit 2
        }
        function escape_frame(value,    i, c, out) {
            out = ""
            for (i = 1; i <= length(value); i++) {
                c = substr(value, i, 1)
                if (c == "\\") {
                    out = out "\\\\"
                } else if (c == "\t") {
                    out = out "\\t"
                } else if (c == "\n") {
                    out = out "\\n"
                } else if (c == "\r") {
                    out = out "\\r"
                } else if (c == "\b") {
                    out = out "\\b"
                } else if (c == "\f") {
                    out = out "\\f"
                } else {
                    out = out c
                }
            }
            return out
        }
        function emit(path, val) {
            if (path == "") {
                return
            }
            print path "\t" escape_frame(val)
        }
        function parse_string(    c, out, hex) {
            if (peek() != "\"") {
                fail("expected string")
            }
            pos++
            out = ""
            while (pos <= n) {
                c = substr(src, pos, 1)
                pos++
                if (c == "\"") {
                    return out
                }
                if (c == "\\") {
                    if (pos > n) {
                        fail("unterminated string")
                    }
                    c = substr(src, pos, 1)
                    pos++
                    if (c == "n") {
                        out = out "\n"
                    } else if (c == "t") {
                        out = out "\t"
                    } else if (c == "r") {
                        out = out "\r"
                    } else if (c == "b") {
                        out = out "\b"
                    } else if (c == "f") {
                        out = out "\f"
                    } else if (c == "u") {
                        hex = substr(src, pos, 4)
                        if (length(hex) != 4 || hex ~ /[^0-9A-Fa-f]/) {
                            fail("invalid unicode escape")
                        }
                        fail("Unicode escape decoding requires a structured JSON parser")
                    } else if (c == "\"" || c == "\\" || c == "/") {
                        out = out c
                    } else {
                        fail("invalid string escape")
                    }
                    continue
                }
                if (c ~ /[[:cntrl:]]/) {
                    fail("unescaped control character in string")
                }
                out = out c
            }
            fail("unterminated string")
        }
        function parse_literal(    c, start, raw) {
            start = pos
            while (pos <= n) {
                c = substr(src, pos, 1)
                if (c ~ /[0-9A-Za-z.+-]/) {
                    pos++
                } else {
                    break
                }
            }
            raw = substr(src, start, pos - start)
            if (raw == "") {
                fail("expected value")
            }
            if (raw == "true" || raw == "false" || raw == "null") {
                return raw
            }
            if (raw !~ /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/) {
                fail("invalid JSON literal")
            }
            return raw
        }
        function enter_container() {
            depth++
            if (depth > max_depth) {
                fail("JSON nesting exceeds supported depth")
            }
        }
        function parse_object(prefix,    key, child, c, nkeys) {
            if (peek() != "{") {
                fail("expected object")
            }
            enter_container()
            pos++
            skip()
            nkeys = 0
            if (peek() == "}") {
                pos++
                if (prefix != "") {
                    emit(prefix, "{}")
                }
                depth--
                return
            }
            while (pos <= n) {
                skip()
                key = parse_string()
                if (key ~ /[[:cntrl:]]/) {
                    fail("object key contains unsupported control characters")
                }
                skip()
                if (peek() != ":") {
                    fail("expected colon")
                }
                pos++
                skip()
                if (prefix == "") {
                    child = key
                } else {
                    child = prefix "." key
                }
                parse_value(child)
                nkeys++
                skip()
                c = peek()
                if (c == ",") {
                    pos++
                    continue
                }
                if (c == "}") {
                    pos++
                    depth--
                    return
                }
                fail("expected comma or }")
            }
            fail("unterminated object")
        }
        function parse_array(prefix,    i, child, c) {
            if (peek() != "[") {
                fail("expected array")
            }
            enter_container()
            pos++
            skip()
            i = 0
            if (peek() == "]") {
                pos++
                if (prefix != "") {
                    emit(prefix, "[]")
                }
                depth--
                return
            }
            while (pos <= n) {
                skip()
                child = prefix "." i
                parse_value(child)
                i++
                skip()
                c = peek()
                if (c == ",") {
                    pos++
                    continue
                }
                if (c == "]") {
                    pos++
                    depth--
                    return
                }
                fail("expected comma or ]")
            }
            fail("unterminated array")
        }
        function parse_value(prefix,    c) {
            skip()
            c = peek()
            if (c == "{") {
                parse_object(prefix)
                return
            }
            if (c == "[") {
                parse_array(prefix)
                return
            }
            if (c == "\"") {
                emit(prefix, parse_string())
                return
            }
            emit(prefix, parse_literal())
        }
        END {
            n = length(src)
            pos = 1
            bad = 0
            depth = 0
            skip()
            if (pos > n) {
                fail("empty JSON")
            }
            parse_value("")
            skip()
            if (pos <= n && peek() != "") {
                fail("trailing JSON content")
            }
        }
    ' "$1"
}

_JSON_FLAT_PATH=
_JSON_FLAT_DATA=

json_load() {
    _json_require_file "${1:-}" || return $?
    if [ "$1" = "$_JSON_FLAT_PATH" ] && [ -n "$_JSON_FLAT_DATA" ]; then
        return 0
    fi
    _JSON_FLAT_PATH=
    _JSON_FLAT_DATA=
    _JSON_FLAT_DATA=$(_json_flatten_awk "$1") || {
        _JSON_FLAT_DATA=
        return 1
    }
    _JSON_FLAT_PATH=$1
}

_json_flat() {
    json_load "$1" || return $?
    printf '%s\n' "$_JSON_FLAT_DATA"
}

json_get() {
    _json_jg_file=${1:-}
    _json_jg_path=${2:-}
    _json_require_file "$_json_jg_file" || return $?
    if [ -z "$_json_jg_path" ]; then
        printf '%s\n' "json_get: missing path" >&2
        return 2
    fi
    _json_jg_path=$(_json_normalize_path "$_json_jg_path")
    if [ -z "${JSON_FORCE_AWK:-}" ] && command -v jsonfilter >/dev/null 2>&1 && _json_path_simple "$_json_jg_path"; then
        _json_jg_out=$(jsonfilter -i "$_json_jg_file" -e "@.$_json_jg_path" 2>/dev/null) || _json_jg_out=
        if [ -n "$_json_jg_out" ]; then
            printf '%s\n' "$_json_jg_out"
            return 0
        fi
    fi
    _json_flat "$_json_jg_file" | awk -F '\t' -v q="$_json_jg_path" '
        function fail() {
            printf "%s\n", "json: invalid flattened value escape" > "/dev/stderr"
            exit 2
        }
        function decode(value,    i, c, escape_char, out) {
            out = ""
            for (i = 1; i <= length(value); i++) {
                c = substr(value, i, 1)
                if (c != "\\") {
                    out = out c
                    continue
                }
                i++
                if (i > length(value)) fail()
                escape_char = substr(value, i, 1)
                if (escape_char == "\\") out = out "\\"
                else if (escape_char == "t") out = out "\t"
                else if (escape_char == "n") out = out "\n"
                else if (escape_char == "r") out = out "\r"
                else if (escape_char == "b") out = out "\b"
                else if (escape_char == "f") out = out "\f"
                else fail()
            }
            return out
        }
        $1 == q {
            print decode(substr($0, index($0, "\t") + 1))
            found = 1
            exit 0
        }
        END {
            if (!found) {
                exit 1
            }
        }
    '
}

json_has() {
    _json_jh_file=${1:-}
    _json_jh_path=${2:-}
    _json_require_file "$_json_jh_file" || return $?
    if [ -z "$_json_jh_path" ]; then
        return 2
    fi
    _json_jh_path=$(_json_normalize_path "$_json_jh_path")
    _json_flat "$_json_jh_file" | awk -F '\t' -v q="$_json_jh_path" '
        $1 == q { found = 1; exit 0 }
        index($1, q ".") == 1 { found = 1; exit 0 }
        END { if (!found) exit 1 }
    '
}

json_keys() {
    _json_jk_file=${1:-}
    _json_jk_path=${2:-}
    _json_require_file "$_json_jk_file" || return $?
    _json_jk_path=$(_json_normalize_path "$_json_jk_path")
    _json_flat "$_json_jk_file" | awk -F '\t' -v p="$_json_jk_path" '
        {
            key = $1
            if (p == "") {
                rest = key
            } else if (key == p) {
                next
            } else if (index(key, p ".") == 1) {
                rest = substr(key, length(p) + 2)
            } else {
                next
            }
            split(rest, parts, ".")
            child = parts[1]
            if (child == "" || seen[child]++) {
                next
            }
            print child
        }
    '
}

json_list() {
    _json_jl_file=${1:-}
    _json_jl_path=${2:-}
    _json_require_file "$_json_jl_file" || return $?
    if [ -z "$_json_jl_path" ]; then
        printf '%s\n' "json_list: missing path" >&2
        return 2
    fi
    _json_jl_path=$(_json_normalize_path "$_json_jl_path")
    _json_flat "$_json_jl_file" | awk -F '\t' -v p="$_json_jl_path" '
        function fail() {
            printf "%s\n", "json: invalid flattened value escape" > "/dev/stderr"
            exit 2
        }
        function decode(value,    i, c, escape_char, out) {
            out = ""
            for (i = 1; i <= length(value); i++) {
                c = substr(value, i, 1)
                if (c != "\\") {
                    out = out c
                    continue
                }
                i++
                if (i > length(value)) fail()
                escape_char = substr(value, i, 1)
                if (escape_char == "\\") out = out "\\"
                else if (escape_char == "t") out = out "\t"
                else if (escape_char == "n") out = out "\n"
                else if (escape_char == "r") out = out "\r"
                else if (escape_char == "b") out = out "\b"
                else if (escape_char == "f") out = out "\f"
                else fail()
            }
            return out
        }
        $1 == p && $2 == "[]" { empty = 1; next }
        {
            prefix = p "."
            if (index($1, prefix) != 1) {
                next
            }
            rest = substr($1, length(prefix) + 1)
            if (rest ~ /^[0-9]+$/) {
                val = substr($0, index($0, "\t") + 1)
                items[rest + 0] = val
                if (rest + 0 > max) {
                    max = rest + 0
                }
                found = 1
            }
        }
        END {
            if (empty && !found) {
                exit 0
            }
            if (!found) {
                exit 1
            }
            for (i = 0; i <= max; i++) {
                if (i in items) {
                    value = decode(items[i])
                    if (index(value, "\n") > 0) {
                        printf "%s\n", "json: json_list cannot frame values containing newlines" > "/dev/stderr"
                        exit 2
                    }
                    print value
                }
            }
        }
    '
}
