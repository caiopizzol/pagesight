# Pagesight

SEO, analytics, page, and performance evidence for developers and AI assistants.
Use it through the TypeScript API, CLI, local HTTP server, or MCP.

Requires Bun. Try a page check without provider credentials:

```sh
bun add pagesight
bunx --bun pagesight page --url https://example.com
```

```ts
import { execute } from "pagesight";

const result = await execute({ operation: "page", url: "https://example.com" });
console.log(result);
```

Provider reports need access to the relevant Google or Bing account. Results keep
raw observations, failures, and limits; missing data is not zero.

- [API, CLI, HTTP, and MCP](docs/usage.md)
- [Snapshots and comparisons](docs/snapshots.md)
- [Choose pages to investigate](docs/opportunities.md)
- [Provider access](docs/credentials.md)
- [Bing diagnostics, HTML images, and UI findings](docs/diagnostics.md)

MIT — see [LICENSE](LICENSE).

[Assess measurement quality and verify analytics](docs/measurement.md) with saved
snapshot summaries, GA Realtime and a repeatable browser-check workflow.

## Investigate a search candidate

Use `pagesight investigate --config seo.config.json --url 'https://example.com/page' --format text`
to gather exact-page search queries, device/country breakdowns, daily history,
current metadata/indexing and associated organic traffic/events. JSON retains raw
observations alongside a brief with findings, unknowns and next checks.
See [the investigation guide](docs/investigation.md) for scope and interpretation.
