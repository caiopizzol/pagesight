import { formatJsonLd } from "../../src/tools/page/structured-data.js";
import { callTool } from "../support/mcp.js";
import { expect, test } from "bun:test";
import { registerPageTool } from "../../src/tools/page/tool.js";

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

test("page contrast retains normal and large-text thresholds", async () => {
  const normal = await callTool(registerPageTool, "page", { foreground: "#000", background: "#fff" });
  expect(normal).toContain("21.00:1");
  expect(normal).toContain("WCAG AA (4.5:1): PASS");
  const large = await callTool(registerPageTool, "page", { foreground: "#000", background: "#fff", large_text: true });
  expect(large).toContain("WCAG AA (3:1): PASS");
  expect(await callTool(registerPageTool, "page", { foreground: "wrong", background: "#fff" })).toContain(
    "Invalid foreground",
  );
});

test("page reports broken internal links in single and batch modes", async () => {
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      return new URL(request.url).pathname === "/missing"
        ? new Response("Missing", { status: 404 })
        : new Response('<title>Fixture</title><a href="/missing">Broken</a>');
    },
  });
  try {
    const single = await callTool(registerPageTool, "page", { url: fixture.url.href });
    expect(single).toContain("404");
    const batch = await callTool(registerPageTool, "page", {
      urls: [fixture.url.href, new URL("/other", fixture.url).href],
    });
    expect(batch).toContain("Batch Page Analysis (2 URLs)");
    expect(batch).toContain("1 broken");
  } finally {
    await fixture.stop(true);
  }
});

test("JSON-LD type display preserves malformed values instead of object coercion", () => {
  expect(formatJsonLd({ "@type": ["Article", "Thing"] })).toEqual(["@type: Article, Thing"]);
  expect(formatJsonLd({ "@type": { unexpected: true } })).toEqual(['@type: {"unexpected":true}']);
});

test("batch JSON-LD labels preserve malformed objects and valid array formatting", async () => {
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const value = new URL(request.url).pathname === "/object" ? { unexpected: true } : ["Article", "Thing"];
      return new Response(
        `<title>Fixture</title><script type="application/ld+json">${JSON.stringify({ "@type": value })}</script>`,
      );
    },
  });
  try {
    const output = await callTool(registerPageTool, "page", {
      urls: [new URL("/object", fixture.url).href, new URL("/array", fixture.url).href],
      check_links: false,
    });
    expect(output).toContain("unexpected");
    expect(output).not.toContain("[object Object]");
    expect(output).toContain("Article,Thing");
  } finally {
    await fixture.stop(true);
  }
});
