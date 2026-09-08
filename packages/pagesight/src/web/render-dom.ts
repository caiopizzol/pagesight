// Executed in Chromium for both detached server HTML and the rendered document.
export function extractSeo(input: { html?: string; url: string }) {
  const doc = input.html === undefined ? document : new DOMParser().parseFromString(input.html, "text/html");
  const maxItems = 200;
  const maxText = 4000;
  let truncated = false;
  const clip = (value: string | null) => {
    if (value !== null && value.length > maxText) truncated = true;
    return value === null ? null : value.slice(0, maxText);
  };
  const select = (selector: string) => {
    const all = doc.querySelectorAll(selector);
    if (all.length > maxItems) truncated = true;
    return Array.from(all).slice(0, maxItems);
  };
  let baseUrl = input.url;
  const baseHref = doc.querySelector("base[href]")?.getAttribute("href");
  try {
    if (baseHref) baseUrl = new URL(baseHref, input.url).href;
  } catch {
    /* Invalid base remains visible below. */
  }
  const resolve = (href: string | null) => {
    try {
      return href === null ? null : new URL(href, baseUrl).href;
    } catch {
      return null;
    }
  };
  return {
    url: input.url,
    baseHref: clip(baseHref ?? null),
    titles: select("title").map((e) => clip(e.textContent)),
    descriptions: select('meta[name="description" i]').map((e) => clip(e.getAttribute("content"))),
    canonicals: select('link[rel~="canonical" i]').map((e) => ({
      raw: clip(e.getAttribute("href")),
      resolved: clip(resolve(e.getAttribute("href"))),
    })),
    robots: select('meta[name="robots" i],meta[name="googlebot" i]').map((e) => ({
      name: clip(e.getAttribute("name")),
      content: clip(e.getAttribute("content")),
    })),
    h1: select("h1").map((e) => clip(e.textContent)),
    jsonLd: select('script[type="application/ld+json" i]').map((e) => {
      const raw = e.textContent ?? "";
      let validJson = true;
      try {
        JSON.parse(raw);
      } catch {
        validJson = false;
      }
      return { raw: clip(raw), validJson };
    }),
    links: select("a[href]").map((e) => ({
      raw: clip(e.getAttribute("href")),
      resolved: clip(resolve(e.getAttribute("href"))),
      text: clip(e.textContent),
    })),
    truncated,
    limits: { maxItemsPerField: maxItems, maxCharactersPerValue: maxText },
  };
}
export type SeoDom = ReturnType<typeof extractSeo>;
