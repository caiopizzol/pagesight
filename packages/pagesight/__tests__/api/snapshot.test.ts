import { afterAll, expect, test } from "bun:test";
import { capture } from "../../src/api/evidence.js";
import { configSchema, operationSchema } from "../../src/api/schema.js";
import { snapshot, snapshotOperations } from "../../src/api/snapshot.js";
import { createSiteFixture } from "../support/site.js";
import { execute } from "../../src/api/index.js";
import { RequestError } from "../../src/shared/http.js";

test("snapshots keep at most three operations in flight and finish all observations", async () => {
  let active = 0;
  let peak = 0;
  let finished = 0;
  const pages = Array.from({ length: 8 }, (_, i) => `https://example.com/${i}`);
  const result = await snapshot(
    {
      config: configSchema.parse({ site: "https://example.com", pages }),
      startDate: "2026-08-01",
      endDate: "2026-08-28",
      maxPages: 4,
    },
    async (request) => {
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(1);
      active--;
      finished++;
      return capture("web", "page", "https://example.com", request, async () => ({}));
    },
  );
  expect(peak).toBe(3);
  expect(active).toBe(0);
  expect(finished).toBe(8);
  expect(result.status).toBe("ok");
});

const fixture = createSiteFixture();
afterAll(() => fixture.stop(true));
const config = configSchema.parse({
  site: fixture.url.href,
  gscSite: "sc-domain:example.com",
  gaProperty: "123",
  productionHostname: "127.0.0.1",
  sitemap: `${fixture.url}sitemap.xml`,
  pages: [],
  context: {
    objective: "Use price pages",
    locale: "pt-BR",
    country: "BR",
    routes: [],
    measurementCaveats: ["Delayed collection"],
  },
});

test("production reports filter hostname, while hostname census remains unfiltered", () => {
  const ops = snapshotOperations(config, "2026-08-01", "2026-08-28", 1).filter((o) => o.operation === "ga.report");
  const census = ops.find((o) => o.request.dimensions?.[0]?.name === "hostName");
  expect(census?.request.dimensionFilter).toBeUndefined();
  for (const op of ops.filter((o) => o !== census))
    expect(JSON.stringify(op.request.dimensionFilter)).toContain("127.0.0.1");
  expect(
    ops.some(
      (o) => o.request.dimensions?.[0]?.name === "eventName" && o.request.metrics.some((m) => m.name === "keyEvents"),
    ),
  ).toBe(true);
});

test("snapshot keeps config and successful observations when a provider fails", async () => {
  const r = await snapshot({ config, startDate: "2026-08-01", endDate: "2026-08-28", maxPages: 1 }, async (raw) => {
    const op = operationSchema.parse(raw);
    return capture(op.operation.startsWith("gsc") ? "gsc" : "ga", op.operation, "site", op, async () => {
      if (op.operation.startsWith("gsc")) throw new RequestError("denied", 403);
      return { rows: [] };
    });
  });
  expect(r.status).toBe("partial");
  expect(r.pages[0].response).toMatchObject({ context: { config, deploymentVersion: null, referenceIdentity: null } });
  expect(r.pages[0].response).toMatchObject({
    summary: expect.arrayContaining([
      expect.objectContaining({ provider: "gsc", status: "error", errorCode: "request_failed" }),
      expect.objectContaining({ provider: "web", status: "ok", errorCode: null }),
    ]),
  });
  expect(r.warnings.join(" ")).toContain("No validated success events");
});

test("site-only doctor and snapshot need no provider credentials and expose selection", async () => {
  const minimal = { site: fixture.url.href };
  const doctor = await execute({ operation: "doctor", config: minimal });
  expect(doctor.status).toBe("ok");
  expect(doctor.pages[0].response).toMatchObject({ providers: { gsc: "not_selected", ga: "not_selected" } });
  const result = await execute({
    operation: "snapshot",
    config: minimal,
    startDate: "2026-08-01",
    endDate: "2026-08-28",
  });
  expect(result.status).toBe("ok");
  expect(result.pages[0].response).toMatchObject({
    snapshotVersion: 1,
    observations: [expect.objectContaining({ provider: "web", name: `page:${fixture.url}` })],
  });
});

test("provider selection gates every dependent report and inspection", () => {
  for (const provider of ["gsc", "ga"]) {
    const selected = configSchema.parse({
      site: fixture.url.href,
      ...(provider === "gsc" ? { gscSite: "sc-domain:example.com" } : { gaProperty: "123" }),
    });
    const ops = snapshotOperations(selected, "2026-08-01", "2026-08-28", 1);
    expect(ops.every((op) => op.operation === "page" || op.operation.startsWith(provider))).toBe(true);
    expect(ops.some((op) => op.operation === `${provider}.report`)).toBe(true);
  }
  expect(configSchema.safeParse({ site: fixture.url.href, pages: [] }).success).toBe(false);
});

test("named observations remain unique and stable when a provider is removed", async () => {
  const collect = (raw: unknown) => {
    const op = operationSchema.parse(raw);
    return capture(op.operation.split(".")[0], op.operation, "site", op, async () => ({ rows: [] }));
  };
  const all = await snapshot({ config, startDate: "2026-08-01", endDate: "2026-08-28", maxPages: 1 }, collect);
  const gaOnly = await snapshot(
    {
      config: configSchema.parse({ ...config, gscSite: undefined }),
      startDate: "2026-08-01",
      endDate: "2026-08-28",
      maxPages: 1,
    },
    collect,
  );
  const names = (e: typeof all) =>
    (e.pages[0].response as { observations: Array<{ name: string }> }).observations.map((o) => o.name);
  expect(new Set(names(all)).size).toBe(names(all).length);
  expect(names(gaOnly)).toEqual(names(all).filter((name) => !name.startsWith("gsc.")));
});
