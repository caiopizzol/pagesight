import { getAuthMethod } from "../providers/gsc-auth.js";
import { getSite } from "../providers/gsc.js";
import { defaultDates } from "../shared/dates.js";
import { aggregate, capture, type Evidence } from "./evidence.js";
import type { Executor } from "./execute.js";
import type { SiteConfig } from "./schema.js";
import { providerSelection } from "./snapshot.js";

export async function doctor(config: SiteConfig, run: Executor): Promise<Evidence> {
  const pending: Promise<Evidence>[] = [run({ operation: "page", url: config.site })];
  const site = config.gscSite;
  const property = config.gaProperty;
  if (config.bingSite) pending.push(run({ operation: "bing.traffic", site: config.bingSite }));
  if (site) pending.push(capture("gsc", "access", site, { site, method: getAuthMethod() }, () => getSite(site)));
  if (property)
    pending.push(
      run({ operation: "ga.property", property }),
      run({
        operation: "ga.report",
        property,
        request: {
          dateRanges: [{ startDate: defaultDates().endDate, endDate: defaultDates().endDate }],
          metrics: [{ name: "sessions" }],
          limit: 1,
        },
      }),
    );
  const result = aggregate("doctor", config.site, config, await Promise.all(pending));
  (result.pages[0].response as Record<string, unknown>).providers = {
    ...providerSelection(config),
    web: "selected",
    sitemap: "not_checked",
  };
  return result;
}
