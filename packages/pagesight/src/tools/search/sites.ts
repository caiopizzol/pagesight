import { type GscSite, type GscSitemap, getSite, getSitemap, listSitemaps, listSites } from "../../providers/gsc.js";
import { type SearchOptions } from "./schema.js";
import { textResult } from "./result.js";
export function formatSites(sites: GscSite[]): string {
  if (sites.length === 0) return "No Search Console properties found.";

  const lines: string[] = [`=== GSC Properties (${sites.length}) ===`, ""];
  for (const site of sites) {
    lines.push(`${site.siteUrl} (${site.permissionLevel})`);
  }
  return lines.join("\n");
}

export function formatSite(site: GscSite): string {
  return [`=== Site: ${site.siteUrl} ===`, "", `Permission: ${site.permissionLevel}`].join("\n");
}

export function formatSitemapDetail(sm: GscSitemap): string {
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
      lines.push(`  ${c.type}: ${c.submitted ?? "?"} submitted; indexed count unavailable (deprecated API field)`);
    }
  }
  return lines.join("\n");
}

export function formatSitemaps(siteUrl: string, sitemaps: GscSitemap[]): string {
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
        lines.push(`  ${c.type}: ${c.submitted ?? "?"} submitted; indexed count unavailable (deprecated API field)`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

// ── Performance formatters ──

export async function runListSites() {
  const sites = await listSites();
  return textResult(formatSites(sites));
}

export async function runGetSite(options: SearchOptions) {
  const { site_url } = options;
  if (!site_url) return textResult("Error: site_url is required for get_site.");
  const site = await getSite(site_url);
  return textResult(formatSite(site));
}

export async function runGetSitemap(options: SearchOptions) {
  const { site_url, sitemap_url } = options;
  if (!site_url) return textResult("Error: site_url is required for get_sitemap.");
  if (!sitemap_url) return textResult("Error: sitemap_url is required for get_sitemap.");
  const sm = await getSitemap(site_url, sitemap_url);
  return textResult(formatSitemapDetail(sm));
}

export async function runSitemaps(options: SearchOptions) {
  const { site_url } = options;
  if (!site_url) return textResult("Error: site_url is required for sitemaps.");
  const sitemaps = await listSitemaps(site_url);
  return textResult(formatSitemaps(site_url, sitemaps));
}
