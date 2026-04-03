import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { auditAiCrawlers, type CrawlerStatus, fetchRobotsTxt, isAllowed, type RobotsTxt } from "../lib/robots.js";

// --- llms.txt detection ---

interface LlmsTxtResult {
  exists: boolean;
  size: number | null;
  firstLine: string | null;
}

async function checkLlmsTxt(origin: string, path: string): Promise<LlmsTxtResult> {
  try {
    const res = await fetch(`${origin}${path}`, {
      headers: { "User-Agent": "Pagesight/1.0" },
      redirect: "follow",
    });
    if (!res.ok) return { exists: false, size: null, firstLine: null };
    const text = await res.text();
    const firstLine =
      text
        .split("\n")
        .find((l) => l.trim().length > 0)
        ?.trim() ?? null;
    return { exists: true, size: text.length, firstLine };
  } catch {
    return { exists: false, size: null, firstLine: null };
  }
}

function formatLlmsTxt(llmsTxt: LlmsTxtResult, llmsFullTxt: LlmsTxtResult): string[] {
  const lines: string[] = ["--- LLM Visibility ---", ""];

  if (llmsTxt.exists) {
    const sizeKB = llmsTxt.size ? `${(llmsTxt.size / 1024).toFixed(1)} KB` : "unknown size";
    lines.push(`llms.txt: FOUND (${sizeKB})`);
    if (llmsTxt.firstLine) lines.push(`  ${llmsTxt.firstLine}`);
  } else {
    lines.push("llms.txt: NOT FOUND — consider adding one for AI-friendly documentation");
  }

  if (llmsFullTxt.exists) {
    const sizeKB = llmsFullTxt.size ? `${(llmsFullTxt.size / 1024).toFixed(1)} KB` : "unknown size";
    lines.push(`llms-full.txt: FOUND (${sizeKB})`);
  } else if (llmsTxt.exists) {
    lines.push("llms-full.txt: NOT FOUND — consider adding full docs for AI context windows");
  }

  return lines;
}

// --- Category summary ---

function formatCategorySummary(crawlers: CrawlerStatus[]): string[] {
  const categoryOrder = ["Training", "Search", "Assistant", "Agent", "Other"];
  const summary = new Map<string, { blocked: number; allowed: number }>();

  for (const bot of crawlers) {
    const cat = normalizeCategory(bot.category);
    const existing = summary.get(cat) ?? { blocked: 0, allowed: 0 };
    if (bot.allowed) existing.allowed++;
    else existing.blocked++;
    summary.set(cat, existing);
  }

  const lines: string[] = ["", "--- AI Crawler Summary by Category ---", ""];
  for (const cat of categoryOrder) {
    const s = summary.get(cat);
    if (!s) continue;
    const total = s.blocked + s.allowed;
    if (s.blocked === 0) {
      lines.push(`${cat}: all ${total} allowed`);
    } else if (s.allowed === 0) {
      lines.push(`${cat}: all ${total} BLOCKED`);
    } else {
      lines.push(`${cat}: ${s.blocked} blocked, ${s.allowed} allowed (of ${total})`);
    }
  }

  return lines;
}

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

  if (crawlers.length === 0) {
    lines.push("", "--- AI Crawlers ---", "", "Could not load AI crawler registry. Audit skipped.");
    return lines.join("\n");
  }

  lines.push(
    "",
    `--- AI Crawlers: ${blocked.length} blocked, ${allowed.length} allowed (of ${crawlers.length} known) ---`,
    "",
    `Source: github.com/ai-robots-txt/ai.robots.txt`,
  );

  if (blocked.length === 0) {
    lines.push("", `All ${crawlers.length} known AI crawlers are allowed. No bots are explicitly blocked.`);
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

export function registerAiTool(server: McpServer): void {
  server.tool(
    "ai",
    "Analyze your site's AI visibility. Audits AI crawler access (training, search, assistant, agent) via robots.txt, checks for llms.txt and llms-full.txt, validates syntax per RFC 9309, and tests specific path access. Shows how AI systems see your site.",
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

        const [crawlers, llmsTxt, llmsFullTxt] = await Promise.all([
          auditAiCrawlers(robotsTxt),
          checkLlmsTxt(origin, "/llms.txt"),
          checkLlmsTxt(origin, "/llms-full.txt"),
        ]);

        const output: string[] = [formatRobotsAudit(origin, robotsTxt, statusCode, crawlers)];

        if (crawlers.length > 0) {
          output.push(...formatCategorySummary(crawlers));
        }

        output.push("", ...formatLlmsTxt(llmsTxt, llmsFullTxt));

        return { content: [{ type: "text", text: output.join("\n") }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error analyzing robots.txt: ${msg}` }] };
      }
    },
  );
}
