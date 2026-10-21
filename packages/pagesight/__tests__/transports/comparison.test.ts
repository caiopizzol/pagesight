import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { execute } from "../../src/api/index.js";
import { createMcpServer } from "../../src/mcp-server.js";
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

test("MCP accepts large snapshot objects and uses the same comparison", async () => {
  const baseline = saved([await gsc(0)]),
    current = saved([await gsc(1)]);
  Object.assign(baseline.pages[0].response as object, { privateFixturePadding: "x".repeat(1_100_000) });
  const input = { operation: "compare", baseline, current };
  const server = createMcpServer();
  const client = new Client({ name: "compare-test-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    const direct = await execute(input);
    await server.connect(a);
    await client.connect(b);
    const result = await client.callTool({ name: "observe", arguments: { request: input } });
    expect((result.structuredContent as { pages: unknown }).pages).toEqual(direct.pages);
  } finally {
    await client.close();
    await server.close();
  }
});
