import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface LinkResult {
  href: string;
  status: number | null;
  redirectChain: Array<{ url: string; status: number }>;
  finalUrl: string | null;
  error: string | null;
}

async function checkLink(href: string): Promise<LinkResult> {
  const chain: Array<{ url: string; status: number }> = [];
  let current = href;

  try {
    for (let i = 0; i < 10; i++) {
      const res = await fetch(current, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", Accept: "text/html" },
        redirect: "manual",
      });

      chain.push({ url: current, status: res.status });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;
        current = new URL(location, current).href;
        continue;
      }

      return {
        href,
        status: res.status,
        redirectChain: chain,
        finalUrl: chain.length > 1 ? current : null,
        error: null,
      };
    }

    return {
      href,
      status: chain[chain.length - 1]?.status ?? null,
      redirectChain: chain,
      finalUrl: current,
      error: "Too many redirects",
    };
  } catch (err) {
    return {
      href,
      status: null,
      redirectChain: chain,
      finalUrl: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function extractInternalLinks(html: string, origin: string): string[] {
  const links = new Set<string>();

  for (const match of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)/gi)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;

    try {
      const resolved = new URL(raw, origin).href;
      if (resolved.startsWith(origin) && !resolved.includes("/cdn-cgi/")) {
        links.add(resolved);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return [...links];
}

function formatResults(url: string, results: LinkResult[]): string {
  const lines: string[] = [`=== Internal Links: ${url} ===`, `Found ${results.length} internal links`, ""];

  const broken = results.filter((r) => r.error || (r.status && r.status >= 400));
  const redirected = results.filter((r) => !r.error && r.redirectChain.length > 1 && r.status && r.status < 400);
  const ok = results.filter((r) => !r.error && r.redirectChain.length === 1 && r.status && r.status < 400);

  // Summary
  lines.push("--- Summary ---", "");
  lines.push(`OK: ${ok.length}`);
  if (redirected.length > 0) lines.push(`Redirected: ${redirected.length}`);
  if (broken.length > 0) lines.push(`Broken: ${broken.length}`);
  lines.push("");

  // Broken links
  if (broken.length > 0) {
    lines.push("--- Broken Links ---", "");
    for (const r of broken) {
      if (r.error) {
        lines.push(`FAIL  ${r.href}`);
        lines.push(`      Error: ${r.error}`);
      } else {
        lines.push(`FAIL  ${r.href} → ${r.status}`);
      }
    }
    lines.push("");
  }

  // Redirect chains
  if (redirected.length > 0) {
    lines.push("--- Redirect Chains ---", "");
    for (const r of redirected) {
      const hops = r.redirectChain.length - 1;
      const chainStr = r.redirectChain.map((h) => `${h.status}`).join(" → ");
      lines.push(`REDIRECT  ${r.href}`);
      lines.push(`          ${chainStr} → ${r.finalUrl} (${hops} hop${hops > 1 ? "s" : ""})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function registerLinksTool(server: McpServer): void {
  server.tool(
    "links",
    "Check internal links on a page. Fetches the page, extracts all internal <a href> links, and checks each for broken links (404/5xx), redirect chains, and errors.",
    {
      url: z.string().url().describe("The page URL to check internal links for."),
    },
    async ({ url }) => {
      try {
        const origin = new URL(url).origin;

        // Fetch the page
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", Accept: "text/html" },
          redirect: "follow",
        });

        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Error fetching ${url}: HTTP ${res.status}` }],
          };
        }

        const html = await res.text();
        const links = extractInternalLinks(html, origin);

        if (links.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No internal links found on ${url}\nNote: this page may use client-side rendering (SPA). Only static <a href> links in the HTML are detected.`,
              },
            ],
          };
        }

        // Check links with concurrency 5
        const concurrency = 5;
        const results: LinkResult[] = [];
        let i = 0;

        while (i < links.length) {
          const batch = links.slice(i, i + concurrency);
          const settled = await Promise.all(batch.map((href) => checkLink(href)));
          results.push(...settled);
          i += concurrency;
        }

        return {
          content: [{ type: "text", text: formatResults(url, results) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error checking links: ${msg}` }],
        };
      }
    },
  );
}
