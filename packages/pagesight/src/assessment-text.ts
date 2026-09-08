import type { Evidence } from "./api/evidence.js";

// Provider values are untrusted text, including terminal control characters.
const text = (value: unknown) =>
  JSON.stringify(value).replace(
    /[\u007f-\u009f\u2028\u2029]/gu,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
export function renderAssessment(result: Evidence): string {
  const assessment = result.pages[0]?.response as
    | {
        site: string;
        snapshotSha256: string;
        requestedDates: { startDate: string; endDate: string };
        collectedAt: string;
        findings: Array<{ level: string; message: string; sources: string[]; nextCheck: string }>;
        tables: Array<{
          observation: string;
          scope: string;
          dimensions: string[];
          metrics: string[];
          rows: Array<{ keys: string[]; values: Array<string | number> }>;
          observedRows: number;
          displayedRows: number;
          complete: boolean;
          limitations: string[];
        }>;
        limitations: string[];
      }
    | undefined;
  if (!assessment) return `${JSON.stringify(result, null, 2)}\n`;
  const lines = [
    `Pagesight assessment: ${text(assessment.site)} (${result.status})`,
    `Report period: ${assessment.requestedDates.startDate}–${assessment.requestedDates.endDate}`,
    `Snapshot collected: ${assessment.collectedAt}; supplied evidence, not reverified.`,
    `Snapshot hash (normalized JSON): ${assessment.snapshotSha256}`,
    "",
    ...assessment.findings.flatMap((f) => [
      `- [${text(f.level)}] ${text(f.message)}`,
      `  Source: ${f.sources.map(text).join(", ")}`,
      `  Next check: ${text(f.nextCheck)}`,
    ]),
  ];
  for (const table of assessment.tables) {
    lines.push(
      "",
      `${text(table.observation)} (${table.scope}; showing ${table.displayedRows}/${table.observedRows} observed rows; ${table.complete ? "pagination exhausted" : "incomplete report"})`,
    );
    lines.push(`  ${[...table.dimensions, ...table.metrics].map(text).join(" | ")}`);
    for (const row of table.rows) lines.push(`  ${[...row.keys, ...row.values].map(text).join(" | ")}`);
    for (const limitation of table.limitations) lines.push(`  Limit: ${text(limitation)}`);
  }
  lines.push("", ...assessment.limitations.map((l) => `Limit: ${text(l)}`));
  return `${lines.join("\n")}\n`;
}
