import { z } from "zod";
import { capture } from "./evidence.js";
import type { ImportedSnapshot } from "./evidence-schema.js";
import { configSchema } from "./schema.js";
import { canonical } from "./report-table.js";
const pageSchema = z.object({
  url: z.string().url(),
  finalUrl: z.string().url(),
  status: z.number().int(),
  canonical: z.string().nullable(),
  robots: z.array(z.string()),
  xRobotsTag: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  sha256: z.string(),
  redirects: z.array(z.unknown()),
});

export function technicalChanges(baseline: ImportedSnapshot | undefined, current: ImportedSnapshot) {
  const hash = (v: unknown) => Bun.CryptoHasher.hash("sha256", canonical(v), "hex");
  const before = baseline?.pages[0].response;
  const after = current.pages[0].response;
  const sameScope = Boolean(
    baseline &&
    baseline.target === current.target &&
    canonical(before?.context.config) === canonical(after.context.config),
  );
  return capture(
    "pagesight",
    "technical.compare",
    current.target,
    { baselineSha256: baseline ? hash(baseline) : null, currentSha256: hash(current) },
    async () => {
      const alerts: Array<{ kind: string; source: string; message: string; before?: unknown; after?: unknown }> = [];
      for (const url of configSchema.parse(after.context.config).pages) {
        if (!after.observations.some((o) => o.provider === "web" && o.operation === "page" && o.target === url))
          alerts.push({
            kind: "unknown",
            source: `page:${url}`,
            message: "Configured page observation is missing; no regression inferred",
          });
      }
      for (const observation of after.observations) {
        if (observation.status === "error" || observation.error) {
          alerts.push({
            kind: "availability",
            source: observation.name,
            message: `Observation unavailable/incomplete: ${observation.error?.code ?? observation.status}`,
          });
          continue;
        }
        if (observation.provider !== "web" || observation.operation !== "page") continue;
        const parsed = pageSchema.safeParse(observation.pages[0]?.response);
        const request = observation.pages[0]?.request as { url?: string } | undefined;
        if (!parsed.success || request?.url !== parsed.data.url || observation.target !== parsed.data.url) {
          alerts.push({
            kind: "unknown",
            source: observation.name,
            message: "Page response is unavailable or not bound to the requested URL",
          });
          continue;
        }
        if (parsed.data.status >= 400)
          alerts.push({
            kind: "http-error",
            source: observation.name,
            message: `HTTP ${parsed.data.status} observed`,
            after: parsed.data.status,
          });
        if (!sameScope) continue;
        const previous = before?.observations.find(
          (o) => o.provider === "web" && o.operation === "page" && o.target === observation.target,
        );
        const prior = pageSchema.safeParse(previous?.pages[0]?.response);
        const priorRequest = previous?.pages[0]?.request as { url?: string } | undefined;
        if (
          !prior.success ||
          priorRequest?.url !== parsed.data.url ||
          prior.data.url !== parsed.data.url ||
          previous?.status === "error" ||
          previous?.error
        ) {
          alerts.push({
            kind: "unknown",
            source: observation.name,
            message: "No usable matching prior page; no regression inferred",
          });
          continue;
        }
        for (const field of [
          "status",
          "finalUrl",
          "canonical",
          "robots",
          "xRobotsTag",
          "redirects",
          "title",
          "description",
          "sha256",
        ] as const) {
          if (canonical(prior.data[field]) !== canonical(parsed.data[field]))
            alerts.push({
              kind: ["title", "description", "sha256"].includes(field) ? "content-change" : "technical-change",
              source: observation.name,
              message: `Observed ${field} changed; verify against intended route policy`,
              before: prior.data[field],
              after: parsed.data[field],
            });
        }
      }
      return {
        comparisonVersion: 1,
        baselineState: !baseline ? "first-run" : sameScope ? "compatible" : "scope-reset",
        alerts,
        limitations: [
          "Exact common requested URLs and equal configuration only. Added or removed URLs reset the baseline.",
          "Changes are observations, not automatically defects; noindex and canonical policy may be intentional.",
          "Daily reporting windows overlap. No traffic deltas, disappearance claims, ranking impact or cross-provider comparisons are calculated.",
          "HTML only; rendered content and Google's stored indexing state require separate checks.",
        ],
      };
    },
  );
}
