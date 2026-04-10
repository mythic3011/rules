# Adblock DNS Pipeline Operations

## 1. Scope

This document explains how to operate and extend the generated adblock DNS pipeline.

Use this document when you need to:

- add or remove upstream block sources
- add custom GitHub blocklists
- tune vendor include/exclude policy
- add a new blocking category
- regenerate outputs locally
- understand what GitHub Actions will update automatically

For the design rationale and decision chain, see:

- [Adblock DNS Pipeline Design](./ADBLOCK_PIPELINE_DESIGN.md)

---

## 2. Source of Truth

Editable inputs:

- `data/categories.yaml`
- `data/adblock_sources.yaml`
- `data/tracking_sources.yaml`
- `data/telemetry_sources.yaml`
- `data/malware_sources.yaml`
- `data/custom_adblock_sources.yaml`
- `data/custom_tracking_sources.yaml`
- `data/custom_telemetry_sources.yaml`
- `data/custom_malware_sources.yaml`
- `data/domain_policies.yaml`
- `data/clash_lite_seed.txt`
- `data/tracking_lite_seed.txt`
- `data/telemetry_lite_seed.txt`
- `data/malware_lite_seed.txt`
- `dns/local_allowlist.txt`
- `dns/local_blocklist.txt`
- `dns/local_tracking_allowlist.txt`
- `dns/local_tracking_blocklist.txt`
- `dns/local_telemetry_allowlist.txt`
- `dns/local_telemetry_blocklist.txt`
- `dns/local_malware_allowlist.txt`
- `dns/local_malware_blocklist.txt`

Generated outputs:

- `dns/adblock.dnsmasq.conf`
- `dns/adblock.hosts.txt`
- `dns/tracking.dnsmasq.conf`
- `dns/tracking.hosts.txt`
- `dns/telemetry.dnsmasq.conf`
- `dns/telemetry.hosts.txt`
- `dns/malware.dnsmasq.conf`
- `dns/malware.hosts.txt`
- `rule/Ads_Lite_Domain.yaml`
- `rule/Tracking_Lite_Domain.yaml`
- `rule/Telemetry_Lite_Domain.yaml`
- `rule/Malware_Lite_Domain.yaml`
- `reports/index.json`
- `reports/*.summary.json`

Operational scripts:

- `py/generate_adblock_outputs.py`
- `shell/apply_adblock_dnsmasq.sh`
- `shell/setup_adblock_cron.sh`

Pages site:

- `site/index.html`
- `.github/workflows/deploy-reports-site.yml`

---

## 3. Normal Workflow

### 3.1 Local regeneration

Run:

```bash
python3 py/generate_adblock_outputs.py
```

Then verify:

```bash
python3 -m py_compile py/generate_adblock_outputs.py
sh -n shell/apply_adblock_dnsmasq.sh shell/setup_adblock_cron.sh
git diff --stat
```

### 3.2 GitHub Actions regeneration

Workflow:

- `.github/workflows/auto-generate-adblock.yml`

It triggers on changes to:

- source config files
- local allow/block files
- lite seed files
- policy config
- generator code
- report-rendering site files are deployed by a separate Pages workflow

It also runs on schedule and via `workflow_dispatch`.

---

## 4. Add a New Upstream Source

### 4.1 Built-in source

If the source is part of the repo default behavior, add it to one of:

- `data/adblock_sources.yaml`
- `data/tracking_sources.yaml`
- `data/telemetry_sources.yaml`
- `data/malware_sources.yaml`

Example:

```yaml
sources:
  - id: example_list
    enabled: true
    priority: 50
    format: plain_domains
    url: https://raw.githubusercontent.com/example/repo/main/domains.txt
    homepage: https://github.com/example/repo
```

### 4.2 Custom user source

If the source is user-specific or experimental, add it to one of:

- `data/custom_adblock_sources.yaml`
- `data/custom_tracking_sources.yaml`
- `data/custom_telemetry_sources.yaml`
- `data/custom_malware_sources.yaml`

This keeps project defaults and user extensions separate.

### 4.3 Supported formats

Current parser names:

- `dnsmasq_conf`
- `domainswild2`
- `plain_domains`
- `hosts`
- `adblock_domains`

If a new source does not fit these formats, that is the point where generator code may need to change.

---

## 5. Add a Local Override

### 5.1 Force-block a domain

Add the domain to the category blocklist:

- `dns/local_blocklist.txt`
- `dns/local_tracking_blocklist.txt`
- `dns/local_telemetry_blocklist.txt`
- `dns/local_malware_blocklist.txt`

### 5.2 Force-allow a domain

Add the domain to the category allowlist:

- `dns/local_allowlist.txt`
- `dns/local_tracking_allowlist.txt`
- `dns/local_telemetry_allowlist.txt`
- `dns/local_malware_allowlist.txt`

Rule:

- allowlist wins over upstream domain collection
- local blocklist adds domains even if upstream does not contain them

---

## 6. Adjust Vendor Policy

Policy file:

- `data/domain_policies.yaml`

Current model supports:

- `include_exact`
- `include_suffix`
- `include_keyword`
- `exclude_exact`
- `exclude_suffix`
- `exclude_keyword`

At both levels:

- `global`
- `categories.<name>`

### 6.1 Preferred default

Use:

- `exact`
- `suffix`

Avoid broad `keyword` exclusions as defaults unless the blast radius is clearly acceptable.

### 6.2 Why keyword is dangerous

Example:

- excluding keyword `google` also removes:
  - `google-analytics.com`
  - `googleadservices.com`
  - `googlesyndication.com`

That is why the current default was narrowed away from keyword-based exclusion.

### 6.3 Safe operating rule

Start with:

- category-specific `exclude_suffix`

Escalate to:

- `exclude_keyword`

only if exact/suffix rules cannot express the requirement.

---

## 7. Add a New Category

This is the main OCP extension path.

### 7.1 Add category metadata

Edit:

- `data/categories.yaml`

Add a new category entry with:

- source config path
- custom source config path
- lite seed path
- allowlist path
- blocklist path
- dnsmasq output path
- hosts output path
- clash output path
- clash rule-provider name

### 7.2 Create category files

Create the referenced files:

- `data/<category>_sources.yaml`
- `data/custom_<category>_sources.yaml`
- `data/<category>_lite_seed.txt`
- `dns/local_<category>_allowlist.txt`
- `dns/local_<category>_blocklist.txt`

### 7.3 Add policy section

Extend:

- `data/domain_policies.yaml`

under:

- `categories.<new-category>`

### 7.4 Update workflow triggers

If the new category introduces new input file paths, extend:

- `.github/workflows/auto-generate-adblock.yml`

Otherwise GitHub Actions will not regenerate automatically on input changes.

### 7.5 Decision rule

If adding a new category requires only new data files and workflow path updates, the design is still behaving correctly.

If adding a new category requires category-specific Python branching, the data model is no longer sufficient and should be revisited.

---

## 8. Update Lite Clash Seeds

Lite seed files:

- `data/clash_lite_seed.txt`
- `data/tracking_lite_seed.txt`
- `data/malware_lite_seed.txt`

Use these for:

- high-value domains that deserve a tiny Clash-side supplement

Do not use these files to mirror large upstream datasets.

Rule:

- if you feel pressure to add hundreds or thousands of domains here, the domain likely belongs in DNS, not Clash

---

## 9. OpenWrt Deployment

### 9.1 One-shot apply

Use:

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
wget -qO- "https://testingcf.jsdelivr.net/gh/mythic3011/rules@refs/heads/${RULES_BRANCH}/shell/apply_adblock_dnsmasq.sh" | sh
```

### 9.2 Install cron refresh

Use:

```bash
RULES_BRANCH="${RULES_BRANCH:-main}"
wget -qO- "https://testingcf.jsdelivr.net/gh/mythic3011/rules@refs/heads/${RULES_BRANCH}/shell/setup_adblock_cron.sh" | sh
```

### 9.3 Recommended defaults

```bash
ENABLE_ADBLOCK=1
ENABLE_TRACKING_BLOCK=0
ENABLE_MALWARE_BLOCK=0
ENABLE_HOSTS_MERGE=0
```

Rationale:

- adblock is the most stable baseline
- tracking and malware need more careful source selection
- hosts merge is optional and should not be the default transport

---

## 10. Triage Guide

### 10.1 Domain should be blocked but is not

Check in this order:

1. Is the domain present in upstream data after normalization?
2. Is it being removed by allowlist or policy?
3. Was the generator rerun?
4. Did GitHub Actions commit fresh outputs?
5. Did OpenWrt re-pull the generated `dnsmasq` files?
6. Was `dnsmasq` restarted successfully?

### 10.2 Domain should not be blocked but is

Check in this order:

1. Is it in upstream data?
2. Is it matched by policy suffix/keyword exclusion logic?
3. Should it be put into the local allowlist?
4. Is the issue in DNS layer or Clash lite layer?

### 10.3 Malware category output is empty

This is currently expected if all malware upstream sources remain disabled.

That is not a generator failure by itself.

---

## 11. Operational Guardrails

Use these rules to keep the system maintainable:

- do not convert full upstream DNS blocklists into Clash rule providers
- do not add broad keyword policies as defaults without checking lite seed damage
- do not mix user-specific sources into built-in source files unless they are intended as project defaults
- do not treat `hosts` output as the primary path when `dnsmasq` output already solves the problem
- do not add parser-specific hacks when the problem can be expressed in data files

---

## 12. Change Checklist

Before merging a change:

1. Regenerate outputs locally.
2. Verify Python and shell syntax.
3. Check whether lite Clash output stayed intentionally small.
4. Check whether vendor policy accidentally removed wanted domains.
5. Check whether workflow trigger paths cover the edited input files.
6. Confirm whether the change belongs in DNS, Clash, or both.
