import type { ChangeRecord } from "./change-record.js";
import { compareObservation } from "./compare-snapshots.js";
import { capture, type Evidence } from "./evidence.js";
import type { ImportedSnapshot } from "./evidence-schema.js";
import { canonical, normalizeReport, requireSame, Incompatible } from "./report-table.js";
import { configSchema, gaRequestSchema, gscRequestSchema } from "./schema.js";
import { snapshotOperations, observationName } from "./snapshot.js";
import { normalizeGaProperty } from "../providers/ga.js";
import { RequestError } from "../shared/http.js";

function localDay(at: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const value = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function scope(provider: string, request: unknown) {
  if (provider === "ga") {
    const { offset: _offset, limit: _limit, returnPropertyQuota: _quota, ...rest } = gaRequestSchema.parse(request);
    return rest;
  }
  const { startRow: _offset, rowLimit: _limit, ...rest } = gscRequestSchema.parse(request);
  return rest;
}
function boundReport(snapshot: ImportedSnapshot, name: string) {
  const { context, observations } = snapshot.pages[0].response;
  const config = configSchema.parse(context.config);
  const expected = snapshotOperations(config, context.requestedDates.startDate, context.requestedDates.endDate, 1).find(
    (op) => observationName(op) === name,
  );
  const observation = observations.find((o) => o.name === name);
  if (!expected || !["ga.report", "gsc.report"].includes(expected.operation))
    throw new Incompatible("Not a configured snapshot report.");
  if (!observation || observation.status === "error" || !observation.pages.length)
    throw new Incompatible("Report unavailable; absence is not zero.");
  const provider = expected.operation === "ga.report" ? "ga" : "gsc";
  const target =
    expected.operation === "ga.report"
      ? normalizeGaProperty(expected.property)
      : expected.operation === "gsc.report"
        ? expected.site
        : "";
  if (observation.provider !== provider || observation.operation !== "report" || observation.target !== target)
    throw new Incompatible("Report identity does not match configured provider/property.");
  if (expected.operation !== "ga.report" && expected.operation !== "gsc.report")
    throw new Incompatible("Unsupported report.");
  for (const page of observation.pages)
    requireSame(
      scope(provider, page.request),
      scope(provider, expected.request),
      "Report request differs from configured scope.",
    );
  return { observation, report: normalizeReport(observation, context) };
}
const fingerprint = (value: unknown) => Bun.CryptoHasher.hash("sha256", canonical(value), "hex");

export async function evaluateChange(
  record: ChangeRecord,
  baseline: ImportedSnapshot,
  current: ImportedSnapshot | undefined,
  maxRows: number,
): Promise<Evidence> {
  if (baseline.target !== record.site || (current && current.target !== record.site))
    throw new RequestError("Change record and snapshots must identify the same exact site", null, "invalid_input");
  const before = baseline.pages[0].response;
  const after = current?.pages[0].response;
  const names = [
    ...new Set(
      [...before.observations, ...(after?.observations ?? [])]
        .filter((o) => o.operation === "report" && ["gsc", "ga"].includes(o.provider))
        .map((o) => o.name),
    ),
  ].sort();
  const result = await capture(
    "pagesight",
    "change.evaluate",
    record.site,
    {
      recordSha256: fingerprint(record),
      baselineSha256: fingerprint(baseline),
      currentSha256: current ? fingerprint(current) : null,
      maxRows,
    },
    async () => {
      const observations = names.map((name) => {
        try {
          const a = boundReport(baseline, name);
          const timezone = (a.report.semantics as { timezone: string }).timezone;
          const deploymentDay = localDay(record.deployedAt, timezone);
          if (a.report.end >= deploymentDay)
            throw new Incompatible("Baseline must end before the deployment day in this report's timezone.");
          if (!current || !after)
            return {
              name,
              status: "pending",
              reason: "After snapshot not supplied; no outcome is available.",
              timezone,
              deploymentDay,
            };
          const b = boundReport(current, name);
          if (b.report.start <= deploymentDay)
            throw new Incompatible("After period must start after the deployment day in this report's timezone.");
          const identity = (snapshot: ImportedSnapshot) => {
            const config = configSchema.parse(snapshot.pages[0].response.context.config);
            return {
              site: config.site,
              gscSite: config.gscSite,
              gaProperty: config.gaProperty ? normalizeGaProperty(config.gaProperty) : null,
              productionHostname: config.productionHostname,
            };
          };
          requireSame(
            identity(baseline),
            identity(current),
            "Configured site, provider identity or production hostname changed.",
          );
          if (
            a.observation.provider === "ga" &&
            record.measurementChanges.some((change) => {
              const day = localDay(change.at, timezone);
              return day >= a.report.start && day <= b.report.end;
            })
          )
            throw new Incompatible(
              "A declared measurement change intersects the combined periods; GA deltas are withheld.",
            );
          return {
            ...compareObservation(a.observation, b.observation, maxRows, before.context, after.context),
            timezone,
            deploymentDay,
            gapDays: (Date.parse(b.report.start) - Date.parse(a.report.end)) / 86400000 - 1,
            weekdays: {
              baselineStart: new Date(a.report.start).getUTCDay(),
              currentStart: new Date(b.report.start).getUTCDay(),
            },
          };
        } catch (error) {
          return {
            name,
            status: "incompatible",
            reason:
              error instanceof Incompatible
                ? error.message
                : "Unsupported report or reporting timezone; no delta calculated.",
          };
        }
      });
      return {
        evaluationVersion: 1,
        record,
        recordVerification: "User-supplied deployment and change context, not independently verified",
        scope: "Original configured snapshot reports; affectedUrls are annotations and do not filter report rows",
        state: !current
          ? observations.some((o) => o.status === "pending")
            ? "pending"
            : "unavailable"
          : observations.some((o) => ["compared", "limited"].includes(o.status))
            ? "descriptive"
            : "unavailable",
        observations,
        confounded: record.overlappingChanges.length > 0,
        contextChanged: Boolean(
          after &&
          canonical(configSchema.parse(before.context.config)) !== canonical(configSchema.parse(after.context.config)),
        ),
        limitations: [
          "Cloudflare, Bing, crawl graphs, HTML, sitemaps and inspection evidence are unsupported; no cross-provider funnel is calculated.",
          "Declared overlapping changes confound attribution. Configuration-context changes remain visible and can alter event interpretation.",
          "Descriptive comparison only. This does not establish causality, statistical significance or the change's effect on rankings.",
          "Deployment day is excluded in each report's timezone. Equal windows can still differ in weekdays, seasonality, demand or search-system changes.",
          "Only declared measurement and overlapping changes are known. An empty list is not proof that no other changes occurred.",
          "Affected URLs do not change property, hostname, channel or row scope. Missing rows remain unknown, never zero.",
          "Collected timestamps do not prove immutable historical data; source hashes identify the supplied artifacts, not their authenticity.",
        ],
      };
    },
  );
  const data = result.pages[0]?.response as { observations: Array<{ status: string }> } | undefined;
  if (
    result.status === "ok" &&
    (!current || !data?.observations.length || data.observations.some((o) => o.status !== "compared"))
  )
    result.status = "partial";
  return result;
}
