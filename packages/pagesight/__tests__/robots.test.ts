import { describe, expect, test } from "bun:test";
import { isAllowed, parseRobotsTxt } from "../src/lib/robots.js";

describe("parseRobotsTxt", () => {
  test("parses basic allow/disallow rules", () => {
    const r = parseRobotsTxt("User-agent: *\nDisallow: /private\nAllow: /public");
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].userAgents).toEqual(["*"]);
    expect(r.groups[0].rules).toEqual([
      { type: "disallow", path: "/private" },
      { type: "allow", path: "/public" },
    ]);
  });

  test("handles multiple user-agents in one group", () => {
    const r = parseRobotsTxt("User-agent: Googlebot\nUser-agent: Bingbot\nDisallow: /");
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].userAgents).toEqual(["Googlebot", "Bingbot"]);
    expect(r.groups[0].rules).toEqual([{ type: "disallow", path: "/" }]);
  });

  test("creates separate groups when rules appear between user-agents", () => {
    const r = parseRobotsTxt("User-agent: A\nDisallow: /a\n\nUser-agent: B\nDisallow: /b");
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0].userAgents).toEqual(["A"]);
    expect(r.groups[1].userAgents).toEqual(["B"]);
  });

  test("strips comments", () => {
    const r = parseRobotsTxt("# This is a comment\nUser-agent: * # inline comment\nDisallow: /secret # hidden");
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].userAgents).toEqual(["*"]);
    expect(r.groups[0].rules).toEqual([{ type: "disallow", path: "/secret" }]);
  });

  test("skips blank lines", () => {
    const r = parseRobotsTxt("\n\nUser-agent: *\n\n\nDisallow: /\n\n");
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].rules).toHaveLength(1);
  });

  test("extracts sitemap directives", () => {
    const r = parseRobotsTxt(
      "Sitemap: https://example.com/sitemap.xml\nUser-agent: *\nDisallow:\nSitemap: https://example.com/sitemap2.xml",
    );
    expect(r.sitemaps).toEqual(["https://example.com/sitemap.xml", "https://example.com/sitemap2.xml"]);
  });

  test("ignores unknown directives silently per RFC 9309", () => {
    const r = parseRobotsTxt("User-agent: *\nDisallow: /\nCrawl-delay: 10\nNoindex: /page\nRequest-rate: 1/5");
    expect(r.errors).toHaveLength(0);
    expect(r.groups[0].rules).toHaveLength(1);
  });

  test("errors on disallow before user-agent", () => {
    const r = parseRobotsTxt("Disallow: /oops");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain("Disallow before any User-agent");
  });

  test("errors on empty user-agent value", () => {
    const r = parseRobotsTxt("User-agent: \nDisallow: /");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain("Empty user-agent");
  });

  test("errors on missing colon", () => {
    const r = parseRobotsTxt("User-agent: *\nDisallow /path");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain("Missing colon");
  });

  test("errors on empty sitemap URL", () => {
    const r = parseRobotsTxt("Sitemap: ");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("Empty sitemap");
  });

  test("handles case-insensitive directives", () => {
    const r = parseRobotsTxt("USER-AGENT: Bot\nDISALLOW: /\nALLOW: /ok\nSITEMAP: https://x.com/s.xml");
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].userAgents).toEqual(["Bot"]);
    expect(r.groups[0].rules).toHaveLength(2);
    expect(r.sitemaps).toHaveLength(1);
  });

  test("handles CR/LF line endings", () => {
    const r = parseRobotsTxt("User-agent: *\r\nDisallow: /\r\n");
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].rules).toHaveLength(1);
  });

  test("empty disallow stores empty path", () => {
    const r = parseRobotsTxt("User-agent: *\nDisallow:");
    expect(r.groups[0].rules).toEqual([{ type: "disallow", path: "" }]);
  });
});

describe("isAllowed", () => {
  test("specific user-agent match takes precedence over wildcard", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow: /\n\nUser-agent: MyBot\nAllow: /");
    const result = isAllowed(robots, "MyBot", "/page");
    expect(result.allowed).toBe(true);
    expect(result.matchedGroup).toBe("MyBot");
  });

  test("falls back to wildcard group", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow: /secret");
    const result = isAllowed(robots, "UnknownBot", "/secret");
    expect(result.allowed).toBe(false);
    expect(result.matchedGroup).toBe("*");
  });

  test("allowed when no matching group exists", () => {
    const robots = parseRobotsTxt("User-agent: SpecificBot\nDisallow: /");
    const result = isAllowed(robots, "OtherBot", "/anything");
    expect(result.allowed).toBe(true);
    expect(result.matchedGroup).toBeNull();
  });

  test("longest matching rule wins", () => {
    const robots = parseRobotsTxt("User-agent: *\nAllow: /page\nDisallow: /page/secret");
    const result = isAllowed(robots, "Bot", "/page/secret/file");
    expect(result.allowed).toBe(false);
  });

  test("allow wins on equal-length tie", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow: /path\nAllow: /path");
    const result = isAllowed(robots, "Bot", "/path");
    expect(result.allowed).toBe(true);
  });

  test("wildcard * matches any path segment", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow: /*/private");
    const result = isAllowed(robots, "Bot", "/foo/private");
    expect(result.allowed).toBe(false);
  });

  test("$ anchor matches end of path exactly", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow: /*.php$");
    expect(isAllowed(robots, "Bot", "/page.php").allowed).toBe(false);
    expect(isAllowed(robots, "Bot", "/page.php?id=1").allowed).toBe(true);
  });

  test("empty disallow allows everything", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow:");
    const result = isAllowed(robots, "Bot", "/anything/at/all");
    expect(result.allowed).toBe(true);
  });

  test("case-insensitive user-agent matching", () => {
    const robots = parseRobotsTxt("User-agent: GPTBot\nDisallow: /");
    expect(isAllowed(robots, "gptbot", "/").allowed).toBe(false);
    expect(isAllowed(robots, "GPTBOT", "/").allowed).toBe(false);
    expect(isAllowed(robots, "GptBot", "/").allowed).toBe(false);
  });

  test("case-sensitive path matching", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow: /Private");
    expect(isAllowed(robots, "Bot", "/Private").allowed).toBe(false);
    expect(isAllowed(robots, "Bot", "/private").allowed).toBe(true);
  });

  test("merges rules from duplicate user-agent groups", () => {
    const robots = parseRobotsTxt("User-agent: MyBot\nDisallow: /a\n\nUser-agent: MyBot\nDisallow: /b");
    expect(isAllowed(robots, "MyBot", "/a").allowed).toBe(false);
    expect(isAllowed(robots, "MyBot", "/b").allowed).toBe(false);
  });

  test("Disallow: / blocks everything", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow: /");
    expect(isAllowed(robots, "Bot", "/").allowed).toBe(false);
    expect(isAllowed(robots, "Bot", "/any/path").allowed).toBe(false);
  });

  test("no rules in group means everything allowed", () => {
    const robots = parseRobotsTxt("User-agent: Bot");
    const result = isAllowed(robots, "Bot", "/anything");
    expect(result.allowed).toBe(true);
    expect(result.matchedRule).toBeNull();
  });
});
