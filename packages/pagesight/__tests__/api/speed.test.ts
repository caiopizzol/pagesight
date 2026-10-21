import { expect, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { mockFetch, requestUrl } from "../support/fetch.js";

const url = "https://example.com/";

async function psi(operation: Record<string, unknown>) {
  const requested: URLSearchParams[] = [];
  const mocked = mockFetch(async (input) => {
    requested.push(new URL(requestUrl(input)).searchParams);
    return Response.json({ id: url, lighthouseResult: { categories: {} } });
  });
  try {
    return { result: await execute(operation), categories: requested[0].getAll("category") };
  } finally {
    mocked.mockRestore();
  }
}

test("speed.psi requests performance and seo unless categories are chosen", async () => {
  const { result, categories } = await psi({ operation: "speed.psi", url });
  expect(result.status).toBe("ok");
  expect(categories).toEqual(["performance", "seo"]);
  expect(result.pages[0].request).toEqual({ url, strategy: "mobile", categories: ["performance", "seo"] });
});

test("speed.psi threads chosen categories into the request and the provider call", async () => {
  const { result, categories } = await psi({
    operation: "speed.psi",
    url,
    strategy: "desktop",
    categories: ["accessibility", "best-practices"],
  });
  expect(result.status).toBe("ok");
  expect(categories).toEqual(["accessibility", "best-practices"]);
  expect(result.pages[0].request).toEqual({
    url,
    strategy: "desktop",
    categories: ["accessibility", "best-practices"],
  });
});

test("speed.psi refuses an empty or unknown category list", async () => {
  for (const categories of [[], ["pwa"]])
    expect(await execute({ operation: "speed.psi", url, categories }).catch((error: unknown) => error)).toMatchObject({
      code: "invalid_input",
    });
});
