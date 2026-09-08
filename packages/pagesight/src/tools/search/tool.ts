import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchSchema } from "./schema.js";
import { runSearch } from "./actions.js";
export function registerSearchTool(server: McpServer): void {
  server.tool(
    "search",
    "Query Google Search Console. Inspect URL indexing, get coverage breakdown by issue type, sample-inspect with filters, list properties and sitemaps, analyze search traffic, or find keyword gaps.",
    searchSchema,
    runSearch,
  );
}
