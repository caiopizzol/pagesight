import { gaFetch, normalizeGaProperty, type GaReport } from "../providers/ga.js";
import { RequestError } from "../shared/http.js";
import { createEvidence, fail, type Evidence } from "./evidence.js";
import type { GaRealtimeRequest } from "./schema.js";

export async function gaRealtime(
  property: string,
  request: GaRealtimeRequest,
  query = (r: GaRealtimeRequest) => gaFetch<GaReport>(`${normalizeGaProperty(property)}:runRealtimeReport`, r),
): Promise<Evidence> {
  const result = createEvidence("ga", "realtime", normalizeGaProperty(property));
  result.warnings.push(
    "Realtime is a moving window of reported property activity, not a historical or finalized report. Requested filters determine scope; no production hostname filter is added.",
    "Activity does not identify a particular browser test or prove event counts are correct. Empty rows do not prove collection failed.",
    "Realtime dimensions and metrics differ from standard reports. Windows beyond 29 minutes ago require Analytics 360; overlapping ranges count overlapping events in both ranges.",
  );
  try {
    const response = await query(request);
    result.pages.push({ request, response });
    if (response.rows !== undefined && !Array.isArray(response.rows))
      throw new RequestError("Invalid realtime rows", null, "invalid_response");
    const count = response.rows?.length ?? 0;
    const total = response.rowCount ?? (count === 0 && Array.isArray(response.metricHeaders) ? 0 : undefined);
    if (!Number.isSafeInteger(total) || Number(total) < count)
      throw new RequestError("Invalid realtime rowCount", null, "invalid_response");
    const exhausted = total === count;
    result.pagination = { exhausted, nextOffset: null, rowsReturned: count };
    if (!exhausted) {
      result.status = "partial";
      result.warnings.push(
        "Realtime rows were truncated. The API has no offset or page token; narrow dimensions or raise the limit. Missing rows are unknown, not zero.",
      );
    }
  } catch (error) {
    result.failedRequest = request;
    fail(result, error);
  }
  result.finishedAt = new Date().toISOString();
  return result;
}
