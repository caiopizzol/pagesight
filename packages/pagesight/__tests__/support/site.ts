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
      if (url.pathname === "/social")
        return new Response(
          [
            "<title>Social</title>",
            '<meta property="og:title" content="Open Graph title">',
            '<meta property="OG:Image" content="https://cdn.example.com/card.png">',
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image" content="https://cdn.example.com/second.png">',
            '<meta property="og:locale:alternate" content="pt_BR">',
            '<meta property="og:locale:alternate" content="es_ES">',
            '<meta name="twitter:card" content="summary_large_image">',
            '<meta name="twitter:image" content="https://cdn.example.com/card.png">',
            '<meta name="description" content="Described">',
            '<link rel="alternate" hreflang="en" href="/en">',
            '<link rel="alternate" hreflang="pt-BR" href="https://pt.example.com/">',
            '<link rel="ALTERNATE" hreflang="es" href="/es">',
            '<link rel="alternate stylesheet" hreflang="fr" href="/fr">',
            '<link rel="alternate" hreflang="de" href="http://[broken">',
            '<link rel="alternate" href="/feed.xml" type="application/rss+xml">',
          ].join(""),
          { headers: { "Content-Type": "text/html" } },
        );
      if (url.pathname === "/based")
        return new Response(
          [
            "<title>Based</title>",
            '<link rel="canonical" href="page">',
            '<base href="/localized/">',
            '<link rel="alternate" hreflang="en" href="en">',
          ].join(""),
          { headers: { "Content-Type": "text/html" } },
        );
      if (url.pathname === "/data-base")
        return new Response(
          '<title>Data base</title><base href="data:text/html,x"><link rel="canonical" href="/page"><link rel="alternate" hreflang="en" href="/en">',
        );
      if (url.pathname === "/bad-base")
        return new Response('<title>Unbased</title><base href="http://[broken"><link rel="canonical" href="/page">');
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
