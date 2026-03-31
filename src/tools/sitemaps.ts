import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type GscSite, type GscSitemap, listSitemaps, listSites } from "../lib/gsc.js";

function formatSites(sites: GscSite[]): string {
  if (sites.length === 0) return "No Search Console properties found.";

  const lines: string[] = [`=== GSC Properties (${sites.length}) ===`, ""];
  for (const site of sites) {
    lines.push(`${site.siteUrl} (${site.permissionLevel})`);
  }
  return lines.join("\n");
}

function formatSitemaps(siteUrl: string, sitemaps: GscSitemap[]): string {
  if (sitemaps.length === 0) return `No sitemaps found for ${siteUrl}.`;

  const lines: string[] = [`=== Sitemaps: ${siteUrl} ===`, ""];

  for (const sm of sitemaps) {
    lines.push(`${sm.path}`);
    if (sm.lastSubmitted) lines.push(`  Submitted: ${sm.lastSubmitted}`);
    if (sm.lastDownloaded) lines.push(`  Downloaded: ${sm.lastDownloaded}`);
    lines.push(`  Pending: ${sm.isPending}`);
    lines.push(`  Index: ${sm.isSitemapsIndex}`);
    if (sm.warnings) lines.push(`  Warnings: ${sm.warnings}`);
    if (sm.errors) lines.push(`  Errors: ${sm.errors}`);
    if (sm.contents) {
      for (const c of sm.contents) {
        lines.push(`  ${c.type}: ${c.submitted ?? "?"} submitted, ${c.indexed ?? "?"} indexed`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function registerSitemapsTool(server: McpServer): void {
  server.tool(
    "sitemaps",
    "List Search Console properties or sitemaps for a property.",
    {
      site_url: z.string().optional().describe("GSC property URL. Omit to list all properties."),
    },
    async ({ site_url }) => {
      if (!site_url) {
        const sites = await listSites();
        return { content: [{ type: "text", text: formatSites(sites) }] };
      }

      const sitemaps = await listSitemaps(site_url);
      return { content: [{ type: "text", text: formatSitemaps(site_url, sitemaps) }] };
    },
  );
}
