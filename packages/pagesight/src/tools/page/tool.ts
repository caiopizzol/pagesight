import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzePage } from "./analyze.js";
import { analyzeBatch } from "./batch.js";
import { analyzeContrast } from "./contrast.js";

export function registerPageTool(server: McpServer): void {
  server.tool(
    "page",
    "Analyze what's on a page — meta tags, Open Graph, Twitter Card, structured data (JSON-LD), internal links, and redirect chains. Also includes a WCAG contrast checker for accessibility fixes.",
    {
      url: z.string().url().optional().describe("Single URL to analyze. Use this OR urls, not both."),
      urls: z
        .array(z.string().url())
        .min(2)
        .max(10)
        .optional()
        .describe(
          "Multiple URLs (2-10) for batch analysis. Returns a summary table of meta tags, structured data, and link health per page.",
        ),
      check_links: z
        .boolean()
        .optional()
        .describe("Check internal links for broken links and redirect chains. Default: true. Set false to skip."),
      user_agent: z.string().optional().describe("Custom User-Agent for page fetch. Default: Googlebot-compatible."),
      foreground: z
        .string()
        .optional()
        .describe("Foreground (text) hex color for WCAG contrast check (e.g., '#D4594C'). Use with background."),
      background: z.string().optional().describe("Background hex color for contrast check (e.g., '#FFFFFF')."),
      large_text: z
        .boolean()
        .optional()
        .describe("Whether text is large (≥18pt or ≥14pt bold). Lowers AA threshold to 3:1."),
    },
    async (options) => {
      const { url, urls, foreground, background, large_text } = options;
      if (urls) return analyzeBatch(urls, options);
      if (foreground && background && !url) return analyzeContrast(foreground, background, large_text);
      if (url) return analyzePage(url, options);
      return {
        content: [
          { type: "text", text: "Provide 'url' for page analysis or 'foreground' + 'background' for contrast check." },
        ],
      };
    },
  );
}
