import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface MetaTag {
  name?: string;
  property?: string;
  content: string;
}

interface ParsedHead {
  title: string | null;
  charset: string | null;
  canonical: string | null;
  meta: MetaTag[];
  hreflang: Array<{ lang: string; href: string }>;
  jsonLd: unknown[];
}

function parseHead(html: string): ParsedHead {
  // Extract <head> content (case-insensitive, handles attributes on <head>)
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch?.[1] ?? html;

  // Title
  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Charset
  const charsetMatch = head.match(/<meta\s+charset=["']([^"']+)["']/i) ?? head.match(/charset=["']?([^"'\s;>]+)/i);
  const charset = charsetMatch ? charsetMatch[1] : null;

  // Canonical
  const canonicalMatch = head.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  const canonical = canonicalMatch ? canonicalMatch[1] : null;

  // Meta tags (name=... content=... and property=... content=...)
  const meta: MetaTag[] = [];
  for (const m of head.matchAll(/<meta\s+([^>]*?)>/gi)) {
    const attrs = m[1];
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
    const propMatch = attrs.match(/property=["']([^"']+)["']/i);
    const contentMatch = attrs.match(/content=["']([^"']*?)["']/i);
    if (contentMatch && (nameMatch || propMatch)) {
      meta.push({
        name: nameMatch?.[1],
        property: propMatch?.[1],
        content: contentMatch[1],
      });
    }
  }

  // Hreflang
  const hreflang: Array<{ lang: string; href: string }> = [];
  const hreflangRegex =
    /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  const hreflangRegex2 =
    /<link[^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*>/gi;
  const hreflangRegex3 =
    /<link[^>]*href=["']([^"']+)["'][^>]*hreflang=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*>/gi;
  for (const rx of [hreflangRegex, hreflangRegex2]) {
    for (const hm of head.matchAll(rx)) {
      hreflang.push({ lang: hm[1], href: hm[2] });
    }
  }
  for (const hm of head.matchAll(hreflangRegex3)) {
    hreflang.push({ lang: hm[2], href: hm[1] });
  }

  // JSON-LD
  const jsonLd: unknown[] = [];
  for (const ld of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      jsonLd.push(JSON.parse(ld[1]));
    } catch {
      // malformed JSON-LD, skip
    }
  }

  return { title, charset, canonical, meta, hreflang, jsonLd };
}

function getMeta(meta: MetaTag[], key: string): string | null {
  const tag = meta.find(
    (m) => m.name?.toLowerCase() === key.toLowerCase() || m.property?.toLowerCase() === key.toLowerCase(),
  );
  return tag?.content ?? null;
}

function getAllMeta(meta: MetaTag[], prefix: string): Array<{ key: string; value: string }> {
  const results: Array<{ key: string; value: string }> = [];
  for (const tag of meta) {
    const key = tag.property ?? tag.name ?? "";
    if (key.toLowerCase().startsWith(prefix.toLowerCase())) {
      results.push({ key, value: tag.content });
    }
  }
  return results;
}

function formatJsonLd(data: unknown, indent = 0): string[] {
  const lines: string[] = [];
  const pad = "  ".repeat(indent);

  if (Array.isArray(data)) {
    for (const item of data) {
      lines.push(...formatJsonLd(item, indent));
    }
    return lines;
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const type = obj["@type"];
    if (type) lines.push(`${pad}@type: ${Array.isArray(type) ? type.join(", ") : type}`);

    for (const [key, val] of Object.entries(obj)) {
      if (key.startsWith("@") && key !== "@type") continue;
      if (key === "@type") continue;
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        const str = String(val);
        lines.push(`${pad}${key}: ${str.length > 100 ? `${str.slice(0, 100)}...` : str}`);
      } else if (Array.isArray(val)) {
        lines.push(`${pad}${key}: [${val.length} items]`);
      } else if (val && typeof val === "object") {
        const nested = val as Record<string, unknown>;
        if (nested["@type"]) {
          lines.push(`${pad}${key}:`);
          lines.push(...formatJsonLd(nested, indent + 1));
        }
      }
    }
  }

  return lines;
}

function formatMetatags(url: string, parsed: ParsedHead): string {
  const lines: string[] = [`=== Meta Tags: ${url} ===`, ""];

  // Document
  lines.push("--- Document ---", "");
  lines.push(`Title: ${parsed.title ? `"${parsed.title}"` : "(missing)"}`);
  lines.push(
    `Description: ${getMeta(parsed.meta, "description") ? `"${getMeta(parsed.meta, "description")}"` : "(missing)"}`,
  );
  lines.push(`Charset: ${parsed.charset ?? "(missing)"}`);
  lines.push(`Viewport: ${getMeta(parsed.meta, "viewport") ?? "(missing)"}`);
  lines.push(`Canonical: ${parsed.canonical ?? "(not set)"}`);
  const robots = getMeta(parsed.meta, "robots");
  if (robots) lines.push(`Robots: ${robots}`);
  const author = getMeta(parsed.meta, "author");
  if (author) lines.push(`Author: ${author}`);
  lines.push("");

  // Open Graph
  const ogTags = getAllMeta(parsed.meta, "og:");
  lines.push("--- Open Graph ---", "");
  if (ogTags.length > 0) {
    for (const tag of ogTags) {
      lines.push(`${tag.key}: ${tag.value}`);
    }
  } else {
    lines.push("(none found)");
  }
  lines.push("");

  // Twitter Card
  const twitterTags = getAllMeta(parsed.meta, "twitter:");
  lines.push("--- Twitter Card ---", "");
  if (twitterTags.length > 0) {
    for (const tag of twitterTags) {
      lines.push(`${tag.key}: ${tag.value}`);
    }
  } else {
    lines.push("(none found)");
  }
  lines.push("");

  // Structured Data
  lines.push("--- Structured Data (JSON-LD) ---", "");
  if (parsed.jsonLd.length > 0) {
    for (let i = 0; i < parsed.jsonLd.length; i++) {
      if (i > 0) lines.push("");
      lines.push(`Block ${i + 1}:`);
      lines.push(...formatJsonLd(parsed.jsonLd[i], 1));
    }
  } else {
    lines.push("(none found)");
  }
  lines.push("");

  // Hreflang
  if (parsed.hreflang.length > 0) {
    lines.push("--- Alternate Languages ---", "");
    for (const h of parsed.hreflang) {
      lines.push(`${h.lang}: ${h.href}`);
    }
    lines.push("");
  }

  // Summary of missing tags relevant to search and social
  const missing: string[] = [];
  if (!parsed.title) missing.push("title");
  if (!getMeta(parsed.meta, "description")) missing.push("meta description");
  if (!parsed.canonical) missing.push("canonical URL");
  if (ogTags.length === 0) missing.push("Open Graph tags");
  else {
    if (!getMeta(parsed.meta, "og:image")) missing.push("og:image");
  }
  if (twitterTags.length === 0) missing.push("Twitter Card tags");
  if (parsed.jsonLd.length === 0) missing.push("structured data (JSON-LD)");

  if (missing.length > 0) {
    lines.push("--- Not Found ---", "");
    for (const m of missing) {
      lines.push(`- ${m}`);
    }
  }

  return lines.join("\n");
}

export function registerMetatagsTool(server: McpServer): void {
  server.tool(
    "metatags",
    "Fetch a page and report its meta tags, Open Graph, Twitter Card, canonical URL, structured data (JSON-LD), and hreflang. Shows what search engines and social platforms see.",
    {
      url: z.string().url().describe("The URL to fetch and analyze."),
      user_agent: z.string().optional().describe("Custom User-Agent string. Default: Googlebot-compatible."),
    },
    async ({ url, user_agent }) => {
      try {
        const ua = user_agent ?? "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
        const res = await fetch(url, {
          headers: {
            "User-Agent": ua,
            Accept: "text/html",
          },
          redirect: "follow",
        });

        if (!res.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Error fetching ${url}: HTTP ${res.status} ${res.statusText}`,
              },
            ],
          };
        }

        const html = await res.text();
        const parsed = parseHead(html);
        const finalUrl = res.url !== url ? `(redirected to ${res.url})\n\n` : "";

        return {
          content: [
            {
              type: "text",
              text: `${finalUrl}${formatMetatags(res.url, parsed)}`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error fetching meta tags: ${msg}` }],
        };
      }
    },
  );
}
