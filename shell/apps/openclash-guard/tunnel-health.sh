#!/bin/sh
# Read-only health probe for Guard-owned OpenClash classified tunnel egress.
# Prefix: guard_health_tunnel_
set -eu

_GUARD_HEALTH_TUN_EXPECTED=0
_GUARD_HEALTH_TUN_STATE=inactive
_GUARD_HEALTH_TUN_MARK=
_GUARD_HEALTH_TUN_IFACES=
_GUARD_HEALTH_TUN_RULES=not-required
_GUARD_HEALTH_TUN_REASON=

_guard_health_tunnel_reset() {
    _GUARD_HEALTH_TUN_EXPECTED=0
    _GUARD_HEALTH_TUN_STATE=inactive
    _GUARD_HEALTH_TUN_MARK=
    _GUARD_HEALTH_TUN_IFACES=
    _GUARD_HEALTH_TUN_RULES=not-required
    _GUARD_HEALTH_TUN_REASON=
}

_guard_health_tunnel_fail() {
    _GUARD_HEALTH_TUN_STATE=failed
    _GUARD_HEALTH_TUN_REASON=$1
    return 1
}

_guard_health_tunnel_comment_count() {
    _guard_htcc_listing=$1
    _guard_htcc_suffix=$2
    printf '%s\n' "$_guard_htcc_listing" | awk \
        -v marker="comment \"${_GUARD_NFT_PREFIX}:${_guard_htcc_suffix}\"" \
        'index($0, marker) { count++ } END { print count + 0 }'
}

_guard_health_tunnel_anchor_line() {
    _guard_htal_listing=$1
    _guard_htal_suffix=$2
    printf '%s\n' "$_guard_htal_listing" | awk \
        -v marker="comment \"${_GUARD_NFT_PREFIX}:${_guard_htal_suffix}\"" \
        'index($0, marker) { print NR; exit }'
}

_guard_health_tunnel_iface_comment_count() {
    _guard_htic_listing=$1
    _guard_htic_iface=$2
    printf '%s\n' "$_guard_htic_listing" | awk \
        -v marker="comment \"${_GUARD_NFT_PREFIX}:tunnel-egress\"" \
        -v iface="oifname \"${_guard_htic_iface}\"" \
        'index($0, marker) && index($0, iface) { count++ } END { print count + 0 }'
}

_guard_health_tunnel_exact_rule_line() {
    _guard_hter_listing=$1
    _guard_hter_mark=$2
    _guard_hter_iface=$3
    printf '%s\n' "$_guard_hter_listing" | awk \
        -v marker="comment \"${_GUARD_NFT_PREFIX}:tunnel-egress\"" \
        -v expected="$_guard_hter_mark" \
        -v iface="oifname \"${_guard_hter_iface}\"" '
        function normalize_mark(raw, hex) {
            hex = tolower(raw)
            sub(/^0x/, "", hex)
            if (hex !~ /^[0-9a-f]+$/ || length(hex) > 8) {
                return ""
            }
            sub(/^0+/, "", hex)
            if (hex == "") {
                hex = "0"
            }
            return "0x" hex
        }
        BEGIN { wanted = normalize_mark(expected) }
        index($0, marker) && index($0, iface) &&
        $0 ~ /(^|[[:space:]])accept([[:space:]]|$)/ {
            value = ""
            if (match($0, /meta mark 0x[0-9A-Fa-f]+/)) {
                value = substr($0, RSTART, RLENGTH)
                sub(/^meta mark /, "", value)
                value = normalize_mark(value)
            }
            if (wanted != "" && value == wanted) {
                print NR
                exit
            }
        }
    '
}

guard_health_tunnel_probe() {
    _guard_htp_mark=${1:-}
    _guard_htp_ifaces=${2:-}
    _GUARD_HEALTH_TUN_STATE=failed
    _GUARD_HEALTH_TUN_REASON=
    _GUARD_HEALTH_TUN_RULES=missing

    [ -n "$_guard_htp_mark" ] || {
        _guard_health_tunnel_fail generic-mark-unavailable
        return $?
    }
    [ -n "$_guard_htp_ifaces" ] || {
        _guard_health_tunnel_fail openclash-tun-interface-unavailable
        return $?
    }
    command -v nft >/dev/null 2>&1 || {
        _guard_health_tunnel_fail nft-unavailable
        return $?
    }

    _guard_htp_listing=$(nft -a list chain \
        "$_GUARD_NFT_FAMILY" "$_GUARD_NFT_TABLE" forward 2>/dev/null) || {
        _guard_health_tunnel_fail guard-forward-unavailable
        return $?
    }

    _guard_htp_protected_count=$(_guard_health_tunnel_comment_count "$_guard_htp_listing" protected-udp)
    _guard_htp_kill_count=$(_guard_health_tunnel_comment_count "$_guard_htp_listing" kill-switch)
    if [ "$_guard_htp_protected_count" -ne 1 ]; then
        _GUARD_HEALTH_TUN_RULES=malformed
        _guard_health_tunnel_fail protected-udp-anchor-invalid
        return $?
    fi
    if [ "$_guard_htp_kill_count" -ne 1 ]; then
        _GUARD_HEALTH_TUN_RULES=malformed
        _guard_health_tunnel_fail kill-switch-anchor-invalid
        return $?
    fi
    _guard_htp_protected=$(_guard_health_tunnel_anchor_line "$_guard_htp_listing" protected-udp)
    _guard_htp_kill=$(_guard_health_tunnel_anchor_line "$_guard_htp_listing" kill-switch)
    if [ "$_guard_htp_protected" -ge "$_guard_htp_kill" ]; then
        _GUARD_HEALTH_TUN_RULES=misordered
        _guard_health_tunnel_fail guard-anchor-order-invalid
        return $?
    fi

    _guard_htp_expected=0
    _guard_htp_ok=1
    for _guard_htp_iface in $_guard_htp_ifaces
    do
        _guard_htp_expected=$((_guard_htp_expected + 1))
        _guard_htp_iface_count=$(_guard_health_tunnel_iface_comment_count "$_guard_htp_listing" "$_guard_htp_iface")
        if [ "$_guard_htp_iface_count" -eq 0 ]; then
            _GUARD_HEALTH_TUN_RULES=missing
            _GUARD_HEALTH_TUN_REASON="missing-interface-$_guard_htp_iface"
            _guard_htp_ok=0
            break
        fi
        if [ "$_guard_htp_iface_count" -ne 1 ]; then
            _GUARD_HEALTH_TUN_RULES=duplicate
            _GUARD_HEALTH_TUN_REASON="duplicate-interface-$_guard_htp_iface"
            _guard_htp_ok=0
            break
        fi
        _guard_htp_line=$(_guard_health_tunnel_exact_rule_line \
            "$_guard_htp_listing" "$_guard_htp_mark" "$_guard_htp_iface")
        if [ -z "$_guard_htp_line" ]; then
            _GUARD_HEALTH_TUN_RULES=malformed
            _GUARD_HEALTH_TUN_REASON="malformed-interface-$_guard_htp_iface"
            _guard_htp_ok=0
            break
        fi
        if [ "$_guard_htp_line" -le "$_guard_htp_protected" ] || [ "$_guard_htp_line" -ge "$_guard_htp_kill" ]; then
            _GUARD_HEALTH_TUN_RULES=misordered
            _GUARD_HEALTH_TUN_REASON="misordered-interface-$_guard_htp_iface"
            _guard_htp_ok=0
            break
        fi
    done

    if [ "$_guard_htp_ok" != 1 ]; then
        _GUARD_HEALTH_TUN_STATE=failed
        return 1
    fi

    _guard_htp_total=$(_guard_health_tunnel_comment_count "$_guard_htp_listing" tunnel-egress)
    if [ "$_guard_htp_total" -ne "$_guard_htp_expected" ]; then
        _GUARD_HEALTH_TUN_RULES=unexpected
        _guard_health_tunnel_fail unexpected-tunnel-egress-rule
        return $?
    fi

    _GUARD_HEALTH_TUN_RULES=present
    _GUARD_HEALTH_TUN_STATE=ready
    return 0
}

guard_health_tunnel_assess() {
    _guard_health_tunnel_reset
    guard_env_detect

    if [ "${_GUARD_OC_HEALTHY:-0}" != 1 ]; then
        _GUARD_HEALTH_TUN_REASON=openclash-unhealthy
        return 0
    fi

    _guard_hta_policy=$(_guard_policy_default_path)
    if ! guard_policy_load "$_guard_hta_policy" >/dev/null 2>&1; then
        _GUARD_HEALTH_TUN_REASON=runtime-policy-unavailable
        return 0
    fi
    if [ "${_GUARD_POLICY_ENFORCEMENT:-}" != reject ]; then
        _GUARD_HEALTH_TUN_REASON=fail-closed-policy-inactive
        return 0
    fi
    if [ "${_GUARD_NFT_AVAILABLE:-0}" != 1 ]; then
        _GUARD_HEALTH_TUN_REASON=nft-unavailable
        return 0
    fi

    _guard_hta_mark=$(_guard_kill_openclash_tunnel_mark 2>/dev/null) || _guard_hta_mark=
    if [ -z "$_guard_hta_mark" ]; then
        _GUARD_HEALTH_TUN_REASON=generic-mark-unavailable
        return 0
    fi
    _guard_hta_ifaces=$(_guard_kill_openclash_tunnel_ifaces 2>/dev/null) || _guard_hta_ifaces=
    if [ -z "$_guard_hta_ifaces" ]; then
        _GUARD_HEALTH_TUN_REASON=openclash-tun-interface-unavailable
        return 0
    fi

    _GUARD_HEALTH_TUN_EXPECTED=1
    _GUARD_HEALTH_TUN_MARK=$_guard_hta_mark
    _GUARD_HEALTH_TUN_IFACES=$_guard_hta_ifaces
    guard_health_tunnel_probe "$_guard_hta_mark" "$_guard_hta_ifaces"
}
