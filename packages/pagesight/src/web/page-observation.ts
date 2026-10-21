import { imageEvidence } from "./images.js";
import { fetchText } from "./fetch.js";

export async function observePage(url: string) {
  const { response, body, finalUrl, redirects } = await fetchText(url, 2_000_000);
  const warnings = ["Fetched HTML only; JavaScript execution and crawler access were not tested."];
  let title = "";
  let description: string | null = null;
  let baseHref: string | null = null;
  let canonicalHref: string | null = null;
  const robots: string[] = [];
  const data: string[] = [];
  const openGraph: Array<{ property: string; content: string }> = [];
  const twitter: Array<{ name: string; content: string }> = [];
  const alternates: Array<{ lang: string; href: string }> = [];
  const rewriter = new HTMLRewriter()
    .on("title", {
      text(chunk) {
        title += chunk.text;
      },
    })
    .on("base[href]", {
      element(el) {
        baseHref ??= el.getAttribute("href");
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        canonicalHref = el.getAttribute("href") || canonicalHref;
      },
    })
    .on("meta", {
      element(el) {
        const name = el.getAttribute("name")?.toLowerCase();
        const property = el.getAttribute("property")?.toLowerCase();
        const value = el.getAttribute("content");
        if (name === "description") description = value;
        if ((name === "robots" || name === "googlebot") && value) robots.push(`${name}: ${value}`);
        if (property?.startsWith("og:") && value !== null) openGraph.push({ property, content: value });
        if (name?.startsWith("twitter:") && value !== null) twitter.push({ name, content: value });
      },
    })
    .on('link[rel~="alternate" i][hreflang]', {
      element(el) {
        const lang = el.getAttribute("hreflang");
        const href = el.getAttribute("href");
        if (lang && href) alternates.push({ lang, href });
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
  // A base element applies to the whole document, so links resolve only once it is known.
  let base = finalUrl;
  if (baseHref !== null) {
    try {
      base = new URL(baseHref, finalUrl).href;
    } catch {
      warnings.push("Malformed base href; links resolve against the final URL.");
    }
  }
  const resolve = (href: string) => {
    try {
      return new URL(href, base).href;
    } catch {
      return null;
    }
  };
  const canonical = canonicalHref === null ? null : resolve(canonicalHref);
  if (canonicalHref !== null && canonical === null) warnings.push("Malformed canonical href; canonical is unknown.");
  const hreflang: Array<{ lang: string; href: string }> = [];
  for (const alternate of alternates) {
    const href = resolve(alternate.href);
    if (href === null)
      warnings.push(`Malformed alternate href for hreflang ${alternate.lang}; that alternate is unknown.`);
    else hreflang.push({ lang: alternate.lang, href });
  }
  return {
    url,
    finalUrl,
    status: response.status,
    redirects,
    contentType: response.headers.get("content-type"),
    xRobotsTag: response.headers.get("x-robots-tag"),
    title: title.trim() || null,
    description,
    descriptionLength: description === null ? null : Array.from(description).length,
    canonical,
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
