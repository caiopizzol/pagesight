import { z } from "zod";
import { changeRecordSchema } from "./change-record.js";
import { assessedSnapshotSchema, configSchema } from "./schema.js";
import { boundReport, evaluateChange, fingerprint, localDay } from "./evaluate-change.js";
import { capture } from "./evidence.js";
import type { ImportedSnapshot } from "./evidence-schema.js";
import { observationName, snapshotOperations } from "./snapshot.js";
import { Incompatible } from "./report-table.js";
import { RequestError } from "../shared/http.js";

const entrySchema = z
  .object({
    label: z.string().min(1).max(200),
    record: changeRecordSchema,
    baseline: assessedSnapshotSchema,
    current: assessedSnapshotSchema.optional(),
  })
  .strict();
const addDays = (day: string, count: number) => new Date(Date.parse(day) + count * 86400000).toISOString().slice(0, 10);
function names(snapshot: ImportedSnapshot) {
  const { context, observations } = snapshot.pages[0].response;
  const expected = snapshotOperations(
    configSchema.parse(context.config),
    context.requestedDates.startDate,
    context.requestedDates.endDate,
    1,
  );
  return [
    ...new Set([
      ...expected.filter((op) => ["gsc.report", "ga.report"].includes(op.operation)).map(observationName),
      ...observations.filter((o) => o.operation === "report" && ["ga", "gsc"].includes(o.provider)).map((o) => o.name),
    ]),
  ].sort();
}
function assertCollected(snapshot: ImportedSnapshot, asOf: string) {
  const evidence = [snapshot, ...snapshot.pages[0].response.observations];
  if (evidence.some((o) => Date.parse(o.startedAt) > Date.parse(o.finishedAt)))
    throw new Incompatible("Evidence collection starts after it finishes.");
  if (evidence.some((o) => Date.parse(o.finishedAt) > Date.parse(asOf)))
    throw new Incompatible("Snapshot contains evidence collected after asOf.");
}

export async function followupChanges(experiments: unknown[], asOf: string, lagDays: number) {
  if (Date.parse(asOf) > Date.now()) throw new RequestError("asOf must not be in the future", null, "invalid_input");
  const result = await capture(
    "pagesight",
    "change.followup",
    "saved-experiments",
    { asOf, lagDays, count: experiments.length },
    async () => {
      const entries = [];
      for (const [index, input] of experiments.entries()) {
        try {
          const { label, record, baseline, current } = entrySchema.parse(input);
          assertCollected(baseline, asOf);
          if (current) assertCollected(current, asOf);
          if (record.site !== baseline.target || (current && current.target !== record.site))
            throw new Incompatible("Record and snapshots must identify the same exact site.");
          if (Date.parse(record.deployedAt) > Date.parse(asOf)) throw new Incompatible("Deployment is after asOf.");
          const evaluation = current ? await evaluateChange(record, baseline, current, 1) : undefined;
          const evaluationData = evaluation?.pages[0]?.response as
            | {
                contextChanged?: boolean;
                observations?: Array<{
                  name: string;
                  status: string;
                  reason?: string;
                  commonRowCount?: number;
                  warnings?: string[];
                }>;
              }
            | undefined;
          const compared = evaluationData?.observations ?? [];
          const reports = [...new Set([...names(baseline), ...(current ? names(current) : [])])].map((name) => {
            const diagnostics = (snapshot: ImportedSnapshot | undefined) => {
              const observation = snapshot?.pages[0].response.observations.find((o) => o.name === name);
              return observation
                ? {
                    status: observation.status,
                    error: observation.error,
                    warnings: observation.warnings,
                    sha256: fingerprint(observation),
                  }
                : null;
            };
            const sources = { baseline: diagnostics(baseline), current: diagnostics(current) };
            try {
              const a = boundReport(baseline, name);
              const timezone = (a.report.semantics as { timezone: string }).timezone;
              if (a.report.end >= localDay(a.observation.finishedAt, timezone))
                throw new Incompatible("Baseline report period was not complete when collected.");
              const deploymentDay = localDay(record.deployedAt, timezone);
              const today = localDay(asOf, timezone);
              if (a.report.end >= deploymentDay)
                throw new Incompatible("Baseline must end before deployment day in this report's timezone.");
              const durationDays = (Date.parse(a.report.end) - Date.parse(a.report.start)) / 86400000 + 1;
              const startDate = addDays(deploymentDay, 1);
              const endDate = addDays(startDate, durationDays - 1);
              const collectOn = addDays(endDate, lagDays);
              const plan = { startDate, endDate, durationDays, collectOn, timezone };
              const details = {
                name,
                sources,
                provider: a.observation.provider,
                target: a.observation.target,
                timezone,
                deploymentDay,
                proposedWindow: plan,
                warnings: [...a.observation.warnings, ...a.report.warnings],
              };
              let comparisonEnd = endDate;
              if (current) {
                let b;
                try {
                  b = boundReport(current, name);
                } catch (error) {
                  return {
                    ...details,
                    status: "blocked",
                    reason: error instanceof Incompatible ? error.message : "Unsupported current report.",
                  };
                }
                comparisonEnd = b.report.end;
                const currentTimezone = (b.report.semantics as { timezone: string }).timezone;
                if (b.report.end >= localDay(b.observation.finishedAt, currentTimezone))
                  return {
                    ...details,
                    status: "blocked",
                    reason: "Current report period was not complete when collected.",
                  };
              }
              const measurementChanges =
                a.observation.provider === "ga"
                  ? record.measurementChanges.filter((change) => {
                      const day = localDay(change.at, timezone);
                      return day >= a.report.start && day <= comparisonEnd;
                    })
                  : [];
              if (measurementChanges.length)
                return {
                  ...details,
                  status: "blocked",
                  reason:
                    "Declared measurement change intersects baseline-to-after interval; later data cannot repair this experiment. Use a stable baseline for a future deployment, or assess technical evidence separately.",
                  measurementChanges,
                };
              if (current) {
                const comparison = compared.find((o) => o.name === name);
                if (!comparison || !["compared", "limited"].includes(comparison.status))
                  return {
                    ...details,
                    status: "blocked",
                    reason: comparison?.reason ?? "Current report unavailable or unsupported.",
                  };
                const actualCollectOn = addDays(comparisonEnd, lagDays);
                if (today < actualCollectOn)
                  return {
                    ...details,
                    status: "waiting",
                    reason: "Supplied after period has not reached the configured collection buffer.",
                    nextCollection: { date: actualCollectOn, timezone },
                  };
                if (!comparison.commonRowCount)
                  return {
                    ...details,
                    status: "blocked",
                    reason: "No common observed rows; missing rows cannot yield a comparison.",
                  };
                return {
                  ...details,
                  status: "ready_to_evaluate",
                  reason: "Saved reports support descriptive evaluation; review limits before interpretation.",
                  evaluationStatus: comparison.status,
                  warnings: [...details.warnings, ...(comparison.warnings ?? [])],
                };
              }
              return {
                ...details,
                status: today < collectOn ? "waiting" : "ready_to_collect",
                reason:
                  "After snapshot missing. Collection date is a planning convention, not evidence of provider finality.",
                nextCollection: { date: collectOn, timezone },
              };
            } catch (error) {
              return {
                name,
                sources,
                status: "blocked",
                reason:
                  error instanceof Incompatible ? error.message : "Unsupported report, dates or reporting timezone.",
              };
            }
          });
          entries.push({
            index,
            label,
            id: record.id,
            site: record.site,
            recordSha256: fingerprint(record),
            baselineSha256: fingerprint(baseline),
            currentSha256: current ? fingerprint(current) : null,
            status: reports.length ? "planned" : "blocked",
            reason: reports.length ? undefined : "No supported configured Google reports.",
            contextChanged: evaluationData?.contextChanged ?? false,
            confounded: record.overlappingChanges.length > 0,
            overlappingChanges: record.overlappingChanges,
            reports,
            summary: Object.fromEntries(
              ["waiting", "ready_to_collect", "ready_to_evaluate", "blocked"].map((status) => [
                status,
                reports.filter((r) => r.status === status).length,
              ]),
            ),
          });
        } catch (error) {
          entries.push({
            index,
            status: "invalid",
            reason:
              error instanceof Incompatible
                ? error.message
                : "Invalid experiment entry or unreadable artifact; provide label, valid change record and configured snapshots.",
          });
        }
      }
      return {
        followupVersion: 1,
        asOf,
        collectionPolicy: {
          lagDays,
          meaning:
            "Calendar days after each provider-local period end; configurable planning buffer, not provider SLA or verified finality.",
        },
        entries,
        limitations: [
          "Read-only plan; no collection, schedule or notification is executed.",
          "Only Google reports are supported. Affected URLs are annotations, not report filters.",
          "Readiness is per report; an experiment can have both actionable reports and blockers.",
          "Future outcome and ranking benefit are unknown. Saved records and hashes are not independently authenticated.",
          "Only declared changes are known. Overlapping changes, weekdays and seasonality confound attribution.",
        ],
      };
    },
  );
  const data = result.pages[0]?.response as
    | { entries: Array<{ status: string; reports?: Array<{ status: string }> }> }
    | undefined;
  if (
    result.status === "ok" &&
    data?.entries.some((e) => e.status !== "planned" || e.reports?.some((r) => r.status !== "ready_to_evaluate"))
  )
    result.status = "partial";
  return result;
}
