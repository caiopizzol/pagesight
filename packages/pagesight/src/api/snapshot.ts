import { RequestError } from "../lib/http.js";
import { capture, type Evidence } from "./evidence.js";
import { configSchema, gaRequestSchema, gscRequestSchema, type Operation, type SiteConfig } from "./schema.js";
import { observeSitemap } from "./web.js";

export type Executor = (input: unknown) => Promise<Evidence>;

export function snapshotOperations(
  config: SiteConfig,
  startDate: string,
  endDate: string,
  maxPages: number,
): Operation[] {
  const operations: Operation[] = [];
  const range = { startDate, endDate };
  if (config.gscSite) {
    const site = config.gscSite;
    operations.push(
      ...[[], ["page"], ["query"], ["date"]].map((dimensions) => ({
        operation: "gsc.report" as const,
        site,
        maxPages,
        request: gscRequestSchema.parse({ ...range, dimensions }),
      })),
      { operation: "gsc.sitemaps", site },
      ...config.pages.map((url) => ({ operation: "gsc.inspect" as const, url, site })),
    );
  }
  if (config.bingSite) {
    const site = config.bingSite;
    operations.push(
      { operation: "bing.queries", site },
      { operation: "bing.pages", site },
      { operation: "bing.traffic", site },
    );
  }
  if (config.gaProperty) {
    const property = config.gaProperty;
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
      property,
      maxPages,
      request: gaRequestSchema.parse({
        dateRanges: [range],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        ...(production ? { dimensionFilter: hostFilter } : {}),
        ...extra,
      }),
    });
    operations.push(
      { operation: "ga.property", property },
      { operation: "ga.key-events", property },
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
    );
  }
  operations.push(...config.pages.map((url) => ({ operation: "page" as const, url })));
  return operations;
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
    observations.push(
      ...(await Promise.all(
        requests.slice(i, i + 3).map(async (request) => ({
          ...(await run(request)),
          name: observationName(request),
        })),
      )),
    );
  if (config.sitemap) {
    const sitemap = config.sitemap;
    const inventory = await capture(
      "web",
      "sitemap-inventory",
      sitemap,
      { url: sitemap, maxDocuments: 5, maxBytes: 8_000_000 },
      () => observeSitemap(sitemap),
    );
    const inventoryResponse = inventory.pages[0]?.response as Awaited<ReturnType<typeof observeSitemap>> | undefined;
    if (inventoryResponse && !inventoryResponse.complete) inventory.status = "partial";
    inventory.name = "web.sitemap";
    observations.push(inventory);
  }
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
  (result.pages[0].response as Record<string, unknown>).snapshotVersion = 1;
  (result.pages[0].response as Record<string, unknown>).context = {
    config,
    providers: providerSelection(config),
    deploymentVersion: null,
    referenceIdentity: null,
    requestedDates: { startDate: input.startDate, endDate: input.endDate },
    observedGscDates: coveredDates,
  };
  result.warnings.push(
    "Deployment version and content reference identity are unknown; content/sitemap hashes identify observed artifacts only.",
    "Dates with no GSC rows may have no activity or unavailable data; observed dates do not prove full date coverage.",
    "GSC uses Pacific dates; GA uses the property timezone in response metadata. Counts cannot be directly reconciled.",
    "Keep raw landing URLs. Resolve observed canonicals and project route policy before page-level comparison.",
    "Search changes are descriptive; traffic volume and content changes limit causal conclusions.",
    ...config.context.measurementCaveats,
  );
  if (!config.context.successEvents.length)
    result.warnings.push("No validated success events configured. Do not optimize total keyEvents as conversions.");
  return result;
}

function observationName(op: Operation): string {
  if (op.operation === "gsc.report") return `gsc.report.${op.request.dimensions?.join("+") || "property"}`;
  if (op.operation === "ga.report") {
    const dimensions = op.request.dimensions?.map((d) => d.name).join("+") || "property";
    const organic = JSON.stringify(op.request.dimensionFilter ?? {}).includes("Organic Search");
    return `ga.report.${dimensions}${organic ? ".organic" : ""}`;
  }
  if (op.operation === "page" || op.operation === "gsc.inspect") return `${op.operation}:${op.url}`;
  return op.operation;
}

export function providerSelection(config: SiteConfig) {
  return {
    gsc: config.gscSite ? "selected" : "not_selected",
    bing: config.bingSite ? "selected" : "not_selected",
    ga: config.gaProperty ? "selected" : "not_selected",
    sitemap: config.sitemap ? "selected" : "not_selected",
    web: config.pages.length ? "selected" : "not_selected",
  };
}

export function aggregate(operation: string, target: string, request: unknown, observations: Evidence[]): Evidence {
  if (!observations.length) throw new RequestError("Select at least one observation", null, "invalid_input");
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
            ...(o.name ? { name: o.name } : {}),
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
