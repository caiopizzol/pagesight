import { fetchText } from "./fetch.js";

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
