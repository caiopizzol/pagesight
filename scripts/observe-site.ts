import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { execute } from "../packages/pagesight/src/api/index.js";
import { configSchema } from "../packages/pagesight/src/api/schema.js";
import { snapshotEvidenceSchema } from "../packages/pagesight/src/api/evidence-schema.js";
import { defaultDates } from "../packages/pagesight/src/shared/dates.js";

// AIDEV-NOTE: A process deadline is required: launchd calendar jobs have no run-duration timeout.
const deadline = setTimeout(() => {
  process.stderr.write("Pagesight daily runner exceeded 1200 seconds; retained files may be incomplete.\n");
  process.exit(1);
}, 1_200_000);
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  strict: true,
  options: { config: { type: "string" }, state: { type: "string" }, "cloudflare-zone": { type: "string" } },
});
if (!values.config || !values.state)
  throw new Error(
    "Usage: bun --env-file PRIVATE scripts/observe-site.ts --config FILE --state PRIVATE_DIR [--cloudflare-zone ZONE]",
  );
const state = resolve(values.state);
await mkdir(state, { recursive: true, mode: 0o700 });
if ((await stat(state)).mode & 0o077) throw new Error("State directory must be private (0700)");
const lockPath = join(state, "runner.lock");
let staleLock = false;
try {
  const lock = await stat(lockPath);
  if (Date.now() - lock.mtimeMs > 2_400_000) {
    const old = JSON.parse(await readFile(lockPath, "utf8")) as { pid: number };
    let alive = true;
    try {
      process.kill(old.pid, 0);
    } catch {
      alive = false;
    }
    if (!alive) {
      await rm(lockPath);
      staleLock = true;
    }
  }
} catch (error) {
  if ((error as { code?: string }).code !== "ENOENT") throw error;
}
let lock;
try {
  lock = await open(lockPath, "wx", 0o600);
} catch {
  clearTimeout(deadline);
  process.stderr.write("Daily runner already locked; no concurrent run started.\n");
  process.exit(3);
}
await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
await lock.close();
async function writePrivate(path: string, value: unknown) {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(value, null, 2) + "\n");
  } finally {
    await file.close();
  }
}
try {
  const startedAt = new Date().toISOString();
  const runId = startedAt.replace(/[:.]/g, "-") + "-" + crypto.randomUUID();
  const dir = join(state, "runs", runId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const manifest: { [key: string]: unknown } = {
    version: 1,
    runId,
    startedAt,
    staleLockRecovered: staleLock,
    artifacts: {},
    cloudflare: values["cloudflare-zone"] ? "selected" : "not-configured",
  };
  const artifacts: Record<string, { path: string; sha256: string; status: string }> = {};
  let exitCode = 0;
  const save = async (name: string, result: unknown, status: string) => {
    const path = join(dir, name + ".json");
    await writePrivate(path, result);
    artifacts[name] = {
      path,
      sha256: Bun.CryptoHasher.hash("sha256", await Bun.file(path).arrayBuffer(), "hex"),
      status,
    };
  };
  try {
    const config = configSchema.parse(await Bun.file(resolve(values.config)).json());
    const dates = defaultDates();
    manifest.dates = { ...dates, timezone: "America/Los_Angeles" };
    manifest.configSha256 = Bun.CryptoHasher.hash("sha256", JSON.stringify(config), "hex");
    const previousPath = join(state, "last-snapshot.json");
    let previous;
    let priorRunDate: string | null = null;
    try {
      const pointer = JSON.parse(await readFile(previousPath, "utf8")) as { path: string; finishedAt: string };
      previous = snapshotEvidenceSchema.parse(await Bun.file(pointer.path).json());
      priorRunDate = pointer.finishedAt.slice(0, 10);
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT")
        manifest.previousEvidenceError = "Previous snapshot unreadable; baseline reset";
    }
    manifest.previousRunUtcDate = priorRunDate;
    manifest.missedUtcDays = priorRunDate
      ? Math.max(0, Math.round((Date.parse(startedAt.slice(0, 10)) - Date.parse(priorRunDate)) / 86400000) - 1)
      : null;
    const snapshot = await execute({ operation: "snapshot", config, ...dates, maxPages: 1 });
    await save("snapshot", snapshot, snapshot.status);
    const parsed = snapshotEvidenceSchema.safeParse(snapshot);
    if (parsed.success) {
      const changes = await execute({
        operation: "technical.compare",
        ...(previous ? { baseline: previous } : {}),
        current: parsed.data,
      });
      await save("alerts", changes, changes.status);
      const response = changes.pages[0]?.response as
        | { alerts?: Array<{ kind: string; source: string; message: string }> }
        | undefined;
      const readable =
        (response?.alerts ?? []).map((a) => `${a.kind}: ${a.source}: ${a.message}`).join("\n") ||
        "No observed technical changes or availability alerts in this sampled run.";
      const report = await open(join(dir, "alerts.txt"), "wx", 0o600);
      try {
        await report.writeFile(readable + "\n");
      } finally {
        await report.close();
      }
    }
    if (parsed.success && snapshot.status !== "error") {
      const temp = join(state, "last-snapshot-" + runId + ".tmp");
      await writePrivate(temp, { path: artifacts.snapshot.path, finishedAt: snapshot.finishedAt });
      await rename(temp, previousPath);
    }
    if (!parsed.success || snapshot.status === "error") exitCode = 1;
    else if (snapshot.status === "partial") exitCode = 3;
    if (values["cloudflare-zone"]) {
      const endTime = startedAt.slice(0, 10) + "T00:00:00Z";
      const startTime = new Date(Date.parse(endTime) - 86400000).toISOString();
      const cloudflare = await execute({
        operation: "cloudflare.audit",
        zone: values["cloudflare-zone"],
        hostname: config.productionHostname,
        startTime,
        endTime,
        limit: 50,
      });
      await save("cloudflare", cloudflare, cloudflare.status);
      manifest.cloudflareWindow = { startTime, endTime, timezone: "UTC" };
      if (cloudflare.status !== "ok" && exitCode === 0) exitCode = cloudflare.status === "partial" ? 3 : 1;
    }
  } catch {
    manifest.error = "Configuration or collection failed; inspect private artifacts and provider availability";
    exitCode = 1;
  }
  manifest.finishedAt = new Date().toISOString();
  manifest.artifacts = artifacts;
  manifest.exitCode = exitCode;
  await writePrivate(join(dir, "manifest.json"), manifest);
  process.stdout.write(JSON.stringify({ runId, manifest: join(dir, "manifest.json"), exitCode }) + "\n");
  process.exitCode = exitCode;
} finally {
  await rm(lockPath);
  clearTimeout(deadline);
}
