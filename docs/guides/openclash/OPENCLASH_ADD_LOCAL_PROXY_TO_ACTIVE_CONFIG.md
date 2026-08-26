# OpenClash Add Local Proxy To Active Config

Date: 2026-04-13
Target: add a manually defined proxy to the currently active OpenClash YAML and attach it to a specific policy group such as `🤖 Claude`

## 1. Scope

This note records the maintenance workflow for adding a new local proxy entry directly into the active OpenClash config on the router.

Use this when:

- the active OpenClash profile is already known or can be discovered from UCI
- the proxy is not coming from a subscription provider
- the proxy should be available to one specific policy group instead of all groups

Typical example:

- add a `socks5h://...` endpoint to the active config
- expose it as a named proxy such as `SOCKS5H Claude`
- place it at the top of the `🤖 Claude` group so Claude traffic prefers it first

---

## 2. Important Syntax Note

OpenClash YAML does not use a separate `socks5h` proxy type in this workflow.

Translate a URL like:

```text
socks5h://username:password@host:port
```

into a Clash/OpenClash proxy item like:

```yaml
- name: SOCKS5H Claude
  type: socks5
  server: host
  port: 10001
  username: username
  password: "password"
  udp: true
```

Practical rule:

- keep the source URL for transport testing
- store the OpenClash config entry as `type: socks5`

---

## 3. Inputs Required

Before editing, collect:

- proxy display name
- server hostname
- server port
- username if required
- password if required
- whether `udp` should be `true` or `false`
- target policy group name, for example `🤖 Claude`

Do not commit real proxy credentials into this repository.

If the router config is being edited live over SSH, keep secrets only on the router and use placeholders in docs and scripts stored in git.

---

## 4. Find The Active OpenClash Config

On the router:

```sh
uci get openclash.config.config_path
```

Expected result looks like:

```text
/etc/openclash/config/liangxin.yaml
```

If that key is missing, inspect OpenClash UCI state:

```sh
uci show openclash | sed -n '1,160p'
```

Do not guess the file path if OpenClash already declares the active config.

---

## 5. Backup Before Editing

Always create a timestamped backup first:

```sh
CFG="$(uci get openclash.config.config_path)"
cp "$CFG" "${CFG}.bak.$(date +%Y%m%d%H%M%S)"
```

Rollback later is just:

```sh
cp /path/to/file.yaml.bak.YYYYMMDDHHMMSS /path/to/file.yaml
/etc/init.d/openclash restart
```

---

## 6. Inspect Current Structure

Check whether the file already has a top-level `proxies:` block:

```sh
grep -n '^proxies:' -A40 "$CFG"
grep -n '^proxy-groups:' -A120 "$CFG"
```

Common patterns:

- provider-only config: no local `proxies:` block exists yet
- hybrid config: `proxies:` already exists and only needs one more item appended

If the config is provider-only, add the new `proxies:` block before `proxy-groups:`.

---

## 7. Manual YAML Edit

### 7.1 Add the local proxy definition

If there is no existing `proxies:` block, insert one before `proxy-groups:`.

Example:

```yaml
proxies:
  - name: SOCKS5H Claude
    type: socks5
    server: isp.example.com
    port: 10001
    username: user-placeholder
    password: "password-placeholder"
    udp: true

proxy-groups:
  - name: 🚀 手動選擇
    ...
```

If `proxies:` already exists, append only the item:

```yaml
  - name: SOCKS5H Claude
    type: socks5
    server: isp.example.com
    port: 10001
    username: user-placeholder
    password: "password-placeholder"
    udp: true
```

### 7.2 Attach the proxy to the target group

Find the target group and add the new proxy name to its `proxies:` list.

Example for `🤖 Claude`:

```yaml
  - name: 🤖 Claude
    type: fallback
    url: https://cp.cloudflare.com/generate_204
    interval: 300
    tolerance: 50
    proxies:
      - SOCKS5H Claude
      - 🚀 手動選擇
      - ♻️ 自動選擇
      - ⛔ 拒絕
```

Recommended placement:

- put the new proxy at the top if it should be preferred first
- put it above `⛔ 拒絕`
- keep provider-backed groups such as `🚀 手動選擇` and `♻️ 自動選擇` as fallback choices
- avoid referencing region subgroups in this local template unless you have verified OpenClash keeps them after provider filtering

---

## 8. Validate The YAML

Use a YAML parser before restarting OpenClash.

Ruby is usually available on OpenWrt builds that already have OpenClash helper tooling:

```sh
ruby -e 'require "yaml"; YAML.load_file(ARGV[0]); puts "YAML_OK"' "$CFG"
```

If Ruby is not available, use any other installed parser you trust.

Do not restart OpenClash on a syntactically broken file.

---

## 9. Restart And Verify

Restart:

```sh
/etc/init.d/openclash restart
sleep 5
/etc/init.d/openclash status
```

Re-check the relevant sections:

```sh
sed -n '1,80p' "$CFG"
grep -n 'SOCKS5H Claude' "$CFG"
grep -n '🤖 Claude' -A20 "$CFG"
```

Healthy signs:

- service returns `running`
- the new proxy name appears in the top-level `proxies:` block
- the target policy group includes the new proxy name

---

## 10. One-Shot Remote Patch Template

Use this pattern from an admin workstation when editing the router over SSH.

Replace every placeholder before running it.

```sh
ssh root@10.0.0.1 'sh -s' <<'EOF'
set -eu

CFG="$(uci get openclash.config.config_path)"
BAK="${CFG}.bak.$(date +%Y%m%d%H%M%S)"
cp "$CFG" "$BAK"

ruby <<'RUBY'
path = `uci get openclash.config.config_path`.strip
text = File.read(path)

proxy_name = "SOCKS5H Claude"
target_group = "🤖 Claude"
region_group_entries = [
  "      - 🇺🇸 美國節點\n",
  "      - 🇯🇵 日本節點\n",
  "      - 🇸🇬 新加坡節點\n",
  "      - 🇼🇸 台灣節點\n",
  "      - 🇰🇷 韓國節點\n",
]

proxy_block = <<~YAML
proxies:
  - name: #{proxy_name}
    type: socks5
    server: isp.example.com
    port: 10001
    username: user-placeholder
    password: "password-placeholder"
    udp: true

YAML

unless text.include?("- name: #{proxy_name}\n")
  marker = "proxy-groups:\n"
  idx = text.index(marker)
  raise "proxy-groups marker not found" unless idx
  text = text.insert(idx, proxy_block)
end

group_marker = "  - name: #{target_group}\n"
start = text.index(group_marker)
raise "#{target_group} group not found" unless start

next_group = text.index("\n  - name:", start + group_marker.length) || text.length
section = text[start...next_group]
entry = "      - #{proxy_name}\n"

region_group_entries.each do |region_entry|
  section.delete!(region_entry)
end

unless section.include?(entry)
  reject_marker = "      - ⛔ 拒絕\n"
  if section.include?(reject_marker)
    section.sub!(reject_marker, entry + reject_marker)
  else
    proxies_marker = "    proxies:\n"
    raise "group proxies block not found" unless section.include?(proxies_marker)
    section.sub!(proxies_marker, proxies_marker + entry)
  end
  text[start...next_group] = section
end

File.write(path, text)
RUBY

ruby -e 'require "yaml"; YAML.load_file(ARGV[0]); puts "YAML_OK"' "$CFG"
/etc/init.d/openclash restart
sleep 5
/etc/init.d/openclash status
echo "backup: $BAK"
EOF
```

This template is safe only if:

- the file is normal YAML text, not a generated binary artifact
- the target group name exists exactly as written
- the operator has already taken a backup

---

## 11. UI Delay Notes

OpenClash UI delay values here are health-check timings, not ICMP ping.

For a group like:

```yaml
url: https://cp.cloudflare.com/generate_204
interval: 300
```

the UI is measuring how long the test URL takes through that proxy.

Interpretation:

- repeated values around `1400-1500 ms` mean the proxy is working but slow
- five-minute timestamps usually match `interval: 300`
- `(udp)` in the UI is expected when the proxy item has `udp: true`

If needed, test directly from the router:

```sh
curl -k -o /dev/null -sS -w 'code=%{http_code} connect=%{time_connect} total=%{time_total}\n' \
  -x 'socks5h://user:pass@host:port' \
  'https://cp.cloudflare.com/generate_204'
```

Working but slow example:

- `code=204`
- `connect` around `0.02`
- `total` around `1.48`

That pattern means:

- the router can reach the proxy quickly
- the upstream exit path is slow
- the config is not necessarily broken

---

## 12. Troubleshooting

### Proxy appears in YAML but not in OpenClash behavior

Check:

- YAML parsed successfully
- OpenClash restart completed
- the proxy was added to the correct policy group
- the relevant traffic is actually routed by that policy group

### Delay looks unstable

That is often a proxy quality issue, not a YAML issue.

Re-test the check URL directly from the router and compare:

- `time_connect`
- `time_total`
- response code

### Group edit did not take effect

The most common causes are:

- wrong group name
- duplicate config files edited in the wrong location
- editing a generated provider file instead of the active source config

Always verify the source path with:

```sh
uci get openclash.config.config_path
```

---

## 13. Minimal Checklist

Use this for future edits:

1. discover active config with `uci get openclash.config.config_path`
2. create timestamped backup
3. add or extend top-level `proxies:`
4. attach proxy name to the correct policy group
5. parse YAML before restart
6. restart OpenClash
7. verify service status and group membership
8. test latency from the router if the UI delay looks suspicious
