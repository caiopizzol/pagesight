import { configSchema } from "./schema.js";
import { aggregate } from "./evidence.js";
import type { Executor } from "./execute.js";

export async function discover(url: string, providers: Array<"gsc" | "ga" | "bing">, run: Executor) {
  const selected = [...new Set(providers)];
  const observations = await Promise.all(
    selected.map((provider) => run({ operation: provider === "ga" ? "ga.accounts" : `${provider}.sites` })),
  );
  const result = aggregate("discover", url, { url, providers: selected }, observations);
  const gsc = observations.find((o) => o.provider === "gsc");
  const bing = observations.find((o) => o.provider === "bing");
  const bingSites = (bing?.pages[0]?.response as { d?: unknown[] } | undefined)?.d;
  const ga = observations.find((o) => o.provider === "ga");
  const sites = (gsc?.pages[0]?.response as { siteEntry?: unknown[] } | undefined)?.siteEntry;
  const accounts = ga?.pages[0]?.response as
    | { accountSummaries?: Array<{ propertySummaries?: unknown[] }> }
    | undefined;
  Object.assign(result.pages[0].response as object, {
    config: configSchema.parse({ site: url }),
    candidates: {
      bing: bingSites ?? [],
      gsc: Array.isArray(sites) ? sites : [],
      ga: accounts?.accountSummaries?.flatMap((a) => a.propertySummaries ?? []) ?? [],
    },
    providers: Object.fromEntries(
      ["gsc", "ga", "bing"].map((p) => [
        p,
        selected.includes(p as "gsc" | "ga" | "bing") ? "selected" : "not_selected",
      ]),
    ),
  });
  result.warnings.push(
    "No provider property is automatically selected. Copy a verified site/property ID into config before collecting its reports.",
    "GA display names do not establish a property's hostname. Candidates can belong to other sites; verify the property and web stream.",
    "The returned config is usable for a site-only snapshot. Sitemap, objective and provider IDs must be supplied explicitly.",
  );
  return result;
}
