# Codex Remediation Spec — Data-Driven AI Routing Profiles

**Repository:** `mythic3011/rules`
**Primary target:** `internal/python/generate_ai_profiles.py`
**Goal:** remove duplicated routing policy, stop regex failure modes, adopt GeoSite as the default domain taxonomy, and separate traffic classification from Hong Kong product availability.

---

## 0. Scope and non-goals

This is not a cosmetic refactor and not a YAML migration for its own sake.

The current script is simultaneously:

- policy catalogue;
- region/node classifier;
- service routing matrix;
- strict-mode guard list;
- rule-provider registry;
- YAML renderer;
- filesystem mutator;
- secret renderer;
- SSH / Gaming / Tailscale companion-rule manager.

That creates several independent sources of truth for the same fact.

The target architecture is:

```text
declarative catalogues
  -> compiler / validator
  -> generated Mihomo YAML + generated rule-provider payloads
  -> OpenClash / Mihomo runtime
```

Python owns compiler behaviour and validation.
Data files own service policy, product exceptions, region aliases, enabled packs, and provider metadata.

Do not replace Python hard code with an unvalidated YAML hard-code zoo.

---

## 1. Confirmed defects to fix first

### P0.1 Regex empty-alternative bug

`AI_HK_EXCLUDE_TERMS` begins with `|`:

```python
AI_HK_EXCLUDE_TERMS = r"|香港|Hong Kong|Hong-Kong|\bHKG\b|\bHK\b"
```

`AI_POOL_FILTER` embeds it into a negative lookahead. Because an empty alternative matches every string, the negative lookahead fails for every node. Result: AI node selection can become empty.

All entries in `REGION_FILTERS` also begin with `|`:

```python
r"(?i)(|美國|美国|...)"
```

That means every region pattern can match every node, including an empty string. Result: US / JP / SG / TW / KR groups are no longer meaningful classifiers.

### Required fix

Never write alternation strings manually. Store individual terms and compile them.

```python
from collections.abc import Iterable


def regex_any(terms: Iterable[str]) -> str:
    values = tuple(terms)
    if not values:
        raise ValueError("regex_any requires at least one term")

    for term in values:
        if not term:
            raise ValueError("empty regex term")
        if term.startswith("|") or term.endswith("|"):
            raise ValueError(f"invalid alternation term: {term!r}")

    return "(?:" + "|".join(values) + ")"
```

Use `regex_any()` for all node filters. Add tests that each region regex:

- does not match `""`;
- has positive fixtures;
- rejects nodes from other regions;
- does not accidentally match non-node provider notices.

---

### P0.2 Duplicated service classification

The same service identity is currently repeated across:

- `AI_RULESETS`;
- `AI_ALL_RULESET`;
- `relaxed_service_proxies()`;
- `strict_service_proxies()`;
- `render_rule_providers()`.

This causes drift. A new service or changed domain coverage requires editing several unrelated blocks.

### Required fix

One service declaration must derive all projections:

```text
service declaration
  -> generated service rule-provider payload
  -> generated proxy-group candidates
  -> generated strict guard rules
  -> generated provider registry entry
  -> generated YAML routing rule
```

Do not hand-maintain `AI_All_Classical.yaml`. Derive it from service guard declarations.

---

### P0.3 `GEOSITE,bing` is too broad for Copilot

`GEOSITE,bing` includes ordinary Bing traffic, not only GitHub Copilot. It should not be used as the identity rule for a Copilot-specific group.

### Required fix

Use a Copilot-specific GeoSite tag when available in the selected geodata dependency. If no sufficiently narrow tag exists, use an explicit minimal override rule-set and document why.

Do not treat a broad vendor/product family tag as product identity without a fixture proving the intended scope.

---

### P0.4 Generator mutates user-owned `Custom_*` files

`migrate_custom_direct_supporting_rules()` appends managed Tailscale entries to:

- `rule/Custom_Direct_Domain.yaml`;
- `rule/Custom_Direct_Classical_IP.yaml`.

This breaks ownership boundaries, creates append-only drift, and makes user-authored inputs non-idempotent.

### Required fix

Generate a separate managed file, for example:

```text
rule/Managed_Tailscale_Direct_Domain.yaml
rule/Managed_Tailscale_Notes.yaml
```

Reference those generated files as their own rule providers.

`Custom_*` files remain user-owned and are never mutated by the compiler.

---

### P0.5 Mutable remote dependency

The current generated URL uses:

```text
@main
```

for routing policy. This makes routers silently consume changing repository state.

### Required fix

The generated deployment manifest must take a pinned revision:

```text
RULES_REVISION=<tag-or-commit-sha>
```

Examples:

```text
v2026.06.30
a1b2c3d4...
```

Do not default production output to `@main`.

---

## 2. New architecture

Suggested layout:

```text
data/
  manifests/
    ai-relaxed.yaml
    ai-strict.yaml

  services/
    openai.yaml
    anthropic.yaml
    google-ai.yaml
    github-copilot.yaml
    perplexity.yaml
    xai.yaml
    poe.yaml

  availability/
    hk.yaml

  regions/
    aliases.yaml

  packs/
    ssh.yaml
    gaming.yaml
    tailscale.yaml
    process-rules.yaml

py/
  profile_compiler/
    __init__.py
    models.py
    load.py
    compile.py
    validate.py
    render_mihomo.py
    write.py
    geosite.py

  generate_ai_profiles.py

tests/
  test_regex_filters.py
  test_service_compilation.py
  test_availability.py
  test_generated_invariants.py
```

`generate_ai_profiles.py` should become a thin CLI wrapper only.

```text
python internal/python/generate_ai_profiles.py generate --manifest data/manifests/ai-strict.yaml
python internal/python/generate_ai_profiles.py validate --manifest data/manifests/ai-strict.yaml
python internal/python/generate_ai_profiles.py explain --service notebooklm --location HK
python internal/python/generate_ai_profiles.py check
```

---

## 3. Source-of-truth model

### 3.1 Service definition

Example `data/services/anthropic.yaml`:

```yaml
id: anthropic
display_group: "🤖 Claude"

classification:
  geosite:
    - anthropic

  # Only use exact narrow rules for product-specific exceptions.
  overrides: []

strict_guard:
  # Broad guard tokens are not normal routing rules.
  # They are used only as final strict-mode catchers.
  domain_keywords:
    - anthropic
    - claude

routing:
  preferred_regions: [sg, us, jp, tw, kr]
  direct_mode: never

availability_key: anthropic
```

Example `data/services/google-ai.yaml`:

```yaml
id: google-ai
display_group: "✨ Google AI"

classification:
  geosite:
    - google-deepmind

strict_guard:
  domain_keywords:
    - gemini
    - deepmind

routing:
  preferred_regions: [sg, us, jp, tw, kr]
  direct_mode: policy

availability_key: google-ai
```

The compiler must generate `RULE-SET` payloads and YAML rule routing from these declarations.

---

### 3.2 Product-specific overrides

A GeoSite family tag is not necessarily a product tag.

Google AI is the important example:

```text
GeoSite / family taxonomy
  = identifies Google AI traffic family

Product availability
  = decides whether a Hong Kong direct route is allowed,
    manual-only, blocked, or unknown
```

`google-deepmind` may cover Gemini, NotebookLM, AI Studio, Gemini API and related products. It must not imply identical Hong Kong availability.

Use a narrow override only where user experience or availability diverges.

Example:

```yaml
id: notebooklm
display_group: "📓 NotebookLM"

classification:
  overrides:
    - DOMAIN-SUFFIX,notebooklm.google.com
    - DOMAIN-SUFFIX,notebooklm.google
  fallback_geosite: google-deepmind

routing:
  preferred_regions: [sg, us, jp, tw, kr]
  direct_mode: policy

availability_key: notebooklm
```

Exact domain rules must appear before family-level GeoSite rules.

---

### 3.3 Hong Kong availability policy

Create `data/availability/hk.yaml`.

```yaml
jurisdiction: HK
products:
  gemini:
    status: supported
    direct: allowed
    source: official-google-product-page
    verified_at: "2026-06-30"

  notebooklm:
    status: unsupported_or_uncertain
    direct: manual_only
    auto_fallback: false
    source: official-google-notebooklm-availability-page
    verified_at: "2026-06-30"

  google-ai-studio:
    status: unavailable
    direct: reject
    auto_fallback: false
    source: official-google-ai-studio-availability-page
    verified_at: "2026-06-30"

  gemini-api:
    status: unavailable
    direct: reject
    auto_fallback: false
    source: official-google-gemini-api-availability-page
    verified_at: "2026-06-30"
```

Important policy rule:

```text
unsupported / unavailable must not implicitly become "auto-route through US".
```

The compiler can expose a manual group to the user, but must not silently route around a product’s regional availability constraints.

`manual_only` means generated config may offer the service group, but health-based automatic fallback must not select overseas nodes by itself.

Keep source URLs and verification dates in the data file. Availability is a volatile fact and needs periodic review.

---

## 4. GeoSite policy

### Default rule

Use GeoSite as the primary domain taxonomy source.

```text
GeoSite owns:
  vendor / product-family domain coverage

This repository owns:
  route target
  product-specific exception rules
  HK availability policy
  fallback order
  strict-mode behaviour
```

### Constraint

GeoSite does not remove all maintenance. It removes most domain-list maintenance.

Use an override only when one of these is true:

1. a family GeoSite tag is too broad for the required UX group;
2. product availability differs within the family;
3. the target GeoSite tag does not exist or is demonstrably inaccurate;
4. a critical endpoint is missing and has a test fixture.

Every override requires:

```yaml
reason: "NotebookLM has HK availability behaviour distinct from the Google AI family"
owner: "local policy"
review_after: "2026-09-30"
```

No unexplained `DOMAIN-KEYWORD` should be accepted.

---

## 5. Strict versus relaxed profiles

Do not maintain separate hard-coded service matrices.

Declare profile defaults:

```yaml
# data/manifests/ai-relaxed.yaml
mode: relaxed
unmatched_action: fallback
default_direct_allowed: true
strict_unclassified_ai_guard: false
enabled_packs: [ai, ssh, gaming, tailscale]
```

```yaml
# data/manifests/ai-strict.yaml
mode: strict
unmatched_action: reject
default_direct_allowed: false
strict_unclassified_ai_guard: true
enabled_packs: [ai, ssh, gaming, tailscale]
```

Compiler logic:

```python
def service_candidates(service: ServiceSpec, profile: ProfileSpec) -> list[str]:
    candidates = ["manual", "auto"]

    direct_allowed = (
        profile.default_direct_allowed
        and service.routing.direct_mode != "never"
        and service.availability.allows_direct(profile.location)
    )

    if direct_allowed:
        candidates.append("direct")

    candidates.extend(service.routing.preferred_regions)
    candidates.append("reject")
    return candidates
```

`strict` should differ through policy flags, not duplicated dictionaries.

---

## 6. Group authority cleanup

Current design mixes `manual`, `auto`, and `fallback` as if they are the same authority.

They are not:

```text
manual   = user selects a route
auto     = runtime health checker selects a route
fallback = terminal/default policy path
```

Generated hierarchy should look like:

```text
ChatGPT (select)
├── ChatGPT Auto (fallback / url-test)
├── 手動選擇
├── 新加坡節點
├── 美國節點
├── 日本節點
├── 台灣節點
├── 韓國節點
└── ⛔ 拒絕
```

Do not make a user-facing service group itself a `fallback` group unless that is explicitly the intended runtime authority.

---

## 7. Region classifier

Node names are unstructured provider input. A region alias catalogue is unavoidable, but it must be isolated and testable.

Example `data/regions/aliases.yaml`:

```yaml
regions:
  us:
    aliases:
      - US
      - USA
      - United States
      - Los Angeles
      - LAX
      - SFO
      - Seattle

  jp:
    aliases:
      - JP
      - Japan
      - Tokyo
      - NRT
      - HND
      - KIX

  sg:
    aliases:
      - SG
      - Singapore
      - SIN

  tw:
    aliases:
      - TW
      - Taiwan
      - Taipei
      - TPE

  kr:
    aliases:
      - KR
      - Korea
      - Seoul
      - ICN
```

Compiler requirements:

- escape literal aliases unless explicitly marked regex;
- compile case-insensitive patterns;
- reject empty aliases;
- reject aliases containing accidental leading/trailing `|`;
- expose a debug command showing which aliases matched each node;
- support fixtures for positive and negative node names.

Example:

```text
python internal/python/generate_ai_profiles.py explain-node "JP Tokyo 03"
```

Expected:

```text
region=jp
matched_aliases=["JP", "Tokyo"]
```

---

## 8. Rule-provider model

A provider registry entry should derive from the same rule-set specification that defines its payload.

```yaml
id: AI_Claude_Classical
kind: classical
file: AI_Claude_Classical.yaml
generated: true
source_service: anthropic
```

Do not define rule payload in one place and provider transport metadata in another.

All generated provider URLs use the pinned `rules_revision`.

---

## 9. User-owned versus generated files

Ownership table:

```text
Generated / compiler-owned:
  cfg/yaml/Custom_Clash_AI.yaml
  cfg/yaml/Custom_Clash_AI_Strict.yaml
  cfg/Custom_Clash_AI.ini
  rule/Managed_*.yaml
  rule/AI_*.yaml
  rule/SSH_*.yaml
  rule/Gaming_*.yaml
  rule/Process_*.yaml

User-owned / never mutated:
  rule/Custom_Direct_Domain.yaml
  rule/Custom_Direct_Classical_IP.yaml
  rule/Custom_Proxy_Domain.yaml
  rule/Custom_Proxy_Classical_IP.yaml
  local/private overlay files
```

The compiler must fail if it tries to write an unowned path.

Writes must use atomic replace:

```python
temp_path = path.with_suffix(path.suffix + ".tmp")
temp_path.write_text(content, encoding="utf-8", newline="\n")
temp_path.replace(path)
```

---

## 10. Secrets and local proxy overlays

Public generated files should be deterministic and secret-free.

Do not render `OPENCLASH_SECRET`, SOCKS username, or SOCKS password into repository output.

Use an ignored local overlay:

```text
cfg/yaml/Custom_Clash_AI.local.yaml
```

or secret reference supported by the deployment environment.

Requirements:

- local overlay path in `.gitignore`;
- permissions `0600` where supported;
- CI must scan generated public outputs for forbidden secret keys/values;
- missing local secrets must not make public config invalid;
- do not log secret values in `explain`, `validate`, errors, or CI output.

---

## 11. Process rule parsing

`load_process_rule_source()` is a partial handwritten YAML parser.

Replace it with `yaml.safe_load` and schema validation, or use JSON/TOML.

Required validation:

- no unknown categories;
- no duplicate process name across categories unless an explicit precedence is declared;
- no empty names;
- all values are strings;
- source must parse fully or compilation fails;
- process rules must be disabled by default for router-mode OpenClash deployments.

Generated comments should explain that `PROCESS-NAME` cannot classify LAN client processes when Mihomo runs on the router.

---

## 12. Required tests

### Regex and classification

```text
- AI pool filter accepts: US-LA-01, JP Tokyo 03
- AI pool filter rejects: 香港 IEPL, Traffic 200GB, Telegram Channel
- every region filter rejects empty string
- US does not match JP fixture
- JP does not match SG fixture
- no region regex matches all fixture nodes
```

### Service compilation

```text
- each service produces exactly one provider registration
- each service produces one proxy group
- strict guard is derived from declarations only
- no service requires edits in a second hard-coded registry
- exact product override rules appear before family GeoSite rules
- broad GeoSite tags cannot be used for product identity without explicit waiver
```

### Availability

```text
- NotebookLM HK status does not auto-select an overseas proxy
- unavailable product emits reject/manual-only result according to policy
- Gemini HK direct behaviour is controlled independently from NotebookLM
- stale `verified_at` emits validation warning or fails under CI policy
```

### Output invariants

```text
- generated config parses as YAML
- generated rule-provider file parses as expected classical/domain format
- every `RULE-SET` reference has exactly one provider
- every provider file exists
- strict output contains no DIRECT candidate for services marked direct_mode: never
- public output contains no configured secret values
- generator is byte-stable: generate twice -> no diff
- compiler never modifies `Custom_*`
- generated URLs are pinned; no `@main`
```

### Runtime validation

Run Mihomo validation in CI where available:

```bash
mihomo -t -f cfg/yaml/Custom_Clash_AI.yaml
mihomo -t -f cfg/yaml/Custom_Clash_AI_Strict.yaml
pytest -q
git diff --exit-code
```

---

## 13. Migration sequence

1. Add tests reproducing the current empty-alternative regex bug.
2. Fix regex compilation before changing routing semantics.
3. Introduce typed models and catalogues while keeping existing output names.
4. Move service declarations into data files and derive:
   - payload;
   - provider registry;
   - group candidates;
   - strict guard.
5. Replace inline domain lists with GeoSite where a suitable tag exists.
6. Add narrow product overrides for availability-divergent products.
7. Add `availability/hk.yaml`.
8. Split managed Tailscale output from `Custom_*`.
9. Pin generated remote URLs to a revision.
10. Move secrets to a private ignored overlay.
11. Replace handwritten process YAML parser.
12. Add CI gates and remove old duplicated functions only after output parity tests pass.

Do not do a big-bang rewrite. Preserve current output filenames first; change semantics only behind fixture-backed policy changes.

---

## 14. Acceptance criteria

This work is complete only when:

```text
[ ] no leading/trailing alternation bug can be introduced by catalogue data
[ ] no duplicated strict/relaxed routing matrix exists
[ ] no hand-maintained AI all-services guard file exists
[ ] each service has one authoritative declaration
[ ] GeoSite is used as default taxonomy, with documented minimal overrides
[ ] Google AI family classification and HK product availability are separate models
[ ] NotebookLM HK is not inferred from Gemini or Google AI subscription availability
[ ] unavailable / uncertain products never auto-bypass regional constraints
[ ] generated code never mutates Custom_* files
[ ] URLs are revision-pinned
[ ] public generated outputs contain no secrets
[ ] generated outputs are deterministic and validated in CI
```

---

## 15. Explicit design decisions

- **GeoSite is a classifier, not an availability oracle.**
- **Service route rules are narrow; strict guard rules may be broad but are isolated.**
- **`manual`, `auto`, and `fallback` are separate authorities.**
- **Availability policy controls automatic routing; it does not silently bypass a product’s regional restrictions.**
- **The compiler owns derivation; catalogues own facts.**
- **A small documented override is acceptable. Copying upstream domain lists is not.**
