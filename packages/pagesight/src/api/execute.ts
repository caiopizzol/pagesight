import { assessSnapshot } from "./assessment.js";
import { gaRealtime } from "./ga-realtime.js";
import { importUiFindings } from "./ui-findings.js";
import { doctor } from "./doctor.js";
import { ZodError } from "zod";
import { queryCrux, queryCruxHistory } from "../providers/crux.js";
import { gaCredentialInfo, gaFetch, normalizeGaProperty } from "../providers/ga.js";
import { inspectUrlResponse, listSitemapsResponse, listSitesResponse } from "../providers/gsc.js";
import { RequestError } from "../shared/http.js";
import { runPagespeed } from "../providers/pagespeed.js";
import { bingDiagnostics, bingObservation } from "./bing.js";
import { compareSnapshots } from "./compare-snapshots.js";
import { capture, type Evidence } from "./evidence.js";
import { gaReport, gscReport } from "./reports.js";
import { operationSchema } from "./schema.js";
import { discover } from "./discover.js";
import { snapshot } from "./snapshot.js";
import { observePage } from "../web/page-observation.js";

export type Executor = (input: unknown) => Promise<Evidence>;
type ParsedOperation = ReturnType<typeof operationSchema.parse>;

export async function execute(input: unknown): Promise<Evidence> {
  let op: ParsedOperation;
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

async function dispatch(op: ParsedOperation): Promise<Evidence> {
  switch (op.operation) {
    case "assess":
      return assessSnapshot(op.snapshot, op.maxRows);
    case "evidence.import":
      return importUiFindings(op.document);
    case "compare":
      return compareSnapshots(op.baseline, op.current, op.maxRows);
    case "discover":
      return discover(op.url, op.providers, execute);
    case "bing.crawl-stats":
    case "bing.crawl-issues":
      return bingDiagnostics(op.operation === "bing.crawl-stats" ? "crawl-stats" : "crawl-issues", op.site);
    case "bing.url-info":
      return bingDiagnostics("url-info", op.site, op.url);
    case "bing.link-counts":
      return bingDiagnostics("link-counts", op.site, undefined, op.maxPages);
    case "bing.url-links":
      return bingDiagnostics("url-links", op.site, op.url, op.maxPages);
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
      return capture("ga", "property", normalizeGaProperty(op.property), {}, () =>
        gaFetch(normalizeGaProperty(op.property), undefined, true),
      );
    case "ga.key-events":
      return capture(
        "ga",
        "key-events",
        normalizeGaProperty(op.property),
        { pageSize: 200 },
        () => gaFetch(`${normalizeGaProperty(op.property)}/keyEvents?pageSize=200`, undefined, true),
        [
          "Configured key events are not necessarily validated product outcomes; inspect event names. Check nextPageToken.",
        ],
      );
    case "ga.realtime":
      return gaRealtime(op.property, op.request);
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
    case "doctor":
      return doctor(op.config, execute);
    case "snapshot":
      return snapshot(op, execute);
  }
}
