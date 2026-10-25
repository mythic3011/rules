# Setup

End users do not need Node.js, Python, or a local clone to consume published rules.

## OpenClash subscription conversion

Static AI custom-template URL:

```text
https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/cfg/Custom_Clash_AI.ini
```

Paste it into OpenClash's **Custom Template URL** field when subscription conversion is enabled.

For personalized region constraints, the optional Web Builder under `apps/profile-service/` creates an opaque custom-template URL:

```text
https://<your-worker-domain>/p/<opaque-token>.ini
```

That URL remains stable when the saved profile is edited.

## Ready-to-load OpenClash / Mihomo YAML

Recommended profile URL:

```text
https://testingcf.jsdelivr.net/gh/mythic3011/rules@main/cfg/yaml/Custom_Clash_AI.yaml
```

Safer router-side install flow:

```sh
wget -O /tmp/mythic3011-rules-install.sh \
  https://raw.githubusercontent.com/mythic3011/rules/main/setup/openclash/install.sh
sh /tmp/mythic3011-rules-install.sh --profile ai-balanced --install
```

The installer only downloads the file. It deliberately does not select the profile, modify routing state, or restart OpenClash.

Use `--profile ai-strict` for the fail-closed variant.
