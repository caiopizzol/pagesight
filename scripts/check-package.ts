import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
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
    `import { execute, RequestError, operationSchema, configSchema, evidenceSchema, snapshotEvidenceSchema } from "pagesight";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const fixture = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("<title>Package check</title>") });
try {
  const result = await execute({ operation: "page", url: fixture.url.href });
  if (result.status !== "ok" || result.schemaVersion !== 1 || result.provider !== "web" || result.operation !== "page" || result.target !== fixture.url.href) throw new Error("Page evidence contract changed");
  try { await execute({ operation: "invalid" }); throw new Error("Invalid input accepted"); }
  catch (error) { if (!(error instanceof RequestError) || error.code !== "invalid_input") throw error; }
  for (const schema of [operationSchema, configSchema, evidenceSchema, snapshotEvidenceSchema]) {
    if (!schema) throw new Error("Public export missing");
  }
  const bin = "./node_modules/pagesight/src/index.ts";
  const help = Bun.spawnSync([process.execPath, bin, "--help"]);
  if (help.exitCode !== 0 || !help.stdout.toString().includes("pagesight")) throw new Error("CLI help failed");
  async function cli(args) {
    const env = { ...process.env };
    for (const key of ["GSC_SERVICE_ACCOUNT_KEY", "GSC_CLIENT_ID", "GSC_CLIENT_SECRET", "GSC_REFRESH_TOKEN", "GOOGLE_API_KEY"]) delete env[key];
    const child = Bun.spawn([process.execPath, bin, ...args], { env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { stdout, stderr, code };
  }
  if ((await cli(["unknown"])).code !== 2) throw new Error("Invalid-input exit changed");
  if ((await cli(["speed", "crux", "--url", fixture.url.href])).code !== 1) throw new Error("Provider-error exit changed");
  await Bun.write("site.json", JSON.stringify({ site: fixture.url.href, gscSite: "sc-domain:example.com" }));
  if ((await cli(["doctor", "--config", "site.json"])).code !== 3) throw new Error("Partial-evidence exit changed");
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
