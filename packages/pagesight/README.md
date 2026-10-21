# Pagesight

SEO, analytics, page, and performance evidence for developers and AI assistants.
Use it through the TypeScript API, CLI, or MCP.

Requires Bun. Page and crawler-policy checks need no provider credentials:

```sh
bun add pagesight
bunx --bun pagesight page --url https://example.com
bunx --bun pagesight robots --url https://example.com
```

```ts
import { execute } from "pagesight";

const result = await execute({ operation: "page", url: "https://example.com" });
console.log(result);
```

Search Console and GA4 reports take one sign-in:

```sh
bunx --bun pagesight login google
bunx --bun pagesight discover --url https://example.com
```

Environment credentials, service accounts and gcloud ADC still work for CI; see
[provider access](docs/credentials.md). Results keep raw observations, failures,
and limits; missing data is not zero.

- [API, CLI, and MCP](docs/usage.md)
- [Snapshots and comparisons](docs/snapshots.md)
- [Choose pages to investigate](docs/opportunities.md)
- [Provider access](docs/credentials.md)

MIT — see [LICENSE](LICENSE).

[Assess measurement quality and verify analytics](docs/measurement.md) with saved
snapshot summaries, GA Realtime and a repeatable browser-check workflow.

## Investigate a search candidate

Use `pagesight investigate --config seo.config.json --url 'https://example.com/page' --format text`
to gather exact-page search queries, device/country breakdowns, daily history,
current metadata/indexing and associated organic traffic/events. JSON retains raw
observations alongside a brief with findings, unknowns and next checks.
See [the investigation guide](docs/investigation.md) for scope and interpretation.

Use `pagesight crawl --config seo.config.json --out crawl.json` for a bounded internal-link/metadata graph and stored indexing sample. See [site discovery](docs/crawl.md) for robots, query and coverage policies.

- [SEO agent workflow](docs/seo-agent-workflow.md)
