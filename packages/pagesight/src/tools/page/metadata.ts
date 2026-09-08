import { formatJsonLd } from "./structured-data.js";
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

export function parseHead(html: string): ParsedHead {
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

  // Dedup hreflang entries
  const seen = new Set<string>();
  const dedupedHreflang = hreflang.filter((h) => {
    const key = `${h.lang}:${h.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // JSON-LD
  const jsonLd: unknown[] = [];
  for (const ld of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      jsonLd.push(JSON.parse(ld[1]));
    } catch {
      // malformed JSON-LD, skip
    }
  }

  return { title, charset, canonical, meta, hreflang: dedupedHreflang, jsonLd };
}

export function getMeta(meta: MetaTag[], key: string): string | null {
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

export function formatMetatags(url: string, parsed: ParsedHead): string {
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

  // Length warnings
  if (parsed.title && parsed.title.length > 60) {
    lines.push(`WARN: title is ${parsed.title.length} chars — may truncate in search results (recommended: ≤60)`);
  }
  const desc = getMeta(parsed.meta, "description");
  if (desc && desc.length > 155) {
    lines.push(`WARN: description is ${desc.length} chars — may truncate in search results (recommended: ≤155)`);
  }

  // HTML entity warnings
  const entityCheck = [
    { label: "title", value: parsed.title },
    { label: "description", value: getMeta(parsed.meta, "description") },
    { label: "og:title", value: getMeta(parsed.meta, "og:title") },
    { label: "og:description", value: getMeta(parsed.meta, "og:description") },
  ];
  for (const { label, value } of entityCheck) {
    if (value && /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/i.test(value)) {
      lines.push(`WARN: ${label} contains HTML entities — may render incorrectly in social previews`);
    }
  }

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
  } else {
    // Warn if URL suggests locale-specific content but no hreflang
    const localePattern =
      /\/(?:en|es|fr|de|ja|ko|pt|zh|ru|it|nl|sv|da|fi|nb|pl|tr|ar|hi|th|vi|id|ms|uk|cs|ro|hu|el|he|bg|hr|sk|sl|sr|lt|lv|et|ca|gl|eu|cy)(?:[-_][a-z]{2,4})?(?:\/|$)/i;
    const checkUrl = parsed.canonical ?? url;
    if (localePattern.test(checkUrl)) {
      lines.push(
        "WARN: URL appears locale-specific but no hreflang tags found — search engines may not discover alternate language versions",
      );
      lines.push("");
    }
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
