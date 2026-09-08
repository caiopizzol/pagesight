import { z } from "zod";
export const speedSchema = {
  action: z
    .enum(["pagespeed", "crux", "crux_history"])
    .optional()
    .describe("Which analysis to run. Auto-detected: 'pagespeed' when url/urls provided, 'crux' when origin provided."),
  url: z.string().url().optional().describe("URL to analyze (PageSpeed or CrUX)."),
  urls: z
    .array(z.string().url())
    .min(2)
    .max(10)
    .optional()
    .describe("Multiple URLs (2-10) for batch PageSpeed. 2 = compare, 3+ = summary table."),
  strategy: z.enum(["mobile", "desktop"]).optional().describe("Device strategy for PageSpeed. Default: 'mobile'."),
  categories: z
    .array(z.enum(["performance", "accessibility", "best-practices", "seo"]))
    .optional()
    .describe("Lighthouse categories. Default: all four."),
  locale: z.string().optional().describe("Locale for PageSpeed results."),
  origin: z.string().optional().describe("Origin for CrUX data (e.g., 'https://example.com'). Triggers CrUX mode."),
  form_factor: z.enum(["DESKTOP", "PHONE", "TABLET"]).optional().describe("CrUX device filter."),
  metrics: z
    .array(
      z.enum([
        "cumulative_layout_shift",
        "first_contentful_paint",
        "interaction_to_next_paint",
        "largest_contentful_paint",
        "experimental_time_to_first_byte",
        "round_trip_time",
        "navigation_types",
        "form_factors",
      ]),
    )
    .optional()
    .describe("CrUX metrics to query."),
  periods: z.number().min(1).max(40).optional().describe("CrUX history periods (1-40). Default: 25."),
};
export type SpeedOptions = z.infer<z.ZodObject<typeof speedSchema>>;
