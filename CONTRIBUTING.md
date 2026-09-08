# Contributing

Use Bun 1.3.12 and Node 22. Pagesight runs on Bun; Vite+ and release tools also need Node.

From the repository root:

```sh
bun install --frozen-lockfile
bun run start --help
bun run verify
bun run test:package
```

`verify` runs formatting, lint, TypeScript, and workspace tests. `test:package` packs
Pagesight, installs it outside the checkout, and checks its API, CLI, and MCP entry.
Use `bun run format` to apply formatting.

The npm package lives in `packages/pagesight`. Keep its runtime dependencies there.
Root owns shared tools, hooks, and the lockfile. Run a focused test from the package:

```sh
cd packages/pagesight
bun test __tests__/transports.test.ts
```

A future website belongs in `apps/website`, with its own build and TypeScript config.
Add it when there is website code; no framework is prescribed yet.

## Releases

Only `packages/pagesight` is published. Website deployment is separate. Use
`feat(website): ...` or `fix(website): ...` for website-only changes; that scope is
excluded from npm releases. Mixed package and website changes must not use it.
The release job disables npm workspace updates so npm version does not rebuild
Bun's dependency layout. Bun remains responsible for the lockfile.

## Working rules

See [CLAUDE.md](CLAUDE.md) for source navigation and conventions, and
[PRODUCT.md](PRODUCT.md) for product boundaries. The active cleanup record is
[cleanup-goal.md](cleanup-goal.md).
