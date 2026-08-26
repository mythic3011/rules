export type RoutingIssueCode =
  | "duplicate-key"
  | "invalid-yaml"
  | "schema"
  | "missing-reference"
  | "policy-invariant"
  | "dynamic-route"
  | "rule-ordering"
  | "artifact-drift";

export interface RoutingIssue {
  readonly code: RoutingIssueCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export function formatIssue(issue: RoutingIssue): string {
  const path = issue.path.length === 0 ? "$" : issue.path.join(".");
  return `[${issue.code}] ${path}: ${issue.message}`;
}

export function formatIssues(issues: readonly RoutingIssue[]): string {
  return issues.map(formatIssue).join("\n");
}
