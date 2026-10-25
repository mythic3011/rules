# Getting started

## Choose the right artifact

There are two different OpenClash workflows in this repository:

1. **Ready-to-load runtime config** — use `cfg/yaml/*.yaml` when you want a complete Mihomo/OpenClash YAML profile.
2. **Subscription conversion** — use a `cfg/*.ini` custom template, or the Profile Builder's opaque `/p/<token>.ini`, when OpenClash/subconverter is converting an existing provider subscription.

Do not load a `.ini` template as runtime Mihomo YAML.

The canonical published list is `catalog.json`. In a clone:

```sh
./rulesctl list
```

## OpenClash subscription conversion

For a static AI template:

```text
https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/cfg/Custom_Clash_AI.ini
```

Use it as OpenClash's **Custom Template URL**.

For a personalized template, deploy `apps/profile-service/` and use its Web Builder. The builder returns a stable opaque URL:

```text
https://<your-worker-domain>/p/<opaque-token>.ini
```

The URL does not encode `disable`, `only`, or `prefer` settings. The Worker resolves the saved `ProfileSpec` and emits the INI on every subscription fetch.

Local preview without Cloudflare:

```sh
./rulesctl profile render --disable hk --prefer jp,sg -o /tmp/custom.ini
```

## Ready-to-load OpenClash/Mihomo YAML

Recommended rolling URL:

```text
https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/cfg/yaml/Custom_Clash_AI.yaml
```

Router-side download:

```sh
wget -O /tmp/mythic3011-rules-install.sh \
  https://raw.githubusercontent.com/mythic3011/rules/main/setup/openclash/install.sh
sh /tmp/mythic3011-rules-install.sh --profile ai-balanced --install
```

The script writes `/etc/openclash/config/mythic3011-ai-balanced.yaml`, preserving an existing file as `.bak`. It does not activate or restart OpenClash.

## Pinning and CDN channels

`catalog.json` exposes three rolling channels: `testingcf.jsdelivr.net`, jsDelivr CDN, and raw GitHub. Generated AI distribution metadata additionally exposes immutable jsDelivr URLs with a commit SHA placeholder for reproducible deployment.

## Contributions vs personal profile preferences

Regional service facts belong in the GitHub Service Intake workflow because they improve the canonical registry for everyone.

Personal choices such as "never use HK nodes" or "prefer JP then SG" belong in a saved `ProfileSpec`; they must not be hand-edited into generated `cfg/*.ini` files.
