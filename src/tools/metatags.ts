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

// --- Structured data validation (per Google Rich Results docs) ---

interface SchemaRule {
  required: string[];
  recommended: string[];
  imageFields: string[];
  nestedRequired?: Record<string, string[]>;
}

// Required/recommended fields sourced from Google's Rich Results documentation
// https://developers.google.com/search/docs/appearance/structured-data
const SCHEMA_RULES: Record<string, SchemaRule> = {
  WebSite: {
    required: ["name", "url"],
    recommended: ["potentialAction"],
    imageFields: [],
  },
  Organization: {
    required: ["name", "url"],
    recommended: ["logo", "sameAs", "contactPoint"],
    imageFields: ["logo"],
  },
  Article: {
    required: ["headline", "image", "datePublished", "author"],
    recommended: ["dateModified", "publisher"],
    imageFields: ["image"],
  },
  NewsArticle: {
    required: ["headline", "image", "datePublished", "author"],
    recommended: ["dateModified", "publisher"],
    imageFields: ["image"],
  },
  Product: {
    required: ["name", "image"],
    recommended: ["description", "offers", "brand", "review", "aggregateRating"],
    imageFields: ["image"],
    nestedRequired: { offers: ["price", "priceCurrency"] },
  },
  LocalBusiness: {
    required: ["name", "address"],
    recommended: ["telephone", "openingHoursSpecification", "image", "url"],
    imageFields: ["image"],
  },
  FAQPage: {
    required: ["mainEntity"],
    recommended: [],
    imageFields: [],
  },
  BreadcrumbList: {
    required: ["itemListElement"],
    recommended: [],
    imageFields: [],
  },
  Event: {
    required: ["name", "startDate", "location"],
    recommended: ["endDate", "image", "description", "offers", "organizer"],
    imageFields: ["image"],
  },
  Recipe: {
    required: ["name", "image"],
    recommended: ["author", "datePublished", "description", "recipeIngredient", "recipeInstructions"],
    imageFields: ["image"],
  },
  VideoObject: {
    required: ["name", "description", "thumbnailUrl", "uploadDate"],
    recommended: ["duration", "contentUrl", "embedUrl"],
    imageFields: ["thumbnailUrl"],
  },
  SoftwareApplication: {
    required: ["name", "offers"],
    recommended: ["applicationCategory", "operatingSystem", "review", "aggregateRating"],
    imageFields: ["image"],
    nestedRequired: { offers: ["price", "priceCurrency"] },
  },
  Dataset: {
    required: ["name", "description"],
    recommended: ["distribution", "creator", "license"],
    imageFields: [],
    nestedRequired: { distribution: ["contentUrl", "encodingFormat"] },
  },
  TechArticle: {
    required: ["headline", "image", "datePublished", "author"],
    recommended: ["dateModified", "publisher"],
    imageFields: ["image"],
  },
  BlogPosting: {
    required: ["headline", "image", "datePublished", "author"],
    recommended: ["dateModified", "publisher"],
    imageFields: ["image"],
  },
  HowTo: {
    required: ["name", "step"],
    recommended: ["image", "totalTime", "estimatedCost"],
    imageFields: ["image"],
  },
  Course: {
    required: ["name", "description"],
    recommended: ["provider", "offers"],
    imageFields: [],
  },
  JobPosting: {
    required: ["title", "description", "datePosted", "hiringOrganization"],
    recommended: ["employmentType", "jobLocation", "baseSalary", "validThrough"],
    imageFields: [],
  },
};

interface ValidationIssue {
  type: string;
  level: "required" | "recommended";
  field: string;
}

function getNestedValue(obj: Record<string, unknown>, field: string): unknown {
  const val = obj[field];
  if (val !== undefined && val !== null && val !== "") return val;
  // Check if it's a nested object with a value (e.g., logo might be {url: "..."} or a string)
  if (typeof val === "object" && val !== null) return val;
  return undefined;
}

function validateJsonLd(blocks: unknown[]): {
  issues: ValidationIssue[];
  imageUrls: string[];
  validatedTypes: Set<string>;
} {
  const issues: ValidationIssue[] = [];
  const imageUrls: string[] = [];
  const validatedTypes = new Set<string>();

  function validateBlock(data: unknown) {
    if (Array.isArray(data)) {
      for (const item of data) validateBlock(item);
      return;
    }
    if (!data || typeof data !== "object") return;

    const obj = data as Record<string, unknown>;
    const rawType = obj["@type"];
    const types = Array.isArray(rawType) ? rawType : rawType ? [rawType] : [];

    for (const type of types) {
      const rule = SCHEMA_RULES[String(type)];
      if (!rule) continue;
      validatedTypes.add(String(type));

      for (const field of rule.required) {
        if (getNestedValue(obj, field) === undefined) {
          issues.push({ type: String(type), level: "required", field });
        }
      }

      for (const field of rule.recommended) {
        if (getNestedValue(obj, field) === undefined) {
          issues.push({ type: String(type), level: "recommended", field });
        }
      }

      // Check nested required fields (e.g., offers.price inside Product)
      if (rule.nestedRequired) {
        for (const [parent, fields] of Object.entries(rule.nestedRequired)) {
          const parentVal = obj[parent];
          if (parentVal && typeof parentVal === "object") {
            const targets = Array.isArray(parentVal) ? parentVal : [parentVal];
            for (const target of targets) {
              if (target && typeof target === "object") {
                const nested = target as Record<string, unknown>;
                for (const field of fields) {
                  if (nested[field] === undefined || nested[field] === null || nested[field] === "") {
                    issues.push({ type: String(type), level: "required", field: `${parent}.${field}` });
                  }
                }
                break; // Only check the first item in arrays
              }
            }
          }
        }
      }

      // Collect image URLs for validation
      for (const field of rule.imageFields) {
        const val = obj[field];
        if (typeof val === "string" && val.startsWith("http")) {
          imageUrls.push(val);
        } else if (val && typeof val === "object") {
          const nested = val as Record<string, unknown>;
          const url = nested.url ?? nested.contentUrl;
          if (typeof url === "string" && url.startsWith("http")) {
            imageUrls.push(url);
          }
        }
      }
    }

    // Recurse into nested objects and arrays (e.g., @graph)
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) validateBlock(item);
      } else if (val && typeof val === "object") {
        validateBlock(val);
      }
    }
  }

  for (const block of blocks) validateBlock(block);
  return { issues, imageUrls, validatedTypes };
}

// What each recommended field enables (sourced from Google Rich Results docs)
const FIELD_HINTS: Record<string, string> = {
  "WebSite.potentialAction": "enables sitelinks searchbox",
  "Organization.logo": "appears in knowledge panel",
  "Organization.contactPoint": "may appear in knowledge panel",
  "Organization.sameAs": "links social profiles in knowledge panel",
  "Article.dateModified": "shows freshness in search results",
  "Article.publisher": "required for some article rich results",
  "Product.offers": "enables price display in search",
  "Product.review": "enables star ratings in search",
  "Product.aggregateRating": "enables aggregate star ratings",
  "Product.brand": "shown in product rich results",
  "LocalBusiness.openingHoursSpecification": "shows business hours in maps",
  "LocalBusiness.image": "shown in local pack results",
  "Event.image": "shown in event rich results",
  "Event.offers": "shows ticket prices in search",
  "Recipe.author": "shown in recipe rich results",
  "VideoObject.duration": "shown in video rich results",
  "SoftwareApplication.applicationCategory": "shown in software rich results",
  "SoftwareApplication.operatingSystem": "shown in software rich results",
  "SoftwareApplication.review": "enables star ratings",
  "SoftwareApplication.aggregateRating": "enables aggregate star ratings",
  "Dataset.distribution": "enables dataset download in search",
  "Dataset.creator": "shown in dataset rich results",
  "Dataset.license": "shown in dataset rich results",
  "Course.provider": "shown in course rich results",
  "Course.offers": "enables price display for courses",
  "JobPosting.employmentType": "shown in job search results",
  "JobPosting.jobLocation": "shown in job search results",
  "JobPosting.baseSalary": "enables salary display in job search",
};

function formatValidation(issues: ValidationIssue[], validatedTypes: Set<string>): string[] {
  const lines: string[] = [];

  // Show PASS for types with no required issues
  const typesWithRequiredIssues = new Set(issues.filter((i) => i.level === "required").map((i) => i.type));
  for (const type of validatedTypes) {
    if (!typesWithRequiredIssues.has(type)) {
      lines.push(`PASS     ${type} — all required fields present`);
    }
  }

  const required = issues.filter((i) => i.level === "required");
  const recommended = issues.filter((i) => i.level === "recommended");

  if (required.length > 0) {
    for (const i of required) {
      lines.push(`MISSING  ${i.type}.${i.field} (required for Rich Results)`);
    }
  }
  if (recommended.length > 0) {
    for (const i of recommended) {
      const hint = FIELD_HINTS[`${i.type}.${i.field}`];
      lines.push(`OPTIONAL ${i.type}.${i.field}${hint ? ` — ${hint}` : ""}`);
    }
  }

  return lines;
}

interface RedirectHop {
  url: string;
  status: number;
}

interface ImageCheck {
  url: string;
  tag: string;
  status: number | null;
  contentType: string | null;
  contentLength: number | null;
  error: string | null;
}

async function followRedirects(
  url: string,
  ua: string,
  maxHops = 10,
): Promise<{ chain: RedirectHop[]; response: Response }> {
  const chain: RedirectHop[] = [];
  let current = url;

  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(current, {
      headers: { "User-Agent": ua, Accept: "text/html" },
      redirect: "manual",
    });

    chain.push({ url: current, status: res.status });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      current = new URL(location, current).href;
      continue;
    }

    return { chain, response: res };
  }

  // If we exhausted hops, do a final follow-redirect fetch
  const res = await fetch(current, {
    headers: { "User-Agent": ua, Accept: "text/html" },
    redirect: "follow",
  });
  return { chain, response: res };
}

async function checkImage(imageUrl: string, tag: string): Promise<ImageCheck> {
  try {
    const res = await fetch(imageUrl, { method: "HEAD", redirect: "follow" });
    return {
      url: imageUrl,
      tag,
      status: res.status,
      contentType: res.headers.get("content-type"),
      contentLength: res.headers.has("content-length") ? Number(res.headers.get("content-length")) : null,
      error: null,
    };
  } catch (err) {
    return {
      url: imageUrl,
      tag,
      status: null,
      contentType: null,
      contentLength: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
        const { chain, response: res } = await followRedirects(url, ua);

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
        const output: string[] = [];

        // Redirect chain (only if there were redirects)
        if (chain.length > 1) {
          output.push("--- Redirect Chain ---", "");
          const parts: string[] = [];
          for (const hop of chain) {
            parts.push(hop.url);
            parts.push(String(hop.status));
          }
          // Format: URL → status → URL → status (drop trailing status)
          parts.pop();
          output.push(parts.join(" → "));
          output.push(`Hops: ${chain.length - 1}`);
          output.push("");
        }

        // Main meta tag report
        const finalUrl = chain.length > 1 ? chain[chain.length - 1].url : url;
        output.push(formatMetatags(finalUrl, parsed));

        // OG/Twitter image validation
        const ogImage = getMeta(parsed.meta, "og:image");
        const twitterImage = getMeta(parsed.meta, "twitter:image");
        const imagesToCheck: Array<{ url: string; tag: string }> = [];
        if (ogImage) imagesToCheck.push({ url: ogImage, tag: "og:image" });
        if (twitterImage && twitterImage !== ogImage) imagesToCheck.push({ url: twitterImage, tag: "twitter:image" });

        if (imagesToCheck.length > 0) {
          const checks = await Promise.all(imagesToCheck.map((img) => checkImage(img.url, img.tag)));
          output.push("", "--- Image Validation ---", "");
          for (const check of checks) {
            if (check.error) {
              output.push(`${check.tag}: FAILED — ${check.error}`);
              output.push(`  URL: ${check.url}`);
            } else if (check.status && check.status >= 400) {
              output.push(`${check.tag}: BROKEN — HTTP ${check.status}`);
              output.push(`  URL: ${check.url}`);
            } else {
              const sizeKB = check.contentLength ? Math.round(check.contentLength / 1024) : null;
              const size = sizeKB ? ` (${sizeKB} KB)` : "";
              const type = check.contentType ? ` ${check.contentType}` : "";
              output.push(`${check.tag}: OK —${type}${size}`);
              if (sizeKB && sizeKB > 1024) {
                output.push(`  Warning: ${sizeKB} KB is large for social previews — consider compressing below 1 MB`);
              }
            }

            // Check declared dimensions from meta tags
            if (check.tag === "og:image") {
              const w = getMeta(parsed.meta, "og:image:width");
              const h = getMeta(parsed.meta, "og:image:height");
              if (w && h) {
                output.push(`  Declared dimensions: ${w}x${h}`);
                const wn = Number(w);
                const hn = Number(h);
                if (wn && hn && (wn < 1200 || hn < 630)) {
                  output.push(`  Note: recommended minimum for og:image is 1200x630`);
                }
              }
            }
          }
        }

        // Structured data validation
        if (parsed.jsonLd.length > 0) {
          const { issues, imageUrls, validatedTypes } = validateJsonLd(parsed.jsonLd);
          if (validatedTypes.size > 0 || imageUrls.length > 0) {
            output.push("", "--- Structured Data Validation ---", "");
            output.push(...formatValidation(issues, validatedTypes));

            // HEAD-check image URLs from structured data
            if (imageUrls.length > 0) {
              const deduped = [...new Set(imageUrls)];
              const imgChecks = await Promise.all(deduped.map((u) => checkImage(u, "schema")));
              for (const check of imgChecks) {
                if (check.error) {
                  output.push(`BROKEN   Image: ${check.url} — ${check.error}`);
                } else if (check.status && check.status >= 400) {
                  output.push(`BROKEN   Image: ${check.url} — HTTP ${check.status}`);
                } else {
                  const sizeKB = check.contentLength ? Math.round(check.contentLength / 1024) : null;
                  output.push(`OK       Image: ${check.url}${sizeKB ? ` (${sizeKB} KB)` : ""}`);
                }
              }
            }
          }
        }

        return {
          content: [{ type: "text", text: output.join("\n") }],
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
