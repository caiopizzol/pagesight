import { readBounded, RequestError } from "../shared/http.js";

export async function fetchText(url: string, maxBytes: number, origin?: string) {
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
