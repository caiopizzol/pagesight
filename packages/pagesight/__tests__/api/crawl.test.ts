import { expect, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { crawlSite } from "../../src/web/site-graph.js";

const body = (e: any) => e.pages[0].response.observations[0].pages[0].response;
test("bounded crawl records broken links, separate canonicals/redirects, robots exclusions and honest sitemap reachability", async () => {
  const hits: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req): Response {
      const u = new URL(req.url);
      hits.push(u.pathname + u.search);
      if (u.pathname === "/robots.txt") return new Response("User-agent: Pagesight\nDisallow: /private");
      if (u.pathname === "/sitemap.xml")
        return new Response(`<urlset><url><loc>${server.url}orphan</loc></url></urlset>`);
      if (u.pathname === "/")
        return new Response(
          '<title>Home</title><a href="/missing">Broken</a><a href="/private">Private</a><a href="/redirect">Old</a><a href="/facet?a=1&amp;b=2">Facet</a><a href="https://outside.test/">Outside</a><link rel="canonical" href="/different">',
          { headers: { "Content-Type": "text/html" } },
        );
      if (u.pathname === "/redirect") return new Response(null, { status: 302, headers: { Location: "/final" } });
      if (u.pathname === "/missing") return new Response("gone", { status: 404 });
      return new Response('<title>Page</title><meta name="robots" content="noindex">', {
        headers: { "Content-Type": "text/html" },
      });
    },
  });
  try {
    const result = await execute({
      operation: "crawl",
      config: { site: server.url.href, sitemap: new URL("sitemap.xml", server.url).href },
      maxPages: 10,
      inspectLimit: 0,
    });
    const graph = body(result);
    expect(result.status).toBe("partial");
    expect(hits).not.toContain("/private");
    expect(hits.some((h) => h.startsWith("/facet"))).toBe(false);
    expect(graph.skipped).toContainEqual({ url: new URL("/private", server.url).href, reason: "robots_disallow" });
    expect(graph.edges.find((e: any) => e.kind === "canonical").to).toBe(new URL("/different", server.url).href);
    expect(hits).not.toContain("/different");
    expect(graph.findings.find((f: any) => f.kind === "http_error").evidence.status).toBe(404);
    expect(graph.redirects[0].chain[0].kind).toBe("redirect");
    expect(graph.pages.find((p: any) => p.url.endsWith("/final")).observedDepthFromSeeds).toBe(1);
    expect(graph.pages.find((p: any) => p.url.endsWith("/orphan")).observedDepthFromSeeds).toBeNull();
    expect(graph.findings.find((f: any) => f.kind === "no_incoming_link_observed").nextCheck).toContain(
      "does not prove an orphan",
    );
  } finally {
    await server.stop(true);
  }
});

test("robots unavailable stops crawling; redirect targets get robots checks and loops remain visible", async () => {
  let unavailable = true;
  const hits: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req): Response {
      const u = new URL(req.url);
      hits.push(u.pathname);
      if (u.pathname === "/robots.txt")
        return unavailable ? new Response("later", { status: 503 }) : new Response("User-agent: *\nDisallow: /blocked");
      if (u.pathname === "/") return new Response(null, { status: 301, headers: { Location: "/loop" } });
      if (u.pathname === "/loop") return new Response(null, { status: 302, headers: { Location: "/" } });
      return new Response(null, { status: 302, headers: { Location: "/blocked" } });
    },
  });
  const input = {
    site: server.url.href,
    seeds: [server.url.href],
    maxPages: 5,
    maxDepth: 2,
    maxLinks: 5,
    includeQuery: false,
  };
  try {
    const denied = await crawlSite(input);
    expect(denied.pages).toHaveLength(0);
    expect(denied.complete).toBe(false);
    expect(hits).toEqual(["/robots.txt"]);
    unavailable = false;
    const loop = await crawlSite({ ...input, seeds: [server.url.href, new URL("/redirect", server.url).href] });
    expect(loop.redirects.some((r) => r.termination === "loop")).toBe(true);
    expect(hits).not.toContain("/blocked");
  } finally {
    await server.stop(true);
  }
});

test("HTML base, fragment-only fetch dedup, raw query order and truncation remain explicit", async () => {
  const hits: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req): Response {
      const u = new URL(req.url);
      hits.push(u.pathname + u.search);
      if (u.pathname === "/robots.txt") return new Response("", { status: 404 });
      return new Response(
        '<base href="/nested/"><a href="item?a=1&amp;b=2#one">one</a><a href="item?b=2&amp;a=1">two</a><a href="ignored">three</a>',
        { headers: { "Content-Type": "text/html" } },
      );
    },
  });
  try {
    const graph = await crawlSite({
      site: server.url.href,
      seeds: [server.url.href],
      maxPages: 3,
      maxDepth: 1,
      maxLinks: 2,
      includeQuery: true,
    });
    expect(hits).toContain("/nested/item?a=1&b=2");
    expect(hits).toContain("/nested/item?b=2&a=1");
    expect(graph.edges[0].raw).toBe("item?a=1&amp;b=2#one");
    expect(graph.pages[0].omittedLinks).toBe(1);
    expect(graph.complete).toBe(false);
  } finally {
    await server.stop(true);
  }
});

test("HTTP429 stops further crawling and preserves the remaining queue as unknown", async () => {
  const hits: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req): Response {
      const path = new URL(req.url).pathname;
      hits.push(path);
      return path === "/robots.txt" ? new Response("", { status: 404 }) : new Response("retry later", { status: 429 });
    },
  });
  try {
    const result = await crawlSite({
      site: server.url.href,
      seeds: [new URL("/first", server.url).href, new URL("/second", server.url).href],
      maxPages: 10,
      maxDepth: 2,
      maxLinks: 10,
      includeQuery: false,
    });
    expect(hits).toEqual(["/robots.txt", "/first"]);
    expect(result.complete).toBe(false);
    expect(result.skipped).toContainEqual({ url: new URL("/second", server.url).href, reason: "rate_limited" });
  } finally {
    await server.stop(true);
  }
});

test("a depth-rejected URL can be fetched through a later permitted redirect", async () => {
  const hits: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req): Response {
      const path = new URL(req.url).pathname;
      hits.push(path);
      if (path === "/robots.txt") return new Response("", { status: 404 });
      if (path === "/redirect") return new Response(null, { status: 302, headers: { Location: "/target" } });
      const html =
        path === "/"
          ? '<a href="/long">Long</a><a href="/redirect">Short</a>'
          : path === "/long"
            ? '<a href="/target">Target</a>'
            : "<title>Target</title>";
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    },
  });
  try {
    const result = await crawlSite({
      site: server.url.href,
      seeds: [server.url.href],
      maxPages: 10,
      maxDepth: 1,
      maxLinks: 10,
      includeQuery: false,
    });
    expect(hits.filter((p) => p === "/target")).toHaveLength(1);
    expect(result.pages.find((p) => p.url.endsWith("/target"))?.observedDepthFromSeeds).toBe(1);
    expect(result.skipped.some((p) => p.url.endsWith("/target"))).toBe(false);
  } finally {
    await server.stop(true);
  }
});

test("case-variant HTML content types retain missing metadata findings", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req) =>
      new URL(req.url).pathname === "/robots.txt"
        ? new Response("", { status: 404 })
        : new Response("<title>Page</title>", { headers: { "Content-Type": "TEXT/HTML; charset=utf-8" } }),
  });
  try {
    const result = await crawlSite({
      site: server.url.href,
      seeds: [server.url.href],
      maxPages: 1,
      maxDepth: 0,
      maxLinks: 10,
      includeQuery: false,
    });
    expect(result.pages[0].title).toBe("Page");
    expect(result.findings.some((f) => f.kind === "missing_html_metadata")).toBe(true);
  } finally {
    await server.stop(true);
  }
});
