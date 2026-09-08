import { uiFindingsSchema } from "./ui-findings.js";
import { z } from "zod";
import { snapshotEvidenceSchema } from "./evidence-schema.js";
import { dateSchema, pacificDate } from "../shared/dates.js";

export { dateSchema } from "../shared/dates.js";
const offset = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const maxPagesSchema = z.number().int().min(1).max(20).default(1);
export const gscRequestSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    dimensions: z
      .array(z.enum(["date", "hour", "query", "page", "country", "device", "searchAppearance"]))
      .max(7)
      .default([]),
    type: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
    dataState: z.enum(["final", "all", "hourly_all"]).default("final"),
    rowLimit: z.number().int().min(1).max(25000).default(25000),
    startRow: offset.default(0),
    aggregationType: z.enum(["auto", "byPage", "byProperty", "byNewsShowcasePanel"]).optional(),
    dimensionFilterGroups: z
      .array(
        z
          .object({
            groupType: z.literal("and").optional(),
            filters: z.array(
              z.object({ dimension: z.string(), operator: z.string(), expression: z.string() }).strict(),
            ),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .refine((v) => v.startDate <= v.endDate, "startDate must be on or before endDate")
  .refine((v) => v.endDate <= pacificDate(), "GSC endDate cannot be in the future");
export type GscRequest = z.infer<typeof gscRequestSchema>;

export const gaRequestSchema = z
  .object({
    dateRanges: z
      .array(
        z
          .object({ startDate: dateSchema, endDate: dateSchema, name: z.string().optional() })
          .strict()
          .refine((v) => v.startDate <= v.endDate, "Invalid date range"),
      )
      .min(1)
      .max(4),
    dimensions: z.array(z.object({ name: z.string() }).passthrough()).default([]),
    metrics: z.array(z.object({ name: z.string() }).passthrough()).min(1),
    dimensionFilter: z.record(z.unknown()).optional(),
    metricFilter: z.record(z.unknown()).optional(),
    orderBys: z.array(z.record(z.unknown())).optional(),
    metricAggregations: z.array(z.string()).optional(),
    currencyCode: z.string().optional(),
    keepEmptyRows: z.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(250000).default(10000),
    offset: offset.default(0),
    returnPropertyQuota: z.boolean().default(true),
  })
  .strict();
export type GaRequest = z.infer<typeof gaRequestSchema>;

export const gaRealtimeRequestSchema = z
  .object({
    dimensions: z
      .array(z.object({ name: z.string().min(1) }).strict())
      .max(9)
      .default([]),
    metrics: z
      .array(z.object({ name: z.string().min(1) }).strict())
      .min(1)
      .max(10),
    dimensionFilter: z.record(z.unknown()).optional(),
    metricFilter: z.record(z.unknown()).optional(),
    orderBys: z.array(z.record(z.unknown())).optional(),
    limit: z.coerce.number().int().min(1).max(250000).default(10000),
    returnPropertyQuota: z.boolean().default(true),
    minuteRanges: z
      .array(
        z
          .object({
            name: z
              .string()
              .min(1)
              .refine((n) => !n.startsWith("date_range_") && !n.startsWith("RESERVED_"))
              .optional(),
            startMinutesAgo: z.number().int().min(0).max(59).default(29),
            endMinutesAgo: z.number().int().min(0).max(59).default(0),
          })
          .strict()
          .refine((r) => r.startMinutesAgo >= r.endMinutesAgo, "Start must be at least as many minutes ago as end"),
      )
      .min(1)
      .max(2)
      .default([{ startMinutesAgo: 29, endMinutesAgo: 0 }]),
  })
  .strict();
export type GaRealtimeRequest = z.infer<typeof gaRealtimeRequestSchema>;

export const httpUrl = z
  .string()
  .url()
  .refine(
    (v) =>
      URL.canParse(v) &&
      ["http:", "https:"].includes(new URL(v).protocol) &&
      !new URL(v).username &&
      !new URL(v).password,
    "Use an HTTP(S) URL without credentials",
  );
export const configSchema = z
  .object({
    site: httpUrl,
    gscSite: z.string().min(1).optional(),
    bingSite: httpUrl.optional(),
    gaProperty: z
      .string()
      .regex(/^(properties\/)?\d+$/)
      .optional(),
    productionHostname: z.string().min(1).optional(),
    sitemap: httpUrl.optional(),
    pages: z.array(httpUrl).max(10).optional(),
    context: z
      .object({
        objective: z.string().default("Define a product objective before evaluating outcomes."),
        successEvents: z.array(z.string()).default([]),
        excludedKeyEvents: z.array(z.string()).default([]),
        locale: z.string().default("unspecified"),
        country: z.string().default("unspecified"),
        routes: z
          .array(
            z
              .object({ pattern: z.string(), purpose: z.string(), indexing: z.enum(["index", "noindex", "verify"]) })
              .strict(),
          )
          .default([]),
        measurementCaveats: z.array(z.string()).default([]),
      })
      .strict()
      .default({}),
  })
  .strict()
  .transform((c) => ({
    ...c,
    productionHostname: c.productionHostname ?? new URL(c.site).hostname,
    pages: [...new Set(c.pages ?? [c.site])],
  }))
  .refine((c) => new URL(c.site).hostname === c.productionHostname, "productionHostname must match site")
  .refine(
    (c) => Boolean(c.pages.length || c.sitemap || c.gscSite || c.gaProperty || c.bingSite),
    "Select at least one page or provider",
  );
export type SiteConfig = z.infer<typeof configSchema>;
const assessedSnapshotSchema = snapshotEvidenceSchema.superRefine((snapshot, ctx) => {
  const config = configSchema.safeParse(snapshot.pages[0].response.context.config);
  if (!config.success)
    for (const issue of config.error.issues)
      ctx.addIssue({ ...issue, path: ["pages", 0, "response", "context", "config", ...issue.path] });
});
const operationVariants = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("opportunities"),
      snapshot: assessedSnapshotSchema,
      minImpressions: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(20),
      maxClicks: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(2),
      maxRows: z.number().int().min(1).max(100).default(10),
    })
    .strict(),
  z
    .object({
      operation: z.literal("assess"),
      snapshot: assessedSnapshotSchema,
      maxRows: z.number().int().min(1).max(100).default(10),
    })
    .strict(),
  z.object({ operation: z.literal("evidence.import"), document: uiFindingsSchema }).strict(),
  z
    .object({
      operation: z.literal("compare"),
      baseline: snapshotEvidenceSchema,
      current: snapshotEvidenceSchema,
      maxRows: z.number().int().min(1).max(1000).default(100),
    })
    .strict(),
  z
    .object({
      operation: z.literal("discover"),
      url: httpUrl,
      providers: z
        .array(z.enum(["gsc", "ga", "bing"]))
        .min(1)
        .max(3)
        .default(["gsc", "ga"]),
    })
    .strict(),
  z.object({ operation: z.literal("bing.crawl-stats"), site: httpUrl }).strict(),
  z.object({ operation: z.literal("bing.crawl-issues"), site: httpUrl }).strict(),
  z.object({ operation: z.literal("bing.url-info"), site: httpUrl, url: httpUrl }).strict(),
  z.object({ operation: z.literal("bing.link-counts"), site: httpUrl, maxPages: maxPagesSchema }).strict(),
  z.object({ operation: z.literal("bing.url-links"), site: httpUrl, url: httpUrl, maxPages: maxPagesSchema }).strict(),
  z.object({ operation: z.literal("bing.sites") }).strict(),
  z.object({ operation: z.literal("bing.queries"), site: httpUrl }).strict(),
  z.object({ operation: z.literal("bing.pages"), site: httpUrl }).strict(),
  z.object({ operation: z.literal("bing.traffic"), site: httpUrl }).strict(),
  z.object({ operation: z.literal("gsc.sites") }).strict(),
  z.object({ operation: z.literal("gsc.sitemaps"), site: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("gsc.inspect"), site: z.string().min(1), url: httpUrl }).strict(),
  z
    .object({
      operation: z.literal("gsc.report"),
      site: z.string().min(1),
      request: gscRequestSchema,
      maxPages: maxPagesSchema,
    })
    .strict(),
  z.object({ operation: z.literal("ga.realtime"), property: z.string(), request: gaRealtimeRequestSchema }).strict(),
  z.object({ operation: z.literal("ga.accounts") }).strict(),
  z.object({ operation: z.literal("ga.property"), property: z.string() }).strict(),
  z.object({ operation: z.literal("ga.key-events"), property: z.string() }).strict(),
  z
    .object({
      operation: z.literal("ga.report"),
      property: z.string(),
      request: gaRequestSchema,
      maxPages: maxPagesSchema,
    })
    .strict(),
  z.object({ operation: z.literal("page"), url: httpUrl }).strict(),
  z
    .object({
      operation: z.literal("speed.psi"),
      url: httpUrl,
      strategy: z.enum(["mobile", "desktop"]).default("mobile"),
    })
    .strict(),
  z
    .object({
      operation: z.literal("speed.crux"),
      url: httpUrl,
      formFactor: z.enum(["PHONE", "DESKTOP", "TABLET"]).default("PHONE"),
      origin: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      operation: z.literal("speed.history"),
      url: httpUrl,
      formFactor: z.enum(["PHONE", "DESKTOP", "TABLET"]).default("PHONE"),
      origin: z.boolean().default(false),
    })
    .strict(),
  z.object({ operation: z.literal("doctor"), config: configSchema }).strict(),
  z
    .object({
      operation: z.literal("snapshot"),
      config: configSchema,
      startDate: dateSchema,
      endDate: dateSchema,
      maxPages: maxPagesSchema.default(4),
    })
    .strict(),
]);
export const operationSchema = operationVariants.refine(
  (op) => op.operation !== "snapshot" || (op.startDate <= op.endDate && op.endDate <= pacificDate()),
  "Invalid or future snapshot interval",
);
export type Operation = z.input<typeof operationSchema>;
