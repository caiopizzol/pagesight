import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execute } from "../../src/api/index.js";
import { startHttpApi } from "../../src/http.js";
import { registerObserveTool } from "../../src/tools/observe.js";
import { gsc, saved } from "../support/comparison.js";

test("CLI comparison reads saved objects and agrees with the API", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pagesight-compare-"));
  const baseline = saved([await gsc(0)]),
    current = saved([await gsc(1)]);
  try {
    await Bun.write(join(dir, "before.json"), JSON.stringify(baseline));
    await Bun.write(join(dir, "after.json"), JSON.stringify(current));
    const child = Bun.spawn(
      [
        process.execPath,
        new URL("../../src/index.ts", import.meta.url).pathname,
        "compare",
        "--baseline",
        join(dir, "before.json"),
        "--current",
        join(dir, "after.json"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = await new Response(child.stdout).json();
    expect(await child.exited).toBe(0);
    expect(output.pages).toEqual((await execute({ operation: "compare", baseline, current })).pages);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("HTTP accepts snapshot objects above the former 1 MB cap and MCP uses the same comparison", async () => {
  const baseline = saved([await gsc(0)]),
    current = saved([await gsc(1)]);
  Object.assign(baseline.pages[0].response as object, { privateFixturePadding: "x".repeat(1_100_000) });
  const input = { operation: "compare", baseline, current };
  const token = "test-comparison-token-at-least-24-chars";
  const api = startHttpApi(token, 0);
  const server = new McpServer({ name: "compare-test", version: "1" });
  const client = new Client({ name: "compare-test-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  registerObserveTool(server);
  try {
    const direct = await execute(input);
    const response = await fetch(`${api.url}v1/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).pages).toEqual(direct.pages);
    await server.connect(a);
    await client.connect(b);
    const result = await client.callTool({ name: "observe", arguments: { request: input } });
    expect((result.structuredContent as { pages: unknown }).pages).toEqual(direct.pages);
  } finally {
    await client.close();
    await server.close();
    await api.stop(true);
  }
});
