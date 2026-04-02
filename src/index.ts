#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCruxTool } from "./tools/crux.js";
import { registerInspectTool } from "./tools/inspect.js";
import { registerMetatagsTool } from "./tools/metatags.js";
import { registerPagespeedTool } from "./tools/pagespeed.js";
import { registerPerformanceTool } from "./tools/performance.js";
import { registerRobotsTool } from "./tools/robots.js";
import { registerSetupTool } from "./tools/setup.js";
import { registerSitemapsTool } from "./tools/sitemaps.js";

const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();

const server = new McpServer({
  name: "pagesight",
  version: pkg.version,
});

registerCruxTool(server);
registerInspectTool(server);
registerMetatagsTool(server);
registerPagespeedTool(server);
registerPerformanceTool(server);
registerRobotsTool(server);
registerSitemapsTool(server);
registerSetupTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
