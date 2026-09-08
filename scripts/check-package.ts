import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const temporary = await mkdtemp(join(tmpdir(), "pagesight-package-"));

function run(args: string[], cwd: string) {
  const result = Bun.spawnSync([process.execPath, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${args.join(" ")} failed:\n${result.stdout.toString()}${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

try {
  const manifest = await Bun.file(join(root, "packages/pagesight/package.json")).json();
  run(["pm", "pack", "--destination", temporary], join(root, "packages/pagesight"));
  await Bun.write(
    join(temporary, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        pagesight: `file:./pagesight-${manifest.version}.tgz`,
        "@modelcontextprotocol/sdk": manifest.dependencies["@modelcontextprotocol/sdk"],
      },
    }),
  );
  run(["install", "--ignore-scripts"], temporary);
  await Bun.write(
    join(temporary, "smoke.ts"),
    `import { execute, operationSchema, configSchema, evidenceSchema, snapshotEvidenceSchema } from "pagesight";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const fixture = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("<title>Package check</title>") });
try {
  const result = await execute({ operation: "page", url: fixture.url.href });
  if (result.status !== "ok") throw new Error("Page API failed");
  for (const schema of [operationSchema, configSchema, evidenceSchema, snapshotEvidenceSchema]) {
    if (!schema) throw new Error("Public export missing");
  }
  const bin = "./node_modules/pagesight/src/index.ts";
  const help = Bun.spawnSync([process.execPath, bin, "--help"]);
  if (help.exitCode !== 0 || !help.stdout.toString().includes("pagesight")) throw new Error("CLI help failed");
  const client = new Client({ name: "package-check", version: "1" });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, "mcp"], stderr: "pipe" }));
    const { tools } = await client.listTools();
    if (tools.map(tool => tool.name).sort().join() !== "ai,audit,observe,page,search,setup,speed") throw new Error("MCP tools changed");
  } finally { await client.close(); }
} finally { await fixture.stop(true); }
console.log("Packed API, CLI, and seven MCP tools passed");
`,
  );
  console.log(run(["run", "smoke.ts"], temporary).trim());
} finally {
  await rm(temporary, { recursive: true, force: true });
}
