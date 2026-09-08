import { configSchema } from "./schema.js";
import { aggregate, type Executor } from "./snapshot.js";

export async function discover(url: string, providers: Array<"gsc" | "ga">, run: Executor) {
  const selected = [...new Set(providers)];
  const observations = await Promise.all(
    selected.map((provider) => run({ operation: provider === "gsc" ? "gsc.sites" : "ga.accounts" })),
  );
  const result = aggregate("discover", url, { url, providers: selected }, observations);
  const gsc = observations.find((o) => o.provider === "gsc");
  const ga = observations.find((o) => o.provider === "ga");
  const sites = gsc?.pages[0]?.response;
  const accounts = ga?.pages[0]?.response as
    | { accountSummaries?: Array<{ propertySummaries?: unknown[] }> }
    | undefined;
  Object.assign(result.pages[0].response as object, {
    config: configSchema.parse({ site: url }),
    candidates: {
      gsc: Array.isArray(sites) ? sites : [],
      ga: accounts?.accountSummaries?.flatMap((a) => a.propertySummaries ?? []) ?? [],
    },
    providers: Object.fromEntries(
      ["gsc", "ga"].map((p) => [p, selected.includes(p as "gsc" | "ga") ? "selected" : "not_selected"]),
    ),
  });
  result.warnings.push(
    "No Google property is automatically selected. Copy a verified site/property ID into config before collecting its reports.",
    "GA display names do not establish a property's hostname. Candidates can belong to other sites; verify the property and web stream.",
    "The returned config is usable for a site-only snapshot. Sitemap, objective and provider IDs must be supplied explicitly.",
  );
  return result;
}
