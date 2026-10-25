import { z } from "zod";

export const RegionIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, {
  message: "must match ^[a-z][a-z0-9-]*$",
});

export const RegionRoleSchema = z.enum(["exit"]);

export const CountryCodesSchema = z
  .object({
    alpha2: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
    alpha3: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1),
  })
  .strict();

export const RegionMatchSchema = z
  .object({
    flags: z.array(z.string().min(1)).default([]),
    aliases: z.array(z.string().min(1)).default([]),
    cities: z.array(z.string().min(1)).default([]),
    airportCodes: z.array(z.string().regex(/^[A-Z]{3}$/)).default([]),
    countryCodes: CountryCodesSchema,
    prefixes: z.array(z.string().regex(/^[A-Z]{2,3}$/)).min(1),
  })
  .strict();

export const RegionRecordSchema = z
  .object({
    id: RegionIdSchema,
    name: z.string().min(1),
    group: z.string().min(1),
    roles: z.array(RegionRoleSchema),
    match: RegionMatchSchema,
  })
  .strict();

export const RegionsConfigSchema = z
  .object({
    schemaVersion: z.literal(2),
    routing: z
      .object({
        primaryOrder: z.array(RegionIdSchema).min(1),
      })
      .strict(),
    regions: z.array(RegionRecordSchema).min(1),
  })
  .strict();

export const CompiledEvidenceMapsSchema = z
  .object({
    flags: z.record(z.string(), z.array(RegionIdSchema).min(1)),
    aliases: z.record(z.string(), z.array(RegionIdSchema).min(1)),
    cities: z.record(z.string(), z.array(RegionIdSchema).min(1)),
    airportCodes: z.record(z.string(), z.array(RegionIdSchema).min(1)),
    countryAlpha2: z.record(z.string(), z.array(RegionIdSchema).min(1)),
    countryAlpha3: z.record(z.string(), z.array(RegionIdSchema).min(1)),
    prefixes: z.array(
      z
        .object({
          regionId: RegionIdSchema,
          pattern: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const CompiledRegionsSchema = z
  .object({
    schemaVersion: z.literal(1),
    primaryOrder: z.array(RegionIdSchema).min(1),
    roles: z.record(RegionIdSchema, z.array(RegionRoleSchema)),
    groups: z.record(RegionIdSchema, z.string().min(1)),
    names: z.record(RegionIdSchema, z.string().min(1)),
    evidence: CompiledEvidenceMapsSchema,
  })
  .strict();

export const LegacyV1RegionSchema = z
  .object({
    id: RegionIdSchema,
    group: z.string().min(1),
    terms: z.string().min(1),
    name: z.string().min(1),
    countryCodes: z.array(z.string().regex(/^[A-Z]{2}$/)),
    aliases: z.array(z.string().min(1)),
    keywords: z.array(z.string().min(1)),
  })
  .strict();

export const LegacyV1RegionsDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    primaryOrder: z.array(RegionIdSchema).min(1),
    regions: z.array(LegacyV1RegionSchema).min(1),
  })
  .strict();

export type RegionsConfig = z.infer<typeof RegionsConfigSchema>;
export type RegionRecord = z.infer<typeof RegionRecordSchema>;
export type CompiledRegions = z.infer<typeof CompiledRegionsSchema>;
export type LegacyV1RegionsDocument = z.infer<typeof LegacyV1RegionsDocumentSchema>;
