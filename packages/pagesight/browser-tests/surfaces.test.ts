import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { operationSchema } from "../src/api/index.js";
import { commands } from "../src/cli.js";
import { fixture } from "../__tests__/support/followup.js";

// Each case runs one CLI command offline, then sends its operation through MCP observe.
// The CLI's exit code, stdout, stderr and provider requests are snapshots; MCP must match them.
const entry = new URL("../src/index.ts", import.meta.url).pathname;
const preload = new URL("../__tests__/support/offline-providers.ts", import.meta.url).pathname;
const site = "https://example.com/";
const about = `${site}about`;
const gscSite = "sc-domain:example.com";
// A fixed port keeps rendered DOM hashes stable, because they include the page URL.
const local = "http://127.0.0.1:29417/";
const saved = await fixture("2026-07-01", "2026-07-28");
const config = { site };
const dates = { startDate: "2026-08-01", endDate: "2026-08-28" };
const gscRequest = { ...dates, dimensions: ["query"] };
const gaRequest = { dateRanges: [dates], metrics: [{ name: "sessions" }] };
const realtime = { metrics: [{ name: "activeUsers" }] };
const files = {
  "config.json": config,
  "saved.json": saved,
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
    argv: ["compare", "--baseline", "saved.json", "--current", "saved.json"],
    request: { operation: "compare", baseline: saved, current: saved },
  },
  {
    argv: ["discover", "--url", site, "--providers", "gsc,ga"],
    request: { operation: "discover", url: site, providers: ["gsc", "ga"] },
  },
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
  GSC_CLIENT_ID: "fixture-gsc-client",
  GSC_CLIENT_SECRET: "secret-gsc-client",
  GSC_REFRESH_TOKEN: "secret-gsc-refresh",
  GOOGLE_API_KEY: "secret-google-key",
});
async function run(argv: string[]) {
  const child = Bun.spawn([process.execPath, ...args(...argv)], {
    cwd: dir,
    env: env("cli.log"),
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
// The MCP server keeps its Google access token, so only a fresh CLI exchanges one every time.
const withoutTokens = (requests: Array<{ origin: string }>) =>
  requests.filter((request) => request.origin !== "https://oauth2.googleapis.com");

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "pagesight-surfaces-"));
  for (const [name, value] of Object.entries(files)) await Bun.write(join(dir, name), JSON.stringify(value));
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: args("mcp"), env: env("mcp.log"), stderr: "pipe" }),
  );
}, 30_000);

afterAll(async () => {
  await client.close();
  await localSite.stop(true);
  if (dir) await rm(dir, { recursive: true });
});

test("every CLI command and API operation has a case, and MCP lists observe", async () => {
  const covered = new Set<string>();
  for (const { argv } of cases) covered.add(Object.hasOwn(commands, argv[0]) ? argv[0] : `${argv[0]}.${argv[1]}`);
  expect(Object.keys(commands).filter((command) => !covered.has(command))).toEqual([]);
  const operations = [...operationSchema.innerType().optionsMap.keys()];
  expect(operations.filter((operation) => !cases.some(({ request }) => request?.operation === operation))).toEqual([]);
  const { tools } = await client.listTools();
  expect(tools.find((tool) => tool.name === "observe")?.description).toMatchSnapshot();
});

for (const { argv, request } of cases)
  test(`pagesight ${argv.join(" ")}`, async () => {
    const cli = { ...(await run(argv)), requests: await drain("cli.log") };
    const out = argv.indexOf("--out");
    const written = out === -1 ? undefined : await Bun.file(join(dir, argv[out + 1])).text();
    const result = request && (await client.callTool({ name: "observe", arguments: { request } }));
    const mcp = result && { ...CallToolResultSchema.parse(result), requests: await drain("mcp.log") };

    expect(cli).toMatchSnapshot();
    expect(JSON.stringify([cli, written, mcp])).not.toContain("secret-");
    if (written !== undefined) expect(written).toBe(cli.stdout);
    if (!mcp) return;
    const evidence = JSON.stringify(JSON.parse(cli.exit === 2 ? cli.stderr : cli.stdout));
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
