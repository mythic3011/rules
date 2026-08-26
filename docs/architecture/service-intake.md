# Service Intake Architecture

`mythic3011/rules` treats GitHub Issues as the public contribution UI and the
repository registries as the source of truth. Contributors report observations;
they do not edit generated Mihomo/OpenClash artifacts.

## Flow

```text
GitHub Issue Form
      |
      v
untrusted observation data
      |
      v
intake validator
      |---------------------> reject unsafe/ambiguous input
      v
Region Registry + Service Registry
      |
      v
normal generators / Routing IR
      |
      v
cfg + rule + dns + catalog
      |
      v
bot pull request + CI
```

The bot never commits directly to the default branch. A successful intake is a
normal pull request with generated artifacts and the same validation gates as a
maintainer change. Editing or reopening the original issue re-runs validation
and refreshes the same deterministic bot branch/PR.

## Region Registry

`internal/config/ai-routing/regions.json` has two separate concepts:

- `regions`: every region that observations may reference.
- `primaryOrder`: regions that may be used as routing exits.

This distinction allows an observation such as `HK = blocked` without creating
an HK proxy candidate.

### Known regions

Known regions are generated into the Issue Form as normal multi-select options.
Contributors select confirmed working and blocked regions; there is no fake
`Other` region identity in those lists.

### Additional / unlisted regions

A ticket can define up to three unlisted regions. Each proposal supplies:

- reachability status for this service (`Works` or `Blocked`);
- a 2-3 letter country/region code;
- a human name;
- optional aliases;
- optional provider-node keywords such as city/airport/emoji terms;
- whether a newly created region should become a routable exit.

The contributor does **not** choose a region ID, regex or group name. Intake
canonicalizes those values:

```text
IS + Iceland
     |
     +--> id: is
     +--> flag/group: 🇮🇸 Iceland 節點
     +--> boundary-aware IS matcher
     +--> escaped aliases/keywords
```

Country/region code is the strongest identity. Existing records are also
matched by canonical ID and normalized name/aliases, so `HK`, `Hong Kong`, and
an additional `Hong Kong SAR` proposal reuse the existing HK region rather than
creating duplicates. A reused region may gain safe aliases/keywords, but public
service intake cannot promote an existing observation-only region into a
routing exit; that governance change requires a maintainer edit.

Duplicate additional-region slots, incomplete slots and loose one/two-character
ASCII keywords are rejected. Short codes belong in the code field, where the
compiler generates a boundary-aware matcher (`HK-01` matches, `CHUNK` does not).

## Service availability

A service may declare:

```json
"availability": {
  "workingRegions": ["us", "jp"],
  "blockedRegions": ["hk"]
}
```

For new declarative services, routable candidates are derived from
`workingRegions ∩ primaryOrder`. Existing `regions` declarations remain
supported for backward compatibility.

An edited ticket is treated as an explicit observation update for the regions it
touches: if a region moves from working to blocked (or vice versa), intake moves
it between states instead of creating a permanent contradiction. Explicitly
blocked regions are removed from the service's active route candidates.

## Intake security boundary

Issue content is untrusted. The intake layer:

- accepts only a fixed matcher-type enum;
- validates domain and CIDR syntax;
- rejects private, loopback, link-local, and reserved CIDRs;
- never executes user text;
- never fetches a user-supplied URL;
- bounds matcher, alias and keyword counts/lengths;
- escapes region aliases/keywords before adding regex terms;
- prevents public intake from promoting an existing observation-only region;
- opens/updates a pull request instead of writing directly to the default branch.

The workflow extracts the issue body from `$GITHUB_EVENT_PATH` with `jq`, so
issue text is never interpolated into shell source.
