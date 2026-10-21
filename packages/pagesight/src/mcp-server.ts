import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execute, operationSchema } from "./api/index.js";
import { RequestError } from "./shared/http.js";

const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();

export function createMcpServer() {
  const server = new McpServer({
    name: "pagesight",
    version: pkg.version,
  });

  server.tool(
    "observe",
    "Run the shared Pagesight API. Evidence operations: page.verify (anonymous browser SEO evidence and one validated internal anchor navigation; may generate site requests); discover; gsc.sites/sitemaps/inspect/report; ga.accounts/property/key-events/report/realtime; page (metadata, Open Graph/Twitter/hreflang and image ALT evidence); robots (robots.txt policy, AI crawler access, llms.txt presence); speed.psi/crux/history; doctor; snapshot; crawl (bounded robots-aware site graph and indexing sample); investigate (fresh exact-page search, organic and technical investigation); opportunities (saved search candidates); assess (saved evidence summary); compare. Pass the API operation object as request. Returns structured evidence, exact effective requests, provider responses and partial errors. See the CLI --help and README for report/config shapes.",
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

  return server;
}
