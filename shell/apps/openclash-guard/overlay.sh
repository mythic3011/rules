#!/bin/sh
# Guard-owned OpenClash custom-overwrite integration for staged rule providers.
# Prefix: guard_overlay_
set -eu

_GUARD_OVERLAY_BEGIN="# BEGIN openclash-guard rules"
_GUARD_OVERLAY_END="# END openclash-guard rules"
_GUARD_OVERLAY_RUNTIME_BIN=${GUARD_OVERLAY_RUNTIME_BIN:-/usr/bin/openclash-guard}

guard_overlay_provider_specs() {
    printf '%s\n' \
        "Custom_Direct_Domain domain Custom_Direct_Domain.yaml" \
        "Custom_Direct_Classical_IP classical Custom_Direct_Classical_IP.yaml" \
        "Custom_Proxy_Domain domain Custom_Proxy_Domain.yaml" \
        "Custom_Proxy_Classical_IP classical Custom_Proxy_Classical_IP.yaml"
}

_guard_overlay_hook_path() {
    if [ -n "${GUARD_OPENCLASH_CUSTOM_OVERWRITE:-}" ]; then
        printf '%s\n' "$GUARD_OPENCLASH_CUSTOM_OVERWRITE"
        return 0
    fi
    printf '%s/etc/openclash/custom/openclash_custom_overwrite.sh\n' "${GUARD_PREFIX:-}"
}

_guard_overlay_backup_path() {
    if [ -n "${GUARD_OVERLAY_BACKUP_FILE:-}" ]; then
        printf '%s\n' "$GUARD_OVERLAY_BACKUP_FILE"
        return 0
    fi
    printf '%s/etc/openclash-guard/backups/openclash_custom_overwrite.sh\n' "${GUARD_PREFIX:-}"
}

_guard_overlay_provider_root() {
    if [ -n "${GUARD_RULES_DIR:-}" ]; then
        printf '%s/providers\n' "${GUARD_RULES_DIR%/}"
        return 0
    fi
    printf '%s/etc/openclash-guard/rules/providers\n' "${GUARD_PREFIX:-}"
}

_guard_overlay_marker_count() {
    _guard_omc_file=$1
    _guard_omc_marker=$2
    awk -v marker="$_guard_omc_marker" '$0 == marker { count++ } END { print count + 0 }' "$_guard_omc_file"
}

_guard_overlay_validate_hook() {
    _guard_ovh_file=$1
    if [ ! -f "$_guard_ovh_file" ] || [ -L "$_guard_ovh_file" ]; then
        cli_error "OpenClash custom-overwrite hook is missing or not a regular file: $_guard_ovh_file"
        return 1
    fi
    if ! /bin/sh -n "$_guard_ovh_file"; then
        cli_error "OpenClash custom-overwrite hook has invalid shell syntax: $_guard_ovh_file"
        return 1
    fi
    if ! grep -E '^[[:space:]]*CONFIG_FILE=.*\$1' "$_guard_ovh_file" >/dev/null 2>&1; then
        cli_error "OpenClash custom-overwrite hook does not expose CONFIG_FILE from its first argument"
        return 1
    fi
    _guard_ovh_begin=$(_guard_overlay_marker_count "$_guard_ovh_file" "$_GUARD_OVERLAY_BEGIN") || return 1
    _guard_ovh_end=$(_guard_overlay_marker_count "$_guard_ovh_file" "$_GUARD_OVERLAY_END") || return 1
    if { [ "$_guard_ovh_begin" -ne 0 ] || [ "$_guard_ovh_end" -ne 0 ]; } && \
       { [ "$_guard_ovh_begin" -ne 1 ] || [ "$_guard_ovh_end" -ne 1 ]; }; then
        cli_error "OpenClash custom-overwrite hook has unexpected Guard marker shape"
        return 1
    fi
    _guard_ovh_exits=$(awk '/^[[:space:]]*exit[[:space:]]+0[[:space:]]*$/ { count++ } END { print count + 0 }' "$_guard_ovh_file") || return 1
    if [ "$_guard_ovh_exits" -ne 1 ]; then
        cli_error "OpenClash custom-overwrite hook must contain exactly one terminal 'exit 0'"
        return 1
    fi
}

_guard_overlay_strip_block() {
    _guard_osb_source=$1
    _guard_osb_dest=$2
    awk -v begin="$_GUARD_OVERLAY_BEGIN" -v end="$_GUARD_OVERLAY_END" '
        $0 == begin {
            if (inside) exit 2
            inside = 1
            next
        }
        $0 == end {
            if (!inside) exit 2
            inside = 0
            next
        }
        !inside { print }
        END { if (inside) exit 2 }
    ' "$_guard_osb_source" > "$_guard_osb_dest"
}

_guard_overlay_write_block() {
    _guard_owb_dest=$1
    cat > "$_guard_owb_dest" <<EOF
$_GUARD_OVERLAY_BEGIN
if [ ! -x "$_GUARD_OVERLAY_RUNTIME_BIN" ]; then
    printf '%s\n' "openclash-guard: rules overlay runtime is missing" >&2
    exit 1
fi
"$_GUARD_OVERLAY_RUNTIME_BIN" rules apply-overlay "\${CONFIG_FILE:-}" || exit \$?
$_GUARD_OVERLAY_END
EOF
}

_guard_overlay_insert_block() {
    _guard_oib_source=$1
    _guard_oib_block=$2
    _guard_oib_dest=$3
    awk -v block="$_guard_oib_block" '
        BEGIN {
            rendered = ""
            while ((getline line < block) > 0) rendered = rendered line ORS
            close(block)
        }
        /^[[:space:]]*exit[[:space:]]+0[[:space:]]*$/ && !inserted {
            printf "%s", rendered
            inserted = 1
        }
        { print }
        END { if (!inserted) exit 3 }
    ' "$_guard_oib_source" > "$_guard_oib_dest"
}

guard_overlay_is_active() {
    _guard_oia_hook=$(_guard_overlay_hook_path)
    [ -f "$_guard_oia_hook" ] || return 1
    [ "$(_guard_overlay_marker_count "$_guard_oia_hook" "$_GUARD_OVERLAY_BEGIN")" -eq 1 ] && \
        [ "$(_guard_overlay_marker_count "$_guard_oia_hook" "$_GUARD_OVERLAY_END")" -eq 1 ]
}

guard_overlay_activate() {
    _guard_oa_yes=0
    while [ "$#" -gt 0 ]; do
        case $1 in
            --yes|-y) _guard_oa_yes=1; shift ;;
            *) cli_error "unknown rules activate option: $1"; return 2 ;;
        esac
    done
    [ "$_guard_oa_yes" -eq 1 ] && cli_set_assume_yes 1
    _guard_oa_hook=$(_guard_overlay_hook_path)
    _guard_overlay_validate_hook "$_guard_oa_hook" || return $?
    if ! cli_confirm "Install the marked OpenClash Guard rule-provider overlay?"; then
        cli_error "refusing to activate staged rules without confirmation (pass --yes)"
        return 1
    fi
    _guard_oa_dir=$(dirname "$_guard_oa_hook")
    _guard_oa_stripped=$(file_mktemp "$_guard_oa_dir") || return 1
    _guard_oa_block=$(file_mktemp "$_guard_oa_dir") || {
        rm -f "$_guard_oa_stripped"
        return 1
    }
    _guard_oa_candidate=$(file_mktemp "$_guard_oa_dir") || {
        rm -f "$_guard_oa_stripped" "$_guard_oa_block"
        return 1
    }
    if ! _guard_overlay_strip_block "$_guard_oa_hook" "$_guard_oa_stripped" || \
       ! _guard_overlay_write_block "$_guard_oa_block" || \
       ! _guard_overlay_insert_block "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate" || \
       ! /bin/sh -n "$_guard_oa_candidate" || \
       [ "$(_guard_overlay_marker_count "$_guard_oa_candidate" "$_GUARD_OVERLAY_BEGIN")" -ne 1 ] || \
       [ "$(_guard_overlay_marker_count "$_guard_oa_candidate" "$_GUARD_OVERLAY_END")" -ne 1 ]; then
        rm -f "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate"
        cli_error "unable to construct a valid OpenClash custom-overwrite hook; keeping last-good"
        return 1
    fi
    _guard_oa_backup=$(_guard_overlay_backup_path)
    if [ ! -e "$_guard_oa_backup" ]; then
        mkdir -p "$(dirname "$_guard_oa_backup")"
        if ! cp -p "$_guard_oa_hook" "$_guard_oa_backup"; then
            rm -f "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate"
            cli_error "unable to back up OpenClash custom-overwrite hook"
            return 1
        fi
    fi
    if ! cmp -s "$_guard_oa_hook" "$_guard_oa_candidate"; then
        if ! file_atomic_replace "$_guard_oa_hook" "$_guard_oa_candidate"; then
            rm -f "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate"
            cli_error "unable to publish OpenClash custom-overwrite hook; keeping last-good"
            return 1
        fi
    fi
    rm -f "$_guard_oa_stripped" "$_guard_oa_block" "$_guard_oa_candidate"
    cli_success "rule-provider overlay activated; restart OpenClash to apply it"
}

guard_overlay_deactivate() {
    _guard_od_yes=0
    while [ "$#" -gt 0 ]; do
        case $1 in
            --yes|-y) _guard_od_yes=1; shift ;;
            *) cli_error "unknown rules deactivate option: $1"; return 2 ;;
        esac
    done
    [ "$_guard_od_yes" -eq 1 ] && cli_set_assume_yes 1
    _guard_od_hook=$(_guard_overlay_hook_path)
    if [ ! -f "$_guard_od_hook" ]; then
        cli_info "rule-provider overlay is not installed"
        return 0
    fi
    _guard_overlay_validate_hook "$_guard_od_hook" || return $?
    if ! guard_overlay_is_active; then
        cli_info "rule-provider overlay is not installed"
        return 0
    fi
    if ! cli_confirm "Remove only the marked OpenClash Guard rule-provider overlay?"; then
        cli_error "refusing to deactivate rules without confirmation (pass --yes)"
        return 1
    fi
    _guard_od_candidate=$(file_mktemp "$(dirname "$_guard_od_hook")") || return 1
    if ! _guard_overlay_strip_block "$_guard_od_hook" "$_guard_od_candidate" || \
       ! /bin/sh -n "$_guard_od_candidate"; then
        rm -f "$_guard_od_candidate"
        cli_error "unable to remove the marked overlay safely; keeping last-good"
        return 1
    fi
    if ! file_atomic_replace "$_guard_od_hook" "$_guard_od_candidate"; then
        rm -f "$_guard_od_candidate"
        cli_error "unable to publish OpenClash custom-overwrite hook; keeping last-good"
        return 1
    fi
    rm -f "$_guard_od_candidate"
    _guard_od_backup=$(_guard_overlay_backup_path)
    rm -f "$_guard_od_backup"
    cli_success "removed only the marked rule-provider overlay; staged rule data was preserved"
}

_guard_overlay_validate_providers() {
    _guard_ovp_root=$1
    while IFS=' ' read -r _guard_ovp_name _guard_ovp_behavior _guard_ovp_file; do
        [ -n "$_guard_ovp_name" ] || continue
        _guard_ovp_path="$_guard_ovp_root/$_guard_ovp_file"
        if [ ! -s "$_guard_ovp_path" ] || ! awk 'NR == 1 { ok = ($0 == "payload:") } END { exit(ok ? 0 : 1) }' "$_guard_ovp_path"; then
            cli_error "staged provider is missing or invalid: $_guard_ovp_path"
            return 1
        fi
    done <<EOF
$(guard_overlay_provider_specs)
EOF
}

guard_overlay_apply_config() {
    _guard_oac_config=${1:-}
    if [ -z "$_guard_oac_config" ] || [ ! -f "$_guard_oac_config" ] || [ -L "$_guard_oac_config" ]; then
        cli_error "rules apply-overlay requires a regular active config file"
        return 2
    fi
    if ! command -v ruby >/dev/null 2>&1; then
        cli_error "OpenClash Ruby runtime is required for structured provider replacement"
        return 127
    fi
    _guard_oac_root=$(_guard_overlay_provider_root)
    _guard_overlay_validate_providers "$_guard_oac_root" || return $?
    _guard_oac_tmp=$(file_mktemp "$(dirname "$_guard_oac_config")") || return 1
    set -- "$_guard_oac_config" "$_guard_oac_tmp" "$_guard_oac_root"
    while IFS=' ' read -r _guard_oac_name _guard_oac_behavior _guard_oac_file; do
        [ -n "$_guard_oac_name" ] || continue
        set -- "$@" "$_guard_oac_name" "$_guard_oac_behavior" "$_guard_oac_file"
    done <<EOF
$(guard_overlay_provider_specs)
EOF
    if ! ruby -ryaml -e '
def safe_yaml(text)
  YAML.safe_load(text, permitted_classes: [], permitted_symbols: [], aliases: true)
rescue ArgumentError
  YAML.safe_load(text, [], [], true)
end
args = ARGV.dup
source, output, root = args.shift(3)
abort("invalid provider specification") unless args.length == 12
doc = safe_yaml(File.binread(source))
abort("active config root must be a mapping") unless doc.is_a?(Hash)
providers = doc["rule-providers"]
abort("active config rule-providers must be a mapping") unless providers.is_a?(Hash)
specs = {}
args.each_slice(3) { |name, behavior, filename| specs[name] = [behavior, filename] }
missing = specs.keys.reject { |key| providers.key?(key) }
abort("reserved providers missing: #{missing.join(",")}") unless missing.empty?
specs.each do |key, (behavior, filename)|
  providers[key] = {
    "type" => "file",
    "behavior" => behavior,
    "format" => "yaml",
    "path" => File.join(root, filename)
  }
end
rendered = YAML.dump(doc)
check = safe_yaml(rendered)
abort("rendered config root must be a mapping") unless check.is_a?(Hash)
out_providers = check["rule-providers"]
abort("rendered providers missing") unless out_providers.is_a?(Hash)
specs.each do |key, (behavior, filename)|
  expected = {"type"=>"file", "behavior"=>behavior, "format"=>"yaml", "path"=>File.join(root, filename)}
  abort("rendered provider mismatch: #{key}") unless out_providers[key] == expected
end
File.binwrite(output, rendered)
' "$@"; then
        rm -f "$_guard_oac_tmp"
        cli_error "active config lacks the expected four provider slots; leaving it untouched"
        return 1
    fi
    if ! file_atomic_replace "$_guard_oac_config" "$_guard_oac_tmp"; then
        rm -f "$_guard_oac_tmp"
        cli_error "unable to publish validated active config; keeping last-good"
        return 1
    fi
    rm -f "$_guard_oac_tmp"
}
