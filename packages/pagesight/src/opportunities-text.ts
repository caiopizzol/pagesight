import type { Evidence } from "./api/evidence.js";

const text = (value: unknown) =>
  JSON.stringify(value).replace(
    /[\u007f-\u009f\u2028\u2029]/gu,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
export function renderOpportunities(result: Evidence): string {
  const out = result.pages[0]?.response as
    | {
        site: string;
        policy: unknown;
        observedSearchRows: number | null;
        unusableSearchRows: number;
        qualifyingObservedRows: number | null;
        omittedCandidates: number;
        requestedDates: unknown;
        snapshotSha256: string;
        limitations: string[];
        unassociatedOrganic: unknown[];
        candidates: Array<{
          url: string;
          reason: string;
          search: unknown;
          organic: unknown;
          technical: unknown;
          unknowns: string[];
          nextChecks: string[];
          suggestedRequests: unknown[];
        }>;
      }
    | undefined;
  if (!out) return `${JSON.stringify(result, null, 2)}\n`;
  const lines = [
    `Pagesight opportunities: ${text(out.site)} (${result.status})`,
    `Period: ${text(out.requestedDates)}; supplied snapshot, not reverified.`,
    `Snapshot hash: ${out.snapshotSha256}`,
    `Selection policy: ${text(out.policy)}`,
    `Observed search rows: ${text(out.observedSearchRows)}; unusable: ${out.unusableSearchRows}; qualifying: ${text(out.qualifyingObservedRows)}; omitted candidates: ${out.omittedCandidates}`,
  ];
  for (const candidate of out.candidates)
    lines.push(
      "",
      text(candidate.url),
      `Why: ${text(candidate.reason)}`,
      `Search: ${text(candidate.search)}`,
      `Organic associations: ${text(candidate.organic)}`,
      `Technical evidence: ${text(candidate.technical)}`,
      ...candidate.unknowns.map((u) => `Unknown: ${text(u)}`),
      ...candidate.nextChecks.map((n) => `Next check: ${text(n)}`),
      ...candidate.suggestedRequests.map((request) => `Suggested API request: ${text(request)}`),
    );
  lines.push(
    "",
    ...out.unassociatedOrganic.map(
      (table) => `Organic evidence not associated with displayed candidates: ${text(table)}`,
    ),
  );
  lines.push("", ...out.limitations.map((l) => `Limit: ${text(l)}`));
  return `${lines.join("\n")}\n`;
}
