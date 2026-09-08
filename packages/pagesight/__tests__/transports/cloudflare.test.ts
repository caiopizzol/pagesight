import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execute } from "../../src/api/index.js";
import { startHttpApi } from "../../src/http.js";

test("Cloudflare audit is reachable through CLI, HTTP and MCP with independent missing-access evidence", async () => {
  const previous = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  const entry = new URL("../../src/index.ts", import.meta.url).pathname;
  const request = {
    operation: "cloudflare.audit",
    zone: "a".repeat(32),
    hostname: "example.com",
    startTime: "2026-08-01T00:00:00Z",
    endTime: "2026-08-02T00:00:00Z",
    limit: 2,
  };
  const server = startHttpApi("cloudflare-fixture-token-long-enough", 0);
  const client = new Client({ name: "cloudflare-test", version: "1" });
  const summary = (value: any) => ({
    status: value.status,
    summary: value.pages[0].response.summary,
    request: value.pages[0].request,
  });
  try {
    const direct = await execute(request);
    expect(direct.status).toBe("error");
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        entry,
        "cloudflare",
        "audit",
        "--zone",
        request.zone,
        "--hostname",
        request.hostname,
        "--start",
        request.startTime,
        "--end",
        request.endTime,
        "--limit",
        "2",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const cli = await new Response(child.stdout).json();
    expect(await child.exited).toBe(1);
    expect(summary(cli)).toEqual(summary(direct));
    const response = await fetch(new URL("v1/query", server.url), {
      method: "POST",
      headers: { Authorization: "Bearer cloudflare-fixture-token-long-enough", "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(summary(await response.json())).toEqual(summary(direct));
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: ["--no-env-file", entry, "mcp"], stderr: "pipe" }),
    );
    const mcp = await client.callTool({ name: "observe", arguments: { request } });
    expect(summary(mcp.structuredContent)).toEqual(summary(direct));
  } finally {
    await client.close();
    await server.stop(true);
    if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previous;
  }
});
