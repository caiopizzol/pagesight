import { z } from "zod";
import { cloudflareGraphql, type CloudflareQuery } from "../providers/cloudflare.js";
import { aggregate, capture, type Evidence } from "./evidence.js";

const responseSchema = z
  .object({
    data: z
      .object({ viewer: z.object({ zones: z.array(z.object({ zoneTag: z.string() }).passthrough()) }).nullable() })
      .nullable()
      .optional(),
    errors: z.array(z.unknown()).nullable().optional(),
  })
  .passthrough();
type Input = { zone: string; hostname: string; startTime: string; endTime: string; limit: number };
// AIDEV-NOTE: Fixed selections exclude IPs, query strings and credentials. New fields change the privacy contract.
export function cloudflareRequests(input: Input): Array<{ name: string; dataset: string; request: CloudflareQuery }> {
  const zoneVar = { zone: input.zone };
  const filters = {
    datetime_geq: input.startTime,
    datetime_lt: input.endTime,
    clientRequestHTTPHost: input.hostname.toLowerCase(),
  };
  return [
    {
      name: "settings",
      dataset: "settings",
      request: {
        query: `query Settings($zone: string) { viewer { zones(filter: {zoneTag: $zone}) { zoneTag settings { httpRequestsAdaptiveGroups { enabled maxDuration maxPageSize notOlderThan availableFields } firewallEventsAdaptive { enabled maxDuration maxPageSize notOlderThan availableFields } } } } }`,
        variables: zoneVar,
      },
    },
    {
      name: "http",
      dataset: "httpRequestsAdaptiveGroups",
      request: {
        query: `query Http($zone: string, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject, $limit: uint64) { viewer { zones(filter: {zoneTag: $zone}) { zoneTag httpRequestsAdaptiveGroups(filter: $filter, limit: $limit, orderBy: [count_DESC]) { count avg { sampleInterval } dimensions { clientRequestHTTPHost clientRequestPath edgeResponseStatus originResponseStatus cacheStatus userAgent verifiedBotCategory } } } } }`,
        variables: { ...zoneVar, filter: filters, limit: input.limit },
      },
    },
    {
      name: "security",
      dataset: "firewallEventsAdaptive",
      request: {
        query: `query Security($zone: string, $filter: FirewallEventsAdaptiveFilter_InputObject, $limit: uint64) { viewer { zones(filter: {zoneTag: $zone}) { zoneTag firewallEventsAdaptive(filter: $filter, limit: $limit, orderBy: [datetime_DESC]) { datetime action source clientRequestHTTPHost clientRequestPath edgeResponseStatus userAgent verifiedBotCategory sampleInterval } } } }`,
        variables: { ...zoneVar, filter: filters, limit: input.limit },
      },
    },
  ];
}

export async function cloudflareAudit(input: Input, query = cloudflareGraphql): Promise<Evidence> {
  const observations: Evidence[] = [];
  for (const planned of cloudflareRequests(input)) {
    const observation = await capture("cloudflare", planned.name, input.zone, planned.request, () =>
      query(planned.request),
    );
    observation.name = `cloudflare.${planned.name}`;
    const raw = observation.pages[0]?.response;
    if (raw !== undefined) {
      const parsed = responseSchema.safeParse(raw);
      const zones = parsed.success ? parsed.data.data?.viewer?.zones : undefined;
      const zone = zones?.length === 1 && zones[0].zoneTag === input.zone ? zones[0] : undefined;
      const usable = Boolean(zone && Object.hasOwn(zone, planned.dataset) && zone[planned.dataset] !== null);
      if (!parsed.success || !usable || parsed.data.errors?.length) {
        observation.status = usable ? "partial" : "error";
        observation.error = {
          code: parsed.success ? "graphql_error" : "invalid_response",
          message: "Cloudflare returned unavailable or incomplete dataset evidence; inspect retained GraphQL response",
          httpStatus: 200,
        };
      }
    }
    observation.credential = { source: "CLOUDFLARE_API_TOKEN", type: "api_token", clientEmail: null };
    observation.warnings.push(
      "Adaptive datasets can contain estimated/sampled values. Retain sampleInterval; do not multiply already estimated counts again.",
      "Dataset availability, retained history and maximum query duration depend on zone settings. Missing or denied data is unknown, not zero.",
    );
    if (planned.name !== "settings")
      observation.warnings.push(
        `At most ${input.limit} ${planned.name === "http" ? "groups ordered by count descending" : "security events ordered newest first"} are retained; this is not exhaustive traffic or crawler coverage.`,
      );
    observations.push(observation);
  }
  const diagnostics: Array<{
    dataset: string;
    observedRows: number | null;
    possiblyTruncated: boolean;
    effectiveRowLimit: number;
    unusableRows: number;
    collectedAt: string;
    errorPaths: unknown[];
  }> = [];
  const unknowns: string[] = [];
  const settingsSchema = z.object({
    enabled: z.boolean(),
    maxDuration: z.number().nonnegative(),
    maxPageSize: z.number().int().positive().optional(),
    notOlderThan: z.number().nonnegative(),
    availableFields: z.array(z.string()),
  });
  const settingsObservation = observations[0];
  const settingsRaw = responseSchema.safeParse(settingsObservation.pages[0]?.response);
  const settingsZone = settingsRaw.success
    ? settingsRaw.data.data?.viewer?.zones?.find((z) => z.zoneTag === input.zone)
    : undefined;
  const settings = settingsZone?.settings as Record<string, unknown> | undefined;
  for (let index = 1; index < observations.length; index++) {
    const observation = observations[index];
    const dataset = index === 1 ? "httpRequestsAdaptiveGroups" : "firewallEventsAdaptive";
    const parsed = responseSchema.safeParse(observation.pages[0]?.response);
    const zone = parsed.success ? parsed.data.data?.viewer?.zones?.find((z) => z.zoneTag === input.zone) : undefined;
    const rows = Array.isArray(zone?.[dataset]) ? (zone[dataset] as unknown[]) : null;
    const unusableRows =
      rows?.filter((row) => {
        if (!row || typeof row !== "object") return true;
        const value = row as Record<string, unknown>;
        const dimensions = value.dimensions as Record<string, unknown> | undefined;
        const hostname = index === 1 ? dimensions?.clientRequestHTTPHost : value.clientRequestHTTPHost;
        return typeof hostname !== "string" || hostname.toLowerCase() !== input.hostname.toLowerCase();
      }).length ?? 0;
    const declared = settingsObservation.status === "ok" ? settingsSchema.safeParse(settings?.[dataset]) : null;
    if (!declared?.success)
      unknowns.push(`${dataset}: settings unavailable or incomplete; retention/availability are unknown.`);
    else {
      if (!declared.data.enabled) unknowns.push(`${dataset}: dataset is currently disabled for this zone.`);
      if (Date.parse(input.startTime) < Date.parse(settingsObservation.finishedAt) - declared.data.notOlderThan * 1000)
        unknowns.push(`${dataset}: requested start is outside the currently declared retention window.`);
      if (Date.parse(input.endTime) - Date.parse(input.startTime) > declared.data.maxDuration * 1000)
        unknowns.push(`${dataset}: interval exceeds currently declared maximum duration.`);
    }
    const providerRowLimit = declared?.success ? declared.data.maxPageSize : undefined;
    const effectiveRowLimit = Math.min(input.limit, providerRowLimit ?? input.limit);
    if (providerRowLimit === undefined)
      unknowns.push(`${dataset}: provider maximum page size unavailable; provider truncation is unknown.`);
    if (rows && rows.length >= effectiveRowLimit)
      unknowns.push(`${dataset}: retained row limit reached; additional rows may exist.`);
    if (rows?.length === 0)
      unknowns.push(`${dataset}: empty retained set, not proof of zero traffic or security actions.`);
    if (unusableRows) {
      unknowns.push(
        `${dataset}: ${unusableRows} rows do not match the requested hostname/shape; raw data retained without association.`,
      );
      if (observation.status === "ok") observation.status = "partial";
    }
    if (!rows && observation.status === "ok") {
      observation.status = "error";
      observation.error = {
        code: "invalid_response",
        message: "Cloudflare dataset is not a row array",
        httpStatus: 200,
      };
    }
    const issues = unknowns.filter((u) => u.startsWith(`${dataset}:`));
    observation.warnings.push(...issues);
    diagnostics.push({
      dataset,
      observedRows: rows?.length ?? null,
      possiblyTruncated: Boolean(rows && rows.length >= effectiveRowLimit),
      effectiveRowLimit,
      unusableRows,
      collectedAt: observation.finishedAt,
      errorPaths: parsed.success
        ? (parsed.data.errors ?? [])
            .slice(0, 3)
            .map((e) => (e && typeof e === "object" ? ("path" in e ? e.path : null) : null))
        : [],
    });
  }
  const result = aggregate("cloudflare.audit", input.zone, input, observations);
  Object.assign(result.pages[0].response as object, {
    scope: {
      zone: input.zone,
      hostname: input.hostname,
      startInclusive: input.startTime,
      endExclusive: input.endTime,
      timezone: "UTC",
      limit: input.limit,
      ordering: { http: "count_DESC", security: "datetime_DESC" },
      querySignature: Bun.CryptoHasher.hash(
        "sha256",
        JSON.stringify(cloudflareRequests(input).map((p) => p.request.query)),
        "hex",
      ),
      settingsCollectedAt: settingsObservation.finishedAt,
      settingsMeaning: "Current zone settings, not proof of settings during the historical reporting window",
    },
    diagnostics,
    unknowns,
    limitations: [
      "No path joins to GSC/GA: Cloudflare paths omit query strings. Cloudflare is not supported by Pagesight report comparisons or conversion funnels.",
      "HTTP traffic is not verified search-engine crawling. User-Agent can be spoofed; verifiedBotCategory is Cloudflare's classification, not proof of Google indexing or a particular crawler identity.",
      "Security events describe observed actions, not all requests or all challenges. Do not reconcile sampled event counts with HTTP groups as a funnel.",
      "Edge status and origin status differ; cached/edge-handled requests may have no origin response. Status zero does not mean successful origin access.",
      "No client IP, request query string, cookies or authentication headers are requested. Paths and user agents may still be sensitive: keep reports private.",
      "Only read-only GraphQL analytics queries execute; no Cloudflare security, cache, DNS or crawler settings are modified.",
    ],
  });
  result.credential = { source: "CLOUDFLARE_API_TOKEN", type: "api_token", clientEmail: null };
  if (result.status === "ok" && unknowns.length) result.status = "partial";
  return result;
}
