import { capture } from "./evidence.js";
import { fetchText } from "../web/fetch.js";
import { launchRenderer, parseServer, captureRendered, type RenderOptions } from "../web/render-browser.js";
import type { SeoDom } from "../web/render-dom.js";
import { RequestError } from "../shared/http.js";

function compare(a: SeoDom | undefined, b: SeoDom | undefined) {
  if (!a || !b || a.url !== b.url || a.truncated || b.truncated)
    return { status: "unavailable", reason: "Both complete captures must identify the same exact final URL." };
  const fields = ["baseHref", "titles", "descriptions", "canonicals", "robots", "h1", "jsonLd", "links"] as const;
  const differences = fields
    .filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]))
    .map((field) => ({ field, before: a[field], after: b[field] }));
  return {
    status: differences.length ? "different" : "equal",
    scope: "Extracted DOM fields only; HTTP response evidence is compared separately.",
    differences,
  };
}
export async function verifyRender(options: RenderOptions) {
  return capture("pagesight", "page.verify", options.url, options, async () => {
    const browser = await launchRenderer();
    try {
      const server = await capture("web", "server_html", options.url, { url: options.url }, async () => {
        const { body, finalUrl, response, redirects } = await fetchText(
          options.url,
          2_000_000,
          new URL(options.url).origin,
        );
        if (!response.headers.get("content-type")?.includes("text/html"))
          throw new RequestError("Server response is not HTML.", response.status, "not_html");
        return {
          finalUrl,
          status: response.status,
          redirects,
          xRobotsTag: response.headers.get("x-robots-tag"),
          contentType: response.headers.get("content-type"),
          sha256: Bun.CryptoHasher.hash("sha256", body, "hex"),
          bytes: Buffer.byteLength(body),
          dom: await parseServer(browser, body, finalUrl),
        };
      });
      const direct = await capture("chromium", "direct", options.url, options, () =>
        captureRendered(browser, options, false),
      );
      const navigation = options.navigation
        ? await capture("chromium", "internal_navigation", options.url, options, () =>
            captureRendered(browser, options, true),
          )
        : null;
      const getDom = (e: typeof server | null) => (e?.pages[0]?.response as { dom?: SeoDom } | undefined)?.dom;
      return {
        verificationVersion: 1,
        browser: { engine: "chromium", version: browser.version(), viewport: options.viewport },
        capturePolicy: {
          waitUntil: "domcontentloaded",
          settleMs: options.settleMs,
          timeoutMsPerBrowserPath: options.timeoutMs,
          anonymousFreshContextPerPath: true,
          maxRequestsPerPath: 500,
          allowedMethods: ["GET", "HEAD"],
          serviceWorkers: "blocked",
          webSockets: "blocked",
          topLevelOrigin: new URL(options.url).origin,
        },
        observations: { server, direct, navigation },
        documentComparison: (() => {
          const a = server.pages[0]?.response as { status: number; xRobotsTag: string | null } | undefined;
          const b = (
            direct.pages[0]?.response as
              | { targetDocumentResponse?: { status: number; xRobotsTag: string | null } }
              | undefined
          )?.targetDocumentResponse;
          if (!a || !b)
            return { status: "unavailable", reason: "Both server and target browser document responses are required." };
          const fields = ["status", "xRobotsTag"] as const;
          return {
            status: fields.every((f) => a[f] === b[f]) ? "equal" : "different",
            fields: fields.map((field) => ({ field, server: a[field], browser: b[field] })),
          };
        })(),
        comparisons: {
          serverToDirect: compare(getDom(server), getDom(direct)),
          directToNavigation: navigation ? compare(getDom(direct), getDom(navigation)) : { status: "not_requested" },
        },
        limitations: [
          "Bounded anonymous Chromium observation, not Google rendering or indexing evidence.",
          "A fixed settle interval does not prove hydration or network completion. Captures occur at different times and can see different deployments or personalized content.",
          "Differences are observations, not automatic SEO defects. Equal extracted fields do not prove visible layout, complete content or functional correctness.",
          "Only GET/HEAD requests run; service workers and cross-origin top-level navigation are blocked. This may alter application behavior; ordinary page requests can still reach analytics.",
          "Server HTML is fetched independently with Pagesight's user agent, then parsed inertly in Chromium. A client route may have no target document response; source-document HTTP status is not target status.",
          "No authenticated profile, storage state, browser actions other than one validated anchor click, or arbitrary evaluation scripts are accepted.",
        ],
      };
    } finally {
      await browser.close();
    }
  }).then((result) => {
    const data = result.pages[0]?.response as
      | {
          observations: Record<string, { status: string; pages: Array<{ response: { dom?: SeoDom } }> } | null>;
          comparisons: Record<string, { status: string }>;
        }
      | undefined;
    if (
      data &&
      (Object.values(data.observations).some((e) => e && (e.status !== "ok" || e.pages[0]?.response.dom?.truncated)) ||
        Object.values(data.comparisons).some((c) => c.status === "unavailable"))
    )
      result.status = "partial";
    return result;
  });
}
