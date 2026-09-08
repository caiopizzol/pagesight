import { dirname, relative, resolve } from "node:path";

const root = new URL("../packages/pagesight/src/", import.meta.url).pathname;
const sources = [...new Bun.Glob("**/*.ts").scanSync(root)];
const graph = new Map<string, string[]>();
for (const source of sources) {
  const text = await Bun.file(resolve(root, source)).text();
  const imports = new Bun.Transpiler({ loader: "ts" }).scan(text).imports;
  const targets: string[] = [];
  for (const imported of imports) {
    if (!imported.path.startsWith(".")) continue;
    const target = relative(root, resolve(root, dirname(source), imported.path)).replace(/\.js$/, ".ts");
    if (!sources.includes(target)) throw new Error(`Missing source import: ${source} -> ${target}`);
    const owner = source.split("/")[0];
    const targetOwner = target.split("/")[0];
    if (owner === "shared" && targetOwner !== "shared")
      throw new Error(`Shared helper imports higher layer: ${source}`);
    if (["providers", "web"].includes(owner) && !["providers", "web", "shared"].includes(targetOwner))
      throw new Error(`Lower layer imports orchestration: ${source} -> ${target}`);
    targets.push(target);
  }
  graph.set(source, targets);
}
const complete = new Set<string>();
function visit(source: string, path: string[]) {
  if (path.includes(source)) throw new Error(`Import cycle: ${[...path, source].join(" -> ")}`);
  if (complete.has(source)) return;
  for (const target of graph.get(source) ?? []) visit(target, [...path, source]);
  complete.add(source);
}
for (const source of sources) visit(source, []);
console.log(`Source boundaries and imports passed (${sources.length} files)`);
