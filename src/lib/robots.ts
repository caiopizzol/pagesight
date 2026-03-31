/**
 * robots.txt parser per RFC 9309
 * https://www.rfc-editor.org/rfc/rfc9309
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
  category: "training" | "search" | "assistant" | "agent";
  purpose: string;
  docsUrl: string;
  allowed: boolean;
  matchedRule?: { type: "allow" | "disallow"; path: string } | null;
  matchedGroup?: string;
}

// --- AI Crawler Registry ---

export interface CrawlerInfo {
  token: string;
  company: string;
  category: "training" | "search" | "assistant" | "agent";
  purpose: string;
  docsUrl: string;
  respectsRobotsTxt: boolean;
}

export const AI_CRAWLERS: CrawlerInfo[] = [
  // OpenAI
  {
    token: "GPTBot",
    company: "OpenAI",
    category: "training",
    purpose: "GPT model training",
    docsUrl: "https://platform.openai.com/docs/bots",
    respectsRobotsTxt: true,
  },
  {
    token: "OAI-SearchBot",
    company: "OpenAI",
    category: "search",
    purpose: "ChatGPT search citations",
    docsUrl: "https://platform.openai.com/docs/bots",
    respectsRobotsTxt: true,
  },
  {
    token: "ChatGPT-User",
    company: "OpenAI",
    category: "assistant",
    purpose: "User-initiated browsing",
    docsUrl: "https://platform.openai.com/docs/bots",
    respectsRobotsTxt: true,
  },

  // Anthropic
  {
    token: "ClaudeBot",
    company: "Anthropic",
    category: "training",
    purpose: "Claude model training",
    docsUrl: "https://support.claude.com/en/articles/8896518",
    respectsRobotsTxt: true,
  },
  {
    token: "Claude-SearchBot",
    company: "Anthropic",
    category: "search",
    purpose: "Claude search indexing",
    docsUrl: "https://support.claude.com/en/articles/8896518",
    respectsRobotsTxt: true,
  },
  {
    token: "Claude-User",
    company: "Anthropic",
    category: "assistant",
    purpose: "User-initiated fetching",
    docsUrl: "https://support.claude.com/en/articles/8896518",
    respectsRobotsTxt: true,
  },
  {
    token: "anthropic-ai",
    company: "Anthropic",
    category: "training",
    purpose: "Bulk training data (legacy)",
    docsUrl: "https://support.claude.com/en/articles/8896518",
    respectsRobotsTxt: true,
  },

  // Google
  {
    token: "Google-Extended",
    company: "Google",
    category: "training",
    purpose: "Gemini training/grounding (does NOT affect Search)",
    docsUrl: "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
    respectsRobotsTxt: true,
  },
  {
    token: "GoogleOther",
    company: "Google",
    category: "training",
    purpose: "R&D crawling by Google teams",
    docsUrl: "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
    respectsRobotsTxt: true,
  },
  {
    token: "Google-CloudVertexBot",
    company: "Google",
    category: "training",
    purpose: "Vertex AI Search/Agents",
    docsUrl: "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
    respectsRobotsTxt: true,
  },
  {
    token: "Gemini-Deep-Research",
    company: "Google",
    category: "assistant",
    purpose: "Gemini Deep Research",
    docsUrl: "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
    respectsRobotsTxt: true,
  },
  {
    token: "Google-NotebookLM",
    company: "Google",
    category: "assistant",
    purpose: "NotebookLM source fetching",
    docsUrl: "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
    respectsRobotsTxt: true,
  },

  // Meta
  {
    token: "meta-externalagent",
    company: "Meta",
    category: "training",
    purpose: "LLaMA model training",
    docsUrl: "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
    respectsRobotsTxt: true,
  },
  {
    token: "Meta-ExternalFetcher",
    company: "Meta",
    category: "assistant",
    purpose: "User-initiated AI fetches",
    docsUrl: "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
    respectsRobotsTxt: true,
  },

  // Microsoft
  {
    token: "AzureAI-SearchBot",
    company: "Microsoft",
    category: "search",
    purpose: "Azure AI search indexing",
    docsUrl: "https://www.bing.com/bingbot.htm",
    respectsRobotsTxt: true,
  },

  // Apple
  {
    token: "Applebot-Extended",
    company: "Apple",
    category: "training",
    purpose: "Apple Intelligence training",
    docsUrl: "https://support.apple.com/en-us/119829",
    respectsRobotsTxt: true,
  },

  // Amazon
  {
    token: "Amazonbot",
    company: "Amazon",
    category: "training",
    purpose: "Alexa/Rufus AI training",
    docsUrl: "https://developer.amazon.com/amazonbot",
    respectsRobotsTxt: true,
  },

  // Perplexity
  {
    token: "PerplexityBot",
    company: "Perplexity",
    category: "search",
    purpose: "Perplexity search indexing",
    docsUrl: "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
    respectsRobotsTxt: true,
  },
  {
    token: "Perplexity-User",
    company: "Perplexity",
    category: "assistant",
    purpose: "User-initiated browsing",
    docsUrl: "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
    respectsRobotsTxt: false,
  },

  // ByteDance
  {
    token: "Bytespider",
    company: "ByteDance",
    category: "training",
    purpose: "Doubao/Lark LLM training",
    docsUrl: "",
    respectsRobotsTxt: false,
  },

  // Common Crawl
  {
    token: "CCBot",
    company: "Common Crawl",
    category: "training",
    purpose: "Open web dataset used by many LLMs",
    docsUrl: "https://commoncrawl.org/ccbot",
    respectsRobotsTxt: true,
  },

  // Cohere
  {
    token: "cohere-ai",
    company: "Cohere",
    category: "training",
    purpose: "Cohere LLM training",
    docsUrl: "https://cohere.com",
    respectsRobotsTxt: true,
  },

  // Mistral
  {
    token: "MistralAI-User",
    company: "Mistral",
    category: "assistant",
    purpose: "Le Chat user browsing",
    docsUrl: "https://docs.mistral.ai/robots",
    respectsRobotsTxt: true,
  },

  // DuckDuckGo
  {
    token: "DuckAssistBot",
    company: "DuckDuckGo",
    category: "search",
    purpose: "AI-assisted answers",
    docsUrl: "http://duckduckgo.com/duckassistbot.html",
    respectsRobotsTxt: true,
  },

  // Diffbot
  {
    token: "Diffbot",
    company: "Diffbot",
    category: "training",
    purpose: "Structured data extraction",
    docsUrl: "https://diffbot.com",
    respectsRobotsTxt: true,
  },
];

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
      // Start new group or extend current if no rules yet
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
    } else if (directive === "crawl-delay") {
      // Valid directive but not supported by Google — note but don't error
    } else if (directive === "host") {
      // Yandex-specific, not in RFC 9309
    } else {
      errors.push(`Line ${lineNum}: Unknown directive "${directive}"`);
    }
  }

  return { groups, sitemaps, raw, errors };
}

// --- Matching (per RFC 9309) ---

function pathMatches(pattern: string, path: string): boolean {
  if (!pattern) return false;

  // Convert pattern to regex
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
  // Implicit trailing wildcard if no $ anchor
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
): { allowed: boolean; matchedRule: { type: "allow" | "disallow"; path: string } | null; matchedGroup: string | null } {
  const ua = userAgent.toLowerCase();

  // Find matching groups — specific match first, then wildcard
  let matchingGroup: RobotsGroup | null = null;
  let matchedGroupName: string | null = null;

  // 1. Try specific user-agent match
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

  // 2. Fall back to wildcard
  if (!matchingGroup) {
    for (const group of robots.groups) {
      if (group.userAgents.some((a) => a === "*")) {
        matchingGroup = group;
        matchedGroupName = "*";
        break;
      }
    }
  }

  // No matching group = allowed
  if (!matchingGroup) return { allowed: true, matchedRule: null, matchedGroup: null };

  // Find the most specific (longest path) matching rule
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

export function auditAiCrawlers(robots: RobotsTxt): CrawlerStatus[] {
  return AI_CRAWLERS.map((crawler) => {
    const result = isAllowed(robots, crawler.token, "/");
    return {
      name: crawler.token,
      company: crawler.company,
      category: crawler.category,
      purpose: crawler.purpose,
      docsUrl: crawler.docsUrl,
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
    headers: { "User-Agent": "Sitelint/0.1" },
    redirect: "follow",
  });

  if (res.status >= 400) {
    // Per RFC 9309: 4xx = no restrictions (all allowed)
    return { robotsTxt: { groups: [], sitemaps: [], raw: "", errors: [] }, statusCode: res.status };
  }

  const raw = await res.text();
  return { robotsTxt: parseRobotsTxt(raw), statusCode: res.status };
}
