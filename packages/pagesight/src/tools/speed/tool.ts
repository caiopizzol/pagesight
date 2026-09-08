import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { speedSchema } from "./schema.js";
import { analyzeSpeed } from "./analyze.js";
export function registerSpeedTool(server: McpServer): void {
  server.tool(
    "speed",
    "Analyze site performance. Run PageSpeed Insights (lab metrics, Lighthouse scores, opportunities) for single or multiple URLs, or query Chrome UX Report for real-world field data and historical trends.",
    speedSchema,
    analyzeSpeed,
  );
}
