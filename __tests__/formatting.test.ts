import { describe, expect, test } from "bun:test";

import { parseRobotsTxt } from "../src/lib/robots.js";

describe("robots access rules", () => {
  test("specific bot rules override the wildcard", async () => {
    const robots = parseRobotsTxt("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /");
    expect(robots.groups).toHaveLength(2);

    // GPTBot should be blocked
    const { isAllowed } = await import("../src/lib/robots.js");
    const gpt = isAllowed(robots, "GPTBot", "/");
    expect(gpt.allowed).toBe(false);

    // Unknown bot should be allowed via wildcard
    const unknown = isAllowed(robots, "RandomBot", "/");
    expect(unknown.allowed).toBe(true);
  });
});

describe("robots group examples", () => {
  test("real-world CNN-style robots.txt with many user-agents in one group", () => {
    const robots = parseRobotsTxt(
      [
        "User-agent: GPTBot",
        "User-agent: ClaudeBot",
        "User-agent: CCBot",
        "Disallow: /",
        "",
        "User-agent: *",
        "Disallow: /search",
        "Allow: /",
      ].join("\n"),
    );

    expect(robots.groups).toHaveLength(2);
    expect(robots.groups[0].userAgents).toEqual(["GPTBot", "ClaudeBot", "CCBot"]);
    expect(robots.groups[0].rules).toEqual([{ type: "disallow", path: "/" }]);
  });

  test("real-world Reddit-style single wildcard disallow", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow: /");

    const { isAllowed } = require("../src/lib/robots.js");
    // Every bot should be blocked
    expect(isAllowed(robots, "GPTBot", "/").allowed).toBe(false);
    expect(isAllowed(robots, "ClaudeBot", "/").allowed).toBe(false);
    expect(isAllowed(robots, "Googlebot", "/").allowed).toBe(false);
  });

  test("real-world NYT-style selective blocking", () => {
    const robots = parseRobotsTxt(
      [
        "User-agent: GPTBot",
        "Disallow: /",
        "",
        "User-agent: ClaudeBot",
        "Disallow: /",
        "",
        "User-agent: *",
        "Disallow: /search",
        "Allow: /",
      ].join("\n"),
    );

    const { isAllowed } = require("../src/lib/robots.js");
    expect(isAllowed(robots, "GPTBot", "/article").allowed).toBe(false);
    expect(isAllowed(robots, "ClaudeBot", "/article").allowed).toBe(false);
    expect(isAllowed(robots, "Googlebot", "/article").allowed).toBe(true);
    expect(isAllowed(robots, "Googlebot", "/search").allowed).toBe(false);
  });
});
