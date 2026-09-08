export interface SitemapParseResult {
  urls: string[];
  isSitemapIndex: boolean;
  childSitemaps: string[];
}

export function parseSitemapXml(xml: string): SitemapParseResult {
  const urls: string[] = [];
  const childSitemaps: string[] = [];

  const isSitemapIndex = /<sitemapindex/i.test(xml);

  if (isSitemapIndex) {
    for (const m of xml.matchAll(/<sitemap[^>]*>[\s\S]*?<loc>\s*(.*?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)) {
      childSitemaps.push(m[1].trim());
    }
  } else {
    for (const m of xml.matchAll(/<url[^>]*>[\s\S]*?<loc>\s*(.*?)\s*<\/loc>[\s\S]*?<\/url>/gi)) {
      urls.push(m[1].trim());
    }
  }

  return { urls, isSitemapIndex, childSitemaps };
}

export async function fetchSitemap(sitemapUrl: string): Promise<SitemapParseResult> {
  const res = await fetch(sitemapUrl, {
    headers: { "User-Agent": "Pagesight/1.0", "Accept-Encoding": "gzip, deflate" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap ${sitemapUrl}: HTTP ${res.status}`);
  }

  let xml: string;
  const contentType = res.headers.get("content-type") ?? "";
  if (sitemapUrl.endsWith(".gz") || contentType.includes("gzip") || contentType.includes("application/x-gzip")) {
    const buffer = await res.arrayBuffer();
    const decompressed = Bun.gunzipSync(new Uint8Array(buffer));
    xml = new TextDecoder().decode(decompressed);
  } else {
    xml = await res.text();
  }
  return parseSitemapXml(xml);
}

export function sampleUrls(urls: string[], count: number, strategy: string): string[] {
  if (urls.length <= count) return [...urls];

  if (strategy === "first") {
    return urls.slice(0, count);
  }

  if (strategy === "spread") {
    const step = Math.floor(urls.length / count);
    const sampled: string[] = [];
    for (let i = 0; i < count; i++) {
      sampled.push(urls[i * step]);
    }
    return sampled;
  }

  // random (default)
  const shuffled = [...urls];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
