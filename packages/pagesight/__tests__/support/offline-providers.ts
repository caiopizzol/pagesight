// Preloaded into every CLI, HTTP and MCP process in browser-tests/surfaces.test.ts. It freezes the clock
// and answers provider and example.com requests offline, appending each request to PAGESIGHT_FIXTURE_LOG
// before answering. It rejects missing or wrong credentials as the real service would, logs no secret,
// and fails any request it has no route for. Loopback requests are logged, then reach the test's server.
import { appendFileSync } from "node:fs";
import { setSystemTime } from "bun:test";

const env = process.env as Record<string, string>;
setSystemTime(new Date(env.PAGESIGHT_FIXTURE_NOW));
const ga = (await Bun.file(env.PAGESIGHT_GA_CREDENTIALS).json()) as Record<string, string>;
const clients = [
  [env.GSC_CLIENT_ID, env.GSC_CLIENT_SECRET, env.GSC_REFRESH_TOKEN],
  [ga.client_id, ga.client_secret, ga.refresh_token],
];
type Request = { query: URLSearchParams; headers: Headers; body: string };
const json = (value: unknown, status = 200) => Response.json(value, { status });
const html = (title: string, body = "") =>
  new Response(`<title>${title}</title>${body}`, { headers: { "content-type": "text/html" } });
const google = (value: unknown) => (request: Request) =>
  request.headers.get("authorization") === `Bearer ${env.PAGESIGHT_FIXTURE_ACCESS_TOKEN}`
    ? json(value)
    : json({ error: { code: 401, status: "UNAUTHENTICATED" } }, 401);
const report = google({
  metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }],
  rows: [{ metricValues: [{ value: "7" }] }],
  rowCount: 1,
  metadata: { timeZone: "UTC" },
});
const crux = ({ query, body }: Request) => {
  if (query.get("key") !== env.GOOGLE_API_KEY) return json({ error: { code: 400, status: "INVALID_ARGUMENT" } }, 400);
  const request = JSON.parse(body) as { url?: string };
  return request.url?.endsWith("/missing")
    ? json({ error: { code: 404, status: "NOT_FOUND" } }, 404)
    : json({ record: { key: request, metrics: {} } });
};
const routes: Record<string, (request: Request) => Response> = {
  "POST https://oauth2.googleapis.com/token": ({ body }) => {
    const form = new URLSearchParams(body);
    const known = clients.some(
      ([id, secret, refresh]) =>
        form.get("client_id") === id && form.get("client_secret") === secret && form.get("refresh_token") === refresh,
    );
    return form.get("grant_type") === "refresh_token" && known
      ? json({ access_token: env.PAGESIGHT_FIXTURE_ACCESS_TOKEN, expires_in: 3600, token_type: "Bearer" })
      : json({ error: "invalid_grant" }, 400);
  },
  "GET https://www.googleapis.com/webmasters/v3/sites": google({
    siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }],
  }),
  "GET https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/sitemaps": google({
    sitemap: [{ path: "https://example.com/sitemap.xml", isPending: false, isSitemapsIndex: false }],
  }),
  "POST https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query": google({
    rows: [{ keys: ["example"], clicks: 1, impressions: 40, ctr: 0.025, position: 12 }],
    responseAggregationType: "byProperty",
  }),
  "POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect": google({
    inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed" } },
  }),
  "GET https://analyticsadmin.googleapis.com/v1beta/accountSummaries": google({
    accountSummaries: [{ account: "accounts/1", propertySummaries: [{ property: "properties/123" }] }],
  }),
  "GET https://analyticsadmin.googleapis.com/v1beta/properties/123": google({
    name: "properties/123",
    timeZone: "UTC",
  }),
  "GET https://analyticsadmin.googleapis.com/v1beta/properties/123/keyEvents": google({
    keyEvents: [{ eventName: "purchase" }],
  }),
  "POST https://analyticsdata.googleapis.com/v1beta/properties/123:runReport": report,
  "POST https://analyticsdata.googleapis.com/v1beta/properties/123:runRealtimeReport": report,
  "GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed": ({ query }) =>
    [null, env.GOOGLE_API_KEY].includes(query.get("key"))
      ? json({ id: query.get("url"), lighthouseResult: { categories: { performance: { score: 0.9 } } } })
      : json({ error: { code: 400, status: "INVALID_ARGUMENT" } }, 400),
  "POST https://chromeuxreport.googleapis.com/v1/records:queryRecord": crux,
  "POST https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord": crux,
  "POST https://api.cloudflare.com/client/v4/graphql": ({ headers, body }) =>
    headers.get("authorization") === `Bearer ${env.CLOUDFLARE_API_TOKEN}`
      ? json({
          data: {
            viewer: {
              zones: [
                {
                  zoneTag: (JSON.parse(body) as { variables: { zone: string } }).variables.zone,
                  settings: {},
                  httpRequestsAdaptiveGroups: [],
                  firewallEventsAdaptive: [],
                },
              ],
            },
          },
          errors: null,
        })
      : json({ errors: [{ message: "Authentication error" }] }, 401),
  "GET https://example.com/robots.txt": () => new Response("User-agent: *\nAllow: /\n"),
  "GET https://example.com/": () => html("Example", '<a href="/about">About</a>'),
  "GET https://example.com/about": () => html("About"),
};
for (const [method, d] of Object.entries({
  GetCrawlStats: [],
  GetCrawlIssues: [],
  GetUrlInfo: { Url: "https://example.com/about" },
  GetLinkCounts: { Links: [], TotalPages: 1 },
  GetUrlLinks: { Details: [], TotalPages: 1 },
  GetUserSites: [],
  GetQueryStats: [],
  GetPageStats: [],
  GetRankAndTrafficStats: [],
}))
  routes[`GET https://ssl.bing.com/webmaster/api.svc/json/${method}`] = ({ query }) =>
    query.get("apikey") === env.BING_WEBMASTER_API_KEY ? json({ d }) : json({ ErrorCode: 3 }, 401);

const passthrough = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
    const form = url.origin === "https://oauth2.googleapis.com" ? new URLSearchParams(body) : undefined;
    const entry = {
      method,
      origin: url.origin,
      path: url.pathname,
      query: [...url.searchParams].map(([name, value]) => [
        name,
        ["key", "apikey"].includes(name) ? "[redacted]" : value,
      ]),
      ...(form
        ? { body: { grant_type: form.get("grant_type"), client_id: form.get("client_id") } }
        : body
          ? { body: JSON.parse(body) as unknown }
          : {}),
    };
    appendFileSync(env.PAGESIGHT_FIXTURE_LOG, `${JSON.stringify(entry)}\n`);
    if (url.hostname === "127.0.0.1") return passthrough(...args);
    const route = routes[`${method} ${url.origin}${url.pathname}`];
    if (!route) throw new TypeError("Offline fixture has no route for this request");
    return route({ query: url.searchParams, headers: new Headers(init?.headers), body });
  },
  { preconnect: passthrough.preconnect },
);
