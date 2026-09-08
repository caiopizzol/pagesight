import { readBounded, RequestError } from "../lib/http.js";
import { imageEvidence } from "./images.js";
import { parseInventorySitemap } from "./sitemap.js";

async function fetchText(url: string, maxBytes: number, origin?: string) {
  const redirects: Array<{ url: string; status: number; location: string }> = [];
  let current = url;
  const signal = AbortSignal.timeout(20_000);
  for (let hop = 0; hop <= 5; hop++) {
    const parsed = new URL(current);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      (origin && parsed.origin !== origin)
    )
      throw new RequestError("Redirect left the permitted origin or protocol", null, "invalid_redirect");
    const response = await fetch(current, {
      signal,
      redirect: "manual",
      headers: { "User-Agent": "Pagesight/0.17", Accept: "text/html,application/xml,text/plain" },
    });
    const location = response.headers.get("location");
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      redirects.push({ url: current, status: response.status, location });
      await response.body?.cancel();
      current = new URL(location, current).href;
      continue;
    }
    return { response, body: await readBounded(response, maxBytes), finalUrl: current, redirects };
  }
  throw new RequestError("Redirect limit exceeded", null, "redirect_limit");
}

export async function observePage(url: string) {
  const { response, body, finalUrl, redirects } = await fetchText(url, 2_000_000);
  const warnings = ["Fetched HTML only; JavaScript execution and crawler access were not tested."];
  let title = "";
  const metadata: { canonical: string | null; description: string | null } = { canonical: null, description: null };
  const robots: string[] = [];
  const data: string[] = [];
  const rewriter = new HTMLRewriter()
    .on("title", {
      text(chunk) {
        title += chunk.text;
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        const href = el.getAttribute("href");
        if (href) {
          try {
            metadata.canonical = new URL(href, finalUrl).href;
          } catch {
            warnings.push("Malformed canonical href; canonical is unknown.");
          }
        }
      },
    })
    .on("meta", {
      element(el) {
        const name = el.getAttribute("name")?.toLowerCase();
        const value = el.getAttribute("content");
        if (name === "description") metadata.description = value;
        if ((name === "robots" || name === "googlebot") && value) robots.push(`${name}: ${value}`);
      },
    })
    .on('script[type="application/ld+json"]', {
      text(chunk) {
        if (!data.length) data.push("");
        data[data.length - 1] += chunk.text;
        if (chunk.lastInTextNode) data.push("");
      },
    });
  await rewriter.transform(new Response(body)).text();
  return {
    url,
    finalUrl,
    status: response.status,
    redirects,
    contentType: response.headers.get("content-type"),
    xRobotsTag: response.headers.get("x-robots-tag"),
    title: title.trim() || null,
    description: metadata.description,
    descriptionLength: metadata.description === null ? null : Array.from(metadata.description).length,
    imageEvidence: await imageEvidence(body),
    canonical: metadata.canonical,
    robots,
    sha256: Bun.CryptoHasher.hash("sha256", body, "hex"),
    bytes: Buffer.byteLength(body),
    structuredData: data.filter(Boolean).map((text) => {
      try {
        return { value: JSON.parse(text), validJson: true };
      } catch {
        return { value: null, validJson: false };
      }
    }),
    warnings,
  };
}

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
