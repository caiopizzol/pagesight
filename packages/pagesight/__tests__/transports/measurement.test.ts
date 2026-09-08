import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execute } from "../../src/api/index.js";
import { startHttpApi } from "../../src/http.js";
import { fixture } from "../support/assessment.js";

const entry = new URL("../../src/index.ts", import.meta.url).pathname;
const preload = new URL("../support/ga-preload.ts", import.meta.url).pathname;
const token = "measurement-test-local-token-long-enough";

test("assessment evidence agrees across API, CLI, HTTP and MCP; text output is opt-in", async () => {
  const dir = await mkdtemp(`${tmpdir()}/pagesight-assessment-`);
  const snapshot = await fixture();
  const request = { operation: "assess", snapshot, maxRows: 2 };
  await Bun.write(`${dir}/snapshot.json`, JSON.stringify(snapshot));
  const server = startHttpApi(token, 0);
  const client = new Client({ name: "measurement-test", version: "1" });
  try {
    const direct = await execute(request);
    const child = Bun.spawn(
      [process.execPath, entry, "assess", "--snapshot", `${dir}/snapshot.json`, "--max-rows", "2"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const cli = await new Response(child.stdout).json();
    expect(await child.exited).toBe(0);
    expect(cli.pages).toEqual(direct.pages);
    const http = await fetch(new URL("v1/query", server.url), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(http.status).toBe(200);
    expect((await http.json()).pages).toEqual(direct.pages);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "mcp"], stderr: "pipe" }));
    const mcp = await client.callTool({ name: "observe", arguments: { request } });
    expect((mcp.structuredContent as { pages: unknown }).pages).toEqual(direct.pages);
    const text = Bun.spawn(
      [
        process.execPath,
        entry,
        "assess",
        "--snapshot",
        `${dir}/snapshot.json`,
        "--format",
        "text",
        "--out",
        `${dir}/report.txt`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = await new Response(text.stdout).text();
    expect(await text.exited).toBe(0);
    expect(output).toContain("42 reported key events");
    expect(await Bun.file(`${dir}/report.txt`).text()).toBe(output);
  } finally {
    await client.close();
    await server.stop(true);
    await rm(dir, { recursive: true });
  }
});

test("Realtime uses the same read endpoint and request through every adapter", async () => {
  const dir = await mkdtemp(`${tmpdir()}/pagesight-realtime-`);
  const previousCredential = process.env.PAGESIGHT_GA_CREDENTIALS;
  const originalFetch = globalThis.fetch;
  const credential = `${dir}/credentials.json`;
  await Bun.write(
    credential,
    JSON.stringify({
      type: "authorized_user",
      client_id: "fixture",
      client_secret: "fixture-secret",
      refresh_token: "fixture-refresh",
    }),
  );
  process.env.PAGESIGHT_GA_CREDENTIALS = credential;
  await import("../support/ga-preload.js");
  const request = {
    operation: "ga.realtime",
    property: "123",
    request: { dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }] },
  };
  await Bun.write(`${dir}/request.json`, JSON.stringify(request.request));
  const server = startHttpApi(token, 0);
  const client = new Client({ name: "realtime-test", version: "1" });
  try {
    const direct = await execute(request);
    expect(direct.status).toBe("ok");
    expect(direct.pages[0].response).toMatchObject({
      fixtureRequest: { returnPropertyQuota: true, minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }] },
    });
    const child = Bun.spawn(
      [
        process.execPath,
        "--preload",
        preload,
        entry,
        "ga",
        "realtime",
        "--property",
        "123",
        "--request",
        `${dir}/request.json`,
      ],
      { stdout: "pipe", stderr: "pipe", env: { ...process.env, PAGESIGHT_GA_CREDENTIALS: credential } },
    );
    const cli = await new Response(child.stdout).json();
    expect(await child.exited).toBe(0);
    expect(cli.pages).toEqual(direct.pages);
    expect(JSON.stringify(cli)).not.toContain("fixture-secret");
    const http = await fetch(new URL("v1/query", server.url), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(http.status).toBe(200);
    expect((await http.json()).pages).toEqual(direct.pages);
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--preload", preload, entry, "mcp"],
        env: { ...process.env, PAGESIGHT_GA_CREDENTIALS: credential } as Record<string, string>,
        stderr: "pipe",
      }),
    );
    const mcp = await client.callTool({ name: "observe", arguments: { request } });
    expect((mcp.structuredContent as { pages: unknown }).pages).toEqual(direct.pages);
  } finally {
    await client.close();
    await server.stop(true);
    globalThis.fetch = originalFetch;
    if (previousCredential === undefined) delete process.env.PAGESIGHT_GA_CREDENTIALS;
    else process.env.PAGESIGHT_GA_CREDENTIALS = previousCredential;
    await rm(dir, { recursive: true });
  }
});
