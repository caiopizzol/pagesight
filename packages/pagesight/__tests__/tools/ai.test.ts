import { callTool } from "../support/mcp.js";
import { expect, spyOn, test } from "bun:test";
import { formatCategorySummary, registerAiTool } from "../../src/tools/ai.js";

test("AI tool reports an oversized streamed llms.txt without consuming it all", async () => {
  let reads = 0;
  let canceled = false;
  const mock = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url.endsWith("/llms.txt"))
          return new Response(
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
          );
        if (url.includes("raw.githubusercontent.com")) return Response.json({});
        return new Response("", { status: 404 });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    const output = await callTool(registerAiTool, "ai", { url: "https://example.com" });
    expect(output).toContain("file too large to preview");
    expect(reads).toBe(17);
    expect(canceled).toBe(true);
  } finally {
    mock.mockRestore();
  }
});

test("category summary formats mixed registry labels and allowed/blocked counts", () => {
  const crawlers = [
    { category: "AI training dataset", allowed: false },
    { category: "Training", allowed: true },
    { category: "Search assistant", allowed: true },
    { category: "Search", allowed: false },
    { category: "Autonomous agent", allowed: true },
    { category: "Unrecognized", allowed: true },
  ].map((crawler) => ({ ...crawler, name: "Bot", company: "Example", respectsRobotsTxt: "yes", description: "" }));
  const output = formatCategorySummary(crawlers).join("\n");
  expect(output).toContain("Training: 1 blocked, 1 allowed (of 2)");
  expect(output).toContain("Search: all 1 BLOCKED");
  expect(output).toContain("Assistant: all 1 allowed");
  expect(output).toContain("Agent: all 1 allowed");
  expect(output).toContain("Other: all 1 allowed");
});
