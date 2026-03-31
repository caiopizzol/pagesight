import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditAiCrawlers, type CrawlerStatus, fetchRobotsTxt, isAllowed, type RobotsTxt } from "../lib/robots.js";

function formatCrawlerStatus(statuses: CrawlerStatus[]): string {
  const lines: string[] = [];

  const categories = ["training", "search", "assistant", "agent"] as const;
  const categoryLabels: Record<string, string> = {
    training: "AI Training Crawlers (take your content, no attribution)",
    search: "AI Search Crawlers (index for AI search, cite you)",
    assistant: "AI Assistants (user-initiated fetches)",
    agent: "AI Agents (autonomous browsing)",
  };

  for (const cat of categories) {
    const bots = statuses.filter((s) => s.category === cat);
    if (bots.length === 0) continue;

    lines.push(`--- ${categoryLabels[cat]} ---`, "");

    for (const bot of bots) {
      const status = bot.allowed ? "ALLOWED" : "BLOCKED";
      const icon = bot.allowed ? "  " : "  ";
      lines.push(`${icon} ${status}  ${bot.name} (${bot.company})`);
      lines.push(`          ${bot.purpose}`);
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

  // Summary stats
  const totalRules = robots.groups.reduce((sum, g) => sum + g.rules.length, 0);
  lines.push(`Groups: ${robots.groups.length}`);
  lines.push(`Rules: ${totalRules}`);
  lines.push(`Sitemaps: ${robots.sitemaps.length}`);

  // Errors
  if (robots.errors.length > 0) {
    lines.push(`Parse errors: ${robots.errors.length}`, "");
    lines.push("--- Parse Errors ---", "");
    for (const err of robots.errors) {
      lines.push(`  ${err}`);
    }
  }

  // Sitemaps
  if (robots.sitemaps.length > 0) {
    lines.push("", "--- Sitemaps ---", "");
    for (const sm of robots.sitemaps) {
      lines.push(`  ${sm}`);
    }
  }

  // User-agent groups summary
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
  );
  lines.push(formatCrawlerStatus(crawlers));

  return lines.join("\n");
}

export function registerRobotsTool(server: McpServer): void {
  server.tool(
    "robots",
    "Fetch and analyze a site's robots.txt. Validates syntax per RFC 9309, audits AI crawler access (50+ bots: GPTBot, ClaudeBot, PerplexityBot, etc.), lists sitemaps, and checks for common mistakes.",
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

        // If checking a specific path
        if (check_path) {
          const ua = user_agent ?? "Googlebot";
          const result = isAllowed(robotsTxt, ua, check_path);
          const status = result.allowed ? "ALLOWED" : "BLOCKED";
          const lines = [
            `=== robots.txt path check ===`,
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

        // Full audit
        const crawlers = auditAiCrawlers(robotsTxt);
        return { content: [{ type: "text", text: formatRobotsAudit(origin, robotsTxt, statusCode, crawlers) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error analyzing robots.txt: ${msg}` }] };
      }
    },
  );
}
