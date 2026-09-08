import { aggregate, capture, type Evidence } from "./evidence.js";
import { crawlSite } from "../web/site-graph.js";
import type { SiteConfig } from "./schema.js";
import type { Executor } from "./execute.js";

type Input = {
  config: SiteConfig;
  maxPages: number;
  maxDepth: number;
  maxLinks: number;
  includeQuery: boolean;
  inspectLimit: number;
};
export async function crawl(input: Input, run: Executor): Promise<Evidence> {
  const { config } = input;
  const request = {
    site: config.site,
    seeds: config.pages,
    sitemap: config.sitemap,
    maxPages: input.maxPages,
    maxDepth: input.maxDepth,
    maxLinks: input.maxLinks,
    includeQuery: input.includeQuery,
  };
  const graph = await capture("web", "site-graph", config.site, request, () => crawlSite(request));
  graph.name = "crawl.graph";
  const data = graph.pages[0]?.response as Awaited<ReturnType<typeof crawlSite>> | undefined;
  if (data && !data.complete) graph.status = "partial";
  const observations = [graph];
  const urls =
    data?.pages
      .filter((p) => p.status === 200 && p.contentType?.toLowerCase().includes("text/html"))
      .slice(0, input.inspectLimit)
      .map((p) => p.url) ?? [];
  if (config.gscSite)
    for (const url of urls)
      observations.push({
        ...(await run({ operation: "gsc.inspect", site: config.gscSite, url })),
        name: `gsc.inspect:${url}`,
      });
  const result = aggregate("crawl", config.site, input, observations);
  Object.assign(result.pages[0].response as object, {
    context: config.context,
    indexingSample: {
      selected: config.gscSite ? urls : [],
      limit: input.inspectLimit,
      available: Boolean(config.gscSite),
      meaning:
        "Stored Google state for selected fetched HTML pages only; not a site indexing count. Missing inspection is unknown.",
    },
  });
  return result;
}
