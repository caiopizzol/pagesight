import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("recurring runner retains immutable runs, detects technical change and serializes callers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pagesight-runner-"));
  const state = join(dir, "state");
  await mkdir(state, { mode: 0o700 });
  let noindex = false;
  const web = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(`<title>Fixture</title>${noindex ? '<meta name="robots" content="noindex">' : ""}`, {
        headers: { "Content-Type": "text/html" },
      }),
  });
  const config = join(dir, "config.json");
  await Bun.write(config, JSON.stringify({ site: web.url.href, pages: [web.url.href] }));
  const entry = new URL("../../../../scripts/observe-site.ts", import.meta.url).pathname;
  const run = async () => {
    const child = Bun.spawn([process.execPath, "--no-env-file", entry, "--config", config, "--state", state], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(child.stdout).text();
    const error = await new Response(child.stderr).text();
    return { code: await child.exited, output, error };
  };
  try {
    const first = await run();
    expect(first.code).toBe(0);
    const firstInfo = JSON.parse(first.output);
    const firstManifest = await Bun.file(firstInfo.manifest).json();
    expect((await Bun.file(firstManifest.artifacts.alerts.path).json()).pages[0].response).toMatchObject({
      baselineState: "first-run",
      alerts: [],
    });
    noindex = true;
    const second = await run();
    expect(second.code).toBe(0);
    const secondInfo = JSON.parse(second.output);
    expect(secondInfo.manifest).not.toBe(firstInfo.manifest);
    const manifest = await Bun.file(secondInfo.manifest).json();
    expect(
      (await Bun.file(manifest.artifacts.alerts.path).json()).pages[0].response.alerts.some(
        (a: any) => a.kind === "technical-change",
      ),
    ).toBe(true);
    expect(await Bun.file(firstInfo.manifest).exists()).toBe(true);
    await Bun.write(join(state, "runner.lock"), JSON.stringify({ pid: process.pid }));
    expect((await run()).code).toBe(3);
    await rm(join(state, "runner.lock"));
    await Bun.write(config, "{}");
    const bad = await run();
    expect(bad.code).toBe(1);
    expect((await Bun.file(join(state, "last-snapshot.json")).json()).path).toBe(manifest.artifacts.snapshot.path);
  } finally {
    await web.stop(true);
    await rm(dir, { recursive: true });
  }
});
