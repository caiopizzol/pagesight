import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execute } from "../../src/api/index.js";
import { startHttpApi } from "../../src/http.js";
import { fixture, record } from "../support/followup.js";

test("follow-up manifest paths and evidence agree through CLI, HTTP and MCP", async () => {
  const baseline = await fixture("2026-07-01", "2026-07-28");
  const request = {
    operation: "change.followup",
    asOf: "2026-09-05T12:00:00Z",
    experiments: [{ label: "Title", record, baseline }],
  };
  const dir = await mkdtemp(`${tmpdir()}/pagesight-followup-`);
  const server = startHttpApi("followup-test-only-token-at-least-24", 0);
  const client = new Client({ name: "followup-test", version: "1" });
  const entry = new URL("../../src/index.ts", import.meta.url).pathname;
  const runCli = (extra: string[] = []) => {
    const child = Bun.spawn(
      [
        process.execPath,
        entry,
        "change",
        "followup",
        "--manifest",
        `${dir}/list.json`,
        "--as-of",
        request.asOf,
        ...extra,
      ],
      { cwd: tmpdir(), stdout: "pipe", stderr: "pipe" },
    );
    return child;
  };
  try {
    await Bun.write(`${dir}/record.json`, JSON.stringify(record));
    await Bun.write(`${dir}/baseline.json`, JSON.stringify(baseline));
    const manifest = [{ label: "Title", record: "record.json", baseline: "baseline.json" }];
    await Bun.write(`${dir}/list.json`, JSON.stringify(manifest));
    const direct = await execute(request);
    const cli = runCli();
    expect((await new Response(cli.stdout).json()).pages).toEqual(direct.pages);
    expect(await cli.exited).toBe(3);
    const text = runCli(["--format", "text"]);
    const rendered = await new Response(text.stdout).text();
    expect(rendered).toContain("ready_to_collect");
    expect(rendered).toContain("2026-09-01 (America/Los_Angeles)");
    expect(await text.exited).toBe(3);
    const response = await fetch(new URL("v1/query", server.url), {
      method: "POST",
      headers: { Authorization: "Bearer followup-test-only-token-at-least-24", "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect((await response.json()).pages).toEqual(direct.pages);
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, "mcp"], stderr: "pipe" }));
    const mcp = await client.callTool({ name: "observe", arguments: { request } });
    expect((mcp.structuredContent as any).pages).toEqual(direct.pages);
    await Bun.write(
      `${dir}/list.json`,
      JSON.stringify([...manifest, { ...manifest[0], label: "Missing", current: "missing.json" }]),
    );
    const missing = runCli();
    const entries = (await new Response(missing.stdout).json()).pages[0].response.entries;
    expect(entries[0].status).toBe("planned");
    expect(entries[1].status).toBe("invalid");
    expect(await missing.exited).toBe(3);
  } finally {
    await client.close();
    await server.stop(true);
    await rm(dir, { recursive: true });
  }
});
