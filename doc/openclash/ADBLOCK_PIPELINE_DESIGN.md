# Adblock DNS Pipeline Design

## 1. Abstract

This repository now treats DNS blocking as a generated artifact pipeline rather than a hand-edited rule collection.

The design separates the problem into two planes:

- `dnsmasq` plane: large DNS block datasets for OpenWrt local resolution
- Clash plane: very small supplemental rule providers for edge cases only

This split is deliberate. Large adblock lists fit `dnsmasq` well because the matching happens at local DNS level and does not bloat Clash profiles. Clash is kept small to avoid oversized templates, slower rule parsing, and maintenance drift.

The pipeline is data-driven:

- source definitions live in `data/*_sources.yaml`
- output wiring lives in `data/categories.yaml`
- policy and vendor exceptions live in `data/domain_policies.yaml`
- local overrides live in `dns/local_*list.txt`
- generation logic lives in `py/generate_adblock_outputs.py`

This keeps extension work additive. New categories, new upstreams, and new custom lists should usually mean editing data files, not rewriting generator code.

---

## 2. Problem Statement

The original problem was not just "block more ads".

The actual problem was:

- local IP / DNS blocking was not reliably taking effect for the intended profile flow
- GFW-targeted AI profiles needed stricter DNS leak protection than normal direct traffic
- OpenWrt already had `HTTPS DNS Proxy` with local DoH, so the blocking system needed to work with the local resolver chain rather than bypass it
- large adblock lists were useful for DNS blocking, but converting them wholesale into Clash rules would create operational cost

So the target design became:

- let OpenWrt local DNS do the heavy blocking
- keep Clash profiles focused on routing and leak control
- generate outputs automatically in GitHub Actions
- allow custom GitHub lists without patching Python every time

---

## 3. Architecture

### 3.1 Data Flow

1. GitHub Actions or local run executes `py/generate_adblock_outputs.py`.
2. The generator reads category metadata from `data/categories.yaml`.
3. For each category, it loads built-in upstream sources plus optional custom sources.
4. Domains are fetched, parsed, normalized, deduplicated, and sanitized.
5. Category/global policy rules are applied.
6. Local allowlist and local blocklist are merged.
7. Outputs are written as:
   - `dns/<category>.dnsmasq.conf`
   - `dns/<category>.hosts.txt`
   - `rule/<category-lite>.yaml`
8. OpenWrt pulls generated outputs through `shell/apply_adblock_dnsmasq.sh`.
9. Optional cron installs recurring refresh via `shell/setup_adblock_cron.sh`.

### 3.2 Categories

Current categories:

- `adblock`
- `tracking`
- `telemetry`
- `malware`

Each category has its own:

- upstream source file
- custom source extension file
- local allow/block override files
- lite Clash seed file
- output destinations

This avoids hardcoding category behavior into the generator.

### 3.3 Output Strategy

Large outputs:

- `dnsmasq.conf` files are the primary operational outputs
- `hosts.txt` files exist for optional merge scenarios

Small outputs:

- Clash lite rule providers contain only a narrow, intentionally curated subset
- they are not mirrors of the large DNS block sets

This is the key scaling decision in the design.

---

## 4. Decision Chain

This section records the actual decision path and why the design moved the way it did.

### Decision 1: Use `dnsmasq` as primary blocker, not Clash

We considered:

- A. convert large adblock lists directly into Clash rules
- B. use local DNS blocking for the large lists and keep Clash small

We chose `B`.

Why not `A`:

- large Clash rule sets make templates heavier
- parsing and distribution costs move into every profile consumer
- OpenClash is the wrong layer for bulk ad/tracking domain maintenance
- it increases config size for users who only need routing policy, not huge rule payloads

Why `B` worked better:

- OpenWrt already has local DNS control
- `dnsmasq` handles domain blocking at the resolution layer
- the blocklist can stay large without inflating Clash templates

What we learned:

- the system becomes easier to reason about if DNS blocking and routing policy are treated as separate responsibilities

### Decision 2: Keep a Clash supplement, but make it intentionally tiny

We considered:

- A. no Clash supplement at all
- B. a very small Clash supplement for selected domains

We chose `B`.

Why not pure DNS-only:

- some AI / app behaviors still benefit from a small routing-side supplement
- the user explicitly wanted AI profile handling and leak-protection-aware behavior

Why not full Clash conversion:

- same scaling problem as Decision 1

What we learned:

- a tiny rule provider is a useful pressure relief valve
- but it must remain seed-based and curated, not auto-expanded into the full upstream corpus

### Decision 3: Use generated files, not hand-edited outputs

We considered:

- A. manually maintain final `dnsmasq` / Clash outputs
- B. generate all outputs from source definitions

We chose `B`.

Why not `A`:

- source lists change frequently
- manual dedupe and normalization are error-prone
- it is difficult to review what changed and why

Why `B`:

- deterministic regeneration
- easier CI automation
- easier provenance of upstream sources

What we learned:

- generated outputs are large, but the maintenance surface is smaller because the editable inputs are narrow

### Decision 4: Use OCP-style data files instead of hardcoded toggles

We considered:

- A. add more `if/else` branches in Python every time a new category or source is needed
- B. move category and source metadata into YAML files

We chose `B`.

Why not `A`:

- the generator would become a pile of special cases
- each new block type would require code edits and higher regression risk

Why `B`:

- `data/categories.yaml` defines category shape
- `data/custom_*_sources.yaml` provides extension points
- the generator can stay generic

What we learned:

- "open/closed" here is practical, not academic: extend by adding data, not by reopening core logic

### Decision 5: Support custom GitHub blocklists as first-class inputs

We considered:

- A. ask users to patch upstream source files directly
- B. reserve separate custom source files

We chose `B`.

Why not `A`:

- local customizations would conflict with upstream repo maintenance
- project-owned sources and user-owned sources have different lifecycle expectations

Why `B`:

- custom source files preserve a clean separation
- repository defaults stay stable
- user additions remain explicit and reviewable

What we learned:

- extension points need to be visible and boring, not hidden in code

### Decision 6: Add vendor exclusion policy, then narrow it

We considered:

- A. no exclusion policy
- B. global vendor exclusion support

We started with `B`.

Why:

- the user wanted controls like "no google, no adobe, no XX"
- a policy layer was the right place for this, not parser-specific hacks

What went wrong:

- the initial policy used broad global keyword exclusions such as `google` and `adobe`
- this also filtered out intended lite seeds like `google-analytics.com`, `googleadservices.com`, and `googlesyndication.com`

What we changed:

- kept the policy system
- removed broad default keyword exclusions
- narrowed defaults to `exact` and `suffix`

What we learned:

- broad keyword policies are too blunt as defaults
- vendor policy is still useful, but the safe baseline is suffix/exact-first

### Decision 7: Keep malware framework present, but default sources off

We considered:

- A. enable large malware/phishing/scam feeds by default
- B. keep the framework ready, but disable noisy upstreams until a smaller default set is chosen

We chose `B`.

Why not `A`:

- candidate feeds were relatively noisy or large for a default-on baseline
- false positives are more expensive in malware blocking than in ad blocking

Why `B`:

- the category and output structure are already ready
- users can enable or extend it later

What we learned:

- shipping an empty-but-structured category is preferable to shipping an unstable default

---

## 5. Why This Design Fits OpenWrt

This repository targets OpenWrt and OpenClash, not generic desktop clients.

That matters because:

- OpenWrt already owns the LAN DNS path
- `dnsmasq` is the natural enforcement layer for large domain blocklists
- OpenClash should stay focused on traffic steering, DNS policy, and leak reduction

Trying to make Clash carry both routing policy and full DNS-block corpus would mix responsibilities and create avoidable operational weight.

---

## 6. Trade-Off Summary

### What we gain

- smaller Clash profiles
- better separation of concerns
- deterministic generation
- clear extension points for custom sources
- category-specific policy control
- easier GitHub Actions automation

### What we accept

- generated files are large in Git history
- category data is split across multiple files
- malware defaults are conservative and currently minimal
- users still need to understand whether a block belongs in DNS or Clash

---

## 7. Current Operating Model

Recommended default:

- `ENABLE_ADBLOCK=1`
- `ENABLE_TRACKING_BLOCK=0`
- `ENABLE_MALWARE_BLOCK=0`
- `ENABLE_HOSTS_MERGE=0`

Interpretation:

- ad blocking is the baseline
- tracking and malware remain opt-in until source quality is tuned further
- `hosts` merge is optional, not primary

---

## 8. Future Extension Path

The design leaves room for the following without changing the generator structure:

- add new categories
- add curated smaller malware defaults
- add per-category vendor policies
- add stricter validation on custom source metadata
- add source health scoring or fallback handling
- emit machine-readable summaries for CI reporting

The intended rule is simple:

- new behavior should first try to fit in `data/`
- generator code should change only when the model itself changes

---

## 9. Archived Script Lessons

The archived shell scripts remain useful as historical reference, but only for a narrow set of runtime patterns.

Reusable patterns worth preserving:

- detect the active `dnsmasq` include directory dynamically from `uci show dhcp.@dnsmasq[0]`
- support both hash-style and index-style OpenWrt `dnsmasq` layouts
- poll OpenClash status with a bounded timeout before applying runtime changes
- check download exit codes explicitly and leave a local log when a fetch fails
- clear only the managed generated artifacts before replacing them

Patterns that should not be copied forward:

- injecting large shell payloads into another shell script by string replacement
- depending on exact marker lines inside OpenClash developer-option scripts
- hardcoding one legacy `dnsmasq` directory path or one firmware-specific hash
- appending directly into `/etc/hosts` as the primary deployment model
- combining source download logic, deployment logic, and interactive prompting in one script

The design rule is:

- reference archived scripts for runtime heuristics only
- keep state and content generation in the repository pipeline
- keep deployment as a dedicated apply step, not an in-place script patch

---

## 10. Related Document

For day-2 maintenance and extension procedures, see:

- [Adblock DNS Pipeline Operations](./ADBLOCK_PIPELINE_OPERATIONS.md)
- [Rule Asset Matching Contract](./RULE_ASSET_MATCHING_CONTRACT.md)
