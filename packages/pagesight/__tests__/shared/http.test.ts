import { afterAll, expect, test } from "bun:test";
import { readBounded, requestJson } from "../../src/shared/http.js";
import { createSiteFixture } from "../support/site.js";
import { capture } from "../../src/api/evidence.js";

test("stream limits stop reading and cancel bodies with missing or false Content-Length", async () => {
  for (const headers of [new Headers(), new Headers({ "content-length": "1" })]) {
    let reads = 0;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(8));
        },
        cancel() {
          canceled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const failure = await readBounded(new Response(body, { headers }), 10).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "size_limit" });
    expect(reads).toBe(2);
    expect(canceled).toBe(true);
  }
  const failure = await readBounded(new Response("é"), 1).catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: "size_limit" });
  expect(await readBounded(new Response("é"), 2)).toBe("é");
});

test("JSON syntax failures and interrupted response bodies have different safe errors", async () => {
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/invalid") return new Response("private-invalid-json");
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
          },
        }),
      );
    },
  });
  try {
    const invalid = await requestJson(`${fixture.url}invalid`).catch((e: unknown) => e);
    expect(invalid).toMatchObject({ code: "invalid_response", status: 200 });
    const interrupted = await requestJson(`${fixture.url}slow`, {}, 50).catch((e: unknown) => e);
    expect(interrupted).toMatchObject({ code: "network_error", status: null });
    expect(JSON.stringify([invalid, interrupted])).not.toContain("private-invalid-json");
  } finally {
    await fixture.stop(true);
  }
});

const fixture = createSiteFixture();
afterAll(() => fixture.stop(true));
test("provider errors do not expose response bodies or credentials", async () => {
  const result = await capture("test", "read", "site", {}, () => requestJson(`${fixture.url}bad?key=secret-key`));
  expect(result.error?.httpStatus).toBe(403);
  expect(JSON.stringify(result)).not.toContain("secret-key");
  expect(JSON.stringify(result)).not.toContain("not-for-output");
});
