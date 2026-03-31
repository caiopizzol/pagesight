/**
 * robots.txt parser per RFC 9309
 * https://www.rfc-editor.org/rfc/rfc9309
 *
 * AI crawler registry sourced from:
 * https://github.com/ai-robots-txt/ai.robots.txt (robots.json)
 */

export interface RobotsGroup {
  userAgents: string[];
  rules: Array<{ type: "allow" | "disallow"; path: string }>;
}

export interface RobotsTxt {
  groups: RobotsGroup[];
  sitemaps: string[];
  raw: string;
  errors: string[];
}

export interface CrawlerStatus {
  name: string;
  company: string;
  category: string;
  respectsRobotsTxt: string;
  description: string;
  allowed: boolean;
  matchedRule?: { type: "allow" | "disallow"; path: string } | null;
  matchedGroup?: string;
}

export interface CrawlerInfo {
  token: string;
  operator: string;
  respect: string;
  function: string;
  description: string;
}

// --- Remote Registry ---

const REGISTRY_URL = "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedRegistry: CrawlerInfo[] | null = null;
let cacheTimestamp = 0;

function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function parseRespect(raw: string): string {
  const clean = stripMarkdownLinks(raw).trim().toLowerCase();
  if (clean.startsWith("yes")) return "yes";
  if (clean.startsWith("no")) return "no";
  return "unclear";
}

async function fetchRegistry(): Promise<CrawlerInfo[]> {
  if (cachedRegistry && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRegistry;
  }

  try {
    const res = await fetch(REGISTRY_URL, {
      headers: { "User-Agent": "Pagesight/0.1" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as Record<string, Record<string, string>>;

    cachedRegistry = Object.entries(data).map(([token, info]) => ({
      token,
      operator: stripMarkdownLinks(info.operator ?? "Unknown"),
      respect: info.respect ?? "Unclear",
      function: info.function ?? "Unknown",
      description: stripMarkdownLinks(info.description ?? ""),
    }));

    cacheTimestamp = Date.now();
    return cachedRegistry;
  } catch {
    // Fall back to cached or empty
    return cachedRegistry ?? [];
  }
}

// --- Parser ---

export function parseRobotsTxt(raw: string): RobotsTxt {
  const errors: string[] = [];
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];

  let currentGroup: RobotsGroup | null = null;

  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let line = lines[i];

    // Strip comments
    const commentIdx = line.indexOf("#");
    if (commentIdx !== -1) line = line.substring(0, commentIdx);
    line = line.trim();

    if (!line) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      errors.push(`Line ${lineNum}: Missing colon — "${line}"`);
      continue;
    }

    const directive = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    if (directive === "user-agent") {
      if (!value) {
        errors.push(`Line ${lineNum}: Empty user-agent value`);
        continue;
      }
      if (!currentGroup || currentGroup.rules.length > 0) {
        currentGroup = { userAgents: [value], rules: [] };
        groups.push(currentGroup);
      } else {
        currentGroup.userAgents.push(value);
      }
    } else if (directive === "disallow") {
      if (!currentGroup) {
        errors.push(`Line ${lineNum}: Disallow before any User-agent`);
        continue;
      }
      currentGroup.rules.push({ type: "disallow", path: value });
    } else if (directive === "allow") {
      if (!currentGroup) {
        errors.push(`Line ${lineNum}: Allow before any User-agent`);
        continue;
      }
      currentGroup.rules.push({ type: "allow", path: value });
    } else if (directive === "sitemap") {
      if (value) sitemaps.push(value);
      else errors.push(`Line ${lineNum}: Empty sitemap URL`);
    } else if (directive === "crawl-delay" || directive === "host") {
      // Known non-standard directives — ignore silently
    } else {
      errors.push(`Line ${lineNum}: Unknown directive "${directive}"`);
    }
  }

  return { groups, sitemaps, raw, errors };
}

// --- Matching (per RFC 9309) ---

function pathMatches(pattern: string, path: string): boolean {
  if (!pattern) return false;

  let regex = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      regex += ".*";
    } else if (c === "$" && i === pattern.length - 1) {
      regex += "$";
    } else {
      regex += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  if (!pattern.endsWith("$")) regex += ".*";

  try {
    return new RegExp(regex).test(path);
  } catch {
    return false;
  }
}

export function isAllowed(
  robots: RobotsTxt,
  userAgent: string,
  path: string,
): {
  allowed: boolean;
  matchedRule: { type: "allow" | "disallow"; path: string } | null;
  matchedGroup: string | null;
} {
  const ua = userAgent.toLowerCase();

  let matchingGroup: RobotsGroup | null = null;
  let matchedGroupName: string | null = null;

  for (const group of robots.groups) {
    for (const agent of group.userAgents) {
      if (agent.toLowerCase() === ua) {
        matchingGroup = group;
        matchedGroupName = agent;
        break;
      }
    }
    if (matchingGroup) break;
  }

  if (!matchingGroup) {
    for (const group of robots.groups) {
      if (group.userAgents.some((a) => a === "*")) {
        matchingGroup = group;
        matchedGroupName = "*";
        break;
      }
    }
  }

  if (!matchingGroup) return { allowed: true, matchedRule: null, matchedGroup: null };

  let bestRule: { type: "allow" | "disallow"; path: string } | null = null;
  let bestLength = -1;

  for (const rule of matchingGroup.rules) {
    if (pathMatches(rule.path, path)) {
      const ruleLength = rule.path.length;
      if (ruleLength > bestLength || (ruleLength === bestLength && rule.type === "allow")) {
        bestRule = rule;
        bestLength = ruleLength;
      }
    }
  }

  if (!bestRule) return { allowed: true, matchedRule: null, matchedGroup: matchedGroupName };

  return {
    allowed: bestRule.type === "allow",
    matchedRule: bestRule,
    matchedGroup: matchedGroupName,
  };
}

// --- AI Crawler Audit ---

export async function auditAiCrawlers(robots: RobotsTxt): Promise<CrawlerStatus[]> {
  const registry = await fetchRegistry();

  return registry.map((crawler) => {
    const result = isAllowed(robots, crawler.token, "/");
    return {
      name: crawler.token,
      company: crawler.operator,
      category: crawler.function,
      respectsRobotsTxt: parseRespect(crawler.respect),
      description: crawler.description.slice(0, 120),
      allowed: result.allowed,
      matchedRule: result.matchedRule,
      matchedGroup: result.matchedGroup ?? undefined,
    };
  });
}

// --- Fetch ---

export async function fetchRobotsTxt(origin: string): Promise<{ robotsTxt: RobotsTxt; statusCode: number }> {
  const url = new URL("/robots.txt", origin).href;

  const res = await fetch(url, {
    headers: { "User-Agent": "Pagesight/0.1" },
    redirect: "follow",
  });

  if (res.status >= 400) {
    return { robotsTxt: { groups: [], sitemaps: [], raw: "", errors: [] }, statusCode: res.status };
  }

  const raw = await res.text();
  return { robotsTxt: parseRobotsTxt(raw), statusCode: res.status };
}

export { fetchRegistry as loadCrawlerRegistry };
