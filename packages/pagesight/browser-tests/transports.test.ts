import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startHttpApi } from "../src/http.js";

test("render operation works through installed-style CLI, HTTP and MCP; missing Chromium is actionable", async () => {
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("<title>Rendered</title><h1>Rendered</h1>", { headers: { "content-type": "text/html" } }),
  });
  const http = startHttpApi("render-only-test-token-at-least-24", 0);
  const entry = new URL("../src/index.ts", import.meta.url).pathname;
  const request = { operation: "page.verify", url: fixture.url.href, settleMs: 0, timeoutMs: 3000 };
  const client = new Client({ name: "render-test", version: "1" });
  const check = (data: any) => {
    expect(data.status).toBe("ok");
    expect(data.pages[0].response.comparisons.serverToDirect.status).toBe("equal");
    expect(data.pages[0].response.observations.direct.pages[0].response.dom.titles).toEqual(["Rendered"]);
  };
  try {
    const child = Bun.spawn([process.execPath, entry, "render", "--url", fixture.url.href, "--settle-ms", "0"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    check(await new Response(child.stdout).json());
    expect(await child.exited).toBe(0);
    const response = await fetch(new URL("v1/query", http.url), {
      method: "POST",
      headers: { Authorization: "Bearer render-only-test-token-at-least-24", "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    check(await response.json());
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "mcp"], stderr: "pipe" }));
    const result = await client.callTool({ name: "observe", arguments: { request } });
    check(result.structuredContent);
    const unavailable = Bun.spawn([process.execPath, entry, "render", "--url", fixture.url.href], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "/nonexistent-pagesight-render-browser-test" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect((await new Response(unavailable.stdout).json()).error.code).toBe("browser_unavailable");
    expect(await unavailable.exited).toBe(1);
  } finally {
    await client.close();
    await http.stop(true);
    await fixture.stop(true);
  }
}, 25000);
