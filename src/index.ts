#!/usr/bin/env bun
if (Bun.argv.length === 2 || (Bun.argv.length === 3 && Bun.argv[2] === "mcp")) {
  await import("./mcp.js");
} else {
  const { runCli } = await import("./cli.js");
  process.exitCode = await runCli(Bun.argv.slice(2));
}

export {};
