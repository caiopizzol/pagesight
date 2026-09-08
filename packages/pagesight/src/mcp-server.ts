import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAiTool } from "./tools/ai.js";
import { registerAuditTool } from "./tools/audit.js";
import { registerObserveTool } from "./tools/observe.js";
import { registerPageTool } from "./tools/page.js";
import { registerSearchTool } from "./tools/search.js";
import { registerSetupTool } from "./tools/setup.js";
import { registerSpeedTool } from "./tools/speed.js";

const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();

export function createMcpServer() {
  const server = new McpServer({
    name: "pagesight",
    version: pkg.version,
  });

  registerObserveTool(server);
  registerAiTool(server);
  registerAuditTool(server);
  registerPageTool(server);
  registerSearchTool(server);
  registerSetupTool(server);
  registerSpeedTool(server);

  return server;
}
