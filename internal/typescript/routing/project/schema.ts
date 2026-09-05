import { z } from "zod";

const RelativePath = z.string().min(1).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !value.includes("\0"),
  "project paths must be relative POSIX paths",
);
const ArtifactPath = RelativePath.refine(
  (value) => value.split("{profile}").length <= 2,
  "artifact paths may contain at most one {profile} placeholder",
);

export const RoutingArtifactPathsSchema = z.object({
  "profile-plan": ArtifactPath,
  "mihomo-fragment": ArtifactPath,
  "controller-plan": ArtifactPath,
  "firewall-semantic-plan": ArtifactPath,
  "ini-mvp-plan": ArtifactPath,
  "shadow-candidate": ArtifactPath,
  "shadow-parity-report": ArtifactPath,
  "semantic-parity-report": ArtifactPath,
  "routing-schema": ArtifactPath,
}).strict();

export const RoutingProjectDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  canonicalManifest: RelativePath,
  serviceCatalog: RelativePath,
  mihomoProjection: RelativePath,
  shadowParityManifest: RelativePath,
  legacyRelaxedBase: RelativePath,
  shadowTemplate: RelativePath,
  generatedArtifactDirectory: RelativePath,
  schemaOutput: RelativePath,
  supportedProfiles: z.array(z.string().min(1)).min(1),
  artifactPaths: RoutingArtifactPathsSchema,
}).strict();

export type RoutingProjectDocument = z.infer<typeof RoutingProjectDocumentSchema>;

export interface RoutingProject extends RoutingProjectDocument {
  readonly projectFile: string;
  readonly projectDirectory: string;
  readonly canonicalManifest: string;
  readonly serviceCatalog: string;
  readonly mihomoProjection: string;
  readonly shadowParityManifest: string;
  readonly legacyRelaxedBase: string;
  readonly shadowTemplate: string;
  readonly generatedArtifactDirectory: string;
  readonly schemaOutput: string;
}
