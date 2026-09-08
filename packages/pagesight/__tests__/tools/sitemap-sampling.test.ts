import { expect, test } from "bun:test";
import { parseSitemapXml, sampleUrls } from "../../src/tools/search/sitemap-sampling.js";

test("legacy sitemap parsing and sampling keep URL order and input intact", () => {
  expect(
    parseSitemapXml("<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap></sitemapindex>"),
  ).toEqual({ urls: [], isSitemapIndex: true, childSitemaps: ["https://example.com/a.xml"] });
  const urls = ["a", "b", "c", "d", "e", "f"];
  expect(sampleUrls(urls, 2, "first")).toEqual(["a", "b"]);
  expect(sampleUrls(urls, 2, "spread")).toEqual(["a", "d"]);
  expect(new Set(sampleUrls(urls, 3, "random")).size).toBe(3);
  expect(urls).toEqual(["a", "b", "c", "d", "e", "f"]);
  expect(parseSitemapXml("<urlset><url><loc>https://example.com/a</loc></url></urlset>").urls).toEqual([
    "https://example.com/a",
  ]);
});
