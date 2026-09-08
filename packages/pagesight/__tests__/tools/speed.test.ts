import { mockFetch, requestUrl } from "../support/fetch.js";
import { expect, test } from "bun:test";
import { registerSpeedTool } from "../../src/tools/speed/tool.js";
import { callTool } from "../support/mcp.js";

const pagespeed = {
  analysisUTCTimestamp: "2026-01-01T00:00:00Z",
  lighthouseResult: {
    configSettings: { emulatedFormFactor: "mobile" },
    lighthouseVersion: "12",
    categories: { performance: { id: "performance", title: "Performance", score: 0.9 } },
    audits: {},
    timing: { total: 1000 },
  },
};

test("speed preserves single, comparison, and partial batch results", async () => {
  const fetchMock = mockFetch(async (input) => {
    const target = new URL(requestUrl(input)).searchParams.get("url");
    return target?.includes("broken") ? new Response("failed", { status: 500 }) : Response.json(pagespeed);
  });
  try {
    expect(await callTool(registerSpeedTool, "speed", { url: "https://example.com/a" })).toContain("Performance: 90");
    const compare = await callTool(registerSpeedTool, "speed", {
      urls: ["https://example.com/a", "https://example.com/b"],
    });
    expect(compare).toContain("90");
    expect(compare).toContain("/a");
    expect(compare).toContain("/b");
    const partial = await callTool(registerSpeedTool, "speed", {
      urls: ["https://example.com/a", "https://example.com/broken"],
    });
    expect(partial).toContain("Errors");
    expect(partial).toContain("broken");
  } finally {
    fetchMock.mockRestore();
  }
});

test("speed auto-selects CrUX from origin and preserves missing-data output", async () => {
  const previous = process.env.GOOGLE_API_KEY;
  process.env.GOOGLE_API_KEY = "fixture";
  const calls: string[] = [];
  const fetchMock = mockFetch(async (input) => {
    calls.push(requestUrl(input));
    return new Response("missing", { status: 404 });
  });
  try {
    expect(await callTool(registerSpeedTool, "speed", { origin: "https://example.com" })).toContain("No CrUX data");
    expect(calls[0]).toContain("queryRecord");
    expect(
      await callTool(registerSpeedTool, "speed", { action: "crux_history", url: "https://example.com", periods: 2 }),
    ).toContain("No CrUX history data");
    expect(calls[1]).toContain("queryHistoryRecord");
  } finally {
    fetchMock.mockRestore();
    if (previous === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = previous;
  }
});
