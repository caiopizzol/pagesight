import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type InspectionResult, inspectUrl } from "../lib/gsc.js";

function formatInspection(url: string, siteUrl: string, r: InspectionResult): string {
  const idx = r.indexStatusResult;
  const lines: string[] = [
    `=== URL Inspection: ${url} ===`,
    `Property: ${siteUrl}`,
    "",
    "--- Index Status ---",
    "",
    `Verdict: ${idx.verdict}`,
    `Coverage: ${idx.coverageState}`,
    `Page fetch: ${idx.pageFetchState}`,
    `Robots.txt: ${idx.robotsTxtState}`,
    `Indexing: ${idx.indexingState}`,
    `Crawled as: ${idx.crawledAs ?? "unknown"}`,
  ];

  if (idx.lastCrawlTime) lines.push(`Last crawled: ${idx.lastCrawlTime}`);
  if (idx.userCanonical) lines.push(`Your canonical: ${idx.userCanonical}`);
  if (idx.googleCanonical) lines.push(`Google's canonical: ${idx.googleCanonical}`);

  if (idx.userCanonical && idx.googleCanonical && idx.userCanonical !== idx.googleCanonical) {
    lines.push(`\n⚠ CANONICAL MISMATCH: You declared "${idx.userCanonical}" but Google chose "${idx.googleCanonical}"`);
  }

  if (idx.sitemap && idx.sitemap.length > 0) {
    lines.push(`\nSitemaps: ${idx.sitemap.join(", ")}`);
  }

  if (idx.referringUrls && idx.referringUrls.length > 0) {
    lines.push(`\nReferring URLs: ${idx.referringUrls.join(", ")}`);
  }

  if (idx.verdict !== "PASS") {
    const gscUrl = `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(siteUrl)}&id=${encodeURIComponent(url)}`;
    lines.push("", `→ This page is not indexed. Request indexing manually in Google Search Console:`, `  ${gscUrl}`);
  }

  // Rich Results
  if (r.richResultsResult) {
    lines.push("", "--- Rich Results ---", "");
    lines.push(`Verdict: ${r.richResultsResult.verdict}`);

    for (const item of r.richResultsResult.detectedItems ?? []) {
      lines.push(`\nType: ${item.richResultType}`);
      for (const instance of item.items ?? []) {
        if (instance.name) lines.push(`  Name: ${instance.name}`);
        const issues = instance.issues ?? [];
        if (issues.length === 0) {
          lines.push("  Status: PASS");
        } else {
          for (const issue of issues) {
            lines.push(`  ${issue.severity}: ${issue.issueMessage}`);
          }
        }
      }
    }
  }

  // Mobile Usability (deprecated but still returned)
  if (r.mobileUsabilityResult) {
    lines.push("", "--- Mobile Usability (deprecated) ---", "");
    lines.push(`Verdict: ${r.mobileUsabilityResult.verdict}`);
    if (r.mobileUsabilityResult.issues) {
      for (const issue of r.mobileUsabilityResult.issues) {
        lines.push(`  ${issue.issueType}${issue.message ? `: ${issue.message}` : ""}`);
      }
    }
  }

  // Inspection link
  if (r.inspectionResultLink) {
    lines.push("", `Full report: ${r.inspectionResultLink}`);
  }

  return lines.join("\n");
}

export function registerInspectTool(server: McpServer): void {
  server.tool(
    "inspect",
    "Inspect a URL using Google Search Console. Returns index status, canonical, crawl status, rich results validation, and more — directly from Google's index.",
    {
      url: z.string().url().describe("The URL to inspect"),
      site_url: z.string().describe("The GSC property (e.g., 'https://example.com/' or 'sc-domain:example.com')"),
    },
    async ({ url, site_url }) => {
      try {
        const result = await inspectUrl(url, site_url);
        return { content: [{ type: "text", text: formatInspection(url, site_url, result) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("PERMISSION_DENIED")) {
          const domain = new URL(url).hostname;
          return {
            content: [
              {
                type: "text",
                text: [
                  `Error: Cannot inspect "${url}" — permission denied for property "${site_url}".`,
                  "",
                  "Possible causes:",
                  `  1. ${domain} is not a verified property in Google Search Console`,
                  `  2. The authenticated account does not have access to "${site_url}"`,
                  `  3. The property format is wrong — try "sc-domain:${domain}" or "https://${domain}/"`,
                  "",
                  "To verify a property: https://search.google.com/search-console",
                  "To check your auth: use the setup tool to verify credentials",
                ].join("\n"),
              },
            ],
          };
        }
        return { content: [{ type: "text", text: `Error inspecting URL: ${msg}` }] };
      }
    },
  );
}
