import { createSiteFixture } from "../support/site.js";
import { afterAll, expect, test } from "bun:test";
import { startHttpApi } from "../../src/http.js";

const fixture = createSiteFixture();
const api = startHttpApi("test-token-with-at-least-24-characters", 0);
afterAll(async () => {
  await fixture.stop(true);
  await api.stop(true);
});
test("HTTP calls the same API and rejects requests without the local API token", async () => {
  const url = `${api.url}v1/query`;
  expect((await fetch(url, { method: "POST", body: "{}" })).status).toBe(401);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer test-token-with-at-least-24-characters" },
    body: JSON.stringify({ operation: "page", url: fixture.url.href }),
  });
  const result = await response.json();
  expect(response.status).toBe(200);
  expect(result.provider).toBe("web");
  expect(result.pages[0].response.title).toBe("Example");
});
