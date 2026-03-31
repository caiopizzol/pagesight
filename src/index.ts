#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerInspectTool } from "./tools/inspect.js";
import { registerPerformanceTool } from "./tools/performance.js";
import { registerSetupTool } from "./tools/setup.js";
import { registerSitemapsTool } from "./tools/sitemaps.js";

const server = new McpServer({
  name: "sitelint",
  version: "0.1.0",
});

registerInspectTool(server);
registerPerformanceTool(server);
registerSitemapsTool(server);
registerSetupTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
