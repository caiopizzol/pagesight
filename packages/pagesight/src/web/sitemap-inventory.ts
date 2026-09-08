import { RequestError } from "../shared/http.js";
import { parseInventorySitemap } from "./sitemap-parser.js";
import { fetchText } from "./fetch.js";

export async function observeSitemap(url: string) {
  const origin = new URL(url).origin;
  const queue = [url];
  const scheduled = new Set(queue);
  let omittedChildReferences = 0;
  const visited = new Set<string>();
  const urls = new Set<string>();
  const documents: Array<{ url: string; status: number; sha256: string; bytes: number }> = [];
  const errors: Array<{ url: string; code: string }> = [];
  const futureLastmods = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);
  let bytes = 0;
  while (queue.length && visited.size < 5 && bytes < 8_000_000) {
    const next = queue.shift();
    if (!next || visited.has(next)) continue;
    visited.add(next);
    try {
      if (new URL(next).origin !== origin)
        throw new RequestError("Child sitemap is outside the site origin", null, "outside_origin");
      const page = await fetchText(next, 8_000_000 - bytes, origin);
      if (!page.response.ok) throw new RequestError("Sitemap fetch failed", page.response.status);
      bytes += Buffer.byteLength(page.body);
      const parsed = parseInventorySitemap(page.body);
      documents.push({
        url: page.finalUrl,
        status: page.response.status,
        bytes: Buffer.byteLength(page.body),
        sha256: Bun.CryptoHasher.hash("sha256", page.body, "hex"),
      });
      for (const child of parsed.children) {
        if (scheduled.has(child)) continue;
        if (scheduled.size >= 5) {
          omittedChildReferences++;
          continue;
        }
        scheduled.add(child);
        queue.push(child);
      }
      for (const item of parsed.urls) urls.add(item);
      for (const lastmod of parsed.lastmods) if (lastmod.slice(0, 10) > today) futureLastmods.add(lastmod);
    } catch (error) {
      errors.push({ url: next, code: error instanceof RequestError ? error.code : "fetch_failed" });
    }
  }
  return {
    sitemap: url,
    complete: queue.length === 0 && errors.length === 0 && omittedChildReferences === 0,
    documents,
    urls: [...urls],
    urlCount: urls.size,
    bytes,
    unvisited: queue,
    omittedChildReferences,
    errors,
    futureLastmods: [...futureLastmods],
    warnings: [
      "Sitemap membership is not indexing evidence. Inventory is limited to five same-origin XML documents and 8 MB.",
    ],
  };
}
