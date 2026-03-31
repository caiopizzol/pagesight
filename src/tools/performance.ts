import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { querySearchAnalytics, type SearchAnalyticsFilter, type SearchAnalyticsResponse } from "../lib/gsc.js";

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

  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const totalImpressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition =
    totalImpressions > 0 ? rows.reduce((sum, r) => sum + r.position * r.impressions, 0) / totalImpressions : 0;

  lines.push(
    "--- Totals ---",
    "",
    `Clicks: ${totalClicks.toLocaleString()}`,
    `Impressions: ${totalImpressions.toLocaleString()}`,
    `Avg CTR: ${(avgCtr * 100).toFixed(1)}%`,
    `Avg Position: ${avgPosition.toFixed(1)}`,
    "",
    "--- Top Results ---",
    "",
  );

  const top = rows.slice(0, 25);
  for (const row of top) {
    const keys = row.keys.join(" | ");
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

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
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
    }) => {
      const startDate = start_date ?? daysAgo(28);
      const endDate = end_date ?? daysAgo(3);
      const dims = dimensions ?? ["query", "page"];

      const filterGroups =
        filters && filters.length > 0
          ? [{ groupType: "and" as const, filters: filters as SearchAnalyticsFilter[] }]
          : undefined;

      try {
        const result = await querySearchAnalytics(site_url, {
          startDate,
          endDate,
          dimensions: dims,
          type: search_type,
          dataState: data_state,
          aggregationType: aggregation_type,
          rowLimit: row_limit ?? 1000,
          startRow: start_row,
          dimensionFilterGroups: filterGroups,
        });

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
