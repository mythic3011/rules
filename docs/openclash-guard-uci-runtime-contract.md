# OpenClash Guard UCI runtime contract

The canonical schema is [`uci-runtime-contract.json`](../internal/config/openclash-guard/uci-runtime-contract.json). It records the accepted `openclash_guard` options, types, defaults, validation phases, and authority labels. The resolver rules and their explicit gaps are in [`uci-overlay-resolution.json`](../internal/config/openclash-guard/uci-overlay-resolution.json).

## Candidate status

The shell source is wired in an unsigned sequence-7 candidate. Source wiring and generated bundles do not establish a signed release, deployment, or live enforcement. [Issue #124](https://github.com/mythic3011/rules/issues/124) tracks the remaining runtime consumers and release qualification.

## Authority and lifecycle

UCI records local operator intent. The signed runtime policy remains authoritative for service capabilities, protected services, nft ownership, protected UDP ports, and fail-mode requirements. Live observations determine external capabilities. UCI cannot widen either authority.

Known options are type-checked before reconciliation can mutate nftables. A malformed known value invalidates the snapshot and causes reconciliation to refuse. Unknown options are ignored and reported. Status exposes the option path and a redacted reason, never the configured value.

`main.enabled`, `main.kill_switch`, and `main.dns_kill_switch` are read through the normalized snapshot. `udp.enabled` and `udp.src_ip` remain validated intent with `next-release` phase and `signed-policy-gated` authority. Their gate is undefined, so they are reported as deferred and never used as effective fallbacks. Scoped UDP direct-bypass exceptions remain disabled; a future signed release is not presumed to activate them.

The configured-client count remains available for existing diagnostics and template suggestions. Client addresses stay redacted, and the count does not authorize routing or a bypass.

Routing mode, region, DNS, resolver-sync, and LuCI-only fields retain the phases and authority labels recorded in the JSON contract. See the integration document for the gates currently defined and the fields still deferred.

The contract reserves `rules.direct_rule`, `rules.proxy_rule`, `rules.direct_source`, and `rules.proxy_source`, but the runtime has no grammar, canonicalization, conflict handling, or precedence contract for them. They remain unused intent and do not authorize routes or bypasses.

Validation commands are listed in the [integration document](openclash-guard-uci-overlay-integration.md).
