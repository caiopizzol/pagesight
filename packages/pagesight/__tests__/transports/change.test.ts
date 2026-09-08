import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execute } from "../../src/api/index.js";
import { startHttpApi } from "../../src/http.js";
import { fixture } from "../support/assessment.js";

test("pending change evaluation agrees through API, CLI, HTTP and MCP", async () => {
  const baseline = await fixture();
  const record = {
    schemaVersion: 1,
    id: "fixture",
    site: baseline.target,
    affectedUrls: [baseline.target],
    description: "Title edit",
    hypothesis: "Clearer intent",
    deployedAt: "2026-09-01T12:00:00Z",
    expectedSignal: "Inspect clicks",
    measurementChanges: [],
    overlappingChanges: [],
  };
  const request = { operation: "change.evaluate", record, baseline };
  const dir = await mkdtemp(`${tmpdir()}/pagesight-change-`);
  const token = "change-evaluation-fixture-token";
  const server = startHttpApi(token, 0);
  const client = new Client({ name: "change-test", version: "1" });
  const entry = new URL("../../src/index.ts", import.meta.url).pathname;
  try {
    await Bun.write(`${dir}/before.json`, JSON.stringify(baseline));
    await Bun.write(`${dir}/record.json`, JSON.stringify(record));
    const direct = await execute(request);
    expect((direct.pages[0].response as any).state).toBe("pending");
    const child = Bun.spawn(
      [
        process.execPath,
        entry,
        "change",
        "evaluate",
        "--record",
        `${dir}/record.json`,
        "--baseline",
        `${dir}/before.json`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect((await new Response(child.stdout).json()).pages).toEqual(direct.pages);
    expect(await child.exited).toBe(3);
    const response = await fetch(new URL("v1/query", server.url), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect((await response.json()).pages).toEqual(direct.pages);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "mcp"], stderr: "pipe" }));
    const mcp = await client.callTool({ name: "observe", arguments: { request } });
    expect((mcp.structuredContent as any).pages).toEqual(direct.pages);
  } finally {
    await client.close();
    await server.stop(true);
    await rm(dir, { recursive: true });
  }
});
