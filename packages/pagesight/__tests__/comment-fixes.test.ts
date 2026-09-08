import { callTool } from "./support/mcp.js";
import { expect, spyOn, test } from "bun:test";
import { pacificDaysAgo } from "../src/shared/dates.js";
import { capture } from "../src/api/evidence.js";
import { configSchema } from "../src/api/schema.js";
import { snapshot } from "../src/api/snapshot.js";
import { readBounded } from "../src/shared/http.js";
import { fetchRobotsTxt, isAllowed, parseRobotsTxt } from "../src/web/robots.js";
import { formatCategorySummary, registerAiTool } from "../src/tools/ai.js";
import { registerPageTool } from "../src/tools/page.js";

test("robots matching normalizes unreserved escapes without decoding reserved separators or wildcards", () => {
  for (const [rule, path, allowed] of [
    ["/a/b", "/a%2Fb", true],
    ["/a%2Fb", "/a/b", true],
    ["/a%2Fb", "/a%2fb", false],
    ["/foo/bar/%E3%83%84", "/foo/bar/%E3%83%84", false],
    ["/foo/bar/ツ", "/foo/bar/%E3%83%84", false],
    ["/foo/bar/%E3%83%84", "/foo/bar/ツ", false],
    ["/%62ar", "/bar", false],
    ["/bar", "/%62ar", false],
    ["/literal%2A", "/literal-anything", true],
    ["/literal%2A", "/literal%2a", false],
    ["/bad%", "/bad%", false],
    ["/bad\uD800", "/bad\uFFFD", false],
  ] as const) {
    expect(isAllowed(parseRobotsTxt(`User-agent: *\nDisallow: ${rule}`), "Bot", path).allowed).toBe(allowed);
  }
  const rules = parseRobotsTxt("User-agent: *\nDisallow: /%62\nAllow: /bar");
  expect(isAllowed(rules, "Bot", "/bar").allowed).toBe(true);
});

test("robots fetch keeps conservative 429 handling without calling it an RFC requirement", async () => {
  const fixture = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null, { status: 429 }) });
  try {
    const { robotsTxt, statusCode } = await fetchRobotsTxt(fixture.url.href);
    expect(statusCode).toBe(429);
    expect(isAllowed(robotsTxt, "Bot", "/page").allowed).toBe(false);
    expect(robotsTxt.errors[0]).not.toContain("per RFC");
  } finally {
    await fixture.stop(true);
  }
});

test("stream limits stop reading and cancel bodies with missing or false Content-Length", async () => {
  for (const headers of [new Headers(), new Headers({ "content-length": "1" })]) {
    let reads = 0;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(8));
        },
        cancel() {
          canceled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const failure = await readBounded(new Response(body, { headers }), 10).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "size_limit" });
    expect(reads).toBe(2);
    expect(canceled).toBe(true);
  }
  const failure = await readBounded(new Response("é"), 1).catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: "size_limit" });
  expect(await readBounded(new Response("é"), 2)).toBe("é");
});

test("AI tool reports an oversized streamed llms.txt without consuming it all", async () => {
  let reads = 0;
  let canceled = false;
  const mock = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url.endsWith("/llms.txt"))
          return new Response(
            new ReadableStream<Uint8Array>(
              {
                pull(controller) {
                  reads++;
                  controller.enqueue(new Uint8Array(65536));
                },
                cancel() {
                  canceled = true;
                },
              },
              { highWaterMark: 0 },
            ),
          );
        if (url.includes("raw.githubusercontent.com")) return Response.json({});
        return new Response("", { status: 404 });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    const output = await callTool(registerAiTool, "ai", { url: "https://example.com" });
    expect(output).toContain("file too large to preview");
    expect(reads).toBe(17);
    expect(canceled).toBe(true);
  } finally {
    mock.mockRestore();
  }
});

test("category summary formats mixed registry labels and allowed/blocked counts", () => {
  const crawlers = [
    { category: "AI training dataset", allowed: false },
    { category: "Training", allowed: true },
    { category: "Search assistant", allowed: true },
    { category: "Search", allowed: false },
    { category: "Autonomous agent", allowed: true },
    { category: "Unrecognized", allowed: true },
  ].map((crawler) => ({ ...crawler, name: "Bot", company: "Example", respectsRobotsTxt: "yes", description: "" }));
  const output = formatCategorySummary(crawlers).join("\n");
  expect(output).toContain("Training: 1 blocked, 1 allowed (of 2)");
  expect(output).toContain("Search: all 1 BLOCKED");
  expect(output).toContain("Assistant: all 1 allowed");
  expect(output).toContain("Agent: all 1 allowed");
  expect(output).toContain("Other: all 1 allowed");
});

test("Pacific day arithmetic stays on calendar dates across DST and year boundaries", () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      expect(pacificDaysAgo(1, new Date("2026-03-09T07:30:00Z"))).toBe("2026-03-08");
      expect(pacificDaysAgo(1, new Date("2026-11-02T07:30:00Z"))).toBe("2026-10-31");
      expect(pacificDaysAgo(1, new Date("2026-01-01T09:00:00Z"))).toBe("2025-12-31");
      expect(pacificDaysAgo(28, new Date("2026-08-29T19:00:00Z"))).toBe("2026-08-01");
      expect(pacificDaysAgo(3, new Date("2026-08-29T19:00:00Z"))).toBe("2026-08-26");
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

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

test("page checks every nested offer, including later array entries", async () => {
  const data = {
    "@type": "SoftwareApplication",
    name: "Example",
    aggregateRating: { "@type": "AggregateRating", ratingValue: 4, ratingCount: 2 },
    offers: [
      { "@type": "Offer", price: 2, priceCurrency: "USD" },
      { "@type": "Offer", priceCurrency: "USD" },
    ],
  };
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(`<title>Example</title><script type="application/ld+json">${JSON.stringify(data)}</script>`),
  });
  try {
    const output = await callTool(registerPageTool, "page", { url: fixture.url.href, check_links: false });
    expect(output).toContain("SoftwareApplication.offers.price");
    expect(output).not.toContain("CHECKED  SoftwareApplication");
    expect(output).not.toContain("enables sitelinks searchbox");
  } finally {
    await fixture.stop(true);
  }
});

test("page presence checks use current sources without obsolete Google eligibility claims", async () => {
  const blocks = [
    { "@type": "Article" },
    { "@type": "Organization" },
    { "@type": "WebSite", name: "Example", url: "https://example.com" },
    { "@type": "Product", name: "Example", offers: { "@type": "AggregateOffer", lowPrice: 0, priceCurrency: "USD" } },
    {
      "@type": "SoftwareApplication",
      name: "Free app",
      offers: { "@type": "Offer", price: 0 },
      review: { "@type": "Review" },
    },
    {
      "@type": "Dataset",
      name: "Data",
      description: "Example",
      distribution: [{ contentUrl: "https://example.com/data" }],
    },
    { "@type": "VideoObject", name: "Video", thumbnailUrl: [], uploadDate: "2026-09-01" },
    { "@type": "HowTo" },
    { "@type": "FAQPage" },
    { "@type": "TechArticle" },
  ];
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(`<title>Example</title><script type="application/ld+json">${JSON.stringify(blocks)}</script>`),
  });
  try {
    const output = await callTool(registerPageTool, "page", { url: fixture.url.href, check_links: false });
    expect(output).toContain("Selected field-presence checks only");
    expect(output).toContain("OPTIONAL Article.headline");
    expect(output).toContain("OPTIONAL Organization.name");
    expect(output).toContain("Source (WebSite): https://developers.google.com/search/docs/appearance/site-names");
    expect(output).toContain("CHECKED  Product");
    expect(output).toContain("CHECKED  SoftwareApplication");
    expect(output).toContain("CHECKED  Dataset");
    expect(output).toContain("MISSING  VideoObject.thumbnailUrl");
    expect(output).not.toContain("MISSING  Article");
    expect(output).not.toContain("MISSING  Organization");
    expect(output).not.toContain("MISSING  HowTo");
    expect(output).not.toContain("MISSING  FAQPage");
    expect(output).not.toContain("MISSING  TechArticle");
    expect(output).not.toContain("potentialAction");
    expect(output).not.toContain("all required fields present");
    expect(output).not.toContain("enables");
  } finally {
    await fixture.stop(true);
  }
});
