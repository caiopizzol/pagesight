import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type GscSite, type GscSitemap, getSite, getSitemap, listSitemaps, listSites } from "../lib/gsc.js";

function formatSites(sites: GscSite[]): string {
  if (sites.length === 0) return "No Search Console properties found.";

  const lines: string[] = [`=== GSC Properties (${sites.length}) ===`, ""];
  for (const site of sites) {
    lines.push(`${site.siteUrl} (${site.permissionLevel})`);
  }
  return lines.join("\n");
}

function formatSite(site: GscSite): string {
  return [`=== Site: ${site.siteUrl} ===`, "", `Permission: ${site.permissionLevel}`].join("\n");
}

function formatSitemapDetail(sm: GscSitemap): string {
  const lines: string[] = [`=== Sitemap: ${sm.path} ===`, ""];
  if (sm.type) lines.push(`Type: ${sm.type}`);
  if (sm.lastSubmitted) lines.push(`Submitted: ${sm.lastSubmitted}`);
  if (sm.lastDownloaded) lines.push(`Downloaded: ${sm.lastDownloaded}`);
  lines.push(`Pending: ${sm.isPending}`);
  lines.push(`Index: ${sm.isSitemapsIndex}`);
  if (sm.warnings) lines.push(`Warnings: ${sm.warnings}`);
  if (sm.errors) lines.push(`Errors: ${sm.errors}`);
  if (sm.contents && sm.contents.length > 0) {
    lines.push("", "Contents:");
    for (const c of sm.contents) {
      lines.push(`  ${c.type}: ${c.submitted ?? "?"} submitted, ${c.indexed ?? "?"} indexed`);
    }
  }
  return lines.join("\n");
}

function formatSitemaps(siteUrl: string, sitemaps: GscSitemap[]): string {
  if (sitemaps.length === 0) return `No sitemaps found for ${siteUrl}.`;

  const lines: string[] = [`=== Sitemaps: ${siteUrl} (${sitemaps.length}) ===`, ""];

  for (const sm of sitemaps) {
    lines.push(`${sm.path}`);
    if (sm.type) lines.push(`  Type: ${sm.type}`);
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
    "List Search Console properties, get site details, list sitemaps, or get details for a specific sitemap.",
    {
      site_url: z.string().optional().describe("GSC property URL. Omit to list all properties."),
      sitemap_url: z.string().optional().describe("Specific sitemap URL to get details for. Requires site_url."),
      action: z
        .enum(["list_sites", "get_site", "list_sitemaps", "get_sitemap"])
        .optional()
        .describe(
          "Action to perform. Auto-detected: omit site_url → list_sites, site_url only → list_sitemaps, site_url + sitemap_url → get_sitemap.",
        ),
    },
    async ({ site_url, sitemap_url, action }) => {
      try {
        // Auto-detect action if not specified
        const resolvedAction = action ?? (sitemap_url ? "get_sitemap" : site_url ? "list_sitemaps" : "list_sites");

        if (resolvedAction === "list_sites") {
          const sites = await listSites();
          return { content: [{ type: "text", text: formatSites(sites) }] };
        }

        if (!site_url) {
          return { content: [{ type: "text", text: "Error: site_url is required for this action." }] };
        }

        if (resolvedAction === "get_site") {
          const site = await getSite(site_url);
          return { content: [{ type: "text", text: formatSite(site) }] };
        }

        if (resolvedAction === "get_sitemap") {
          if (!sitemap_url) {
            return { content: [{ type: "text", text: "Error: sitemap_url is required for get_sitemap." }] };
          }
          const sm = await getSitemap(site_url, sitemap_url);
          return { content: [{ type: "text", text: formatSitemapDetail(sm) }] };
        }

        // list_sitemaps (default when site_url provided)
        const sitemaps = await listSitemaps(site_url);
        return { content: [{ type: "text", text: formatSitemaps(site_url, sitemaps) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${msg}` }] };
      }
    },
  );
}
