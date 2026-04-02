import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { querySearchAnalytics, type SearchAnalyticsFilter, type SearchAnalyticsResponse } from "../lib/gsc.js";

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
  if (previous === 0) return current > 0 ? "+∞" : "0%";
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

  lines.push(
    `--- Summary (${rows.length} rows returned) ---`,
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

function formatComparison(
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
    "--- Summary ---",
    "",
    `             Current     Previous    Change`,
    `Clicks:      ${String(cur.clicks.toLocaleString()).padEnd(12)} ${String(prev.clicks.toLocaleString()).padEnd(12)} ${pctChange(cur.clicks, prev.clicks)}`,
    `Impressions: ${String(cur.impressions.toLocaleString()).padEnd(12)} ${String(prev.impressions.toLocaleString()).padEnd(12)} ${pctChange(cur.impressions, prev.impressions)}`,
    `Avg CTR:     ${`${(cur.ctr * 100).toFixed(1)}%`.padEnd(12)} ${`${(prev.ctr * 100).toFixed(1)}%`.padEnd(12)} ${((cur.ctr - prev.ctr) * 100).toFixed(1)}pp`,
    `Avg Position:${String(cur.position.toFixed(1)).padEnd(13)} ${String(prev.position.toFixed(1)).padEnd(12)} ${prev.position === 0 && cur.position > 0 ? "new" : cur.position < prev.position ? "improved" : cur.position > prev.position ? "regressed" : "stable"} (${(cur.position - prev.position).toFixed(1)})`,
    "",
  ];

  // Build lookup for previous period rows
  const prevMap = new Map<string, (typeof prevRows)[0]>();
  for (const row of prevRows) {
    prevMap.set(row.keys.join("|"), row);
  }

  // Find biggest movers (by click change)
  const movers: Array<{ keys: string[]; curClicks: number; prevClicks: number; curPos: number; prevPos: number }> = [];
  for (const row of curRows) {
    const key = row.keys.join("|");
    const prevRow = prevMap.get(key);
    movers.push({
      keys: row.keys,
      curClicks: row.clicks,
      prevClicks: prevRow?.clicks ?? 0,
      curPos: row.position,
      prevPos: prevRow?.position ?? 0,
    });
  }

  // Also include rows that disappeared (were in previous but not in current)
  const curKeys = new Set(curRows.map((r) => r.keys.join("|")));
  for (const row of prevRows) {
    const key = row.keys.join("|");
    if (!curKeys.has(key)) {
      movers.push({
        keys: row.keys,
        curClicks: 0,
        prevClicks: row.clicks,
        curPos: 0,
        prevPos: row.position,
      });
    }
  }

  // Sort by absolute click change descending
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

  if (regressed.length > 0) {
    lines.push("--- Regressed ---", "");
    for (const m of regressed) {
      const keys = m.keys.map((k, i) => `${dimensions[i] ?? "key"}=${k}`).join(" | ");
      const posChange = m.prevPos > 0 ? ` | Position: ${m.prevPos.toFixed(1)} → ${m.curPos.toFixed(1)}` : "";
      lines.push(`${keys}`);
      lines.push(`  Clicks: ${m.prevClicks} → ${m.curClicks} (${pctChange(m.curClicks, m.prevClicks)})${posChange}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function daysAgo(n: number): string {
  // GSC dates are in PT (Pacific Time). Use UTC-8 as a stable approximation.
  const now = new Date(Date.now() - 8 * 60 * 60 * 1000);
  now.setDate(now.getDate() - n);
  return now.toISOString().split("T")[0];
}

export function registerPerformanceTool(server: McpServer): void {
  server.tool(
    "performance",
    "Query Google Search Console search analytics. Returns clicks, impressions, CTR, and position data. Supports all dimensions, search types, filter operators, aggregation modes, and pagination.",
    {
      site_url: z.string().describe("The GSC property (e.g., 'https://example.com/' or 'sc-domain:example.com')"),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD). Default: 28 days ago."),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD). Default: 3 days ago."),
      dimensions: z
        .array(z.enum(["query", "page", "country", "device", "date", "searchAppearance", "hour"]))
        .optional()
        .describe(
          "Dimensions to group by. Default: ['query', 'page']. Use 'hour' for hourly data (requires dataState='hourly_all').",
        ),
      search_type: z
        .enum(["web", "image", "video", "news", "discover", "googleNews"])
        .optional()
        .describe("Filter by search type. Default: 'web'."),
      data_state: z
        .enum(["all", "final", "hourly_all"])
        .optional()
        .describe(
          "Data freshness. 'all' includes fresh data, 'final' only finalized, 'hourly_all' for hourly granularity. Default: 'all'.",
        ),
      aggregation_type: z
        .enum(["auto", "byPage", "byProperty", "byNewsShowcasePanel"])
        .optional()
        .describe("How to aggregate results. Default: 'auto'."),
      filters: z
        .array(
          z.object({
            dimension: z
              .enum(["query", "page", "country", "device", "searchAppearance"])
              .describe("Dimension to filter on."),
            operator: z
              .enum(["equals", "contains", "notEquals", "notContains", "includingRegex", "excludingRegex"])
              .describe("Filter operator."),
            expression: z
              .string()
              .describe(
                "Filter value. For country use ISO 3166-1 alpha-3 (e.g., 'FRA'). For device: 'DESKTOP', 'MOBILE', 'TABLET'.",
              ),
          }),
        )
        .optional()
        .describe("Dimension filters. Combined with AND logic."),
      row_limit: z.number().optional().describe("Max rows (1-25000). Default: 1000."),
      start_row: z.number().optional().describe("Zero-based offset for pagination. Default: 0."),
      compare: z
        .boolean()
        .optional()
        .describe(
          "Compare against the previous period of equal length. Shows click/impression/CTR/position deltas and top movers.",
        ),
    },
    async ({
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
    }) => {
      const startDate = start_date ?? daysAgo(28);
      const endDate = end_date ?? daysAgo(3);
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

      try {
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

          return {
            content: [
              {
                type: "text",
                text: formatComparison(
                  site_url,
                  current,
                  previous,
                  dims,
                  startDate,
                  endDate,
                  prevStartDate,
                  prevEndDate,
                ),
              },
            ],
          };
        }

        const result = await querySearchAnalytics(site_url, queryOpts);
        return {
          content: [{ type: "text", text: formatPerformance(site_url, result, dims, startDate, endDate) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error querying search analytics: ${msg}` }] };
      }
    },
  );
}
