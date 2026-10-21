import { createSiteFixture } from "../support/site.js";
import { afterAll, expect, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { observePage } from "../../src/web/page-observation.js";
import { observeSitemap } from "../../src/web/sitemap-inventory.js";

const fixture = createSiteFixture();
afterAll(() => fixture.stop(true));
test("page inventory reads attribute order and preserves noindex without declaring index status", async () => {
  const page = await observePage(fixture.url.href);
  expect(page.title).toBe("Example");
  expect(page.robots).toEqual(["robots: noindex,follow"]);
  expect(page.canonical).toBe(`${fixture.url}canonical`);
  expect(page.structuredData).toEqual([{ value: { "@type": "Vehicle" }, validJson: true }]);
  const sitemap = await observeSitemap(`${fixture.url}sitemap.xml`);
  expect(sitemap.urls).toEqual([`${fixture.url}?a=1&b=2`]);
  expect(sitemap.futureLastmods).toEqual(["2099-01-01"]);
});

test("page evidence keeps repeated Open Graph and Twitter metas in document order", async () => {
  const result = await execute({ operation: "page", url: `${fixture.url}social` });
  expect(result.status).toBe("ok");
  expect(result.pages[0].response).toMatchObject({
    openGraph: [
      { property: "og:title", content: "Open Graph title" },
      { property: "og:image", content: "https://cdn.example.com/card.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image", content: "https://cdn.example.com/second.png" },
      { property: "og:locale:alternate", content: "pt_BR" },
      { property: "og:locale:alternate", content: "es_ES" },
    ],
    twitter: [
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://cdn.example.com/card.png" },
    ],
    description: "Described",
  });
});

test("page evidence records every rel list that contains alternate", async () => {
  const result = await execute({ operation: "page", url: `${fixture.url}social` });
  expect(result.pages[0].response).toMatchObject({
    hreflang: [
      { lang: "en", href: `${fixture.url}en` },
      { lang: "pt-BR", href: "https://pt.example.com/" },
      { lang: "es", href: `${fixture.url}es` },
      { lang: "fr", href: `${fixture.url}fr` },
    ],
    warnings: expect.arrayContaining(["Malformed alternate href for hreflang de; that alternate is unknown."]),
  });
});

test("canonical and hreflang resolve against a base element declared anywhere in the document", async () => {
  const based = await observePage(`${fixture.url}based`);
  expect(based.canonical).toBe(`${fixture.url}localized/page`);
  expect(based.hreflang).toEqual([{ lang: "en", href: `${fixture.url}localized/en` }]);
  const unbased = await observePage(`${fixture.url}bad-base`);
  expect(unbased.canonical).toBe(`${fixture.url}page`);
  expect(unbased.warnings).toContain("Malformed base href; links resolve against the final URL.");
  const dataBase = await observePage(`${fixture.url}data-base`);
  expect(dataBase.canonical).toBe(`${fixture.url}page`);
  expect(dataBase.hreflang).toEqual([{ lang: "en", href: `${fixture.url}en` }]);
  expect(dataBase.warnings).toContain("Ignored data: base href; links resolve against the final URL.");
});

test("malformed canonical keeps independently observed page evidence", async () => {
  const result = await execute({ operation: "page", url: `${fixture.url}bad-canonical` });
  expect(result.status).toBe("ok");
  expect(result.pages[0].response).toMatchObject({
    title: "Still observable",
    canonical: null,
    warnings: expect.arrayContaining(["Malformed canonical href; canonical is unknown."]),
  });
});
