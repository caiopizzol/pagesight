import { querySearchAnalytics, type SearchAnalyticsFilter, type SearchAnalyticsResponse } from "../../providers/gsc.js";
import { pacificDaysAgo } from "../../shared/dates.js";
import { type SearchOptions } from "./schema.js";
import { textResult } from "./result.js";
interface Totals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function computeTotals(rows: SearchAnalyticsResponse["rows"]): Totals {
  const r = rows ?? [];
  const clicks = r.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = r.reduce((sum, row) => sum + row.impressions, 0);
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const position = impressions > 0 ? r.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr, position };
}

function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? `+${current} (new)` : "0%";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function formatPerformance(
  siteUrl: string,
  result: SearchAnalyticsResponse,
  dimensions: string[],
  startDate: string,
  endDate: string,
): string {
  const rows = result.rows ?? [];
  const lines: string[] = [
    `=== Search Performance: ${siteUrl} ===`,
    `Period: ${startDate} to ${endDate}`,
    `Dimensions: ${dimensions.join(", ")}`,
    `Aggregation: ${result.responseAggregationType ?? "auto"}`,
    `Results: ${rows.length}`,
    "",
  ];

  if (result.metadata) {
    if (result.metadata.first_incomplete_date)
      lines.push(`Data incomplete from: ${result.metadata.first_incomplete_date}`);
    if (result.metadata.first_incomplete_hour)
      lines.push(`Hourly data incomplete from: ${result.metadata.first_incomplete_hour}`);
    lines.push("");
  }

  if (rows.length === 0) {
    lines.push("No data found for this period and filters.");
    return lines.join("\n");
  }

  const totals = computeTotals(rows);

  if (totals.impressions < 10) {
    lines.push("⚠ Low data volume — trends may not be meaningful.", "");
  }

  lines.push(
    `--- Returned-row summary (${rows.length} rows; not property totals) ---`,
    "API top-row limits and query privacy exclusions may omit data.",
    "",
    `Clicks: ${totals.clicks.toLocaleString()}`,
    `Impressions: ${totals.impressions.toLocaleString()}`,
    `Avg CTR: ${(totals.ctr * 100).toFixed(1)}%`,
    `Avg Position: ${totals.position.toFixed(1)}`,
    "",
    "--- Top Results ---",
    "",
  );

  const top = rows.slice(0, 25);
  for (const row of top) {
    const keys = row.keys.map((k, i) => `${dimensions[i] ?? "key"}=${k}`).join(" | ");
    lines.push(`${keys}`);
    lines.push(
      `  Clicks: ${row.clicks} | Impressions: ${row.impressions} | CTR: ${(row.ctr * 100).toFixed(1)}% | Position: ${row.position.toFixed(1)}`,
    );
  }

  if (rows.length > 25) {
    lines.push("", `... and ${rows.length - 25} more rows`);
  }

  return lines.join("\n");
}

export function formatComparison(
  siteUrl: string,
  current: SearchAnalyticsResponse,
  previous: SearchAnalyticsResponse,
  dimensions: string[],
  currentStart: string,
  currentEnd: string,
  previousStart: string,
  previousEnd: string,
): string {
  const curRows = current.rows ?? [];
  const prevRows = previous.rows ?? [];
  const cur = computeTotals(curRows);
  const prev = computeTotals(prevRows);

  const lines: string[] = [
    `=== Search Performance: ${siteUrl} ===`,
    `Current:  ${currentStart} to ${currentEnd}`,
    `Previous: ${previousStart} to ${previousEnd}`,
    `Dimensions: ${dimensions.join(", ")}`,
    "",
  ];

  if (cur.impressions < 10 && prev.impressions < 10) {
    lines.push("⚠ Low data volume — trends may not be meaningful.", "");
  }

  lines.push("--- Returned-row summary (not property totals) ---", "");
  lines.push("Query privacy exclusions, top-row limits and aggregation may omit data.");
  lines.push("Position changes can reflect a different mix of impressions, not a ranking change.", "");
  lines.push("             Current     Previous    Change");
  lines.push(
    `Clicks:      ${String(cur.clicks.toLocaleString()).padEnd(12)} ${String(prev.clicks.toLocaleString()).padEnd(12)} ${pctChange(cur.clicks, prev.clicks)}`,
  );
  lines.push(
    `Impressions: ${String(cur.impressions.toLocaleString()).padEnd(12)} ${String(prev.impressions.toLocaleString()).padEnd(12)} ${pctChange(cur.impressions, prev.impressions)}`,
  );
  const curCtr = `${(cur.ctr * 100).toFixed(1)}%`;
  const prevCtr = `${(prev.ctr * 100).toFixed(1)}%`;
  lines.push(`Avg CTR:     ${curCtr.padEnd(12)} ${prevCtr.padEnd(12)} ${((cur.ctr - prev.ctr) * 100).toFixed(1)}pp`);
  const posStatus =
    prev.position === 0 && cur.position > 0
      ? "new"
      : cur.position < prev.position
        ? "improved"
        : cur.position > prev.position
          ? "regressed"
          : "stable";
  lines.push(
    `Avg Position:${String(cur.position.toFixed(1)).padEnd(13)} ${String(prev.position.toFixed(1)).padEnd(12)} ${posStatus} (${(cur.position - prev.position).toFixed(1)})`,
  );
  lines.push("");

  // Build lookup for previous period rows
  const prevMap = new Map<string, (typeof prevRows)[0]>();
  for (const row of prevRows) {
    prevMap.set(JSON.stringify(row.keys), row);
  }

  // Find biggest movers (by click change)
  const movers: Array<{ keys: string[]; curClicks: number; prevClicks: number; curPos: number; prevPos: number }> = [];
  for (const row of curRows) {
    const key = JSON.stringify(row.keys);
    const prevRow = prevMap.get(key);
    if (!prevRow) continue;
    movers.push({
      keys: row.keys,
      curClicks: row.clicks,
      prevClicks: prevRow.clicks,
      curPos: row.position,
      prevPos: prevRow.position,
    });
  }

  lines.push("Movers include only rows observed in both periods. Missing rows are unknown, not zero.", "");

  movers.sort((a, b) => Math.abs(b.curClicks - b.prevClicks) - Math.abs(a.curClicks - a.prevClicks));

  const improved = movers.filter((m) => m.curClicks > m.prevClicks).slice(0, 10);
  const regressed = movers.filter((m) => m.curClicks < m.prevClicks).slice(0, 10);

  if (improved.length > 0) {
    lines.push("--- Improved ---", "");
    for (const m of improved) {
      const keys = m.keys.map((k, i) => `${dimensions[i] ?? "key"}=${k}`).join(" | ");
      const posChange = m.prevPos > 0 ? ` | Position: ${m.prevPos.toFixed(1)} → ${m.curPos.toFixed(1)}` : "";
      lines.push(`${keys}`);
      lines.push(`  Clicks: ${m.prevClicks} → ${m.curClicks} (${pctChange(m.curClicks, m.prevClicks)})${posChange}`);
    }
    lines.push("");
  }

  lines.push("--- Regressed ---", "");
  if (regressed.length > 0) {
    for (const m of regressed) {
      const keys = m.keys.map((k, i) => `${dimensions[i] ?? "key"}=${k}`).join(" | ");
      const posChange = m.prevPos > 0 ? ` | Position: ${m.prevPos.toFixed(1)} → ${m.curPos.toFixed(1)}` : "";
      lines.push(`${keys}`);
      lines.push(`  Clicks: ${m.prevClicks} → ${m.curClicks} (${pctChange(m.curClicks, m.prevClicks)})${posChange}`);
    }
  } else {
    lines.push("(none)");
  }
  lines.push("");

  return lines.join("\n");
}

export async function runAnalytics(options: SearchOptions) {
  const {
    site_url,
    start_date,
    end_date,
    dimensions,
    search_type,
    data_state,
    aggregation_type,
    filters,
    row_limit,
    start_row,
    compare,
  } = options;
  if (!site_url) return textResult("Error: site_url is required for analytics.");

  const startDate = start_date ?? pacificDaysAgo(28);
  const endDate = end_date ?? pacificDaysAgo(3);

  if (start_date && Number.isNaN(new Date(start_date).getTime())) {
    return textResult(`Error: invalid start_date "${start_date}". Use YYYY-MM-DD format.`);
  }
  if (end_date && Number.isNaN(new Date(end_date).getTime())) {
    return textResult(`Error: invalid end_date "${end_date}". Use YYYY-MM-DD format.`);
  }
  const dims = dimensions ?? ["query", "page"];

  const filterGroups =
    filters && filters.length > 0
      ? [{ groupType: "and" as const, filters: filters as SearchAnalyticsFilter[] }]
      : undefined;

  const queryOpts = {
    startDate,
    endDate,
    dimensions: dims,
    type: search_type,
    dataState: data_state,
    aggregationType: aggregation_type,
    rowLimit: row_limit ?? 1000,
    startRow: start_row,
    dimensionFilterGroups: filterGroups,
  };

  if (compare) {
    // Calculate previous period of equal length
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1 * 24 * 60 * 60 * 1000); // day before current start
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    const prevStartDate = prevStart.toISOString().split("T")[0];
    const prevEndDate = prevEnd.toISOString().split("T")[0];

    const [current, previous] = await Promise.all([
      querySearchAnalytics(site_url, queryOpts),
      querySearchAnalytics(site_url, { ...queryOpts, startDate: prevStartDate, endDate: prevEndDate }),
    ]);

    return textResult(
      formatComparison(site_url, current, previous, dims, startDate, endDate, prevStartDate, prevEndDate),
    );
  }

  const result = await querySearchAnalytics(site_url, queryOpts);
  return textResult(formatPerformance(site_url, result, dims, startDate, endDate));
}
