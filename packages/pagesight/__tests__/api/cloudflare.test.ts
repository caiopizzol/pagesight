import { expect, test } from "bun:test";
import { cloudflareAudit, cloudflareRequests } from "../../src/api/cloudflare.js";
import { operationSchema } from "../../src/api/schema.js";
const input = {
  zone: "a".repeat(32),
  hostname: "example.com",
  startTime: "2026-08-01T00:00:00Z",
  endTime: "2026-08-02T00:00:00Z",
  limit: 2,
};

test("Cloudflare queries bind zone/hostname and half-open UTC dates without raw IP or query-string fields", () => {
  const requests = cloudflareRequests(input);
  expect(requests).toHaveLength(3);
  for (const item of requests) {
    expect(item.request.variables.zone).toBe(input.zone);
    expect(item.request.query).not.toMatch(/\b(clientIP|clientRequestQuery|cookie)\b/);
  }
  for (const item of requests.slice(1))
    expect(item.request.variables.filter).toEqual({
      datetime_geq: input.startTime,
      datetime_lt: input.endTime,
      clientRequestHTTPHost: input.hostname,
    });
  expect(operationSchema.safeParse({ operation: "cloudflare.audit", ...input }).success).toBe(true);
  expect(
    operationSchema.safeParse({ operation: "cloudflare.audit", ...input, endTime: "2026-08-03T00:00:00Z" }).success,
  ).toBe(false);
  expect(operationSchema.safeParse({ operation: "cloudflare.audit", ...input, startTime: input.endTime }).success).toBe(
    false,
  );
});

test("HTTP200 GraphQL failures stay errors and do not erase successful independent datasets", async () => {
  const result = await cloudflareAudit(input, async (request) => {
    if (request.query.includes("query Settings"))
      return {
        data: {
          viewer: {
            zones: [
              { zoneTag: input.zone, settings: { httpRequestsAdaptiveGroups: { enabled: true, notOlderThan: 86400 } } },
            ],
          },
        },
        errors: null,
      };
    if (request.query.includes("query Http"))
      return {
        data: { viewer: { zones: [{ zoneTag: input.zone, httpRequestsAdaptiveGroups: null }] } },
        errors: [{ message: "Permission denied", path: ["viewer", "zones", 0, "httpRequestsAdaptiveGroups"] }],
      };
    return {
      data: {
        viewer: {
          zones: [
            {
              zoneTag: input.zone,
              firewallEventsAdaptive: [
                { action: "block", clientRequestHTTPHost: input.hostname, userAgent: "Googlebot", sampleInterval: 10 },
              ],
            },
          ],
        },
      },
      errors: null,
    };
  });
  expect(result.status).toBe("partial");
  const observations = (result.pages[0].response as any).observations;
  expect(observations.map((o: any) => o.status)).toEqual(["ok", "error", "ok"]);
  expect(observations[1].pages[0].response.errors[0].message).toBe("Permission denied");
  expect(JSON.stringify(result)).toContain("User-Agent can be spoofed");
  expect(JSON.stringify(result)).toContain("do not multiply");
});

test("partial data and empty/incorrect zone scope are not silently successful", async () => {
  for (const zones of [
    [],
    [{ zoneTag: "b".repeat(32), settings: {}, httpRequestsAdaptiveGroups: [], firewallEventsAdaptive: [] }],
  ]) {
    const result = await cloudflareAudit(input, async () => ({ data: { viewer: { zones } }, errors: null }));
    expect(result.status).toBe("error");
  }
  const partial = await cloudflareAudit(input, async () => ({
    data: {
      viewer: {
        zones: [{ zoneTag: input.zone, settings: {}, httpRequestsAdaptiveGroups: [], firewallEventsAdaptive: [] }],
      },
    },
    errors: [{ message: "incomplete" }],
  }));
  expect(partial.status).toBe("partial");
  expect((partial.pages[0].response as any).observations.every((o: any) => o.status === "partial")).toBe(true);
});

test("retention, top-N truncation and response hostname mismatches are explicit unknowns", async () => {
  const result = await cloudflareAudit(input, async () => ({
    data: {
      viewer: {
        zones: [
          {
            zoneTag: input.zone,
            settings: {
              httpRequestsAdaptiveGroups: {
                enabled: true,
                maxDuration: 86400,
                notOlderThan: 60,
                availableFields: ["count"],
              },
              firewallEventsAdaptive: { enabled: false, maxDuration: 86400, notOlderThan: 60, availableFields: [] },
            },
            httpRequestsAdaptiveGroups: [
              { dimensions: { clientRequestHTTPHost: "other.test" } },
              { dimensions: { clientRequestHTTPHost: input.hostname } },
            ],
            firewallEventsAdaptive: [],
          },
        ],
      },
    },
    errors: null,
  }));
  const data = result.pages[0].response as any;
  expect(result.status).toBe("partial");
  expect(data.diagnostics.find((d: any) => d.dataset === "httpRequestsAdaptiveGroups")).toMatchObject({
    observedRows: 2,
    possiblyTruncated: true,
    unusableRows: 1,
  });
  expect(data.unknowns.join()).toContain("retention");
  expect(data.unknowns.join()).toContain("disabled");
  expect(data.scope.querySignature).toHaveLength(64);
});
