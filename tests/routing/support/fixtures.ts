import {
  digestControllerPlan,
  digestFirewallStaticEvidence,
  sealArtifactGeneration,
  type FirewallDynamicEvidence,
  type FirewallProofEvidence,
  type FirewallStaticEvidence,
  type SealedArtifactGeneration,
  type SealedArtifactInput,
} from "#routing/firewall-proof.js";
import type { ControllerPlan } from "#routing/runtime-plan.js";
import type { RouterDeployment } from "#routing/router-local.js";

export interface DeploymentFixtureOptions {
  readonly mode?: "example" | "deployment";
  readonly policyVersion?: string;
  readonly controllerUrl?: string;
  readonly secretFile?: string;
  readonly protectedSources?: readonly Readonly<Record<string, string>>[];
}

export interface EgressBindingFixture {
  readonly approvedId: string;
  readonly node: string;
  readonly provider: string;
}

export interface EgressFixtureOptions {
  readonly policyVersion?: string;
  readonly serviceId?: string;
  readonly bindings?: readonly EgressBindingFixture[];
  readonly revokedNodes?: readonly string[];
}

export interface StateFixtureOptions {
  readonly policyVersion?: string;
  readonly activeMode?: string;
  readonly accountId?: string;
  readonly selectedNode?: string;
  readonly verifiedPolicyVersion?: string | null;
  readonly verifiedNode?: string | null;
  readonly resetReason?: string;
}

export const SHADOW_TEMPLATE_CONTEXT = {
  header: "# shadow",
  "static-top-level": "port: 7890",
  "proxy-providers": "  provider: {}",
  dns: "  enable: true",
  "proxy-groups": "  - name: x",
  rules: "  - MATCH,DIRECT",
  "rule-providers": "  example: {}",
} as const;

export const DIGEST_A = `sha256:${"a".repeat(64)}`;
export const DIGEST_B = `sha256:${"b".repeat(64)}`;
export const RULESET_DIGEST = `sha256:${"c".repeat(64)}`;

export function topologyFixture(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    mode: "deployment",
    policyVersion: "1",
    protectedSources: {
      ipv4: ["192.0.2.10/32"],
      ipv6: ["2001:db8::10/128"],
      interfaces: ["br-ai"],
      vlans: ["ai-safe"],
    },
    routerDns: { ipv4: ["192.0.2.1"], ipv6: ["2001:db8::1"] },
    wanInterfaces: ["pppoe-wan"],
    mihomo: {
      interceptionChains: ["openclash_mihomo"],
      routingMark: "0x162",
      proxyEndpointIps: {
        ipv4: ["198.51.100.10"],
        ipv6: ["2001:db8:1::10"],
      },
    },
  };
}

export function deploymentFixture(
  options: DeploymentFixtureOptions = {},
): Record<string, unknown> {
  const {
    mode = "deployment",
    policyVersion = "1",
    controllerUrl = "http://127.0.0.1:9090",
    secretFile = "/run/secrets/openclash-controller",
    protectedSources = [
      { kind: "vlan", name: "EXAMPLE-PROTECTED-VLAN" },
    ],
  } = options;
  return {
    schemaVersion: 1,
    mode,
    policyVersion,
    controller: { url: controllerUrl, secretFile },
    protectedSources: protectedSources.map((source) => ({ ...source })),
  };
}

export function deploymentForPlan(plan: ControllerPlan): RouterDeployment {
  return {
    schemaVersion: 1,
    mode: "deployment",
    policyVersion: plan.policyVersion,
    controller: {
      url: "http://127.0.0.1:9090",
      secretFile: "/tmp/redacted-controller-secret",
    },
    protectedSources: [{ kind: "vlan", name: "ai-account-safe" }],
  };
}

export function egressFixture(
  options: EgressFixtureOptions = {},
): Record<string, unknown> {
  const {
    policyVersion = "1",
    serviceId = "claude",
    bindings = [
      {
        approvedId: "US-Claude-01",
        node: "EXAMPLE-APPROVED-NODE-ONE",
        provider: "provider1",
      },
      {
        approvedId: "US-Claude-02",
        node: "EXAMPLE-APPROVED-NODE-TWO",
        provider: "provider1",
      },
    ],
    revokedNodes = [],
  } = options;
  return {
    schemaVersion: 1,
    mode: "deployment",
    policyVersion,
    services: {
      [serviceId]: {
        bindings: bindings.map((binding) => ({ ...binding })),
        revokedNodes: [...revokedNodes],
      },
    },
  };
}

export function stateFixture(
  options: StateFixtureOptions = {},
): Record<string, unknown> {
  const {
    policyVersion = "1",
    activeMode = "hk",
    accountId = "claude",
    selectedNode = "REJECT",
    verifiedPolicyVersion = null,
    verifiedNode = null,
    resetReason = "none",
  } = options;
  return {
    schemaVersion: 1,
    policyVersion,
    activeMode,
    accounts: {
      [accountId]: {
        selectedNode,
        verifiedPolicyVersion,
        verifiedNode,
        resetReason,
      },
    },
  };
}

export function staticEvidence(
  rulesetGeneration = RULESET_DIGEST,
): FirewallStaticEvidence {
  return {
    protectedSources: ["ai-account-safe"],
    blockedFamilies: ["ipv4", "ipv6"],
    blockedPaths: ["direct-wan", "external-dns", "external-dot", "direct-quic"],
    approvedProxyDestinations: ["approved-proxy"],
    routerDnsDestinations: ["router-dns"],
    rulesetGeneration,
  };
}

export function sealedInput(
  staticValue = staticEvidence(),
  controllerPlanSha256 = DIGEST_A,
  overrides: Partial<SealedArtifactInput> = {},
): SealedArtifactInput {
  return {
    policyVersion: "1",
    publicArtifactSha256: DIGEST_A,
    privateMaterializationSha256: DIGEST_A,
    controllerPlanSha256,
    topologySha256: DIGEST_A,
    firewallStaticEvidenceSha256: digestFirewallStaticEvidence(staticValue),
    proofMaximumAgeMs: 60_000,
    ...overrides,
  };
}

export function firewallNow(): Date {
  return new Date("2026-07-23T00:01:00.000Z");
}

export function closedEvidence(
  input?: SealedArtifactInput | SealedArtifactGeneration,
  staticValue = staticEvidence(),
  dynamicOverrides: Partial<FirewallDynamicEvidence> = {},
  checkedAt = firewallNow().toISOString(),
): FirewallProofEvidence {
  const sealedArtifact = input === undefined
    ? sealedInput(staticValue)
    : "generationId" in input
      ? (() => {
        const { generationId: _generationId, ...unsealed } = input;
        return unsealed;
      })()
      : input;
  return {
    checkedAt,
    sealedArtifact,
    staticEvidence: staticValue,
    dynamicEvidence: {
      directIpv4: "blocked",
      directIpv6: "blocked",
      externalDns: "blocked",
      externalDot: "blocked",
      directQuic: "blocked",
      approvedProxy: "allowed",
      routerDns: "allowed",
      generationBefore: staticValue.rulesetGeneration,
      generationAfter: staticValue.rulesetGeneration,
      ...dynamicOverrides,
    },
  };
}

export function generationForPlan(
  plan: ControllerPlan,
  staticValue = staticEvidence(),
  overrides: Partial<SealedArtifactInput> = {},
): SealedArtifactGeneration {
  return sealArtifactGeneration(
    sealedInput(staticValue, digestControllerPlan(plan), overrides),
  );
}
