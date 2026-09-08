import { z } from "zod";

const contextChange = z.object({ at: z.string().datetime(), description: z.string().min(1).max(2000) }).strict();
export const changeRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(200),
    site: z.string().url(),
    affectedUrls: z.array(z.string().url()).min(1).max(100),
    description: z.string().min(1).max(4000),
    hypothesis: z.string().min(1).max(4000),
    deployedAt: z.string().datetime(),
    expectedSignal: z.string().min(1).max(2000),
    measurementChanges: z.array(contextChange).max(100),
    overlappingChanges: z.array(contextChange).max(100),
  })
  .strict()
  .superRefine((record, ctx) => {
    for (const [index, url] of record.affectedUrls.entries()) {
      if (new URL(url).origin !== new URL(record.site).origin)
        ctx.addIssue({
          code: "custom",
          path: ["affectedUrls", index],
          message: "Affected URL must share the site's origin",
        });
    }
    if (Date.parse(record.deployedAt) > Date.now())
      ctx.addIssue({ code: "custom", path: ["deployedAt"], message: "Deployment must not be in the future" });
  });
export type ChangeRecord = z.infer<typeof changeRecordSchema>;
