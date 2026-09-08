import { z } from "zod";
import { assessSnapshot, type AssessmentTable } from "./assessment.js";
import { capture } from "./evidence.js";
import type { ImportedSnapshot } from "./evidence-schema.js";
import { configSchema, httpUrl } from "./schema.js";
import { parseNumericValue } from "./report-table.js";

export interface OpportunityPolicy {
  minImpressions: number;
  maxClicks: number;
  maxRows: number;
}
const pageSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  status: z.number().int(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  canonical: z.string().nullable(),
  robots: z.array(z.string()),
  xRobotsTag: z.string().nullable(),
  warnings: z.array(z.string()).default([]),
});
const inspectionSchema = z.object({
  inspectionResult: z.object({
    indexStatusResult: z.object({
      verdict: z.string().optional(),
      coverageState: z.string().optional(),
      indexingState: z.string().optional(),
      robotsTxtState: z.string().optional(),
      googleCanonical: z.string().optional(),
      userCanonical: z.string().optional(),
      lastCrawlTime: z.string().optional(),
    }),
  }),
});
const organicNames = [
  "ga.report.landingPagePlusQueryString+sessionSource.organic",
  "ga.report.landingPagePlusQueryString+sessionSource+eventName.organic",
];
function configuredPath(raw: string, site: string): string | null {
  try {
    const url = new URL(raw);
    if (url.origin === new URL(site).origin && url.href === raw && !raw.includes("#") && !url.username && !url.password)
      return url.pathname + url.search;
  } catch {
    /* Invalid provider URL remains raw evidence. */
  }
  return null;
}

export async function opportunities(snapshot: ImportedSnapshot, policy: OpportunityPolicy) {
  const config = configSchema.parse(snapshot.pages[0].response.context.config);
  const observations = snapshot.pages[0].response.observations;
  // Selection must use all retained rows, not the assessment's presentation cap.
  const assessment = await assessSnapshot(snapshot, Number.MAX_SAFE_INTEGER);
  const assessed = assessment.pages[0]?.response as
    | {
        tables: AssessmentTable[];
        snapshotSha256: string;
        limitations: string[];
      }
    | undefined;
  const tables = assessed?.tables ?? [];
  const search = tables.find((t) => t.observation === "gsc.report.page");
  const limits = [
    ...(assessed?.limitations ?? []),
    "Cutoffs select an investigation cohort, not a CTR benchmark, SEO score or forecast. Position and query/device/country mix can explain few clicks.",
    "Candidate ordering covers retained GSC page rows only. Missing pages and missing GA rows are unknown, not zero.",
    "GA is associated by configured origin and exact path/query only, not verified canonical identity. Landing page is session entry, not event location; no cross-provider funnel is computed.",
    "Technical observations describe their collection times; they need not represent the historical reporting period. No live requests or imported-claim verification occur.",
  ];
  let unusableSearchRows = 0;
  const result = await capture(
    "pagesight",
    "opportunities",
    snapshot.target,
    {
      snapshotSha256: assessed?.snapshotSha256 ?? null,
      ...policy,
    },
    async () => {
      const candidates = (search?.rows ?? [])
        .flatMap((row) => {
          const values = Object.fromEntries(search!.metrics.map((m, i) => [m, row.values[i]]));
          const impressions = parseNumericValue(values.impressions);
          const clicks = parseNumericValue(values.clicks);
          const ctr = parseNumericValue(values.ctr);
          const position = parseNumericValue(values.position);
          if (
            impressions === null ||
            clicks === null ||
            !Number.isSafeInteger(impressions) ||
            !Number.isSafeInteger(clicks) ||
            impressions < 0 ||
            ctr === null ||
            ctr < 0 ||
            ctr > 1 ||
            position === null ||
            position < 0 ||
            clicks < 0 ||
            clicks > impressions
          ) {
            unusableSearchRows++;
            return [];
          }
          if (impressions < policy.minImpressions || clicks > policy.maxClicks) return [];
          return [{ url: row.keys[0], values, impressions, clicks }];
        })
        .sort(
          (a, b) =>
            b.impressions - a.impressions || a.clicks - b.clicks || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
        );
      const selected = candidates.slice(0, policy.maxRows).map((candidate) => {
        const unknowns: string[] = [
          "No page-filtered query/device/country breakdown is used for this candidate; property query totals are not page-level evidence.",
        ];
        const nextChecks = [
          "Inspect page-filtered Search Console queries, device/country mix and position before deciding whether a title/snippet change is appropriate.",
        ];
        const path = configuredPath(candidate.url, config.site);
        if (path === null) unknowns.push("No supported configured-origin/exact-path association for this GSC URL.");
        const organic = organicNames.map((name) => {
          const table = tables.find((t) => t.observation === name);
          const matched = path === null ? [] : (table?.rows.filter((r) => r.keys[0] === path) ?? []);
          if (!table || !matched.length)
            unknowns.push(`${name}: ${table ? "no exact observed row; not zero activity" : "report unavailable"}.`);
          return {
            source: name,
            association: path === null ? "unmatched" : "configured-origin-exact-path-not-canonical",
            dimensions: table?.dimensions ?? [],
            metrics: table?.metrics ?? [],
            rows: matched.slice(0, policy.maxRows),
            observedMatchingRows: matched.length,
            omittedMatchingRows: Math.max(0, matched.length - policy.maxRows),
            complete: table?.complete ?? false,
            limitations: table?.limitations ?? [],
          };
        });
        const technical = observations.flatMap((observation) => {
          if (observation.status !== "ok" || observation.error || observation.pages.length !== 1) return [];
          const page = observation.pages[0];
          const request = page.request as Record<string, unknown> | null;
          if (
            observation.provider === "web" &&
            observation.operation === "page" &&
            observation.target === candidate.url &&
            request?.url === candidate.url
          ) {
            const parsed = pageSchema.safeParse(page.response);
            if (!parsed.success || parsed.data.url !== candidate.url) return [];
            if (
              parsed.data.canonical !== candidate.url ||
              parsed.data.status !== 200 ||
              parsed.data.finalUrl !== candidate.url ||
              [...parsed.data.robots, parsed.data.xRobotsTag ?? ""].some((v) => /noindex/i.test(v))
            )
              nextChecks.push(
                "Check redirects, canonical and indexing directives against intentional route policy before proposing content edits.",
              );
            return [
              {
                source: observation.name,
                kind: "html",
                collectedAt: observation.finishedAt,
                evidence: parsed.data as unknown,
                limitations: [
                  ...observation.warnings,
                  ...parsed.data.warnings,
                  "HTML only; JavaScript execution and crawler access were not tested.",
                ],
              },
            ];
          }
          if (
            observation.provider === "gsc" &&
            observation.operation === "inspect" &&
            observation.target === config.gscSite &&
            request?.inspectionUrl === candidate.url &&
            request.siteUrl === config.gscSite
          ) {
            const parsed = inspectionSchema.safeParse(page.response);
            if (parsed.success) {
              const index = parsed.data.inspectionResult.indexStatusResult;
              if (
                [index.googleCanonical, index.userCanonical].some(
                  (canonical) => canonical !== undefined && canonical !== candidate.url,
                )
              )
                nextChecks.unshift(
                  "Check Google's reported canonical URLs against intentional route policy; canonical differences do not authorize additional GA associations or a rewritten candidate URL.",
                );
              if (parsed.data.inspectionResult.indexStatusResult.verdict !== "PASS")
                nextChecks.unshift(
                  "Reconcile Google's stored inspection verdict and crawl date with the historical impressions and current route policy before a snippet experiment; these observations may describe different times.",
                );
              return [
                {
                  source: observation.name,
                  kind: "google-indexed-state",
                  collectedAt: observation.finishedAt,
                  evidence: parsed.data.inspectionResult.indexStatusResult as unknown,
                  limitations: [
                    ...observation.warnings,
                    "Google's stored indexed state, not a live fetch or proof of historical state.",
                  ],
                },
              ];
            }
          }
          return [];
        });
        if (!technical.some((t) => t.kind === "html")) {
          unknowns.push("No usable exact-URL HTML observation.");
          nextChecks.push(
            "Collect this URL's HTML metadata and verify title, description, canonical and robots directives.",
          );
        }
        if (!technical.some((t) => t.kind === "google-indexed-state")) {
          unknowns.push("No usable exact-URL Google inspection.");
          nextChecks.push("Inspect this exact URL in Search Console; indexed state is not a live fetch.");
        }
        nextChecks.push(
          "Validate the meaning and instrumentation dates of relevant events; compare a later equivalent window without treating event counts as a conversion rate.",
        );
        return {
          url: candidate.url,
          reason: `${candidate.impressions} observed impressions and ${candidate.clicks} clicks meet the supplied cutoffs. Investigate; this does not establish underperformance.`,
          search: {
            source: search!.observation,
            keys: [candidate.url],
            metrics: candidate.values,
            complete: search!.complete,
            limitations: search!.limitations,
          },
          organic,
          technical,
          unknowns,
          nextChecks,
          suggestedRequests: [
            {
              operation: "gsc.report",
              site: config.gscSite,
              maxPages: 1,
              request: {
                ...snapshot.pages[0].response.context.requestedDates,
                dimensions: ["query"],
                dataState: "final",
                dimensionFilterGroups: [
                  {
                    groupType: "and",
                    filters: [{ dimension: "page", operator: "equals", expression: candidate.url }],
                  },
                ],
              },
            },
            ...(httpUrl.safeParse(candidate.url).success && !technical.some((t) => t.kind === "html")
              ? [{ operation: "page", url: candidate.url }]
              : []),
            ...(httpUrl.safeParse(candidate.url).success && !technical.some((t) => t.kind === "google-indexed-state")
              ? [{ operation: "gsc.inspect", site: config.gscSite, url: candidate.url }]
              : []),
          ],
        };
      });
      const associatedPaths = new Set(
        selected.map((candidate) => configuredPath(candidate.url, config.site)).filter((path) => path !== null),
      );
      const unassociatedOrganic = organicNames.map((source) => {
        const table = tables.find((table) => table.observation === source);
        const rows = table?.rows.filter((row) => !associatedPaths.has(row.keys[0])) ?? [];
        return {
          source,
          available: Boolean(table),
          meaning:
            "Not associated with displayed candidates; includes URL variants, special values and landings outside this selected cohort.",
          dimensions: table?.dimensions ?? [],
          metrics: table?.metrics ?? [],
          rows: rows.slice(0, policy.maxRows),
          observedRows: table ? rows.length : null,
          omittedRows: Math.max(0, rows.length - policy.maxRows),
          complete: table?.complete ?? false,
          limitations: [
            ...(table?.limitations ?? []),
            "(other) aggregates and (not set) values cannot establish exact landing identity. Missing associations are not zero traffic.",
          ],
        };
      });
      return {
        site: config.site,
        basis: "saved-snapshot-not-reverified",
        snapshotSha256: assessed?.snapshotSha256 ?? null,
        collectedAt: snapshot.finishedAt,
        requestedDates: snapshot.pages[0].response.context.requestedDates,
        policy: {
          ...policy,
          ordering: "impressions-desc,clicks-asc,url-asc",
          meaning: "caller-adjustable investigation cutoffs, not quality benchmarks",
        },
        searchReportAvailable: Boolean(search),
        observedSearchRows: search?.observedRows ?? null,
        unusableSearchRows,
        qualifyingObservedRows: search ? candidates.length : null,
        omittedCandidates: Math.max(0, candidates.length - policy.maxRows),
        candidates: selected,
        unassociatedOrganic,
        limitations: limits,
      };
    },
  );
  if (
    result.status !== "error" &&
    (assessment.status !== "ok" || !search || !search.complete || unusableSearchRows > 0)
  )
    result.status = "partial";
  return result;
}
