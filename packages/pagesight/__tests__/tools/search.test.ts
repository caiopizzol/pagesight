import { expect, test } from "bun:test";
import { registerSearchTool } from "../../src/tools/search/tool.js";
import { callTool } from "../support/mcp.js";

test("search explicit actions validate their required inputs", async () => {
  expect(await callTool(registerSearchTool, "search", { action: "inspect" })).toContain("url is required");
  expect(await callTool(registerSearchTool, "search", { action: "get_site" })).toContain("site_url is required");
});
