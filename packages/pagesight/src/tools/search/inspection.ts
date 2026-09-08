import { type InspectionResult, inspectUrl } from "../../providers/gsc.js";
import { type SearchOptions } from "./schema.js";
import { textResult } from "./result.js";
export function formatInspection(url: string, siteUrl: string, r: InspectionResult): string {
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
    lines.push("", "→ This page is not indexed. Request indexing manually in Google Search Console:", `  ${gscUrl}`);
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

  // Display deprecated mobile-usability evidence when supplied.
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

// ── Sample-inspect formatters ──

export function humanizeState(state: string): string {
  const map: Record<string, string> = {
    PAGE_FETCH_STATE_UNSPECIFIED: "not yet crawled",
    ROBOTS_TXT_STATE_UNSPECIFIED: "not yet checked",
    INDEXING_STATE_UNSPECIFIED: "not yet determined",
  };
  return map[state] ?? state;
}

// ── Coverage helpers ──

export interface InspectionSummary {
  url: string;
  verdict: string;
  coverageState: string;
  pageFetchState: string;
  robotsTxtState: string;
  indexingState: string;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  error: string | null;
}

export async function inspectSingle(url: string, siteUrl: string): Promise<InspectionSummary> {
  try {
    const r = await inspectUrl(url, siteUrl);
    const idx = r.indexStatusResult;
    return {
      url,
      verdict: idx.verdict,
      coverageState: idx.coverageState,
      pageFetchState: idx.pageFetchState,
      robotsTxtState: idx.robotsTxtState,
      indexingState: idx.indexingState,
      lastCrawlTime: idx.lastCrawlTime ?? null,
      googleCanonical: idx.googleCanonical ?? null,
      error: null,
    };
  } catch (err) {
    return {
      url,
      verdict: "ERROR",
      coverageState: "ERROR",
      pageFetchState: "ERROR",
      robotsTxtState: "ERROR",
      indexingState: "ERROR",
      lastCrawlTime: null,
      googleCanonical: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runInspect(options: SearchOptions) {
  const { site_url, url } = options;
  if (!url) return textResult("Error: url is required for inspect.");
  if (!site_url) return textResult("Error: site_url is required for inspect.");

  try {
    const result = await inspectUrl(url, site_url);
    return textResult(formatInspection(url, site_url, result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("PERMISSION_DENIED")) {
      const domain = new URL(url).hostname;
      return textResult(
        [
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
      );
    }
    return textResult(`Error inspecting URL: ${msg}`);
  }
}
