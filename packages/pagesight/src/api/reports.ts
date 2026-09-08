import { gaFreshnessWarnings } from "./ga-freshness.js";
import { type GaReport, gaFetch, normalizeGaProperty } from "../providers/ga.js";
import { querySearchAnalytics, type SearchAnalyticsResponse } from "../providers/gsc.js";
import { RequestError } from "../shared/http.js";
import { type Evidence, createEvidence, fail } from "./evidence.js";
import type { GaRequest, GscRequest } from "./schema.js";

type Query<T> = (request: T) => Promise<SearchAnalyticsResponse | GaReport>;

async function pages<T extends GscRequest | GaRequest>(
  provider: "gsc" | "ga",
  target: string,
  request: T,
  maxPages: number,
  query: Query<T>,
): Promise<Evidence> {
  const result = createEvidence(provider, "report", target);
  const isGsc = provider === "gsc";
  const offsetKey = isGsc ? "startRow" : "offset";
  let offset = Number(isGsc ? (request as GscRequest).startRow : (request as GaRequest).offset);
  const limit = Number(isGsc ? (request as GscRequest).rowLimit : (request as GaRequest).limit);
  result.pagination = { exhausted: false, nextOffset: offset, rowsReturned: 0 };
  if (isGsc) {
    result.warnings.push(
      "GSC dates are America/Los_Angeles; API top-row limits apply even after pagination is exhausted.",
    );
    if ((request as GscRequest).dimensions.includes("query"))
      result.warnings.push("Anonymized queries are omitted. Query-row sums are not property totals.");
    if ((request as GscRequest).dimensions.includes("page"))
      result.warnings.push("Page aggregation differs from property aggregation; do not reconcile their row sums.");
    if ((request as GscRequest).dataState !== "final")
      result.warnings.push("Fresh data can be incomplete even when metadata is absent for this grouping.");
  } else if (
    (request as GaRequest).dimensions.some((dimension) => dimension.name === "landingPagePlusQueryString") &&
    (request as GaRequest).dimensions.some((dimension) => dimension.name === "eventName")
  ) {
    result.warnings.push(
      "Landing page is the first pageview of the session, not necessarily where an event occurred. Event counts are occurrences, not unique sessions or a conversion rate.",
      "Landing URLs retain query strings and (not set)/(other) values; do not join them to Search Console canonical URLs without verified mapping.",
    );
  }
  for (let page = 0; page < maxPages; page++) {
    const effective = { ...request, [offsetKey]: offset };
    try {
      const response = await query(effective);
      if (response.rows !== undefined && !Array.isArray(response.rows))
        throw new RequestError("Invalid report rows", null, "invalid_response");
      const count = response.rows?.length ?? 0;
      const rowCount =
        (response as GaReport).rowCount ??
        (count === 0 && Array.isArray((response as GaReport).metricHeaders) ? 0 : undefined);
      if (!isGsc && (!Number.isSafeInteger(rowCount) || Number(rowCount) < 0))
        throw new RequestError("GA response missing a valid rowCount", null, "invalid_response");
      result.pages.push({ request: effective, response });
      result.pagination.rowsReturned += count;
      offset += count;
      const exhausted = isGsc ? count < limit : offset >= Number(rowCount);
      result.pagination.exhausted = exhausted;
      result.pagination.nextOffset = exhausted ? null : offset;
      if (!isGsc) {
        const metadata = (response as GaReport).metadata;
        if (metadata?.subjectToThresholding) result.warnings.push("GA report is subject to thresholding.");
        if (metadata?.dataLossFromOtherRow)
          result.warnings.push("GA high-cardinality rows were combined into (other).");
        if (metadata?.samplingMetadatas?.length) result.warnings.push("GA report is sampled; see response metadata.");
      }
      if (exhausted) break;
      if (!count) throw new RequestError("Provider pagination made no progress", null, "invalid_response");
    } catch (error) {
      result.failedRequest = effective;
      fail(result, error);
      break;
    }
  }
  if (!result.pagination.exhausted && !result.error) result.status = "partial";
  if (!result.pagination.exhausted)
    result.warnings.push("Pagination not exhausted. Missing rows are unknown, not zero.");
  result.finishedAt = new Date().toISOString();
  if (!isGsc)
    for (const page of result.pages)
      result.warnings.push(
        ...gaFreshnessWarnings(
          (request as GaRequest).dateRanges.map((range) => range.endDate),
          (page.response as GaReport).metadata?.timeZone,
          result.finishedAt,
        ),
      );
  result.warnings = [...new Set(result.warnings)];
  return result;
}

export function gscReport(
  site: string,
  request: GscRequest,
  maxPages: number,
  query = (r: GscRequest) => querySearchAnalytics(site, r),
): Promise<Evidence> {
  return pages("gsc", site, request, maxPages, query);
}

export function gaReport(
  property: string,
  request: GaRequest,
  maxPages: number,
  query = (r: GaRequest) => gaFetch<GaReport>(`${normalizeGaProperty(property)}:runReport`, r),
): Promise<Evidence> {
  return pages("ga", normalizeGaProperty(property), request, maxPages, query);
}
