import type { Evidence } from "./api/evidence.js";

export function renderFollowup(evidence: Evidence): string {
  const data = evidence.pages[0]?.response as
    | {
        asOf: string;
        entries: Array<{
          index: number;
          label?: string;
          id?: string;
          status: string;
          reason?: string;
          confounded?: boolean;
          reports?: Array<{
            name: string;
            status: string;
            reason?: string;
            nextCollection?: { date: string; timezone: string };
          }>;
        }>;
      }
    | undefined;
  if (!data) return `Experiment follow-up unavailable: ${evidence.error?.message ?? evidence.status}\n`;
  const lines = [
    `Experiment follow-up as of ${data.asOf}`,
    "Collection dates are planning estimates; no data is collected automatically.",
    "",
  ];
  for (const entry of data.entries) {
    lines.push(`${entry.label ?? `Entry ${entry.index + 1}`}${entry.id ? ` (${entry.id})` : ""}: ${entry.status}`);
    if (entry.reason) lines.push(`  ${entry.reason}`);
    if (entry.confounded) lines.push("  Declared overlapping changes confound attribution.");
    for (const report of entry.reports ?? []) {
      lines.push(
        `  ${report.name}: ${report.status}${report.nextCollection ? ` — collect ${report.nextCollection.date} (${report.nextCollection.timezone})` : ""}`,
      );
      if (report.reason) lines.push(`    ${report.reason}`);
    }
    lines.push("");
  }
  lines.push(
    "Readiness is per report. Review raw JSON warnings and source hashes; no causal SEO conclusion is implied.",
  );
  return lines.join("\n") + "\n";
}
