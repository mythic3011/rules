# banIP DoH Setup And Fix

Date: 2026-04-11
Router: `noctsec-hk-gw01`
Target: OpenWrt `banIP` as a DoH/IP enforcement layer

## Purpose

Use `banIP` for IP-based blocking of public DoH endpoints.

Do not use `banIP` as the primary replacement for the existing dnsmasq-based adblock flow.

Current design:

- `dnsmasq` hosts and `dnsmasq.conf` outputs handle domain blocking
- `banIP` handles known public DoH resolver IPs
- OpenClash local DNS remains the main resolver path

## Why This Was Needed

`banIP` was installed on the router but not actually working.

Observed state before fix:

- package installed: `banip 1.5.6-r7`
- LuCI package installed: `luci-app-banip`
- status: `error`
- `element_count: 0`
- no active feeds
- service restart logged: `banIP service autostart is disabled`

The config also contained a broad default feed bundle that was not aligned with the actual goal here.

## Working Config

The router was changed to a minimal `doh`-only profile:

- `ban_enabled='1'`
- `ban_autodetect='0'`
- `ban_protov4='1'`
- `ban_protov6='0'`
- `ban_ifv4='wan'`
- `ban_dev='eth1'`
- `ban_feed='doh'`
- `ban_fetchcmd='curl'`
- `ban_autoallowlist='1'`
- `ban_autoallowuplink='subnet'`
- `ban_autoblocklist='1'`
- `ban_autoblocksubnet='1'`

Pixel 8 Pro exception added to local allowlist:

- MAC: `86:84:26:D9:5A:C6`
- DHCP name: `noctsec-mob-01`
- DHCP IP: `10.0.0.169`

Backup created on router:

- `/root/banip.config.backup.20260411-013141`

## Final Exported Config

Exact final `banIP` UCI state:

```sh
banip.global=banip
banip.global.ban_enabled='1'
banip.global.ban_debug='0'
banip.global.ban_autodetect='0'
banip.global.ban_logterm='Exit before auth from' 'luci: failed login'
banip.global.ban_fetchretry='5'
banip.global.ban_nicelimit='0'
banip.global.ban_filelimit='1024'
banip.global.ban_deduplicate='1'
banip.global.ban_nftpriority='-100'
banip.global.ban_icmplimit='25'
banip.global.ban_synlimit='10'
banip.global.ban_udplimit='100'
banip.global.ban_nftpolicy='memory'
banip.global.ban_nftretry='5'
banip.global.ban_blockpolicy='drop'
banip.global.ban_nftloglevel='warn'
banip.global.ban_logprerouting='0'
banip.global.ban_loginbound='0'
banip.global.ban_logoutbound='0'
banip.global.ban_loglimit='100'
banip.global.ban_autoallowlist='1'
banip.global.ban_autoallowuplink='subnet'
banip.global.ban_autoblocklist='1'
banip.global.ban_allowlistonly='0'
banip.global.ban_autoblocksubnet='1'
banip.global.ban_protov4='1'
banip.global.ban_protov6='0'
banip.global.ban_ifv4='wan'
banip.global.ban_dev='eth1'
banip.global.ban_feed='doh'
banip.global.ban_fetchcmd='curl'
```

Final local allowlist addition:

```text
86:84:26:D9:5A:C6
```

## Fix Steps

### 1. Confirm package state

```sh
opkg list-installed | grep -E '^(banip|luci-app-banip) '
service banip status
uci show banip
```

### 2. Replace the broad default feed set with a DoH-only profile

```sh
uci -q delete banip.global.ban_feed
uci -q delete banip.global.ban_ifv4
uci -q delete banip.global.ban_ifv6
uci -q delete banip.global.ban_dev

uci set banip.global.ban_enabled='1'
uci set banip.global.ban_autodetect='0'
uci set banip.global.ban_protov4='1'
uci set banip.global.ban_protov6='0'
uci add_list banip.global.ban_ifv4='wan'
uci add_list banip.global.ban_dev='eth1'
uci add_list banip.global.ban_feed='doh'
uci set banip.global.ban_fetchcmd='curl'
uci set banip.global.ban_autoallowlist='1'
uci set banip.global.ban_autoallowuplink='subnet'
uci set banip.global.ban_autoblocklist='1'
uci set banip.global.ban_autoblocksubnet='1'

uci commit banip
```

### 3. Add the Pixel 8 Pro exception

```sh
printf '%s\n' '86:84:26:D9:5A:C6' >> /etc/banip/banip.allowlist
```

### 4. Enable the init service

This was the actual blocker.

```sh
/etc/init.d/banip enable
```

### 5. Restart and verify

```sh
/etc/init.d/banip restart
sleep 8
service banip status
logread | grep -i banip | tail -n 80
```

Expected healthy state:

- status: `active`
- nft: enabled
- monitor: enabled
- active feeds include `doh.v4`
- non-zero element count

## Verified Working State

After the fix, router status showed:

- status: `active (nft: ✔, monitor: ✔)`
- `element_count: 1 564`
- active feeds:
  - `allowlist.v4MAC`
  - `allowlist.v6MAC`
  - `allowlist.v4`
  - `allowlist.v6`
  - `blocklist.v4MAC`
  - `blocklist.v6MAC`
  - `blocklist.v4`
  - `blocklist.v6`
  - `doh.v4`

## How To Use It

### Normal operation

Leave `banIP` running in the background.

It now blocks public DoH endpoint IPs on the WAN path while local DNS and dnsmasq keep handling ordinary domain filtering.

### Check status

```sh
service banip status
```

### Restart after config changes

```sh
/etc/init.d/banip restart
```

### View logs

```sh
logread | grep -i banip | tail -n 100
```

### Add another client exception

Add the client MAC to:

- `/etc/banip/banip.allowlist`

Then restart:

```sh
/etc/init.d/banip restart
```

## Important Limitations

### 1. `banIP` is not the main adblock engine here

Keep using:

- `setup/openclash/scripts/apply_adblock_dnsmasq.sh`
- `/etc/dnsmasq.custom-blocks.hosts`
- generated `dns/*.dnsmasq.conf`

for ad, tracking, and Adobe domain blocking.

### 2. Per-device bypass is weaker than VLAN/SSID separation

The Pixel allowlist may work for the desired exception path, but the clean network design is still:

- separate SSID or VLAN for bypass devices
- policy separation at network layer, not just per-MAC exception

### 3. IPv6 is disabled in this `banIP` profile

That is intentional for the current setup.

If IPv6 later becomes part of the production path, add and verify:

- `ban_protov6='1'`
- `ban_ifv6='wan6'`

before turning it on.

## Recommended Final Design

- Keep OpenClash local DNS active
- Keep dnsmasq custom hosts and generated dnsmasq conf files active
- Use `banIP` only for public DoH IP blocking and similar IP-layer controls
- Use VLAN or separate SSID if a device should intentionally bypass the enforced DNS path
