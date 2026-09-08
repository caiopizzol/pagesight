import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { fixture, record } from "../support/followup.js";

beforeEach(() => setSystemTime(new Date("2026-09-08T12:00:00Z")));
afterEach(() => setSystemTime());

const asOf = "2026-09-05T12:00:00Z";
const entry = async () => ({ label: "Title", record, baseline: await fixture("2026-07-01", "2026-07-28") });
const run = async (experiments: unknown[], options = {}) =>
  (await execute({ operation: "change.followup", experiments, asOf, ...options })).pages[0]!.response as any;
const report = (data: any, name: string) => data.entries[0].reports.find((r: any) => r.name === name);

test("missing after evidence transitions from waiting to collection, never evaluation by time alone", async () => {
  const experiment = await entry();
  const early = await run([experiment], { asOf: "2026-08-15T12:00:00Z" });
  expect(report(early, "gsc.report.query")).toMatchObject({
    status: "waiting",
    proposedWindow: { startDate: "2026-08-02", endDate: "2026-08-29", collectOn: "2026-09-01", durationDays: 28 },
  });
  expect(report(early, "ga.report.eventName")).toMatchObject({
    proposedWindow: { startDate: "2026-08-03", endDate: "2026-08-30", collectOn: "2026-09-02", timezone: "UTC" },
  });
  const later = await run([experiment]);
  expect(report(later, "gsc.report.query").status).toBe("ready_to_collect");
  expect(later.entries[0].reports.some((r: any) => r.status === "ready_to_evaluate")).toBe(false);
});

test("measurement breaks block GA early without blocking Google Search reports", async () => {
  const experiment = await entry();
  experiment.record = {
    ...record,
    measurementChanges: [{ at: record.deployedAt, description: "tag change" }],
  } as typeof record;
  const result = await run([experiment], { asOf: "2026-08-15T12:00:00Z" });
  expect(report(result, "ga.report.eventName").status).toBe("blocked");
  expect(report(result, "ga.report.eventName").nextCollection).toBeUndefined();
  expect(report(result, "gsc.report.query").status).toBe("waiting");
});

test("current evidence uses evaluator compatibility and preserves limited coverage", async () => {
  const experiment = { ...(await entry()), current: await fixture("2026-08-03", "2026-08-30") };
  const result = await run([experiment]);
  expect(report(result, "gsc.report.query").status).toBe("ready_to_evaluate");
  expect(report(result, "ga.report.eventName").status).toBe("ready_to_evaluate");
  const altered = structuredClone(experiment) as any;
  altered.current.pages[0].response.observations.find(
    (o: any) => o.name === "ga.report.eventName",
  ).pages[0].request.dimensionFilter = undefined;
  const invalid = await run([altered]);
  expect(report(invalid, "ga.report.eventName").status).toBe("blocked");
  expect(report(invalid, "gsc.report.query").status).toBe("ready_to_evaluate");
  const mismatch = await run([{ ...experiment, current: await fixture("2026-08-03", "2026-08-20") }]);
  expect(report(mismatch, "gsc.report.query").reason).toContain("equal duration");
});

test("bad artifacts and missing configured observations stay visible without erasing another experiment", async () => {
  const experiment = await entry();
  const bad = structuredClone(experiment) as any;
  bad.baseline.pages[0].response.observations = bad.baseline.pages[0].response.observations.filter(
    (o: any) => o.name !== "gsc.report.query",
  );
  const result = await run([bad, { label: "broken", record: null, baseline: null }, experiment]);
  expect(result.entries[0].reports.find((r: any) => r.name === "gsc.report.query").status).toBe("blocked");
  expect(result.entries[1].status).toBe("invalid");
  expect(result.entries[2].summary.ready_to_collect).toBeGreaterThan(0);
});

test("reject future clocks, future evidence and unknown reporting timezones", async () => {
  const experiment = await entry();
  const failure = await execute({
    operation: "change.followup",
    experiments: [experiment],
    asOf: "2099-01-01T00:00:00Z",
  }).catch((error: Error) => error);
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain("future");
  const future = structuredClone(experiment);
  future.baseline.finishedAt = "2099-01-01T00:00:00Z";
  expect((await run([future])).entries[0]).toMatchObject({
    status: "invalid",
    reason: "Snapshot contains evidence collected after asOf.",
  });
  const unknown = await run([{ ...experiment, baseline: await fixture("2026-07-01", "2026-07-28", "unknown/zone") }]);
  expect(report(unknown, "ga.report.eventName").status).toBe("blocked");
});

test("calendar windows cross DST and leap month without hourly drift", async () => {
  const baseline = await fixture("2024-02-02", "2024-02-29", "America/New_York");
  const result = await run([{ label: "DST", baseline, record: { ...record, deployedAt: "2024-03-09T23:30:00Z" } }], {
    asOf: "2024-03-11T12:00:00Z",
    lagDays: 2,
  });
  expect(report(result, "ga.report.eventName").proposedWindow).toMatchObject({
    startDate: "2024-03-10",
    endDate: "2024-04-06",
    collectOn: "2024-04-08",
    durationDays: 28,
  });
});

test("reject impossible collection chronology and unfinished saved report periods", async () => {
  const experiment = await entry();
  const bad = structuredClone(experiment);
  bad.baseline.startedAt = "2026-09-01T00:00:00Z";
  expect((await run([bad])).entries[0].reason).toContain("starts after");
  const current = await fixture("2026-08-03", "2026-08-30");
  const ga = (current.pages[0]!.response as any).observations.find((o: any) => o.name === "ga.report.eventName");
  ga.startedAt = ga.finishedAt = "2026-08-30T23:00:00Z";
  expect(report(await run([{ ...experiment, current }]), "ga.report.eventName")).toMatchObject({
    status: "blocked",
    reason: "Current report period was not complete when collected.",
  });
});

test("actual after windows set collection buffer and retain source errors and context changes", async () => {
  const experiment = { ...(await entry()), current: await fixture("2026-08-05", "2026-09-01") };
  experiment.current.startedAt = experiment.current.finishedAt = "2026-09-03T12:00:00Z";
  for (const observation of (experiment.current.pages[0]!.response as any).observations)
    observation.startedAt = observation.finishedAt = "2026-09-03T12:00:00Z";
  const result = await run([experiment], { asOf: "2026-09-03T12:00:00Z" });
  expect(report(result, "ga.report.eventName")).toMatchObject({
    status: "waiting",
    nextCollection: { date: "2026-09-04", timezone: "UTC" },
  });
  const response = experiment.current.pages[0]!.response as any;
  response.context.config.pages = ["https://example.com/another"];
  const ga = response.observations.find((o: any) => o.name === "ga.report.eventName");
  ga.status = "error";
  ga.pages = [];
  ga.error = { code: "unavailable", message: "Provider unavailable", httpStatus: 503 };
  experiment.current.startedAt = experiment.current.finishedAt = "2026-09-04T12:00:00Z";
  for (const observation of response.observations)
    observation.startedAt = observation.finishedAt = "2026-09-04T12:00:00Z";
  const failed = await run([experiment]);
  expect(failed.entries[0].contextChanged).toBe(true);
  expect(report(failed, "ga.report.eventName").sources.current.error.httpStatus).toBe(503);
  expect(report(failed, "gsc.report.query").status).toBe("ready_to_evaluate");
});

test("early saved after evidence must be recollected even after its buffer elapses", async () => {
  const experiment = { ...(await entry()), current: await fixture("2026-08-03", "2026-08-30") };
  const observations = (experiment.current.pages[0]!.response as any).observations;
  const ga = observations.find((o: any) => o.name === "ga.report.eventName");
  ga.startedAt = ga.finishedAt = "2026-09-01T12:00:00Z";
  const result = await run([experiment]);
  expect(report(result, "ga.report.eventName")).toMatchObject({
    status: "ready_to_collect",
    nextCollection: { date: "2026-09-02", timezone: "UTC" },
  });
  expect(report(result, "ga.report.eventName").reason).toContain("Recollect");
  ga.startedAt = ga.finishedAt = "2026-09-02T00:00:00Z";
  expect(report(await run([experiment]), "ga.report.eventName").status).toBe("ready_to_evaluate");
});
