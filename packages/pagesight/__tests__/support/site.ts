export function createSiteFixture() {
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req): Response {
      const url = new URL(req.url);
      if (url.pathname === "/sitemap.xml")
        return new Response(
          `<urlset><url><loc>${fixture.url}?a=1&amp;b=2</loc><lastmod>2099-01-01</lastmod></url></urlset>`,
        );
      if (url.pathname === "/bad") return new Response("private token=not-for-output", { status: 403 });
      if (url.pathname === "/bad-canonical")
        return new Response('<title>Still observable</title><link rel="canonical" href="http://[broken">');
      if (url.pathname === "/entities.xml")
        return new Response(`<urlset><url><loc>${fixture.url}?literal=&amp;lt;</loc></url></urlset>`);
      if (url.pathname === "/prefixed.xml")
        return new Response(
          `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:url><sm:loc>${fixture.url}</sm:loc></sm:url></sm:urlset>`,
        );
      return new Response(
        '<html><head><title>Example</title><link href="/canonical" rel="canonical"><meta content="noindex,follow" name="robots"><script type="application/ld+json">{"@type":"Vehicle"}</script></head></html>',
        { headers: { "Content-Type": "text/html" } },
      );
    },
  });
  return fixture;
}
