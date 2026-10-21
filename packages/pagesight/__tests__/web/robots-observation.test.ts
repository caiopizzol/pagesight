import { beforeEach, expect, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { clearCrawlerRegistryCache } from "../../src/web/robots.js";
import { mockFetch, requestUrl } from "../support/fetch.js";

const site = "https://robots.example/";
const registry = {
  GPTBot: { operator: "[OpenAI](https://openai.com)", respect: "Yes", function: "AI model training" },
  Googlebot: { operator: "Google", respect: "Yes", function: "Search crawler" },
};
const robotsTxt = [
  "Sitemap: https://robots.example/sitemap.xml",
  "User-agent: GPTBot",
  "Disallow: /",
  "",
  "User-agent: *",
  "Allow: /",
  "Oops",
].join("\n");

function serve(responses: Record<string, () => Response>) {
  return mockFetch(async (input) => {
    const path = new URL(requestUrl(input)).pathname;
    const route = responses[path] ?? responses.registry;
    if (!route) throw new TypeError(`No route for ${requestUrl(input)}`);
    return route();
  });
}

beforeEach(() => {
  clearCrawlerRegistryCache();
});

test("robots evidence reports status, parse errors, sitemaps, Googlebot access, AI crawlers and llms files", async () => {
  const mocked = serve({
    "/robots.txt": () => new Response(robotsTxt),
    "/llms.txt": () => new Response("# Docs\n"),
    "/llms-full.txt": () => new Response(null, { status: 404 }),
    registry: () => Response.json(registry),
  });
  try {
    const result = await execute({ operation: "robots", url: `${site}page` });
    expect(result.status).toBe("ok");
    expect(result.provider).toBe("web");
    expect(result.operation).toBe("robots");
    expect(result.pages[0].request).toEqual({ url: `${site}page` });
    expect(result.pages[0].response).toEqual({
      url: `${site}page`,
      origin: "https://robots.example",
      status: 200,
      errors: ['Line 7: Missing colon — "Oops"'],
      sitemaps: ["https://robots.example/sitemap.xml"],
      googlebotAllowed: true,
      aiCrawlers: [
        { name: "GPTBot", operator: "OpenAI", category: "AI model training", allowed: false },
        { name: "Googlebot", operator: "Google", category: "Search crawler", allowed: true },
      ],
      llms: [
        { path: "/llms.txt", status: 200, bytes: 7 },
        { path: "/llms-full.txt", status: 404, bytes: null },
      ],
      warnings: [],
    });
  } finally {
    mocked.mockRestore();
  }
});

test("an unreachable AI crawler registry warns instead of failing the operation", async () => {
  const mocked = serve({
    "/robots.txt": () => new Response("User-agent: *\nDisallow: /secret\n"),
    "/llms.txt": () => new Response(null, { status: 404 }),
    "/llms-full.txt": () => new Response(null, { status: 404 }),
    registry: () => new Response(null, { status: 503 }),
  });
  try {
    const result = await execute({ operation: "robots", url: site });
    expect(result.status).toBe("ok");
    expect(result.error).toBeUndefined();
    expect(result.pages[0].response).toMatchObject({
      googlebotAllowed: true,
      aiCrawlers: [],
      warnings: ["The AI crawler registry could not be fetched; aiCrawlers is empty, not empty of blocks."],
    });
  } finally {
    mocked.mockRestore();
  }
});

test("an oversized llms.txt is reported without reading past the byte limit", async () => {
  let reads = 0;
  let canceled = false;
  const mocked = serve({
    "/robots.txt": () => new Response("User-agent: *\nAllow: /\n"),
    "/llms.txt": () => new Response(null, { status: 404 }),
    "/llms-full.txt": () =>
      new Response(
        new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              reads++;
              controller.enqueue(new Uint8Array(65536));
            },
            cancel() {
              canceled = true;
            },
          },
          { highWaterMark: 0 },
        ),
      ),
    registry: () => Response.json(registry),
  });
  try {
    const result = await execute({ operation: "robots", url: site });
    expect(result.status).toBe("ok");
    expect(result.pages[0].response).toMatchObject({
      llms: [
        { path: "/llms.txt", status: 404, bytes: null },
        { path: "/llms-full.txt", status: 200, bytes: null },
      ],
      warnings: ["/llms-full.txt exceeds the 1048576 byte read limit; its size is unknown."],
    });
    expect(reads).toBe(17);
    expect(canceled).toBe(true);
  } finally {
    mocked.mockRestore();
  }
});

test("llms redirects are followed manually and a credentialed hop is refused", async () => {
  const mocked = serve({
    "/robots.txt": () => new Response("User-agent: *\nAllow: /\n"),
    "/llms.txt": () => new Response(null, { status: 302, headers: { location: `${site}docs/llms.txt` } }),
    "/docs/llms.txt": () => new Response("# Docs\n"),
    "/llms-full.txt": () =>
      new Response(null, { status: 302, headers: { location: "https://user:pass@robots.example/llms-full.txt" } }),
    registry: () => Response.json(registry),
  });
  try {
    const result = await execute({ operation: "robots", url: site });
    expect(result.status).toBe("ok");
    expect(result.pages[0].response).toMatchObject({
      llms: [
        { path: "/llms.txt", status: 200, bytes: 7 },
        { path: "/llms-full.txt", status: null, bytes: null },
      ],
      warnings: ["/llms-full.txt could not be fetched; its status is unknown."],
    });
  } finally {
    mocked.mockRestore();
  }
});

test("robots.txt is read with a timeout and stops at the byte limit", async () => {
  let reads = 0;
  let canceled = false;
  let robotsSignal: AbortSignal | undefined;
  const mocked = mockFetch(async (input, init) => {
    const path = new URL(requestUrl(input)).pathname;
    if (path !== "/robots.txt") return Response.json(registry);
    robotsSignal = init?.signal ?? undefined;
    return new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            reads++;
            if (reads > 10) return controller.close();
            controller.enqueue(new Uint8Array(65536).fill(32));
          },
          cancel() {
            canceled = true;
          },
        },
        { highWaterMark: 0 },
      ),
    );
  });
  try {
    const result = await execute({ operation: "robots", url: site });
    expect(result.status).toBe("error");
    expect(result.error).toEqual({ code: "size_limit", message: "Response exceeds byte limit", httpStatus: null });
    expect(reads).toBe(8);
    expect(canceled).toBe(true);
    expect(robotsSignal).toBeInstanceOf(AbortSignal);
  } finally {
    mocked.mockRestore();
  }
});

test("a failed llms request keeps the rest of the robots evidence", async () => {
  const mocked = serve({
    "/robots.txt": () => new Response(robotsTxt),
    "/llms.txt": () => {
      throw new TypeError("Network unreachable");
    },
    "/llms-full.txt": () => new Response(null, { status: 404 }),
    registry: () => Response.json(registry),
  });
  try {
    const result = await execute({ operation: "robots", url: site });
    expect(result.status).toBe("ok");
    expect(result.error).toBeUndefined();
    expect(result.pages[0].response).toMatchObject({
      sitemaps: ["https://robots.example/sitemap.xml"],
      googlebotAllowed: true,
      aiCrawlers: [
        { name: "GPTBot", operator: "OpenAI", category: "AI model training", allowed: false },
        { name: "Googlebot", operator: "Google", category: "Search crawler", allowed: true },
      ],
      llms: [
        { path: "/llms.txt", status: null, bytes: null },
        { path: "/llms-full.txt", status: 404, bytes: null },
      ],
      warnings: ["/llms.txt could not be fetched; its status is unknown."],
    });
  } finally {
    mocked.mockRestore();
  }
});
