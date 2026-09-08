import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type GscSitemap, inspectUrl, listSitemaps } from "../providers/gsc.js";
import { RequestError } from "../shared/http.js";
import { type PsiCategoryType, type PsiResult, runPagespeed } from "../providers/pagespeed.js";
import { auditAiCrawlers, fetchRobotsTxt, isAllowed } from "../web/robots.js";

type Severity = "HIGH" | "MEDIUM" | "LOW";

interface Finding {
  severity: Severity;
  message: string;
  source: string;
}

// --- Metatags (inline, no external dep needed) ---

interface MetaCheckResult {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogImage: string | null;
  ogTitle: string | null;
  twitterCard: string | null;
  hasJsonLd: boolean;
  redirectCount: number;
  finalUrl: string;
}

async function checkMeta(url: string): Promise<MetaCheckResult> {
  let current = url;
  let redirectCount = 0;

  for (let i = 0; i < 10; i++) {
    const res = await fetch(current, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", Accept: "text/html" },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      current = new URL(location, current).href;
      redirectCount++;
      continue;
    }

    const html = await res.text();
    const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? html;

    const getMeta = (key: string) => {
      const nameMatch = head.match(new RegExp(`<meta[^>]*name=["']${key}["'][^>]*content=["']([^"']*?)["']`, "i"));
      const propMatch = head.match(new RegExp(`<meta[^>]*property=["']${key}["'][^>]*content=["']([^"']*?)["']`, "i"));
      return nameMatch?.[1] ?? propMatch?.[1] ?? null;
    };

    return {
      title: head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null,
      description: getMeta("description"),
      canonical: head.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null,
      ogImage: getMeta("og:image"),
      ogTitle: getMeta("og:title"),
      twitterCard: getMeta("twitter:card"),
      hasJsonLd: /<script[^>]*type=["']application\/ld\+json["']/i.test(html),
      redirectCount,
      finalUrl: current,
    };
  }

  // The hop limit or a redirect without Location prevented a page response.
  return {
    title: null,
    description: null,
    canonical: null,
    ogImage: null,
    ogTitle: null,
    twitterCard: null,
    hasJsonLd: false,
    redirectCount,
    finalUrl: current,
  };
}

// --- Audit logic ---

function addMetaFindings(meta: MetaCheckResult, findings: Finding[]) {
  if (!meta.title) findings.push({ severity: "HIGH", message: "Missing <title> tag", source: "metatags" });
  if (!meta.description) findings.push({ severity: "HIGH", message: "Missing meta description", source: "metatags" });
  if (!meta.canonical) findings.push({ severity: "HIGH", message: "Missing canonical URL", source: "metatags" });
  if (!meta.ogImage)
    findings.push({ severity: "MEDIUM", message: "Missing og:image — no social preview image", source: "metatags" });
  if (!meta.ogTitle) findings.push({ severity: "MEDIUM", message: "Missing Open Graph tags", source: "metatags" });
  if (!meta.twitterCard) findings.push({ severity: "LOW", message: "Missing Twitter Card tags", source: "metatags" });
  if (!meta.hasJsonLd)
    findings.push({ severity: "LOW", message: "No structured data (JSON-LD) found", source: "metatags" });
  if (meta.redirectCount > 2)
    findings.push({
      severity: "MEDIUM",
      message: `Redirect chain has ${meta.redirectCount} hops — consider reducing`,
      source: "metatags",
    });
}

function addPagespeedFindings(result: PsiResult, findings: Finding[]) {
  const lhr = result.lighthouseResult;

  for (const cat of Object.values(lhr.categories)) {
    const score = cat.score !== null ? Math.round(cat.score * 100) : null;
    if (score === null) continue;

    if (cat.id === "performance" && score < 50) {
      findings.push({ severity: "HIGH", message: `Performance score: ${score}/100`, source: "pagespeed" });
    } else if (cat.id === "performance" && score < 90) {
      findings.push({ severity: "MEDIUM", message: `Performance score: ${score}/100`, source: "pagespeed" });
    }

    if (cat.id === "accessibility" && score < 90) {
      const sev = score < 70 ? "HIGH" : "MEDIUM";
      findings.push({ severity: sev, message: `Accessibility score: ${score}/100`, source: "pagespeed" });
    }

    if (cat.id === "seo" && score < 90) {
      findings.push({ severity: "MEDIUM", message: `SEO score: ${score}/100`, source: "pagespeed" });
    }
  }

  // Flag specific high-impact audits
  const renderBlocking = lhr.audits["render-blocking-insight"] ?? lhr.audits["render-blocking-resources"];
  if (renderBlocking?.score === 0 && renderBlocking.details?.items) {
    const fontItems = renderBlocking.details.items.filter((i) => i.url && String(i.url).includes("fonts"));
    if (fontItems.length > 0) {
      const wastedMs = fontItems.reduce((sum, i) => sum + (i.wastedMs ? Number(i.wastedMs) : 0), 0);
      const isGoogleFonts = fontItems.some((i) => String(i.url).includes("fonts.googleapis.com"));
      const label = isGoogleFonts ? "Render-blocking Google Fonts" : "Render-blocking font CSS";
      findings.push({
        severity: "MEDIUM",
        message: `${label} (${Math.round(wastedMs)}ms wasted)`,
        source: "pagespeed",
      });
    }
  }

  // FCP / LCP
  const fcp = lhr.audits["first-contentful-paint"];
  if (fcp?.numericValue && fcp.numericValue > 2500) {
    findings.push({
      severity: "MEDIUM",
      message: `FCP ${(fcp.numericValue / 1000).toFixed(1)}s — above 2.5s threshold`,
      source: "pagespeed",
    });
  }

  const lcp = lhr.audits["largest-contentful-paint"];
  if (lcp?.numericValue && lcp.numericValue > 2500) {
    findings.push({
      severity: lcp.numericValue > 4000 ? "HIGH" : "MEDIUM",
      message: `LCP ${(lcp.numericValue / 1000).toFixed(1)}s — above 2.5s threshold`,
      source: "pagespeed",
    });
  }
}

function addRobotsFindings(
  robotsTxt: string | null,
  blockedAiCrawlers: number,
  totalAiCrawlers: number,
  googlebotAllowed: boolean,
  findings: Finding[],
) {
  if (robotsTxt === null) {
    findings.push({ severity: "LOW", message: "No robots.txt found", source: "robots" });
    return;
  }
  if (!googlebotAllowed) {
    findings.push({ severity: "HIGH", message: "Googlebot is blocked by robots.txt", source: "robots" });
  }
  if (blockedAiCrawlers > 0) {
    findings.push({
      severity: "LOW",
      message: `${blockedAiCrawlers}/${totalAiCrawlers} AI crawlers blocked`,
      source: "robots",
    });
  }
}

export function addSitemapFindings(sitemaps: GscSitemap[], findings: Finding[]) {
  if (sitemaps.length === 0) {
    findings.push({ severity: "MEDIUM", message: "No sitemaps submitted to GSC", source: "sitemaps" });
  }
  // contents[].indexed is deprecated; sitemap submission is not indexing evidence.
  // https://developers.google.com/webmaster-tools/v1/sitemaps
  for (const sitemap of sitemaps) {
    if (Number(sitemap.errors) > 0) {
      findings.push({
        severity: "HIGH",
        message: `${sitemap.path}: ${sitemap.errors} sitemap errors`,
        source: "sitemaps",
      });
    }
    if (Number(sitemap.warnings) > 0) {
      findings.push({
        severity: "MEDIUM",
        message: `${sitemap.path}: ${sitemap.warnings} sitemap warnings`,
        source: "sitemaps",
      });
    }
  }
}

function addInspectFindings(verdict: string, coverageState: string, findings: Finding[]) {
  if (verdict === "FAIL") {
    findings.push({ severity: "HIGH", message: `URL not indexed: ${coverageState}`, source: "inspect" });
  } else if (verdict !== "PASS") {
    findings.push({ severity: "MEDIUM", message: `Index status: ${coverageState}`, source: "inspect" });
  }
}

function formatAudit(url: string, findings: Finding[], errors: string[]): string {
  const lines: string[] = [`=== Site Audit: ${url} ===`, ""];

  // Lead with errors so partial results are obvious
  if (errors.length > 0) {
    lines.push(`${errors.length} check${errors.length > 1 ? "s" : ""} failed — results below are partial:`, "");
    for (const e of errors) {
      lines.push(`  FAIL  ${e}`);
    }
    lines.push("");
  }

  const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  if (findings.length === 0 && errors.length === 0) {
    lines.push("No issues found.");
  } else if (findings.length > 0) {
    lines.push(`${findings.length} finding${findings.length > 1 ? "s" : ""}:`, "");
    for (const f of findings) {
      lines.push(`${f.severity.padEnd(6)}  ${f.message}`);
    }
  }

  return lines.join("\n");
}

export function registerAuditTool(server: McpServer): void {
  server.tool(
    "audit",
    "Run a comprehensive site audit. Checks PageSpeed scores, meta tags, robots.txt, sitemaps, and index status in one call. Returns a prioritized list of findings.",
    {
      url: z.string().url().describe("The URL to audit (e.g., 'https://example.com')."),
      site_url: z
        .string()
        .optional()
        .describe("GSC property for index/sitemap checks (e.g., 'sc-domain:example.com'). Omit to skip GSC checks."),
      strategy: z.enum(["mobile", "desktop"]).optional().describe("PageSpeed device strategy. Default: 'mobile'."),
    },
    async ({ url, site_url, strategy }) => {
      const findings: Finding[] = [];
      const errors: string[] = [];
      const origin = new URL(url).origin;

      const [metaResult, pagespeedResult, robotsResult, sitemapResult, inspectResult] = await Promise.allSettled([
        checkMeta(url),
        runPagespeed(url, {
          strategy: (strategy as "mobile" | "desktop") ?? "mobile",
          categories: ["performance", "accessibility", "seo", "best-practices"] as PsiCategoryType[],
        }),
        fetchRobotsTxt(origin).then(async ({ robotsTxt }) => {
          const crawlers = await auditAiCrawlers(robotsTxt);
          const { allowed: googlebotAllowed } = isAllowed(robotsTxt, "Googlebot", "/");
          return { robotsTxt, crawlers, googlebotAllowed };
        }),
        site_url ? listSitemaps(site_url) : Promise.resolve(null),
        site_url ? inspectUrl(url, site_url) : Promise.resolve(null),
      ]);

      // Process meta
      if (metaResult.status === "fulfilled") {
        addMetaFindings(metaResult.value, findings);
      } else {
        errors.push(`Meta tags: ${metaResult.reason}`);
      }

      // Process pagespeed
      if (pagespeedResult.status === "fulfilled") {
        addPagespeedFindings(pagespeedResult.value, findings);
      } else {
        const psiErr = String(pagespeedResult.reason);
        const status = pagespeedResult.reason instanceof RequestError ? pagespeedResult.reason.status : null;
        if (status === 403) {
          errors.push("PageSpeed: SKIPPED (API key not authorized — enable PageSpeed Insights API in Google Cloud)");
        } else if (status === 429) {
          errors.push("PageSpeed: SKIPPED (rate limited — try again later or set GOOGLE_API_KEY)");
        } else {
          errors.push(`PageSpeed: ${psiErr.replace(/:\s*\{[\s\S]*$/, "")}`);
        }
      }

      // Process robots
      if (robotsResult.status === "fulfilled") {
        const { robotsTxt, crawlers, googlebotAllowed } = robotsResult.value;
        const blocked = crawlers.filter((c) => !c.allowed).length;
        addRobotsFindings(robotsTxt.raw || null, blocked, crawlers.length, googlebotAllowed, findings);
      } else {
        errors.push(`Robots.txt: ${robotsResult.reason}`);
      }

      // Process sitemaps
      if (sitemapResult.status === "fulfilled" && sitemapResult.value) {
        addSitemapFindings(sitemapResult.value, findings);
      } else if (sitemapResult.status === "rejected") {
        errors.push(`Sitemaps: ${sitemapResult.reason}`);
      }

      // Process inspect
      if (inspectResult.status === "fulfilled" && inspectResult.value) {
        const idx = inspectResult.value.indexStatusResult;
        addInspectFindings(idx.verdict, idx.coverageState, findings);

        // Rich Results check
        const richResults = inspectResult.value.richResultsResult;
        if (richResults && richResults.verdict === "FAIL") {
          const failingTypes = (richResults.detectedItems ?? [])
            .filter((item) => item.items?.some((i) => (i.issues?.length ?? 0) > 0))
            .map((item) => item.richResultType);
          if (failingTypes.length > 0) {
            findings.push({
              severity: "MEDIUM",
              message: `Rich Results failing for: ${failingTypes.join(", ")}`,
              source: "inspect",
            });
          }
        }
      } else if (inspectResult.status === "rejected") {
        errors.push(`Inspect: ${inspectResult.reason}`);
      }

      return {
        content: [{ type: "text", text: formatAudit(url, findings, errors) }],
      };
    },
  );
}
