import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { parseHead, getMeta } from "./metadata.js";
import { validateJsonLd } from "./structured-data.js";
import { followRedirects, checkLink, extractInternalLinks } from "./links.js";

export async function analyzeBatch(
  urls: string[],
  options: { check_links?: boolean; user_agent?: string },
): Promise<CallToolResult> {
  const { check_links, user_agent } = options;
  const ua = user_agent ?? "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  const results: Array<{
    url: string;
    title: string;
    description: string;
    canonical: string;
    jsonLd: string;
    links: string;
    issues: string[];
    error?: string;
  }> = [];

  for (const pageUrl of urls) {
    try {
      const { chain, response: res } = await followRedirects(pageUrl, ua);
      if (!res.ok) {
        results.push({
          url: pageUrl,
          title: "-",
          description: "-",
          canonical: "-",
          jsonLd: "-",
          links: "-",
          issues: [`HTTP ${res.status}`],
        });
        continue;
      }
      const html = await res.text();
      const parsed = parseHead(html);
      const finalUrl = chain.length > 1 ? chain[chain.length - 1].url : pageUrl;

      const issues: string[] = [];
      if (!parsed.title) issues.push("no title");
      if (!getMeta(parsed.meta, "description")) issues.push("no description");
      else if ((getMeta(parsed.meta, "description") ?? "").length > 155) issues.push("description >155 chars");
      if (!parsed.canonical) issues.push("no canonical");
      if (parsed.jsonLd.length === 0) issues.push("no JSON-LD");
      if (chain.length > 2) issues.push(`${chain.length - 1} redirects`);

      // Quick link check
      let linkSummary = "-";
      if (check_links !== false) {
        const origin = new URL(finalUrl).origin;
        const links = extractInternalLinks(html, origin);
        if (links.length > 0) {
          const checked = await Promise.all(links.slice(0, 20).map((href) => checkLink(href)));
          const broken = checked.filter((r) => r.error || (r.status && r.status >= 400)).length;
          const redirected = checked.filter(
            (r) => !r.error && r.redirectChain.length > 1 && r.status && r.status < 400,
          ).length;
          const parts: string[] = [`${links.length} found`];
          if (broken > 0) parts.push(`${broken} broken`);
          if (redirected > 0) parts.push(`${redirected} redirected`);
          if (broken === 0 && redirected === 0) parts.push("all OK");
          linkSummary = parts.join(", ");
          if (broken > 0) issues.push(`${broken} broken links`);
          if (redirected > 0) issues.push(`${redirected} redirect chains`);
        } else {
          linkSummary = "0 (SPA?)";
        }
      }

      const jsonLdTypes = parsed.jsonLd
        .map((block) => {
          if (block && typeof block === "object" && "@type" in block)
            return String((block as Record<string, unknown>)["@type"]);
          return null;
        })
        .filter(Boolean);

      // Run structured data validation for batch summary
      let jsonLdSummary = "none";
      if (parsed.jsonLd.length > 0) {
        const { issues: valIssues } = validateJsonLd(parsed.jsonLd);
        const requiredMissing = valIssues.filter((i) => i.level === "required").length;
        if (jsonLdTypes.length > 0) {
          jsonLdSummary = `${jsonLdTypes.join(", ")} (selected fields only)`;
          if (requiredMissing > 0) {
            jsonLdSummary += ` (${requiredMissing} required missing)`;
            issues.push(`${requiredMissing} missing required fields in checked JSON-LD subset`);
          }
        }
      }

      // Description with length
      const descVal = getMeta(parsed.meta, "description");
      let descSummary: string;
      if (descVal) {
        descSummary = descVal.length > 155 ? `yes (${descVal.length} chars ⚠)` : `yes (${descVal.length})`;
      } else {
        descSummary = "no";
      }

      results.push({
        url: finalUrl,
        title: parsed.title
          ? parsed.title.length > 60
            ? `${parsed.title.slice(0, parsed.title.lastIndexOf(" ", 60) > 20 ? parsed.title.lastIndexOf(" ", 60) : 60)}...`
            : parsed.title
          : "(missing)",
        description: descSummary,
        canonical: parsed.canonical ? "yes" : "no",
        jsonLd: jsonLdSummary,
        links: linkSummary,
        issues,
      });
    } catch (err) {
      results.push({
        url: pageUrl,
        title: "-",
        description: "-",
        canonical: "-",
        jsonLd: "-",
        links: "-",
        issues: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  const lines: string[] = [`=== Batch Page Analysis (${results.length} URLs) ===`, ""];

  for (const r of results) {
    let label: string;
    try {
      const u = new URL(r.url);
      const allSameHost = results.every((x) => {
        try {
          return new URL(x.url).hostname === u.hostname;
        } catch {
          return false;
        }
      });
      label = allSameHost ? u.pathname : `${u.hostname}${u.pathname}`;
    } catch {
      label = r.url;
    }
    lines.push(label);
    lines.push(`  Title: ${r.title}`);
    lines.push(`  Description: ${r.description}  Canonical: ${r.canonical}  JSON-LD: ${r.jsonLd}`);
    if (check_links !== false) lines.push(`  Links: ${r.links}`);
    if (r.issues.length > 0) {
      lines.push(`  Issues: ${r.issues.join(", ")}`);
    } else {
      lines.push("  Issues: none");
    }
    lines.push("");
  }

  const issueCount = results.reduce((sum, r) => sum + r.issues.length, 0);
  lines.push(`Total: ${results.length} pages, ${issueCount} issues`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
