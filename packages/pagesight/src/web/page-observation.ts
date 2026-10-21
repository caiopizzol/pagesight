import { imageEvidence } from "./images.js";
import { fetchText } from "./fetch.js";

export async function observePage(url: string) {
  const { response, body, finalUrl, redirects } = await fetchText(url, 2_000_000);
  const warnings = ["Fetched HTML only; JavaScript execution and crawler access were not tested."];
  let title = "";
  const metadata: { canonical: string | null; description: string | null } = { canonical: null, description: null };
  const robots: string[] = [];
  const data: string[] = [];
  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  const hreflang: Array<{ lang: string; href: string }> = [];
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
        const property = el.getAttribute("property")?.toLowerCase();
        const value = el.getAttribute("content");
        if (name === "description") metadata.description = value;
        if ((name === "robots" || name === "googlebot") && value) robots.push(`${name}: ${value}`);
        if (property?.startsWith("og:") && value !== null) openGraph[property] = value;
        if (name?.startsWith("twitter:") && value !== null) twitter[name] = value;
      },
    })
    .on('link[rel="alternate"][hreflang]', {
      element(el) {
        const lang = el.getAttribute("hreflang");
        const href = el.getAttribute("href");
        if (!lang || !href) return;
        try {
          hreflang.push({ lang, href: new URL(href, finalUrl).href });
        } catch {
          warnings.push(`Malformed alternate href for hreflang ${lang}; that alternate is unknown.`);
        }
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
    canonical: metadata.canonical,
    robots,
    openGraph,
    twitter,
    hreflang,
    sha256: Bun.CryptoHasher.hash("sha256", body, "hex"),
    bytes: Buffer.byteLength(body),
    structuredData: data.filter(Boolean).map((text) => {
      try {
        return { value: JSON.parse(text), validJson: true };
      } catch {
        return { value: null, validJson: false };
      }
    }),
    imageEvidence: await imageEvidence(body),
    warnings,
  };
}
