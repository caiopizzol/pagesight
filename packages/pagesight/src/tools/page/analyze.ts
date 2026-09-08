import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { parseHead, getMeta, formatMetatags } from "./metadata.js";
import { validateJsonLd, formatValidation } from "./structured-data.js";
import {
  followRedirects,
  checkImage,
  checkLink,
  extractInternalLinks,
  formatLinkResults,
  type LinkResult,
} from "./links.js";
import { parseHex, relativeLuminance, contrastRatio, wcagLevel, toHex, findNearestPassing } from "./contrast.js";

export async function analyzePage(
  url: string,
  options: {
    check_links?: boolean;
    user_agent?: string;
    foreground?: string;
    background?: string;
    large_text?: boolean;
  },
): Promise<CallToolResult> {
  const { check_links, user_agent, foreground, background, large_text } = options;
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
              output.push("  Note: recommended minimum for og:image is 1200x630");
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

    if (foreground && background) {
      const fg = parseHex(foreground);
      const bg = parseHex(background);
      if (fg && bg) {
        const fgLum = relativeLuminance(...fg);
        const bgLum = relativeLuminance(...bg);
        const ratio = contrastRatio(fgLum, bgLum);
        const isLarge = large_text ?? false;
        const level = wcagLevel(ratio, isLarge);
        const aaThreshold = isLarge ? 3 : 4.5;
        const aaaThreshold = isLarge ? 4.5 : 7;
        output.push(
          "",
          "--- Contrast Check ---",
          "",
          `Foreground: ${toHex(...fg)}  Background: ${toHex(...bg)}`,
          `Ratio: ${ratio.toFixed(2)}:1  AA: ${ratio >= aaThreshold ? "PASS" : "FAIL"}  AAA: ${ratio >= aaaThreshold ? "PASS" : "FAIL"}  Result: ${level}`,
        );
        if (ratio < aaThreshold) {
          const suggested = findNearestPassing(fg, bg, aaThreshold);
          output.push(`Nearest AA-passing foreground: ${suggested}`);
        }
      }
    }

    // --- Link check (last section) ---
    if (check_links !== false) {
      const origin = new URL(url).origin;
      const links = extractInternalLinks(html, origin);

      if (links.length === 0) {
        output.push(
          "",
          "--- Internal Links ---",
          "",
          "No internal links found.",
          "Note: this page may use client-side rendering (SPA). Only static <a href> links in the HTML are detected.",
        );
      } else {
        const concurrency = 5;
        const results: LinkResult[] = [];
        let i = 0;

        while (i < links.length) {
          const batch = links.slice(i, i + concurrency);
          const settled = await Promise.all(batch.map((href) => checkLink(href)));
          results.push(...settled);
          i += concurrency;
        }

        output.push("", formatLinkResults(url, results));
      }
    }

    return {
      content: [{ type: "text", text: output.join("\n") }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error analyzing page: ${msg}` }],
    };
  }
}
