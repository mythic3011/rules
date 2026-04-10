# OpenClash Local DNS Recovery

## 1. Scope

This note records a practical recovery workflow for the case where OpenClash is still using external DNS resolvers instead of the local OpenWrt DNS path.

This is meant for future maintenance when:

- local DNS policy should stay inside OpenWrt
- `https-dns-proxy` is already running locally
- OpenClash config still contains public resolvers such as:
  - `114.114.114.114`
  - `119.29.29.29`
  - `8.8.8.8`
  - `1.1.1.1`
  - `https://dns.cloudflare.com/dns-query`
  - `https://dns.google/dns-query`

---

## 2. Symptom Pattern

Typical signs:

- local DNS/block policy appears not to take effect
- resolver IPs show Tencent / Google / Cloudflare rather than the local router path
- OpenClash UI `website_check` becomes unstable
- LuCI/OpenClash page may return `invalid CGI response` or `Broken pipe`

Observed local services in this setup:

- `dnsmasq`: `127.0.0.1:53`
- `dnsmasq`: `10.0.0.1:53`
- `https-dns-proxy`: `127.0.0.1:5053`
- `clash`: `:7874`

---

## 3. Root Cause

The problem is usually not the generated proxy-provider cache itself.

The real source is the main OpenClash config still carrying external DNS settings in the `dns:` block, and generated provider files inherit that behavior.

Important rule:

- do not edit `/etc/openclash/proxy_provider/*.yaml`

Why:

- provider files are generated/runtime artifacts
- manual edits there do not survive regeneration

Fix the source config instead:

- `/etc/openclash/liangxin.yaml`
- `/etc/openclash/config/liangxin.yaml`

---

## 4. Target State

The goal is to make OpenClash DNS use the local OpenWrt path:

- local resolver IP: `127.0.0.1`
- local `https-dns-proxy` listener: `127.0.0.1:5053`

Recommended DNS block:

```yaml
dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  listen: 0.0.0.0:7874
  respect-rules: true
  use-hosts: true
  fake-ip-filter:
    - geosite:cn
  default-nameserver:
    - 127.0.0.1
  nameserver:
    - 127.0.0.1:5053
  proxy-server-nameserver:
    - 127.0.0.1:5053
  direct-nameserver:
    - 127.0.0.1:5053
  fallback:
    - 127.0.0.1:5053
```

Rationale:

- `default-nameserver` stays as a plain local resolver IP
- all other DNS paths are collapsed onto the local `https-dns-proxy` listener

---

## 5. One-Shot Bash Replacement

Use this when the current YAML already contains a top-level `dns:` block and you want to replace it safely with a backup.

```sh
cat >/tmp/replace_openclash_dns.sh <<'SH'
#!/bin/sh
set -eu

replace_dns_block() {
  file="$1"
  [ -f "$file" ] || return 0

  cp "$file" "${file}.bak.$(date +%Y%m%d-%H%M%S)"

  awk '
  BEGIN {
    in_dns = 0
    replaced = 0
  }

  /^dns:[[:space:]]*$/ && replaced == 0 {
    print "dns:"
    print "  enable: true"
    print "  ipv6: false"
    print "  enhanced-mode: fake-ip"
    print "  fake-ip-range: 198.18.0.1/16"
    print "  listen: 0.0.0.0:7874"
    print "  respect-rules: true"
    print "  use-hosts: true"
    print "  fake-ip-filter:"
    print "    - geosite:cn"
    print "  default-nameserver:"
    print "    - 127.0.0.1"
    print "  nameserver:"
    print "    - 127.0.0.1:5053"
    print "  proxy-server-nameserver:"
    print "    - 127.0.0.1:5053"
    print "  direct-nameserver:"
    print "    - 127.0.0.1:5053"
    print "  fallback:"
    print "    - 127.0.0.1:5053"
    in_dns = 1
    replaced = 1
    next
  }

  in_dns == 1 {
    if ($0 ~ /^[^[:space:]]/) {
      in_dns = 0
      print
    }
    next
  }

  { print }
  ' "$file" > "${file}.tmp"

  mv "${file}.tmp" "$file"
  echo "updated: $file"
}

replace_dns_block /etc/openclash/liangxin.yaml
replace_dns_block /etc/openclash/config/liangxin.yaml
SH

chmod +x /tmp/replace_openclash_dns.sh
/tmp/replace_openclash_dns.sh
```

---

## 6. Verification

Check the resulting DNS block:

```sh
grep -nA20 '^dns:' /etc/openclash/liangxin.yaml
grep -nA20 '^dns:' /etc/openclash/config/liangxin.yaml
```

Check local listeners:

```sh
netstat -lnptu | grep -E ':53 |:53$|:5053 |:5053$|:7874 |:7874$'
```

Restart services:

```sh
/etc/init.d/dnsmasq restart
/etc/init.d/https-dns-proxy restart
/etc/init.d/openclash restart
```

Then re-check:

```sh
grep -RniE 'default-nameserver:|proxy-server-nameserver:|nameserver:|fallback:' /etc/openclash/
```

Expected result:

- main config should point to `127.0.0.1` / `127.0.0.1:5053`
- generated provider files may still exist, but after restart they should be rebuilt from the corrected source config

---

## 7. Rollback

The script writes timestamped backups next to each file:

- `/etc/openclash/liangxin.yaml.bak.YYYYMMDD-HHMMSS`
- `/etc/openclash/config/liangxin.yaml.bak.YYYYMMDD-HHMMSS`

Rollback example:

```sh
cp /etc/openclash/liangxin.yaml.bak.20260409-220000 /etc/openclash/liangxin.yaml
cp /etc/openclash/config/liangxin.yaml.bak.20260409-220000 /etc/openclash/config/liangxin.yaml
/etc/init.d/openclash restart
```

---

## 8. Notes for "Get Proxy Only" Scenarios

If the future goal is "get proxies only" or "refresh provider only", keep this rule clear:

- proxy/provider refresh is not the correct layer to fix DNS path issues

Why:

- provider YAML is downstream generated state
- DNS resolver behavior comes from the top-level `dns:` section in the main config

So for provider-only workflows:

- refresh providers as usual
- but keep the local DNS policy pinned in the source config
- never rely on generated provider files as the place to enforce local DNS

In short:

- providers define nodes
- the main config defines DNS behavior

---

## 9. Decision Rule

If the issue is:

- "why is OpenClash still querying Tencent / Google / Cloudflare DNS?"

check the top-level `dns:` block first.

If the issue is:

- "why did my manual provider edit disappear?"

the answer is:

- provider files are generated and should not be hand-edited
