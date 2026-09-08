import { z } from "zod";
import { dateSchema } from "../shared/dates.js";

export const evidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    provider: z.string().min(1),
    operation: z.string().min(1),
    name: z.string().min(1).optional(),
    target: z.string().min(1),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    status: z.enum(["ok", "partial", "error"]),
    pages: z.array(
      z
        .object({ request: z.unknown(), response: z.unknown() })
        .passthrough()
        .refine(
          (p) => Object.hasOwn(p, "request") && Object.hasOwn(p, "response"),
          "Evidence pages require a request and response",
        )
        .transform((p) => ({ ...p, request: p.request, response: p.response })),
    ),
    pagination: z
      .object({
        exhausted: z.boolean(),
        nextOffset: z.number().int().nonnegative().nullable(),
        rowsReturned: z.number().int().nonnegative(),
      })
      .optional(),
    warnings: z.array(z.string()),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        httpStatus: z.number().int().nullable(),
        name: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const snapshotEvidenceSchema = evidenceSchema
  .extend({
    provider: z.literal("pagesight"),
    operation: z.literal("snapshot"),
    pages: z.tuple([
      z
        .object({
          request: z.unknown(),
          response: z
            .object({
              snapshotVersion: z.literal(1),
              context: z
                .object({
                  config: z.object({ site: z.string().url() }).passthrough(),
                  requestedDates: z.object({ startDate: dateSchema, endDate: dateSchema }).passthrough(),
                  observedGscDates: z.array(dateSchema),
                })
                .passthrough(),
              observations: z
                .array(evidenceSchema.extend({ name: z.string().min(1) }))
                .min(1)
                .max(100),
            })
            .passthrough(),
        })
        .passthrough(),
    ]),
  })
  .refine((s) => s.target === s.pages[0].response.context.config.site, "Snapshot target must match its configured site")
  .refine(
    (s) =>
      new Set(s.pages[0].response.observations.map((o) => o.name)).size === s.pages[0].response.observations.length,
    "Snapshot observation names must be unique",
  );

export type ImportedSnapshot = z.infer<typeof snapshotEvidenceSchema>;
