import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { querySearchAnalytics, type SearchAnalyticsRow } from "../lib/gsc.js";

function formatPerformance(
  siteUrl: string,
  rows: SearchAnalyticsRow[],
  dimensions: string[],
  startDate: string,
  endDate: string,
): string {
  const lines: string[] = [
    `=== Search Performance: ${siteUrl} ===`,
    `Period: ${startDate} to ${endDate}`,
    `Dimensions: ${dimensions.join(", ")}`,
    `Results: ${rows.length}`,
    "",
  ];

  if (rows.length === 0) {
    lines.push("No data found for this period and filters.");
    return lines.join("\n");
  }

  // Summary
  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const totalImpressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition = rows.reduce((sum, r) => sum + r.position * r.impressions, 0) / totalImpressions;

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

  // Top rows
  const top = rows.slice(0, 20);
  for (const row of top) {
    const keys = row.keys.join(" | ");
    lines.push(`${keys}`);
    lines.push(
      `  Clicks: ${row.clicks} | Impressions: ${row.impressions} | CTR: ${(row.ctr * 100).toFixed(1)}% | Position: ${row.position.toFixed(1)}`,
    );
  }

  if (rows.length > 20) {
    lines.push("", `... and ${rows.length - 20} more rows`);
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
    "Query Google Search Console search analytics. Returns clicks, impressions, CTR, and position data.",
    {
      site_url: z.string().describe("The GSC property (e.g., 'https://example.com/' or 'sc-domain:example.com')"),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD). Default: 28 days ago."),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD). Default: 3 days ago."),
      dimensions: z
        .array(z.enum(["query", "page", "country", "device", "date", "searchAppearance"]))
        .optional()
        .describe("Dimensions to group by. Default: ['query', 'page']."),
      page_url: z.string().optional().describe("Filter to a specific page URL."),
      query: z.string().optional().describe("Filter to a specific search query."),
      row_limit: z.number().optional().describe("Max rows to return (1-25000). Default: 1000."),
    },
    async ({ site_url, start_date, end_date, dimensions, page_url, query, row_limit }) => {
      const startDate = start_date ?? daysAgo(28);
      const endDate = end_date ?? daysAgo(3);
      const dims = dimensions ?? ["query", "page"];

      const filters: Array<{ dimension: string; operator: string; expression: string }> = [];
      if (page_url) {
        filters.push({ dimension: "page", operator: "equals", expression: page_url });
      }
      if (query) {
        filters.push({ dimension: "query", operator: "contains", expression: query });
      }

      const result = await querySearchAnalytics(site_url, {
        startDate,
        endDate,
        dimensions: dims,
        rowLimit: row_limit ?? 1000,
        dimensionFilterGroups: filters.length > 0 ? [{ filters }] : undefined,
      });

      return {
        content: [{ type: "text", text: formatPerformance(site_url, result.rows ?? [], dims, startDate, endDate) }],
      };
    },
  );
}
