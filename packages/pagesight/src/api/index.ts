import { ZodError } from "zod";
import { getAuthMethod } from "../lib/auth.js";
import { queryCrux, queryCruxHistory } from "../lib/crux.js";
import { gaCredentialInfo, gaFetch, gaProperty } from "../lib/ga.js";
import { getSite, inspectUrlResponse, listSitemapsResponse, listSitesResponse } from "../lib/gsc.js";
import { RequestError } from "../lib/http.js";
import { runPagespeed } from "../lib/psi.js";
import { bingObservation } from "./bing.js";
import { compareSnapshots } from "./compare.js";
import { defaultDates } from "./dates.js";
import { capture, type Evidence } from "./evidence.js";
import { gaReport, gscReport } from "./reports.js";
import { operationSchema } from "./schema.js";
import { discover } from "./setup.js";
import { aggregate, providerSelection, snapshot } from "./snapshot.js";
import { observePage } from "./web.js";

export { evidenceSchema, snapshotEvidenceSchema } from "./imported.js";
export type { Evidence } from "./evidence.js";
export { configSchema, type Operation, operationSchema } from "./schema.js";

export async function execute(input: unknown): Promise<Evidence> {
  let op: ReturnType<typeof operationSchema.parse>;
  try {
    op = operationSchema.parse(input);
  } catch (error) {
    throw new RequestError(
      error instanceof ZodError
        ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid operation",
      null,
      "invalid_input",
    );
  }
  const result = await dispatch(op);
  if (op.operation.startsWith("ga.")) result.credential = await gaCredentialInfo();
  if (op.operation.startsWith("bing."))
    result.credential = { source: "BING_WEBMASTER_API_KEY", type: "api_key", clientEmail: null };
  const response = result.pages[0]?.response as { nextPageToken?: string } | undefined;
  if (response?.nextPageToken) {
    result.status = "partial";
    result.warnings.push("More metadata pages are available; nextPageToken is preserved in the response.");
  }
  return result;
}

async function dispatch(op: ReturnType<typeof operationSchema.parse>): Promise<Evidence> {
  switch (op.operation) {
    case "compare":
      return compareSnapshots(op.baseline, op.current, op.maxRows);
    case "discover":
      return discover(op.url, op.providers, execute);
    case "bing.sites":
      return bingObservation("sites");
    case "bing.queries":
      return bingObservation("queries", op.site);
    case "bing.pages":
      return bingObservation("pages", op.site);
    case "bing.traffic":
      return bingObservation("traffic", op.site);
    case "gsc.sites":
      return capture("gsc", "sites", "accessible-properties", {}, listSitesResponse);
    case "gsc.sitemaps":
      return capture("gsc", "sitemaps", op.site, { site: op.site }, () => listSitemapsResponse(op.site), [
        "contents[].indexed is deprecated and must not be interpreted.",
      ]);
    case "gsc.inspect":
      return capture(
        "gsc",
        "inspect",
        op.site,
        { inspectionUrl: op.url, siteUrl: op.site },
        () => inspectUrlResponse(op.url, op.site),
        ["Inspection describes Google's indexed state, not a live fetch. This is one URL, not site coverage."],
      );
    case "gsc.report":
      return gscReport(op.site, op.request, op.maxPages);
    case "ga.accounts":
      return capture(
        "ga",
        "accounts",
        "accessible-properties",
        { pageSize: 200 },
        () => gaFetch("accountSummaries?pageSize=200", undefined, true),
        ["If nextPageToken is present, this discovery response is incomplete."],
      );
    case "ga.property":
      return capture("ga", "property", gaProperty(op.property), {}, () =>
        gaFetch(gaProperty(op.property), undefined, true),
      );
    case "ga.key-events":
      return capture(
        "ga",
        "key-events",
        gaProperty(op.property),
        { pageSize: 200 },
        () => gaFetch(`${gaProperty(op.property)}/keyEvents?pageSize=200`, undefined, true),
        [
          "Configured key events are not necessarily validated product outcomes; inspect event names. Check nextPageToken.",
        ],
      );
    case "ga.report":
      return gaReport(op.property, op.request, op.maxPages);
    case "page":
      return capture("web", "page", op.url, { url: op.url }, () => observePage(op.url));
    case "speed.psi":
      return capture(
        "psi",
        "run",
        op.url,
        { url: op.url, strategy: op.strategy, categories: ["performance", "seo"] },
        () => runPagespeed(op.url, { strategy: op.strategy, categories: ["performance", "seo"] }),
        ["Single Lighthouse lab run; not field performance or ranking evidence."],
      );
    case "speed.crux":
    case "speed.history": {
      const request = {
        ...(op.origin ? { origin: new URL(op.url).origin } : { url: op.url }),
        formFactor: op.formFactor,
      };
      return capture(
        "crux",
        op.operation,
        op.url,
        request,
        () => (op.operation === "speed.crux" ? queryCrux(request) : queryCruxHistory(request)),
        [
          "NOT_FOUND means no record for the requested scope, not zero performance. CrUX aggregates 28-day windows; history periods overlap.",
        ],
      );
    }
    case "doctor": {
      const pending: Promise<Evidence>[] = [execute({ operation: "page", url: op.config.site })];
      const site = op.config.gscSite;
      const property = op.config.gaProperty;
      if (op.config.bingSite) pending.push(execute({ operation: "bing.traffic", site: op.config.bingSite }));
      if (site) pending.push(capture("gsc", "access", site, { site, method: getAuthMethod() }, () => getSite(site)));
      if (property)
        pending.push(
          execute({ operation: "ga.property", property }),
          execute({
            operation: "ga.report",
            property,
            request: {
              dateRanges: [{ startDate: defaultDates().endDate, endDate: defaultDates().endDate }],
              metrics: [{ name: "sessions" }],
              limit: 1,
            },
          }),
        );
      const result = aggregate("doctor", op.config.site, op.config, await Promise.all(pending));
      (result.pages[0].response as Record<string, unknown>).providers = {
        ...providerSelection(op.config),
        web: "selected",
        sitemap: "not_checked",
      };
      return result;
    }
    case "snapshot":
      return snapshot(op, execute);
  }
}
