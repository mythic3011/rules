{{PROFILE_MARKER}}
# {{TITLE}}
{{PROFILE_DESCRIPTION}}
{{PROFILE_POLICY_NOTES}}
{{GENERATOR_NOTE}}

{{PORTS_SECTION}}
port: 7890
socks-port: 7891
mixed-port: 7893
redir-port: 7892
tproxy-port: 7895
allow-lan: true
bind-address: "*"
mode: rule
tcp-concurrent: true
unified-delay: true

{{PROXY_PROVIDERS_SECTION}}
proxy-providers:
  provider1:
    type: http
    url: "url"
    interval: 3600
    path: ./proxy_provider/provider1.yaml
    proxy: DIRECT
    header:
    health-check:
      enable: true
      interval: 600
      url: https://cp.cloudflare.com/generate_204
    override:
      skip-cert-verify: true
      udp: true
    exclude-filter: {{PROVIDER_NOISE_EXCLUDE_PATTERN}}

{{GEODATA_SECTION}}
geox-url:
  mmdb: https://testingcf.jsdelivr.net/gh/alecthw/mmdb_china_ip_list@release/Country.mmdb
  geoip: https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geoip.dat
  geosite: https://testingcf.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/geosite.dat
  asn: https://testingcf.jsdelivr.net/gh/xishang0128/geoip@release/GeoLite2-ASN.mmdb
geo-auto-update: true
geo-update-interval: 24
geodata-mode: true

{{LOGGING_SECTION}}
log-level: info
ipv6: false
external-controller: 0.0.0.0:9090
{{SECRET_LINES}}

{{PROFILE_SECTION}}
profile:
  store-selected: true
  store-fake-ip: true

{{TUN_SECTION}}
tun:
  enable: true
  stack: system
  dns-hijack:
    - "any:53"
    - "tcp://any:53"
  auto-detect-interface: false
  auto-route: false
  auto-redirect: false
  strict-route: false
  endpoint-independent-nat: true

{{DNS_CONFIG}}

{{PROXY_GROUPS_SECTION}}
proxy-groups:
{{PROXY_GROUPS}}

{{RULES_SECTION}}
rules:
{{RULES}}

{{RULE_PROVIDERS_SECTION}}
rule-providers:
{{RULE_PROVIDERS}}
