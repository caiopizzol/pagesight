import { snapshot, snapshotOperations } from "../../src/api/snapshot.js";
import { configSchema } from "../../src/api/schema.js";
import { capture } from "../../src/api/evidence.js";

const config = configSchema.parse({
  site: "https://example.com/",
  gaProperty: "123",
  pages: [],
  context: { excludedKeyEvents: ["explorer_visit"] },
});
export async function fixture() {
  return snapshot({ config, startDate: "2026-08-01", endDate: "2026-08-28", maxPages: 1 }, async (input) => {
    const op = input as ReturnType<typeof snapshotOperations>[number];
    if (op.operation !== "ga.report")
      return capture(
        "ga",
        op.operation === "ga.property" ? "property" : "key-events",
        "properties/123",
        {},
        async () => ({ keyEvents: [{ eventName: "purchase" }, { eventName: "explorer_visit" }] }),
      );
    const dims = op.request.dimensions!.map((d) => d.name);
    const metrics = op.request.metrics.map((d) => d.name);
    const keys =
      dims[0] === "hostName"
        ? [["example.com"], ["localhost"]]
        : dims[0] === "eventName"
          ? [["page_view"], ["explorer_visit"]]
          : dims.map(() => "Organic Search").length
            ? [dims.map(() => "Organic Search")]
            : [[]];
    const response = {
      dimensionHeaders: dims.map((name) => ({ name })),
      metricHeaders: metrics.map((name) => ({ name, type: "TYPE_INTEGER" })),
      rows: keys.map((key, i) => ({
        dimensionValues: key.map((value) => ({ value })),
        metricValues: metrics.map((name) => ({ value: name === "keyEvents" ? (i ? "42" : "0") : "100" })),
      })),
      rowCount: keys.length,
      metadata: { timeZone: "UTC" },
    };
    const result = await capture("ga", "report", "properties/123", op.request, async () => response);
    result.pagination = { exhausted: true, nextOffset: null, rowsReturned: keys.length };
    return result;
  });
}
