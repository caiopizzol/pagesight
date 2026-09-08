import { afterAll, expect, test } from "bun:test";
import { parseInventorySitemap } from "../../src/web/sitemap-parser.js";
import { observeSitemap } from "../../src/web/sitemap-inventory.js";
import { createSiteFixture } from "../support/site.js";

test("sitemap XML decodes numeric entities once and preserves CDATA", () => {
  const result = parseInventorySitemap(
    "<urlset><url><loc>https://example.com/&#x61;?a=1&#38;b=2&amp;literal=&#x1F600;</loc></url><url><loc><![CDATA[https://example.com/?a=1&b=2]]></loc></url></urlset>",
  );
  expect(result.urls).toEqual(["https://example.com/a?a=1&b=2&literal=😀", "https://example.com/?a=1&b=2"]);
});

test("malformed sitemap content cannot claim complete empty coverage", () => {
  for (const xml of [
    "<urlset><url><loc>https://example.com/</loc></urlset>",
    "<urlset><url><loc>https://example.com/</loc></url>",
    "<urlset><url/></urlset>",
    "<urlset><url><loc/></url></urlset>",
    "<urlset><url><loc>https://example.com/</loc><loc>https://example.com/2</loc></url></urlset>",
    '<!DOCTYPE urlset [<!ENTITY foo "secret">]><urlset/>',
    "<urlset><url><loc>https://example.com/?a=1&bad;</loc></url></urlset>",
    "<urlset/><urlset/>",
  ])
    expect(() => parseInventorySitemap(xml)).toThrow();
  expect(parseInventorySitemap("<urlset/>").urls).toEqual([]);
});

test("large sitemap indexes schedule at most five documents and retain incompleteness", async () => {
  const requests: string[] = [];
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req): Response {
      const path = new URL(req.url).pathname;
      requests.push(path);
      if (path === "/index.xml")
        return new Response(
          `<sitemapindex>${Array.from({ length: 20000 }, (_, i) => `<sitemap><loc>${fixture.url}${i}.xml</loc></sitemap>`).join("")}</sitemapindex>`,
        );
      return new Response("<urlset/>");
    },
  });
  try {
    const result = await observeSitemap(`${fixture.url}index.xml`);
    expect(requests).toHaveLength(5);
    expect(result.complete).toBe(false);
    expect(result.omittedChildReferences).toBe(19996);
    expect(result.unvisited).toHaveLength(0);
    expect(result.errors).toEqual([]);
  } finally {
    await fixture.stop(true);
  }
});

const fixture = createSiteFixture();
afterAll(() => fixture.stop(true));
test("sitemap entities are decoded once and unsupported XML cannot imply empty complete coverage", async () => {
  const entities = await observeSitemap(`${fixture.url}entities.xml`);
  expect(entities.complete).toBe(true);
  expect(entities.urls).toEqual([`${fixture.url}?literal=&lt;`]);
  const prefixed = await observeSitemap(`${fixture.url}prefixed.xml`);
  expect(prefixed.complete).toBe(false);
  expect(prefixed.errors).toEqual([{ url: `${fixture.url}prefixed.xml`, code: "unsupported_sitemap" }]);
});
