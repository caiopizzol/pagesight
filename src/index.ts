#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAiTool } from "./tools/ai.js";
import { registerAuditTool } from "./tools/audit.js";
import { registerPageTool } from "./tools/page.js";
import { registerSearchTool } from "./tools/search.js";
import { registerSetupTool } from "./tools/setup.js";
import { registerSpeedTool } from "./tools/speed.js";

const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();

const server = new McpServer({
  name: "pagesight",
  version: pkg.version,
});

registerAiTool(server);
registerAuditTool(server);
registerPageTool(server);
registerSearchTool(server);
registerSetupTool(server);
registerSpeedTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
