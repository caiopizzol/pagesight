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

test("malformed canonical keeps independently observed page evidence", async () => {
  const result = await execute({ operation: "page", url: `${fixture.url}bad-canonical` });
  expect(result.status).toBe("ok");
  expect(result.pages[0].response).toMatchObject({
    title: "Still observable",
    canonical: null,
    warnings: expect.arrayContaining(["Malformed canonical href; canonical is unknown."]),
  });
});
