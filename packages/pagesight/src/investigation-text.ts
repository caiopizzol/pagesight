import type { Evidence } from "./api/evidence.js";
import type { investigationBrief } from "./api/investigation.js";

export function renderInvestigation(evidence: Evidence): string {
  const response = evidence.pages[0]?.response as {
    requestedDates: unknown;
    context: unknown;
    brief: ReturnType<typeof investigationBrief>;
  };
  const { brief } = response;
  const quote = (value: unknown) => JSON.stringify(value);
  return [
    `Pagesight investigation: ${quote(evidence.target)} (${evidence.status})`,
    `Reporting window: ${quote(response.requestedDates)}`,
    `Caller context (unverified): ${quote(response.context)}`,
    ...brief.findings.map((f) => `Finding [${f.source}]: ${f.statement}`),
    ...brief.tables.flatMap((t) => [
      `Evidence [${t.source}]: ${quote({ dimensions: t.dimensions, metrics: t.metrics, rows: t.rows, observedRows: t.observedRows, omittedRows: t.omittedRows, unusableRows: t.unusableRows, paginationExhausted: t.paginationExhausted, collectedAt: t.collectedAt, metadata: t.metadata })}`,
      ...t.warnings.map((w) => `Warning [${t.source}]: ${quote(w)}`),
    ]),
    ...brief.technical.map((t) => `Technical [${t.source}]: ${quote(t)}`),
    "Full raw requests/responses and errors are available in JSON output.",
    ...brief.unknowns.map((v) => `Unknown: ${quote(v)}`),
    ...brief.nextChecks.map((v) => `Next check: ${quote(v)}`),
    ...brief.limitations.map((v) => `Limitation: ${quote(v)}`),
    "",
  ].join("\n");
}
