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

test("opportunity candidates agree across API, CLI, HTTP and MCP with readable text", async () => {
  const { opportunityFixture } = await import("../support/opportunities.js");
  const snapshot = await opportunityFixture();
  const request = { operation: "opportunities", snapshot, minImpressions: 40, maxClicks: 1, maxRows: 1 };
  const dir = await mkdtemp(`${tmpdir()}/pagesight-opportunities-`);
  await Bun.write(`${dir}/snapshot.json`, JSON.stringify(snapshot));
  const server = startHttpApi(token, 0);
  const client = new Client({ name: "opportunities-test", version: "1" });
  try {
    const direct = await execute(request);
    const child = Bun.spawn(
      [
        process.execPath,
        entry,
        "opportunities",
        "--snapshot",
        `${dir}/snapshot.json`,
        "--min-impressions",
        "40",
        "--max-clicks",
        "1",
        "--max-rows",
        "1",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const cli = await new Response(child.stdout).json();
    expect(await child.exited).toBe(3);
    expect(cli.pages).toEqual(direct.pages);
    const response = await fetch(new URL("v1/query", server.url), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).pages).toEqual(direct.pages);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "mcp"], stderr: "pipe" }));
    const mcp = await client.callTool({ name: "observe", arguments: { request } });
    expect((mcp.structuredContent as { pages: unknown }).pages).toEqual(direct.pages);
    const readable = Bun.spawn(
      [process.execPath, entry, "opportunities", "--snapshot", `${dir}/snapshot.json`, "--format", "text"],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(await new Response(readable.stdout).text()).toContain("caller-adjustable investigation cutoffs");
    expect(await readable.exited).toBe(3);
  } finally {
    await client.close();
    await server.stop(true);
    await rm(dir, { recursive: true });
  }
});

test("URL investigation collects live HTML through API, CLI, HTTP and MCP with explicit missing-provider evidence", async () => {
  const web = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response('<title>Investigation fixture</title><meta name="robots" content="noindex">', {
        headers: { "Content-Type": "text/html" },
      }),
  });
  const url = new URL("/candidate?variant=1", web.url).href;
  const config = { site: web.url.href };
  const request = { operation: "investigate", config, url, startDate: "2026-08-01", endDate: "2026-08-28" };
  const dir = await mkdtemp(`${tmpdir()}/pagesight-investigation-`);
  await Bun.write(`${dir}/config.json`, JSON.stringify(config));
  const server = startHttpApi(token, 0);
  const client = new Client({ name: "investigation-test", version: "1" });
  try {
    const direct = await execute(request);
    const data = (e: any) => ({
      target: e.target,
      status: e.status,
      findings: e.pages[0].response.brief.findings,
      unknowns: e.pages[0].response.brief.unknowns,
      nextChecks: e.pages[0].response.brief.nextChecks,
    });
    expect(direct.status).toBe("partial");
    const child = Bun.spawn(
      [
        process.execPath,
        entry,
        "investigate",
        "--config",
        `${dir}/config.json`,
        "--url",
        url,
        "--start",
        "2026-08-01",
        "--end",
        "2026-08-28",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const cli = await new Response(child.stdout).json();
    expect(await child.exited).toBe(3);
    expect(data(cli)).toEqual(data(direct));
    const response = await fetch(new URL("v1/query", server.url), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(200);
    expect(data(await response.json())).toEqual(data(direct));
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "mcp"], stderr: "pipe" }));
    const mcp = await client.callTool({ name: "observe", arguments: { request } });
    expect(data(mcp.structuredContent)).toEqual(data(direct));
    const readable = Bun.spawn(
      [
        process.execPath,
        entry,
        "investigate",
        "--config",
        `${dir}/config.json`,
        "--url",
        url,
        "--start",
        "2026-08-01",
        "--end",
        "2026-08-28",
        "--format",
        "text",
        "--out",
        `${dir}/brief.txt`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const text = await new Response(readable.stdout).text();
    expect(await readable.exited).toBe(3);
    expect(text).toContain("Investigation fixture");
    expect(text).toContain("noindex");
    expect(text).toContain("Search Console is not configured");
    expect(await Bun.file(`${dir}/brief.txt`).text()).toBe(text);
  } finally {
    await client.close();
    await server.stop(true);
    await web.stop(true);
    await rm(dir, { recursive: true });
  }
});

test("bounded crawl is reachable through CLI, HTTP and MCP with the shared graph contract", async () => {
  const web = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req) =>
      new URL(req.url).pathname === "/robots.txt"
        ? new Response("", { status: 404 })
        : new Response('<title>Crawl fixture</title><a href="/next">Next</a>', {
            headers: { "Content-Type": "text/html" },
          }),
  });
  const dir = await mkdtemp(`${tmpdir()}/pagesight-crawl-`);
  const config = { site: web.url.href };
  await Bun.write(`${dir}/config.json`, JSON.stringify(config));
  const request = { operation: "crawl", config, maxPages: 2, inspectLimit: 0 };
  const server = startHttpApi(token, 0);
  const client = new Client({ name: "crawl-test", version: "1" });
  const graph = (e: any) => {
    const g = e.pages[0].response.observations[0].pages[0].response;
    return {
      edges: g.edges,
      pages: g.pages.map((p: any) => ({ url: p.url, status: p.status, depth: p.observedDepthFromSeeds })),
      skipped: g.skipped,
    };
  };
  try {
    const direct = await execute(request);
    const child = Bun.spawn(
      [process.execPath, entry, "crawl", "--config", `${dir}/config.json`, "--max-pages", "2", "--inspect-limit", "0"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const cli = await new Response(child.stdout).json();
    expect(await child.exited).toBe(0);
    expect(graph(cli)).toEqual(graph(direct));
    const response = await fetch(new URL("v1/query", server.url), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(200);
    expect(graph(await response.json())).toEqual(graph(direct));
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "mcp"], stderr: "pipe" }));
    const mcp = await client.callTool({ name: "observe", arguments: { request } });
    expect(graph(mcp.structuredContent)).toEqual(graph(direct));
  } finally {
    await client.close();
    await server.stop(true);
    await web.stop(true);
    await rm(dir, { recursive: true });
  }
});
