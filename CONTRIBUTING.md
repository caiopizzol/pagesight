# Contributing

Use Bun 1.3.12 and Node 22.18 or later in the 22.x line. Pagesight runs on Bun; Vite+ and release tools also need Node.

From the repository root:

```sh
bun install --frozen-lockfile
bun run start --help
bun run verify
bun run test:package
```

`verify` runs formatting, lint, TypeScript, import boundary checks, and workspace tests. `test:package` packs
Pagesight, installs it outside the checkout, and checks its API, CLI, and MCP entry.
Use `bun run format` to apply formatting.

The npm package lives in `packages/pagesight`. Keep its runtime dependencies there.
Root owns shared tools, hooks, and the lockfile. Run a focused test from the package:

```sh
cd packages/pagesight
bun test __tests__/transports/cli.test.ts
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

## Adding an operation

Add its request shape to `packages/pagesight/src/api/schema.ts`, implement the
workflow beside its owner, then dispatch it from `api/execute.ts`. Keep transport
adapters thin. Add focused behavior tests and a transport check when wiring changes.
Expose public API additions explicitly from `api/index.ts`.

Use `fetch*` for I/O, `parse*` for parsing, and `format*` for display. Use kebab-case
filenames and keep formatters with the result they describe. Avoid a generic utility
folder or shared package until there is a concrete shared responsibility.
