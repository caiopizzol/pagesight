export {};
const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (...args: Parameters<typeof fetch>) => {
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "fixture-access" });
    if (url === "https://analyticsdata.googleapis.com/v1beta/properties/123:runRealtimeReport") {
      const body = args[1]?.body;
      if (typeof body !== "string") throw new Error("Expected JSON request body");
      const request = JSON.parse(body);
      return Response.json({
        dimensionHeaders: [{ name: "eventName" }],
        metricHeaders: [{ name: "eventCount", type: "TYPE_INTEGER" }],
        rows: [{ dimensionValues: [{ value: "page_view" }], metricValues: [{ value: "2" }] }],
        rowCount: 1,
        fixtureRequest: request,
      });
    }
    if (url.includes("googleapis.com")) throw new Error("Unexpected Google request in offline fixture");
    return originalFetch(...args);
  },
  { preconnect: originalFetch.preconnect },
);
