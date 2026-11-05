# Input: one bounded nft JSON ruleset. Configuration is packaged from its
# canonical source; policy is local configuration, not proof of applied policy.
def safe_counter($maximum):
  type == "number" and . >= 0 and . == floor and . <= $maximum;
def terminal_decision:
  if type != "object" then "unknown"
  elif keys == ["accept"] and .accept == null then "accept"
  elif keys == ["reject"] then "reject"
  elif keys == ["drop"] and .drop == null then "drop"
  else "unknown" end;

(if length != 1 or (.[0].nftables | type) != "array" or
   (.[0].nftables | all(.[]; type == "object") | not)
then error("invalid nft ruleset") else .[0] end) as $nft |
$catalog[0] as $catalog |
$policy[0] as $policy |
[$nft.nftables[] | .rule? | select(type == "object") |
  select(.family == $policy.nft.family and .table == $policy.nft.table) |
  select((.comment | type) == "string") |
  select(.comment | startswith($policy.nft.commentPrefix + ":"))] as $owned |
[$owned[] as $rule |
  $catalog.ruleReasons[] as $reason |
  select($rule.comment == ($policy.nft.commentPrefix + ":" + $reason.id)) |
  (if ($rule.expr | type) == "array" then $rule.expr[-1] | terminal_decision else "unknown" end) as $decision |
  [($rule.expr // [])[] | .counter? | select(. != null)] as $counters |
  ($rule.chain == $reason.chain and $decision == $reason.decision) as $shape |
  ($shape and ($counters | length) == 1 and ($counters[0] | type) == "object" and
    ($counters[0].packets | safe_counter($catalog.limits.maxSafeCounter)) and
    ($counters[0].bytes | safe_counter($catalog.limits.maxSafeCounter))) as $counted |
  {
    ruleId: $reason.id,
    chain: $reason.chain,
    handle: (if ($rule.handle | safe_counter($catalog.limits.maxSafeCounter)) then $rule.handle else null end),
    decision: (if $shape then $decision else "unknown" end),
    reason: (if $shape then $reason.label else "Observed rule shape does not match its catalog reference" end),
    reasonBinding: "catalog-reference-only",
    status: (if ($shape | not) then "rule-shape-mismatch"
      elif $counted then "counter-observed"
      elif ($counters | length) == 0 then "counter-unavailable"
      else "counter-invalid" end),
    packets: (if $counted then $counters[0].packets else null end),
    bytes: (if $counted then $counters[0].bytes else null end)
  }] as $rules |
{
  ok: true,
  version: $catalog.version,
  kind: $catalog.kind,
  authorization: $catalog.authorization,
  observedAtMs: $now,
  ttlMs: $catalog.limits.ttlMs,
  source: "live-nft-snapshot",
  policy: {configuredRevision: $policy.revision, appliedRevision: null, binding: "unverified"},
  coverage: {
    status: "partial",
    scope: "Guard hook counters only; accepts permit continuation, not end-to-end delivery",
    connectionAttribution: "unavailable",
    ruleSemanticsVerified: false,
    offloadCoverage: "unverified",
    flowtablesPresent: ([$nft.nftables[] | .flowtable? | select(type == "object")] | length > 0),
    hardwareOffloadFlagPresent: ([$nft.nftables[] | .flowtable? | select(type == "object") |
      select((.flags // []) | index("offload"))] | length > 0),
    targetTablePresent: ([$nft.nftables[] | .table? | select(type == "object") |
      select(.family == $policy.nft.family and .name == $policy.nft.table)] | length > 0),
    ownedRuleCount: ($owned | length),
    recognizedRuleCount: ($rules | length),
    unknownRuleCount: (($owned | length) - ($rules | length)),
    counterUnavailableCount: ([$rules[] | select(.status != "counter-observed")] | length),
    truncated: (($rules | length) > $catalog.limits.maxRecords),
    counterLifetime: "Since rule creation or counter reset; no cross-snapshot deltas inferred"
  },
  rules: $rules[:$catalog.limits.maxRecords]
}
