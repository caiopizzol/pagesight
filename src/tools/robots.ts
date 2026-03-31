import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditAiCrawlers, type CrawlerStatus, fetchRobotsTxt, isAllowed, type RobotsTxt } from "../lib/robots.js";

// Normalize the messy registry categories into clean buckets
function normalizeCategory(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("training") || lower.includes("train") || lower.includes("scrape") || lower.includes("dataset"))
    return "Training";
  if (lower.includes("search") && !lower.includes("assistant")) return "Search";
  if (lower.includes("assistant") || lower.includes("user prompt") || lower.includes("user quer")) return "Assistant";
  if (lower.includes("agent")) return "Agent";
  return "Other";
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
  const blocked = crawlers.filter((c) => !c.allowed);
  const allowed = crawlers.filter((c) => c.allowed);

  lines.push(
    "",
    `--- AI Crawlers: ${blocked.length} blocked, ${allowed.length} allowed (of ${crawlers.length} known) ---`,
    "",
    `Source: github.com/ai-robots-txt/ai.robots.txt`,
  );

  if (blocked.length === 0) {
    lines.push("", "All 139 known AI crawlers are allowed. No bots are explicitly blocked.");
  } else if (blocked.length === crawlers.length) {
    lines.push("", "All known AI crawlers are blocked.");
    // Show how they're blocked
    const byGroup = new Map<string, string[]>();
    for (const bot of blocked) {
      const group = bot.matchedGroup ?? "wildcard";
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group)?.push(bot.name);
    }
    for (const [group, bots] of byGroup) {
      lines.push(`  via group "${group}": ${bots.length} bots`);
    }
  } else {
    // Mixed — show blocked bots in detail, grouped by normalized category
    lines.push("");

    const blockedByCategory = new Map<string, CrawlerStatus[]>();
    for (const bot of blocked) {
      const cat = normalizeCategory(bot.category);
      if (!blockedByCategory.has(cat)) blockedByCategory.set(cat, []);
      blockedByCategory.get(cat)?.push(bot);
    }

    const categoryOrder = ["Training", "Search", "Assistant", "Agent", "Other"];
    for (const cat of categoryOrder) {
      const bots = blockedByCategory.get(cat);
      if (!bots) continue;

      lines.push(`Blocked ${cat} (${bots.length}):`);
      for (const bot of bots) {
        lines.push(`  BLOCKED  ${bot.name} (${bot.company})`);
      }
      lines.push("");
    }

    // Summary of allowed by category
    const allowedByCategory = new Map<string, number>();
    for (const bot of allowed) {
      const cat = normalizeCategory(bot.category);
      allowedByCategory.set(cat, (allowedByCategory.get(cat) ?? 0) + 1);
    }

    const allowedSummary = categoryOrder
      .filter((cat) => allowedByCategory.has(cat))
      .map((cat) => `${cat}: ${allowedByCategory.get(cat)}`)
      .join(", ");

    lines.push(`Allowed (${allowed.length}): ${allowedSummary}`);
  }

  return lines.join("\n");
}

export function registerRobotsTool(server: McpServer): void {
  server.tool(
    "robots",
    "Fetch and analyze a site's robots.txt. Validates syntax per RFC 9309, audits AI crawler access (139+ bots), lists sitemaps. Shows blocked bots in detail, summarizes allowed.",
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
