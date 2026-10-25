# Policy maintenance

Edit the canonical declaration, generate the published profiles, then check the result. `cfg/`, `rule/`, and `dns/` are stable consumer paths; generated files are outputs, not editing surfaces.

| Policy | Canonical source |
| --- | --- |
| Service groups and shared routing behavior | `internal/config/ai-routing/catalogs/services.json` |
| Protected service identity and authorization | `internal/config/ai-routing/core/30-services.yaml` and `internal/config/ai-routing/core/20-protection-classes.yaml` |
| Private/foundation routes, DNS resolver sets, profile groups | `internal/config/ai-routing/profile.json` |
| DNS resolver routing and output settings | `internal/config/ai-routing/dns.json` |
| SSH, gaming, finance, and privacy rule sets | `internal/config/ai-routing/catalogs/companion-rules.json` |
| Region definitions | `internal/config/ai-routing/catalogs/regions.source.json` |
| Published templates offered by the web tools | `internal/config/ai-routing/catalogs/profile-templates.json` |
| Exported profile comment translations | `internal/config/ai-routing/catalogs/profile-languages.json` |
| Output compilation and rendering | `internal/python/ai_profiles/` |

## Add or edit a service

Add the service-specific identity, payload, DNS policy, and upstream rules to `services.json`. Reference a shared policy from its top-level `policies` map for `group`, `regions`, `directRelaxed`, and `subconverter`. Keep those route fields in one place; the catalog rejects a service that combines a policy reference with conflicting inline route settings.

Services should share a policy only when their routing behavior matches. Related Google services use a proxy-only Google AI group and a direct-allowed Google AI Tools group. Generated profiles reuse shared region and global selectors as manual `select` groups with `REJECT` first, so health checks cannot switch the egress IP. Account-sensitive services keep separate protection and manual, reject-first selectors.

## Remove or share a policy

When removing a service, remove its canonical declaration and keep a shared policy while any service still references it. Published filenames and paths are compatibility surfaces; get a compatibility decision before removing or renaming them.

When changing a shared policy, review every service that references it because all receive the change. Split the policy first if even one service needs different groups, regions, direct access, or INI clustering.

Account protection comes from the typed core service and protection-class declarations. Keep it there; do not add a second protection class to the legacy service catalog. Claude's explicit domain, telemetry, IP, and NTP matchers follow its protected account group. These shared telemetry and NTP matches can affect other applications too.

## Change regions, companion rules, or upstream data

Edit authored region data in `regions.source.json`; `regions.json` is a generated projection. Edit companion payloads in `companion-rules.json` and retain their declared provider, group, and output filename. Do not merge account protection into a convenience service group.

Normal maintenance is deterministic and offline:

```sh
rtk proxy mise run generate
rtk proxy mise run check
```

`rtk proxy mise run refresh` is a separate, explicit network operation for upstream snapshots and source revisions. Run it only when an upstream refresh is intended, then regenerate and check the result.

The privacy rule set rejects captured DNS/DoT and known STUN/TURN traffic, and rejects IPv6 visible to the profile. This cannot cover router traffic that bypasses TUN/TProxy; router deployments still need TCP/UDP DNS capture plus IPv4 and IPv6 firewall enforcement. DoH on 443 and custom-port or obfuscated STUN/TURN need separate policy. See [node normalization and traffic privacy](node-normalization.md).
