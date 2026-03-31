import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditAiCrawlers, type CrawlerStatus, fetchRobotsTxt, isAllowed, type RobotsTxt } from "../lib/robots.js";

function formatCrawlerStatus(statuses: CrawlerStatus[]): string {
  const lines: string[] = [];

  // Group by category
  const categories = new Map<string, CrawlerStatus[]>();
  for (const s of statuses) {
    const cat = s.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)?.push(s);
  }

  for (const [cat, bots] of categories) {
    lines.push(`--- ${cat} (${bots.length}) ---`, "");

    for (const bot of bots) {
      const status = bot.allowed ? "ALLOWED" : "BLOCKED";
      lines.push(`  ${status}  ${bot.name} (${bot.company})`);
      if (bot.matchedRule) {
        lines.push(`          Rule: ${bot.matchedRule.type}: ${bot.matchedRule.path} (group: ${bot.matchedGroup})`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatRobotsAudit(origin: string, robots: RobotsTxt, statusCode: number, crawlers: CrawlerStatus[]): string {
  const lines: string[] = [`=== robots.txt: ${origin} ===`, `Status: ${statusCode}`, ""];

  const totalRules = robots.groups.reduce((sum, g) => sum + g.rules.length, 0);
  lines.push(`Groups: ${robots.groups.length}`);
  lines.push(`Rules: ${totalRules}`);
  lines.push(`Sitemaps: ${robots.sitemaps.length}`);

  if (robots.errors.length > 0) {
    lines.push(`Parse errors: ${robots.errors.length}`, "");
    lines.push("--- Parse Errors ---", "");
    for (const err of robots.errors) {
      lines.push(`  ${err}`);
    }
  }

  if (robots.sitemaps.length > 0) {
    lines.push("", "--- Sitemaps ---", "");
    for (const sm of robots.sitemaps) {
      lines.push(`  ${sm}`);
    }
  }

  if (robots.groups.length > 0) {
    lines.push("", "--- User-Agent Groups ---", "");
    for (const group of robots.groups) {
      const agents = group.userAgents.join(", ");
      const allows = group.rules.filter((r) => r.type === "allow").length;
      const disallows = group.rules.filter((r) => r.type === "disallow").length;
      lines.push(`  ${agents}: ${disallows} disallow, ${allows} allow`);
    }
  }

  // AI Crawler audit
  const allowed = crawlers.filter((c) => c.allowed);
  const blocked = crawlers.filter((c) => !c.allowed);

  lines.push(
    "",
    `--- AI Crawlers: ${blocked.length} blocked, ${allowed.length} allowed (of ${crawlers.length} known) ---`,
    "",
    `Source: github.com/ai-robots-txt/ai.robots.txt (${crawlers.length} bots)`,
    "",
  );
  lines.push(formatCrawlerStatus(crawlers));

  return lines.join("\n");
}

export function registerRobotsTool(server: McpServer): void {
  server.tool(
    "robots",
    "Fetch and analyze a site's robots.txt. Validates syntax per RFC 9309, audits AI crawler access (130+ bots from ai-robots-txt registry), lists sitemaps, and reports blocked vs allowed bots by category.",
    {
      url: z
        .string()
        .describe("Site URL or origin (e.g., 'https://example.com'). Fetches /robots.txt from this origin."),
      check_path: z
        .string()
        .optional()
        .describe("Optional: check if a specific path is allowed/blocked for a given user-agent."),
      user_agent: z
        .string()
        .optional()
        .describe("Optional: user-agent to check path access for. Default: 'Googlebot'."),
    },
    async ({ url, check_path, user_agent }) => {
      try {
        const origin = new URL(url).origin;
        const { robotsTxt, statusCode } = await fetchRobotsTxt(origin);

        if (check_path) {
          const ua = user_agent ?? "Googlebot";
          const result = isAllowed(robotsTxt, ua, check_path);
          const status = result.allowed ? "ALLOWED" : "BLOCKED";
          const lines = [
            "=== robots.txt path check ===",
            `Origin: ${origin}`,
            `User-Agent: ${ua}`,
            `Path: ${check_path}`,
            `Result: ${status}`,
          ];
          if (result.matchedRule) {
            lines.push(`Matched rule: ${result.matchedRule.type}: ${result.matchedRule.path}`);
            lines.push(`Matched group: ${result.matchedGroup}`);
          } else {
            lines.push("No matching rule found (default: allowed)");
          }
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        const crawlers = await auditAiCrawlers(robotsTxt);
        return { content: [{ type: "text", text: formatRobotsAudit(origin, robotsTxt, statusCode, crawlers) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error analyzing robots.txt: ${msg}` }] };
      }
    },
  );
}
