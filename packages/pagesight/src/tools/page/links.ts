interface RedirectHop {
  url: string;
  status: number;
}

interface ImageCheck {
  url: string;
  tag: string;
  status: number | null;
  contentType: string | null;
  contentLength: number | null;
  error: string | null;
}

export interface LinkResult {
  href: string;
  status: number | null;
  redirectChain: Array<{ url: string; status: number }>;
  finalUrl: string | null;
  error: string | null;
}

export async function followRedirects(
  url: string,
  ua: string,
  maxHops = 10,
): Promise<{ chain: RedirectHop[]; response: Response }> {
  const chain: RedirectHop[] = [];
  let current = url;

  for (let i = 0; i < maxHops; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(current, {
      headers: { "User-Agent": ua, Accept: "text/html" },
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    chain.push({ url: current, status: res.status });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) break;
      current = new URL(location, current).href;
      continue;
    }

    return { chain, response: res };
  }

  // Retry with automatic redirects after the hop limit or a missing Location header.
  const res = await fetch(current, {
    headers: { "User-Agent": ua, Accept: "text/html" },
    redirect: "follow",
  });
  return { chain, response: res };
}

export async function checkImage(imageUrl: string, tag: string): Promise<ImageCheck> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(imageUrl, { method: "HEAD", redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);
    return {
      url: imageUrl,
      tag,
      status: res.status,
      contentType: res.headers.get("content-type"),
      contentLength: res.headers.has("content-length") ? Number(res.headers.get("content-length")) : null,
      error: null,
    };
  } catch (err) {
    return {
      url: imageUrl,
      tag,
      status: null,
      contentType: null,
      contentLength: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkLink(href: string): Promise<LinkResult> {
  const chain: Array<{ url: string; status: number }> = [];
  let current = href;

  try {
    for (let i = 0; i < 10; i++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(current, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", Accept: "text/html" },
        redirect: "manual",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      chain.push({ url: current, status: res.status });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;
        current = new URL(location, current).href;
        continue;
      }

      return {
        href,
        status: res.status,
        redirectChain: chain,
        finalUrl: chain.length > 1 ? current : null,
        error: null,
      };
    }

    return {
      href,
      status: chain[chain.length - 1]?.status ?? null,
      redirectChain: chain,
      finalUrl: current,
      error: "Too many redirects",
    };
  } catch (err) {
    return {
      href,
      status: null,
      redirectChain: chain,
      finalUrl: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function extractInternalLinks(html: string, origin: string): string[] {
  const links = new Set<string>();

  for (const match of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)/gi)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;

    try {
      const resolved = new URL(raw, origin).href;
      if (resolved.startsWith(origin) && !resolved.includes("/cdn-cgi/")) {
        links.add(resolved);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return [...links];
}

export function formatLinkResults(url: string, results: LinkResult[]): string {
  const lines: string[] = [`=== Internal Links: ${url} ===`, `Found ${results.length} internal links`, ""];

  const broken = results.filter((r) => r.error || (r.status && r.status >= 400));
  const redirected = results.filter((r) => !r.error && r.redirectChain.length > 1 && r.status && r.status < 400);
  const ok = results.filter((r) => !r.error && r.redirectChain.length === 1 && r.status && r.status < 400);

  // Summary
  lines.push("--- Summary ---", "");
  lines.push(`OK: ${ok.length}`);
  if (redirected.length > 0) lines.push(`Redirected: ${redirected.length}`);
  if (broken.length > 0) lines.push(`Broken: ${broken.length}`);
  lines.push("");

  // Broken links
  if (broken.length > 0) {
    lines.push("--- Broken Links ---", "");
    for (const r of broken) {
      if (r.error) {
        lines.push(`FAIL  ${r.href}`);
        lines.push(`      Error: ${r.error}`);
      } else {
        lines.push(`FAIL  ${r.href} → ${r.status}`);
      }
    }
    lines.push("");
  }

  // Redirect chains
  if (redirected.length > 0) {
    lines.push("--- Redirect Chains ---", "");
    for (const r of redirected) {
      const hops = r.redirectChain.length - 1;
      const chainStr = r.redirectChain.map((h) => `${h.status}`).join(" → ");
      lines.push(`REDIRECT  ${r.href}`);
      lines.push(`          ${chainStr} → ${r.finalUrl} (${hops} hop${hops > 1 ? "s" : ""})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
