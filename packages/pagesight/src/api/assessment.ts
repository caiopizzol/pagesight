import { z } from "zod";
import { capture, type Evidence } from "./evidence.js";
import type { ImportedSnapshot } from "./evidence-schema.js";
import { configSchema, gaRequestSchema, gscRequestSchema } from "./schema.js";
import { snapshotOperations, observationName } from "./snapshot.js";
import { canonical, normalizeReport, parseNumericValue } from "./report-table.js";
import { normalizeGaProperty } from "../providers/ga.js";

interface Finding {
  code: string;
  level: "attention" | "info" | "unknown";
  message: string;
  sources: string[];
  nextCheck: string;
}
interface Table {
  observation: string;
  scope: "search-property" | "production" | "production-organic" | "all-hostnames";
  dimensions: string[];
  metrics: string[];
  rows: Array<{ keys: string[]; values: Array<string | number> }>;
  observedRows: number;
  displayedRows: number;
  complete: boolean;
  limitations: string[];
}

function reportScope(provider: string, request: unknown) {
  if (provider === "ga") {
    const { offset: _offset, limit: _limit, returnPropertyQuota: _quota, ...scope } = gaRequestSchema.parse(request);
    return scope;
  }
  const { startRow: _offset, rowLimit: _limit, ...scope } = gscRequestSchema.parse(request);
  return scope;
}

export async function assessSnapshot(snapshot: ImportedSnapshot, maxRows: number): Promise<Evidence> {
  const { context, observations } = snapshot.pages[0].response;
  const config = configSchema.parse(context.config);
  const { startDate, endDate } = context.requestedDates;
  const hash = Bun.CryptoHasher.hash("sha256", canonical(snapshot), "hex");
  const result = await capture("pagesight", "assess", snapshot.target, { snapshotSha256: hash, maxRows }, async () => {
    const findings: Finding[] = [];
    const tables: Table[] = [];
    let configuredKeyEvents: Array<{ eventName: string; countingMethod?: string }> = [];
    const keyEventSource = observations.find((o) => o.name === "ga.key-events");
    const add = (code: string, level: Finding["level"], message: string, sources: string[], nextCheck: string) =>
      findings.push({ code, level, message, sources, nextCheck });
    if (config.gaProperty) {
      if (!config.context.successEvents.length)
        add(
          "no-success-events",
          "attention",
          "No success events are designated in the site configuration. Reported key events are not validated product outcomes.",
          ["context.config.context.successEvents"],
          "Define the useful visitor action, then verify its tracking before evaluating SEO outcomes.",
        );
      else
        add(
          "success-events-unverified",
          "info",
          `Site configuration designates ${config.context.successEvents.length} success event(s); showing ${Math.min(config.context.successEvents.length, maxRows)}: ${config.context.successEvents.slice(0, maxRows).join(", ")} as success events; Pagesight has not independently validated them.`,
          ["context.config.context.successEvents"],
          "Verify each event against a real user action and provider reports.",
        );
    }
    if (config.gaProperty) {
      if (!keyEventSource || keyEventSource.status === "error" || !keyEventSource.pages.length)
        add(
          "key-event-metadata-unavailable",
          "unknown",
          "Configured GA key-event metadata is unavailable.",
          ["ga.key-events"],
          "Read GA key-event metadata separately from observed event counts.",
        );
      else {
        try {
          if (
            keyEventSource.provider !== "ga" ||
            keyEventSource.operation !== "key-events" ||
            keyEventSource.target !== normalizeGaProperty(config.gaProperty)
          )
            throw new Error();
          const metadata = z.object({
            keyEvents: z
              .array(z.object({ eventName: z.string().min(1), countingMethod: z.string().optional() }))
              .default([]),
            nextPageToken: z.string().optional(),
          });
          const pages = keyEventSource.pages.map((p) => metadata.parse(p.response));
          configuredKeyEvents = pages.flatMap((p) => p.keyEvents);
          if (pages.some((p) => p.nextPageToken) || keyEventSource.status !== "ok" || keyEventSource.error)
            add(
              "key-event-metadata-partial",
              "unknown",
              "Only part of the configured key-event list is available.",
              ["ga.key-events"],
              "Retrieve the remaining metadata before claiming this is the complete configuration.",
            );
          add(
            "configured-key-events",
            "info",
            `GA configuration contains ${configuredKeyEvents.length} observed key-event entries; showing ${Math.min(configuredKeyEvents.length, maxRows)}: ${
              configuredKeyEvents
                .slice(0, maxRows)
                .map((e) => `${e.eventName}${e.countingMethod ? ` (${e.countingMethod})` : ""}`)
                .join(", ") || "no observed key-event entries"
            }. Configuration does not prove events occurred or outcomes are valid.`,
            ["ga.key-events"],
            "Compare configured events with observed report rows and separately validate their business meaning.",
          );
        } catch {
          add(
            "key-event-metadata-unusable",
            "unknown",
            "Key-event metadata does not match the configured property or supported shape.",
            ["ga.key-events"],
            "Recollect key-event metadata for the configured property.",
          );
        }
      }
    }
    for (const operation of snapshotOperations(config, startDate, endDate, 1)) {
      if (operation.operation !== "ga.report" && operation.operation !== "gsc.report") continue;
      if (
        operation.operation === "gsc.report" &&
        operation.request.dimensions?.some((d) => ["date", "hour"].includes(d))
      )
        continue;
      const name = observationName(operation);
      const observation = observations.find((o) => o.name === name);
      if (!observation || observation.status === "error" || !observation.pages.length) {
        add(
          "report-unavailable",
          "unknown",
          `${name}: no usable report is available.`,
          [name],
          "Collect or retry this report; absence is not zero activity.",
        );
        continue;
      }
      try {
        const provider = operation.operation === "ga.report" ? "ga" : "gsc";
        const target = operation.operation === "ga.report" ? normalizeGaProperty(operation.property) : operation.site;
        if (observation.provider !== provider || observation.operation !== "report" || observation.target !== target)
          throw new Error("Provider or property does not match the site configuration.");
        for (const page of observation.pages)
          if (canonical(reportScope(provider, page.request)) !== canonical(reportScope(provider, operation.request)))
            throw new Error("Report filters, dates or dimensions do not match the configured snapshot report.");
        const normalized = normalizeReport(observation, context);
        if (
          provider === "gsc" &&
          normalized.dimensions.length === 0 &&
          observation.pages.some(
            (p) => (p.response as { responseAggregationType?: string }).responseAggregationType !== "byProperty",
          )
        )
          throw new Error("GSC property totals require byProperty response aggregation.");
        const allRows = [...normalized.rows.values()];
        const limitations = [...new Set([...observation.warnings, ...normalized.warnings])];
        const complete =
          observation.status === "ok" && !observation.error && observation.pagination?.exhausted === true;
        const sorted = [...allRows].sort((a, b) => {
          const av = parseNumericValue(a.values[0]);
          const bv = parseNumericValue(b.values[0]);
          return (bv ?? -Infinity) - (av ?? -Infinity) || canonical(a.keys).localeCompare(canonical(b.keys));
        });
        const scope =
          provider === "gsc"
            ? "search-property"
            : normalized.dimensions[0] === "hostName"
              ? "all-hostnames"
              : name.endsWith(".organic")
                ? "production-organic"
                : "production";
        tables.push({
          observation: name,
          scope,
          dimensions: normalized.dimensions,
          metrics: normalized.metrics,
          rows: sorted.slice(0, maxRows),
          observedRows: allRows.length,
          displayedRows: Math.min(allRows.length, maxRows),
          complete,
          limitations,
        });
        if (normalized.dimensions[0] === "hostName") {
          const other = allRows.filter(
            (row) =>
              row.keys[0] !== config.productionHostname && row.values.some((v) => (parseNumericValue(v) ?? 0) > 0),
          );
          if (other.length)
            add(
              "other-hostnames",
              "info",
              `The hostname census contains activity on ${other.length} other observed hostname(s): ${other
                .slice(0, maxRows)
                .map((r) => r.keys[0])
                .join(
                  ", ",
                )}. This does not invalidate correctly production-filtered reports or identify internal visitors on production.`,
              [name],
              "Keep production reports filtered to the intended hostname; separately evaluate internal-traffic handling.",
            );
        }
        if (name === "ga.report.eventName") {
          const keyIndex = normalized.metrics.indexOf("keyEvents");
          const eventRows = allRows.filter((r) => (parseNumericValue(r.values[keyIndex]) ?? 0) > 0);
          if (eventRows.length > maxRows)
            add(
              "event-findings-capped",
              "info",
              `Showing ${maxRows} of ${eventRows.length} observed event rows with positive key-event counts.`,
              [name],
              "Increase maxRows or inspect the original report for other event names.",
            );
          for (const row of eventRows.slice(0, maxRows)) {
            const event = row.keys[0];
            const excluded = config.context.excludedKeyEvents.includes(event);
            add(
              excluded ? "excluded-key-event" : "reported-key-event",
              excluded ? "attention" : "info",
              `${event}: ${row.values[keyIndex]} reported key events${excluded ? "; excluded from success metrics by site configuration" : "; business meaning is not validated by its name or count"}.`,
              [name],
              "Inspect the event definition and verify the real user action; do not infer its generation rule from the name.",
            );
          }
          for (const configured of configuredKeyEvents.slice(0, maxRows))
            if (!allRows.some((r) => r.keys[0] === configured.eventName))
              add(
                "configured-event-not-observed",
                "info",
                `GA-configured key event ${configured.eventName} has no observed event row in this period and scope. This does not establish zero activity or broken tracking.`,
                ["ga.key-events", name],
                "Check date, hostname and report coverage before investigating the event's instrumentation.",
              );
          for (const event of config.context.successEvents.slice(0, maxRows))
            if (!allRows.some((r) => r.keys[0] === event))
              add(
                "success-event-not-observed",
                "unknown",
                `Configured success event ${event} has no observed row in this report; that is not proof of zero events or broken tracking.`,
                [name, "context.config.context.successEvents"],
                "Check report coverage, dates, filters and a real user flow.",
              );
        }
      } catch (error) {
        add(
          "report-unusable",
          "unknown",
          `${name}: ${error instanceof Error && error.name !== "ZodError" ? error.message : "Request or response does not match the supported report shape."}`,
          [name],
          "Inspect the original report and recollect a compatible snapshot before drawing conclusions.",
        );
      }
    }
    for (const observation of observations.filter((o) => o.status !== "ok" || o.error))
      add(
        "provider-incomplete",
        "unknown",
        `${observation.name}: ${observation.status}${observation.error ? ` (${observation.error.code})` : ""}.`,
        [observation.name],
        "Inspect the retained provider error or pagination before relying on missing data.",
      );
    return {
      assessmentVersion: 1,
      site: config.site,
      requestedDates: context.requestedDates,
      collectedAt: snapshot.finishedAt,
      basis: "saved-snapshot-not-reverified",
      snapshotSha256: hash,
      providerSelection: {
        gsc: Boolean(config.gscSite),
        ga: Boolean(config.gaProperty),
        bing: Boolean(config.bingSite),
      },
      findings,
      tables,
      displayLimit: maxRows,
      observations: observations.map((o) => ({
        name: o.name,
        provider: o.provider,
        status: o.status,
        warnings: o.warnings,
        errorCode: o.error?.code ?? null,
      })),
      limitations: [
        ...new Set([
          ...snapshot.warnings,
          "This assessment describes supplied snapshot evidence; it makes no new provider requests and does not authenticate imported claims. The hash identifies normalized snapshot JSON, not file bytes.",
          "Configured success events are caller-designated, not independently validated. Aggregate reports cannot diagnose duplicate tags, prove a particular browser test arrived, or establish SEO causation.",
          "Tables retain raw values for observed rows; capped lists are not exhaustive rankings. GSC property, page and query counts and GA sessions have different semantics and must not be reconciled as a funnel.",
        ]),
      ],
    };
  });
  const assessment = result.pages[0]?.response as { findings: Finding[]; tables: Table[] } | undefined;
  if (
    result.status !== "error" &&
    (snapshot.status !== "ok" ||
      snapshot.error ||
      assessment?.findings.some((f) => f.level === "unknown") ||
      assessment?.tables.some((t) => !t.complete))
  )
    result.status = "partial";
  return result;
}
