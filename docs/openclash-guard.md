# OpenClash Guard

OpenClash Guard is the repository's generated standalone POSIX shell application for interactive OpenWrt setup, policy refresh, diagnostics, and fail-closed reconciliation.

## Install and Open the Menu

<!-- BEGIN GENERATED OPENCLASH GUARD INSTALL -->
Use the stable human-facing bootstrap alias:

```sh
curl -fsSL https://analytics.mythic3011.com/q/qdf9961KN | sh
```

With no arguments and a controlling terminal, the generated guard opens its interactive menu and reads input from `/dev/tty`. The alias is only an onboarding redirect; runtime refresh does not depend on it.

### Direct Sources / Fallback

Raw GitHub and CDN commands are generated from the canonical distribution catalog:

```sh
curl -fsSL https://raw.githubusercontent.com/mythic3011/rules/refs/heads/main/dist/openclash-guard.sh | sh
curl -fsSL https://cdn.jsdelivr.net/gh/mythic3011/rules@main/dist/openclash-guard.sh | sh
```

For a one-shot headless command:

```sh
curl -fsSL https://analytics.mythic3011.com/q/qdf9961KN | sh -s -- status
```
<!-- END GENERATED OPENCLASH GUARD INSTALL -->

## Installed Commands

Running `openclash-guard` opens the menu. Direct subcommands remain available for automation:

```text
openclash-guard status
openclash-guard doctor [SERVICE]
openclash-guard refresh [--source auto|github-raw|jsdelivr]
openclash-guard apply
openclash-guard reconcile
openclash-guard template list|suggest|show|apply
openclash-guard geo direct|route ROUTE
openclash-guard remove
```

Global automation flags include `--json`, `--yes`, `--dry-run`, and `--policy-file FILE`. Output mode never bypasses destructive confirmation; use `--yes` explicitly in trusted automation.

## Public Surfaces

- `setup/openclash/install.sh` is the profile/bootstrap helper.
- `dist/openclash-guard.sh` is the generated standalone application.
- `cfg/runtime/openclash-guard.json` is the generated runtime policy.
- `dist/manifest.json` and `dist/openclash-guard.sha256` describe the built application.

The application is generated from modular sources under `shell/`; do not edit `dist/openclash-guard.sh` directly.
