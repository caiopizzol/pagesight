import { createSiteFixture } from "../support/site.js";
import { afterAll, expect, test } from "bun:test";
import { capture } from "../../src/api/evidence.js";
import { configSchema, operationSchema } from "../../src/api/schema.js";
import { discover } from "../../src/api/discover.js";
import { RequestError } from "../../src/shared/http.js";

const fixture = createSiteFixture();
afterAll(() => fixture.stop(true));
test("discovery keeps independent failures and never infers a GA hostname from its name", async () => {
  const result = await discover(fixture.url.href, ["gsc", "ga"], async (raw) => {
    const op = operationSchema.parse(raw);
    return capture(op.operation.split(".")[0], op.operation, "accounts", op, async () => {
      if (op.operation === "gsc.sites") throw new RequestError("Not configured", null, "not_configured");
      return { accountSummaries: [{ propertySummaries: [{ property: "properties/123", displayName: "127.0.0.1" }] }] };
    });
  });
  expect(result.status).toBe("partial");
  const response = result.pages[0].response as { config: unknown; candidates: unknown };
  expect(configSchema.parse(response.config).gaProperty).toBeUndefined();
  expect(response.candidates).toMatchObject({ ga: [{ property: "properties/123" }] });
});

test("discovery extracts GSC candidates from the raw provider envelope", async () => {
  const sites = [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }];
  const result = await discover("https://example.com/", ["gsc"], () =>
    capture("gsc", "sites", "accessible-properties", {}, async () => ({ siteEntry: sites, extra: true })),
  );
  expect(result.pages[0].response).toMatchObject({ candidates: { gsc: sites } });
});
