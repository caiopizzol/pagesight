import { expect, test } from "bun:test";
import { cloudflareGraphql } from "../../src/providers/cloudflare.js";
import { mockFetch, requestUrl } from "../support/fetch.js";

test("Cloudflare transport keeps credentials out of evidence and maps unavailable responses", async () => {
  const previous = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  let calls = 0;
  let status = 403;
  const mocked = mockFetch(async (url, init) => {
    calls++;
    expect(requestUrl(url)).toBe("https://api.cloudflare.com/client/v4/graphql");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer fixture-private-token");
    expect(init?.method).toBe("POST");
    if (status === 200) return Response.json({ data: null, errors: [{ message: "dataset unavailable" }] });
    return new Response("fixture-private-token", { status });
  });
  try {
    const request = { query: "query Settings {}", variables: {} };
    const missing = await cloudflareGraphql(request).catch((error: unknown) => error);
    expect(missing).toMatchObject({ code: "not_configured" });
    expect(calls).toBe(0);
    process.env.CLOUDFLARE_API_TOKEN = "fixture-private-token";
    for (const [http, code] of [
      [401, "unauthenticated"],
      [403, "forbidden"],
      [429, "quota_exceeded"],
      [500, "provider_error"],
    ] as const) {
      status = http;
      try {
        await cloudflareGraphql(request);
        throw new Error("expected failure");
      } catch (error) {
        expect(error).toMatchObject({ code, status: http });
        expect(String(error)).not.toContain("fixture-private-token");
      }
    }
    status = 200;
    expect(await cloudflareGraphql(request)).toEqual({ data: null, errors: [{ message: "dataset unavailable" }] });
  } finally {
    mocked.mockRestore();
    if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previous;
  }
});

test("Cloudflare distinguishes interrupted bodies from malformed JSON", async () => {
  const previous = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = "fixture-private-token";
  let interrupted = true;
  const mocked = mockFetch(async () =>
    interrupted
      ? new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new DOMException("interrupted", "AbortError"));
            },
          }),
        )
      : new Response("{broken"),
  );
  try {
    expect(
      await cloudflareGraphql({ query: "query Settings {}", variables: {} }).catch((error: unknown) => error),
    ).toMatchObject({
      code: "network_error",
    });
    interrupted = false;
    expect(
      await cloudflareGraphql({ query: "query Settings {}", variables: {} }).catch((error: unknown) => error),
    ).toMatchObject({
      code: "invalid_response",
    });
  } finally {
    mocked.mockRestore();
    if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previous;
  }
});
