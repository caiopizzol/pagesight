import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execute, operationSchema } from "../api/index.js";
import { RequestError } from "../shared/http.js";

export function registerObserveTool(server: McpServer): void {
  server.tool(
    "observe",
    "Run the shared Pagesight API. Read-only operations: cloudflare.audit (bounded zone analytics/settings/security evidence); technical.compare (saved exact-page technical changes); change.evaluate (deployment context and comparable snapshot evidence); discover; bing.sites/queries/pages/traffic/crawl-stats/crawl-issues/url-info/link-counts/url-links; evidence.import (unverified UI findings); gsc.sites/sitemaps/inspect/report; ga.accounts/property/key-events/report/realtime; page (metadata and image ALT evidence); speed.psi/crux/history; doctor; snapshot; crawl (bounded robots-aware site graph and indexing sample); investigate (fresh exact-page search, organic and technical investigation); opportunities (saved search candidates); assess (saved evidence summary); compare. Pass the API operation object as request. Returns structured evidence, exact effective requests, provider responses and partial errors. See the CLI --help and README for report/config shapes.",
    { request: operationSchema },
    async ({ request }) => {
      try {
        const result = await execute(request);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: { ...result },
          isError: result.status === "error",
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: error instanceof RequestError ? error.message : "Invalid operation" },
          ],
          isError: true,
        };
      }
    },
  );
}
