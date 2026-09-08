import { afterAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startHttpApi } from "../src/http.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execute } from "../src/api/index.js";

const fixture = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () =>
    new Response("<html><head><title>Transport check</title></head></html>", {
      headers: { "Content-Type": "text/html" },
    }),
});
afterAll(() => fixture.stop(true));
const entry = new URL("../src/index.ts", import.meta.url).pathname;

test("CLI emits the same page evidence as the API and exits", async () => {
  const child = Bun.spawn([process.execPath, entry, "page", "--url", fixture.url.href], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(child.stdout).json();
  const direct = await execute({ operation: "page", url: fixture.url.href });
  expect(await child.exited).toBe(0);
  expect(output.pages).toEqual(direct.pages);
});

test("CLI invalid input is structured stderr with no stdout or MCP startup", async () => {
  const child = Bun.spawn([process.execPath, entry, "unknown"], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).json()]);
  expect(await child.exited).toBe(2);
  expect(stdout).toBe("");
  expect(stderr.error.code).toBe("invalid_input");
});

test("CLI rejects ignored flags and unexpected positional arguments before provider work", async () => {
  for (const args of [
    ["doctor", "--start", "2026-08-01"],
    ["snapshot", "--url", fixture.url.href],
    ["api", "--site", "sc-domain:example.com"],
    ["serve", "--out", "ignored.json"],
    ["page", "unexpected", "--url", fixture.url.href],
  ]) {
    const child = Bun.spawn([process.execPath, entry, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).json()]);
    expect(await child.exited).toBe(2);
    expect(stdout).toBe("");
    expect(stderr.error.code).toBe("invalid_input");
  }
});

test("explicit MCP startup exposes existing tools and observe calls the same API", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, "mcp"], stderr: "pipe" });
  const client = new Client({ name: "pagesight-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name).sort()).toEqual([
      "ai",
      "audit",
      "observe",
      "page",
      "search",
      "setup",
      "speed",
    ]);
    expect(listed.tools.find((t) => t.name === "observe")?.description).toContain("evidence.import");
    const result = await client.callTool({
      name: "observe",
      arguments: { request: { operation: "page", url: fixture.url.href } },
    });
    const direct = await execute({ operation: "page", url: fixture.url.href });
    expect((result.structuredContent as { pages?: unknown } | undefined)?.pages).toEqual(direct.pages);
    expect(result.isError).toBe(false);
  } finally {
    await client.close();
  }
});

test("no arguments show CLI help and exit without starting MCP", async () => {
  const child = Bun.spawn([process.execPath, entry], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(await child.exited).toBe(0);
  expect(stdout).toContain("Show CLI help");
  expect(stdout).toContain("pagesight mcp");
  expect(stderr).toBe("");
});

test("UI imports agree through CLI, HTTP and MCP without upgrading their verification", async () => {
  const directory = await mkdtemp(`${tmpdir()}/pagesight-import-`);
  const document = {
    provider: "bing",
    site: "https://example.com/",
    source: { kind: "csv", label: "URLs", capturedAt: null, scannedAt: null, coverage: "Unknown" },
    findings: [{ rule: "Short description", severity: "unknown", urls: [] }],
  };
  const request = { operation: "evidence.import", document };
  await Bun.write(`${directory}/input.json`, JSON.stringify(document));
  const server = startHttpApi("transport-test-token-long-enough", 0);
  const client = new Client({ name: "import-test", version: "1" });
  try {
    const direct = await execute(request);
    const child = Bun.spawn([process.execPath, entry, "evidence", "import", "--request", `${directory}/input.json`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const cli = await new Response(child.stdout).json();
    expect(await child.exited).toBe(0);
    expect(cli.pages).toEqual(direct.pages);
    const http = await fetch(new URL("v1/query", server.url), {
      method: "POST",
      headers: { Authorization: "Bearer transport-test-token-long-enough", "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(http.status).toBe(200);
    expect((await http.json()).pages).toEqual(direct.pages);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "mcp"], stderr: "pipe" }));
    const mcp = await client.callTool({ name: "observe", arguments: { request } });
    expect((mcp.structuredContent as { pages: unknown }).pages).toEqual(direct.pages);
  } finally {
    await client.close();
    await server.stop(true);
    await rm(directory, { recursive: true });
  }
});
