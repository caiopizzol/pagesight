# Pagesight

See your site the way search engines and AI see it. Pagesight returns SEO,
analytics, page, and performance evidence through a TypeScript API, CLI, local
HTTP server, and MCP tools.

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
- [Provider access](docs/credentials.md)
- [Product boundary](https://github.com/caiopizzol/pagesight/blob/main/PRODUCT.md)
- [Contributing](https://github.com/caiopizzol/pagesight/blob/main/CONTRIBUTING.md)

MIT — see [LICENSE](LICENSE).
