import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { operationSchema } from "../src/api/index.js";
import { commands } from "../src/cli.js";
import { fixture, record } from "../__tests__/support/followup.js";

// Each case runs one CLI command offline, then sends its operation through the HTTP API and MCP observe.
// The CLI's exit code, stdout, stderr and provider requests are snapshots; HTTP and MCP must match them.
const entry = new URL("../src/index.ts", import.meta.url).pathname;
const preload = new URL("../__tests__/support/offline-providers.ts", import.meta.url).pathname;
const site = "https://example.com/";
const about = `${site}about`;
const gscSite = "sc-domain:example.com";
// A fixed port keeps rendered DOM hashes stable, because they include the page URL.
const local = "http://127.0.0.1:29417/";
const apiToken = "secret-local-api-token-for-surfaces";
const saved = await fixture("2026-07-01", "2026-07-28");
const config = { site };
const findings = {
  provider: "bing",
  site,
  source: { kind: "csv", label: "URLs", capturedAt: null, scannedAt: null, coverage: "Unknown" },
  findings: [{ rule: "Short description", severity: "unknown", urls: [] }],
};
const dates = { startDate: "2026-08-01", endDate: "2026-08-28" };
const gscRequest = { ...dates, dimensions: ["query"] };
const gaRequest = { dateRanges: [dates], metrics: [{ name: "sessions" }] };
const realtime = { metrics: [{ name: "activeUsers" }] };
const interval = { startTime: "2026-09-09T00:00:00Z", endTime: "2026-09-10T00:00:00Z" };
const zone = "0123456789abcdef0123456789abcdef";
const asOf = "2026-09-05T12:00:00Z";
const files = {
  "config.json": config,
  "saved.json": saved,
  "record.json": record,
  "experiments.json": [{ label: "Title", record: "record.json", baseline: "saved.json" }],
  "findings.json": findings,
  "gsc-report.json": gscRequest,
  "ga-report.json": gaRequest,
  "realtime.json": realtime,
  "operation.json": { operation: "gsc.sites" },
  "ga-credentials.json": {
    type: "authorized_user",
    client_id: "fixture-ga-client",
    client_secret: "secret-ga-client",
    refresh_token: "secret-ga-refresh",
  },
};

type Case = { argv: string[]; request?: { operation: string; [field: string]: unknown } };
const simple = (operation: string, fields: Record<string, string> = {}): Case => ({
  argv: [...operation.split("."), ...Object.entries(fields).flatMap(([name, value]) => [`--${name}`, value])],
  request: { operation, ...fields },
});
const followup = ["change", "followup", "--manifest", "experiments.json", "--as-of", asOf];
const investigate = [
  "investigate",
  "--config",
  "config.json",
  "--url",
  about,
  "--start",
  "2026-08-01",
  "--end",
  "2026-08-28",
];
const cases: Case[] = [
  { argv: ["--help"] },
  {
    argv: ["render", "--url", `${local}target`, "--from-url", local, "--link-selector", "#go", "--settle-ms", "0"],
    request: {
      operation: "page.verify",
      url: `${local}target`,
      navigation: { fromUrl: local, linkSelector: "#go" },
      settleMs: 0,
    },
  },
  {
    argv: ["cloudflare", "audit", "--zone", zone, "--hostname", "example.com"].concat([
      "--start",
      interval.startTime,
      "--end",
      interval.endTime,
      "--limit",
      "2",
    ]),
    request: { operation: "cloudflare.audit", zone, hostname: "example.com", ...interval, limit: 2 },
  },
  {
    argv: followup,
    request: { operation: "change.followup", experiments: [{ label: "Title", record, baseline: saved }], asOf },
  },
  { argv: [...followup, "--format", "text"] },
  {
    argv: ["change", "evaluate", "--record", "record.json", "--baseline", "saved.json"],
    request: { operation: "change.evaluate", record, baseline: saved },
  },
  {
    argv: ["technical", "compare", "--current", "saved.json"],
    request: { operation: "technical.compare", current: saved },
  },
  {
    argv: ["crawl", "--config", "config.json", "--max-pages", "2"],
    request: { operation: "crawl", config, maxPages: 2 },
  },
  { argv: investigate, request: { operation: "investigate", config, url: about, ...dates } },
  { argv: [...investigate, "--format", "text"] },
  { argv: ["opportunities", "--snapshot", "saved.json"], request: { operation: "opportunities", snapshot: saved } },
  { argv: ["opportunities", "--snapshot", "saved.json", "--format", "text"] },
  { argv: ["assess", "--snapshot", "saved.json"], request: { operation: "assess", snapshot: saved } },
  { argv: ["assess", "--snapshot", "saved.json", "--format", "text", "--out", "assessment.txt"] },
  {
    argv: ["evidence", "import", "--request", "findings.json"],
    request: { operation: "evidence.import", document: findings },
  },
  {
    argv: ["compare", "--baseline", "saved.json", "--current", "saved.json"],
    request: { operation: "compare", baseline: saved, current: saved },
  },
  {
    argv: ["discover", "--url", site, "--providers", "gsc,ga,bing"],
    request: { operation: "discover", url: site, providers: ["gsc", "ga", "bing"] },
  },
  simple("bing.crawl-stats", { site }),
  simple("bing.crawl-issues", { site }),
  simple("bing.url-info", { site, url: about }),
  simple("bing.link-counts", { site }),
  simple("bing.url-links", { site, url: about }),
  simple("bing.sites"),
  simple("bing.queries", { site }),
  simple("bing.pages", { site }),
  simple("bing.traffic", { site }),
  simple("gsc.sites"),
  simple("gsc.sitemaps", { site: gscSite }),
  simple("gsc.inspect", { site: gscSite, url: about }),
  {
    argv: ["gsc", "report", "--site", gscSite, "--request", "gsc-report.json"],
    request: { operation: "gsc.report", site: gscSite, request: gscRequest },
  },
  {
    argv: ["ga", "realtime", "--property", "123", "--request", "realtime.json"],
    request: { operation: "ga.realtime", property: "123", request: realtime },
  },
  simple("ga.accounts"),
  simple("ga.property", { property: "123" }),
  simple("ga.key-events", { property: "123" }),
  {
    argv: ["ga", "report", "--property", "123", "--request", "ga-report.json"],
    request: { operation: "ga.report", property: "123", request: gaRequest },
  },
  { argv: ["page", "--url", site, "--json"], request: { operation: "page", url: site } },
  simple("speed.psi", { url: site }),
  simple("speed.crux", { url: site }),
  simple("speed.crux", { url: `${site}missing` }),
  {
    argv: ["speed", "history", "--url", site, "--origin"],
    request: { operation: "speed.history", url: site, origin: true },
  },
  { argv: ["doctor", "--config", "config.json"], request: { operation: "doctor", config } },
  {
    argv: ["snapshot", "--config", "config.json"],
    request: { operation: "snapshot", config, startDate: "2026-08-11", endDate: "2026-09-07" },
  },
  { argv: ["api", "--request", "operation.json"], request: { operation: "gsc.sites" } },
  simple("page", { url: "ftp://example.com/" }),
  {
    argv: ["render", "--url", `${local}target`, "--from-url", "http://localhost:29417/", "--link-selector", "#go"],
    request: {
      operation: "page.verify",
      url: `${local}target`,
      navigation: { fromUrl: "http://localhost:29417/", linkSelector: "#go" },
    },
  },
  { argv: ["page", "--unknown-flag"] },
];

let dir = "";
let port = 0;
let serveOutput = "";
let server: ReturnType<typeof Bun.spawn> | undefined;
const client = new Client({ name: "surfaces-test", version: "1" });
const localSite = Bun.serve({
  hostname: "127.0.0.1",
  port: 29417,
  fetch: () =>
    new Response('<title>Local</title><a id="go" href="/target">Target</a>', {
      headers: { "content-type": "text/html" },
    }),
});
const args = (...rest: string[]) => ["--no-env-file", "--preload", preload, entry, ...rest];
const env = (log: string) => ({
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH } : {}),
  TZ: "UTC",
  PAGESIGHT_FIXTURE_LOG: join(dir, log),
  PAGESIGHT_FIXTURE_NOW: "2026-09-10T12:00:00.000Z",
  PAGESIGHT_FIXTURE_ACCESS_TOKEN: "secret-access-token",
  PAGESIGHT_GA_CREDENTIALS: join(dir, "ga-credentials.json"),
  PAGESIGHT_API_TOKEN: apiToken,
  GSC_CLIENT_ID: "fixture-gsc-client",
  GSC_CLIENT_SECRET: "secret-gsc-client",
  GSC_REFRESH_TOKEN: "secret-gsc-refresh",
  GOOGLE_API_KEY: "secret-google-key",
  BING_WEBMASTER_API_KEY: "secret-bing-key",
  CLOUDFLARE_API_TOKEN: "secret-cloudflare-token",
});
async function run(argv: string[], environment = env("cli.log")) {
  const child = Bun.spawn([process.execPath, ...args(...argv)], {
    cwd: dir,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exit, stdout, stderr };
}
// Reads and clears one process's request log. Sorted, because parallel observations finish in any order.
async function drain(log: string) {
  const file = Bun.file(join(dir, log));
  const lines = (await file.exists()) ? (await file.text()).split("\n").filter(Boolean).sort() : [];
  await Bun.write(file, "");
  return lines.map((line) => JSON.parse(line) as { origin: string });
}
// The HTTP and MCP servers keep their Google access tokens, so only a fresh CLI exchanges one every time.
const withoutTokens = (requests: Array<{ origin: string }>) =>
  requests.filter((request) => request.origin !== "https://oauth2.googleapis.com");
const query = (init: RequestInit) => fetch(`http://127.0.0.1:${port}/v1/query`, init);
const authorized = { Authorization: `Bearer ${apiToken}` };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "pagesight-surfaces-"));
  for (const [name, value] of Object.entries(files)) await Bun.write(join(dir, name), JSON.stringify(value));
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  port = probe.port ?? 0;
  await probe.stop(true);
  const serve = Bun.spawn([process.execPath, ...args("serve", "--port", String(port))], {
    env: env("http.log"),
    stdout: "ignore",
    stderr: "pipe",
  });
  server = serve;
  serveOutput = new TextDecoder().decode((await serve.stderr.getReader().read()).value);
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: args("mcp"), env: env("mcp.log"), stderr: "pipe" }),
  );
}, 30_000);

afterAll(async () => {
  await client.close();
  server?.kill();
  await server?.exited;
  await localSite.stop(true);
  if (dir) await rm(dir, { recursive: true });
});

test("every CLI command and API operation has a case, and MCP lists observe", async () => {
  // serve is covered by the next test; every case also uses the HTTP API it starts.
  const covered = new Set(["serve"]);
  for (const { argv } of cases) covered.add(Object.hasOwn(commands, argv[0]) ? argv[0] : `${argv[0]}.${argv[1]}`);
  expect(Object.keys(commands).filter((command) => !covered.has(command))).toEqual([]);
  const operations = [...operationSchema.innerType().innerType().optionsMap.keys()];
  expect(operations.filter((operation) => !cases.some(({ request }) => request?.operation === operation))).toEqual([]);
  const { tools } = await client.listTools();
  expect(tools.find((tool) => tool.name === "observe")?.description).toMatchSnapshot();
});

test("serve refuses a short token, then refuses unauthenticated, unknown and malformed requests before provider work", async () => {
  // The port is taken, so a serve that skipped the token check would fail to bind instead of running.
  expect(await run(["serve", "--port", String(port)], { ...env("cli.log"), PAGESIGHT_API_TOKEN: "short" })).toEqual({
    exit: 2,
    stdout: "",
    stderr: '{"error":{"code":"invalid_input","message":"Set PAGESIGHT_API_TOKEN to at least 24 characters"}}\n',
  });
  expect(serveOutput).toBe(`Pagesight API listening on http://127.0.0.1:${port}/v1/query\n`);
  const refused = [
    await query({ method: "POST", body: JSON.stringify({ operation: "gsc.sites" }) }),
    await query({ method: "GET", headers: authorized }),
    await query({ method: "POST", headers: authorized, body: "{" }),
  ];
  expect(await Promise.all(refused.map(async (response) => [response.status, await response.text()]))).toEqual([
    [401, '{"error":{"code":"unauthenticated"}}'],
    [404, '{"error":{"code":"not_found"}}'],
    [400, '{"error":{"code":"invalid_input","message":"Invalid JSON operation"}}'],
  ]);
  expect(await drain("http.log")).toEqual([]);
  expect(await drain("cli.log")).toEqual([]);
});

for (const { argv, request } of cases)
  test(`pagesight ${argv.join(" ")}`, async () => {
    const cli = { ...(await run(argv)), requests: await drain("cli.log") };
    const out = argv.indexOf("--out");
    const written = out === -1 ? undefined : await Bun.file(join(dir, argv[out + 1])).text();
    const response = request && (await query({ method: "POST", headers: authorized, body: JSON.stringify(request) }));
    const http = response && {
      status: response.status,
      type: response.headers.get("content-type"),
      cache: response.headers.get("cache-control"),
      body: await response.text(),
      requests: await drain("http.log"),
    };
    const result = request && (await client.callTool({ name: "observe", arguments: { request } }));
    const mcp = result && { ...CallToolResultSchema.parse(result), requests: await drain("mcp.log") };

    expect(cli).toMatchSnapshot();
    expect(JSON.stringify([cli, written, http, mcp])).not.toContain("secret-");
    if (written !== undefined) expect(written).toBe(cli.stdout);
    if (!http || !mcp) return;
    const evidence = JSON.stringify(JSON.parse(cli.exit === 2 ? cli.stderr : cli.stdout));
    expect(http).toEqual({
      status: [200, 502, 400, 200][cli.exit],
      type: "application/json;charset=utf-8",
      cache: cli.exit === 2 ? null : "no-store",
      body: evidence,
      requests: expect.anything(),
    });
    expect(withoutTokens(http.requests)).toEqual(withoutTokens(cli.requests));
    expect(mcp.isError).toBe(cli.exit === 1 || cli.exit === 2);
    // MCP returns the same evidence, but its SDK parses the request before execute does, which reorders
    // keys in the echoed config. Invalid input is refused by that SDK check, with a message it formats.
    if (cli.exit === 2) expect(mcp.content).toMatchSnapshot();
    else {
      expect(mcp.structuredContent).toEqual(JSON.parse(evidence));
      expect(mcp.content).toEqual([{ type: "text", text: JSON.stringify(mcp.structuredContent) }]);
    }
    expect(withoutTokens(mcp.requests)).toEqual(withoutTokens(cli.requests));
  }, 30_000);
