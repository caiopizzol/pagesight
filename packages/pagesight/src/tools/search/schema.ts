import { z } from "zod";
export const searchSchema = {
  action: z
    .enum(["inspect", "sample", "coverage", "sitemaps", "analytics", "gaps", "list_sites", "get_site", "get_sitemap"])
    .optional()
    .describe("Action to perform. Auto-detected from params when unambiguous."),
  site_url: z.string().optional().describe("GSC property (e.g., 'sc-domain:example.com')."),
  url: z.string().url().optional().describe("URL to inspect in Google's index."),
  sitemap_url: z.string().url().optional().describe("Sitemap URL for sample/coverage inspection or get_sitemap."),
  sample_size: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe("URLs to inspect (1-50). Default: 5 for sample, 20 for coverage."),
  sample_strategy: z
    .enum(["random", "first", "spread"])
    .optional()
    .describe("Sampling strategy. Default: 'spread' for coverage, 'random' for sample."),
  filter: z
    .enum([
      "not_indexed",
      "server_error",
      "redirect",
      "soft_404",
      "blocked",
      "duplicate",
      "discovered",
      "crawled_not_indexed",
    ])
    .optional()
    .describe("Filter sample results by coverage issue type. Inspects more URLs internally to find matches."),
  start_date: z.string().optional().describe("Start date (YYYY-MM-DD) for analytics. Default: 28 days ago."),
  end_date: z.string().optional().describe("End date (YYYY-MM-DD) for analytics. Default: 3 days ago."),
  dimensions: z
    .array(z.enum(["query", "page", "country", "device", "date", "searchAppearance", "hour"]))
    .optional()
    .describe("Analytics dimensions. Default: auto."),
  search_type: z
    .enum(["web", "image", "video", "news", "discover", "googleNews"])
    .optional()
    .describe("Search type for analytics."),
  data_state: z.enum(["all", "final", "hourly_all"]).optional().describe("Data freshness for analytics."),
  aggregation_type: z
    .enum(["auto", "byPage", "byProperty", "byNewsShowcasePanel"])
    .optional()
    .describe("Aggregation mode for analytics."),
  filters: z
    .array(
      z.object({
        dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
        operator: z.enum(["equals", "contains", "notEquals", "notContains", "includingRegex", "excludingRegex"]),
        expression: z.string(),
      }),
    )
    .optional()
    .describe("Dimension filters for analytics."),
  row_limit: z.number().optional().describe("Max rows for analytics (1-25000). Default: 1000."),
  start_row: z.number().optional().describe("Pagination offset for analytics."),
  compare: z.boolean().optional().describe("Compare current vs previous period for analytics."),
};
export type SearchOptions = z.infer<z.ZodObject<typeof searchSchema>>;
