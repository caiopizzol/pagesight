import { capture, type Evidence } from "./evidence.js";
import { configSchema, gaRequestSchema, gscRequestSchema, type Operation, type SiteConfig } from "./schema.js";
import { observeSitemap } from "./web.js";

export type Executor = (input: Operation | unknown) => Promise<Evidence>;

export function snapshotOperations(
  config: SiteConfig,
  startDate: string,
  endDate: string,
  maxPages: number,
): Operation[] {
  const range = { startDate, endDate };
  const hostFilter = {
    filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: config.productionHostname } },
  };
  const ga = (
    dimensions: string[],
    metrics: string[],
    production = true,
    extra: Record<string, unknown> = {},
  ): Operation => ({
    operation: "ga.report",
    property: config.gaProperty,
    maxPages,
    request: gaRequestSchema.parse({
      dateRanges: [range],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      ...(production ? { dimensionFilter: hostFilter } : {}),
      ...extra,
    }),
  });
  return [
    ...[[], ["page"], ["query"], ["date"]].map((dimensions) => ({
      operation: "gsc.report" as const,
      site: config.gscSite,
      maxPages,
      request: gscRequestSchema.parse({ ...range, dimensions }),
    })),
    { operation: "gsc.sitemaps", site: config.gscSite },
    { operation: "ga.property", property: config.gaProperty },
    { operation: "ga.key-events", property: config.gaProperty },
    ga(["hostName"], ["sessions", "screenPageViews"], false),
    ga(["sessionDefaultChannelGroup", "sessionSourceMedium"], ["sessions", "engagedSessions"]),
    ga(["eventName"], ["eventCount", "keyEvents"]),
    ga(["landingPagePlusQueryString", "sessionSource"], ["sessions", "engagedSessions"], true, {
      dimensionFilter: {
        andGroup: {
          expressions: [
            hostFilter,
            {
              filter: {
                fieldName: "sessionDefaultChannelGroup",
                stringFilter: { matchType: "EXACT", value: "Organic Search" },
              },
            },
          ],
        },
      },
    }),
    ga(["eventName"], ["eventCount", "keyEvents"], true, {
      dimensionFilter: {
        andGroup: {
          expressions: [
            hostFilter,
            {
              filter: {
                fieldName: "sessionDefaultChannelGroup",
                stringFilter: { matchType: "EXACT", value: "Organic Search" },
              },
            },
          ],
        },
      },
    }),
    ...config.pages.flatMap((url) => [
      { operation: "page" as const, url },
      { operation: "gsc.inspect" as const, url, site: config.gscSite },
    ]),
  ];
}

export async function snapshot(
  input: { config: SiteConfig; startDate: string; endDate: string; maxPages: number },
  run: Executor,
): Promise<Evidence> {
  const config = configSchema.parse(input.config);
  const requests = snapshotOperations(config, input.startDate, input.endDate, input.maxPages);
  const observations: Evidence[] = [];
  // Small batches bound simultaneous token exchanges and provider load.
  for (let i = 0; i < requests.length; i += 3)
    observations.push(...(await Promise.all(requests.slice(i, i + 3).map(run))));
  const inventory = await capture(
    "web",
    "sitemap-inventory",
    config.sitemap,
    { url: config.sitemap, maxDocuments: 5, maxBytes: 8_000_000 },
    () => observeSitemap(config.sitemap),
  );
  const inventoryResponse = inventory.pages[0]?.response as Awaited<ReturnType<typeof observeSitemap>> | undefined;
  if (inventoryResponse && !inventoryResponse.complete) inventory.status = "partial";
  observations.push(inventory);
  const dateReport = observations.find(
    (o) =>
      o.provider === "gsc" &&
      o.operation === "report" &&
      (o.pages[0]?.request as { dimensions?: string[] })?.dimensions?.[0] === "date",
  );
  const coveredDates =
    dateReport?.pages
      .flatMap((p) => ((p.response as { rows?: Array<{ keys: string[] }> }).rows ?? []).map((r) => r.keys[0]))
      .sort() ?? [];
  const result = aggregate("snapshot", config.site, input, observations);
  (result.pages[0].response as Record<string, unknown>).context = {
    config,
    deploymentVersion: null,
    referenceIdentity: null,
    requestedDates: { startDate: input.startDate, endDate: input.endDate },
    observedGscDates: coveredDates,
  };
  result.warnings.push(
    "Deployment version and FIPE reference identity are unknown; content/sitemap hashes identify observed artifacts only.",
    "Dates with no GSC rows may have no activity or unavailable data; observed dates do not prove full date coverage.",
    "GSC uses Pacific dates; GA uses the property timezone in response metadata. Counts cannot be directly reconciled.",
    "Keep raw landing URLs. Resolve observed canonicals and project route policy before page-level comparison.",
    "Search changes are descriptive; low traffic and monthly data publications limit causal conclusions.",
    ...config.context.measurementCaveats,
  );
  if (!config.context.successEvents.length)
    result.warnings.push("No validated success events configured. Do not optimize total keyEvents as conversions.");
  return result;
}

export function aggregate(operation: string, target: string, request: unknown, observations: Evidence[]): Evidence {
  return {
    schemaVersion: 1,
    provider: "pagesight",
    operation,
    target,
    startedAt: observations.map((o) => o.startedAt).sort()[0] ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: observations.every((o) => o.status === "ok")
      ? "ok"
      : observations.every((o) => o.status === "error")
        ? "error"
        : "partial",
    pages: [
      {
        request,
        response: {
          observations,
          summary: observations.map((o) => ({
            provider: o.provider,
            operation: o.operation,
            target: o.target,
            status: o.status,
            errorCode: o.error?.code ?? null,
          })),
        },
      },
    ],
    warnings: [],
  };
}
