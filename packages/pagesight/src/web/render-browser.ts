import { chromium, type Browser, type Page } from "playwright";
import { RequestError } from "../shared/http.js";
import { extractSeo, type SeoDom } from "./render-dom.js";

export interface RenderOptions {
  url: string;
  navigation?: { fromUrl: string; linkSelector: string };
  settleMs: number;
  timeoutMs: number;
  viewport: { width: number; height: number };
}
export async function launchRenderer() {
  try {
    return await chromium.launch({ timeout: 15000 });
  } catch {
    throw new RequestError(
      "Chromium unavailable. Run bunx playwright install chromium in the Pagesight installation and check browser OS dependencies.",
      null,
      "browser_unavailable",
    );
  }
}
export async function parseServer(browser: Browser, html: string, url: string) {
  const context = await browser.newContext({ javaScriptEnabled: false, offline: true, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    return await page.evaluate(extractSeo, { html, url });
  } finally {
    await context.close();
  }
}
function documentResponse(page: Page) {
  const documents: Array<{ url: string; status: number; location: string | null; xRobotsTag: string | null }> = [];
  page.on("response", (response) => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame() && documents.length < 20) {
      const headers = response.headers();
      documents.push({
        url: response.url(),
        status: response.status(),
        location: headers.location ?? null,
        xRobotsTag: headers["x-robots-tag"] ?? null,
      });
    }
  });
  return documents;
}
export async function captureRendered(browser: Browser, options: RenderOptions, navigate: boolean) {
  const origin = new URL(options.url).origin;
  const context = await browser.newContext({
    viewport: options.viewport,
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    void context.close().catch(() => {});
  }, options.timeoutMs);
  let blockedRequests = 0;
  let requests = 0;
  try {
    await context.routeWebSocket("**/*", async (socket) => {
      blockedRequests++;
      await socket.close();
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        ++requests > 500 ||
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        !["GET", "HEAD"].includes(request.method()) ||
        (request.isNavigationRequest() && request.frame().parentFrame() === null && url.origin !== origin)
      ) {
        blockedRequests++;
        await route.abort();
      } else await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    const documents = documentResponse(page);
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => {
      if (consoleErrors.length < 20) consoleErrors.push(error.name);
    });
    const initialUrl = navigate ? options.navigation!.fromUrl : options.url;
    const initial = await page.goto(initialUrl, { waitUntil: "domcontentloaded" });
    if (!initial || !initial.headers()["content-type"]?.includes("text/html"))
      throw new RequestError("Browser document is not HTML.", initial?.status() ?? null, "not_html");
    await page.waitForTimeout(options.settleMs);
    let clickedLink: { selector: string; href: string } | null = null;
    let source: SeoDom | null = null;
    if (navigate) {
      source = await page.evaluate(extractSeo, { url: page.url() });
      const link = page.locator(`css=${options.navigation!.linkSelector}`);
      if ((await link.count()) !== 1)
        throw new RequestError("Navigation selector must identify exactly one anchor.", null, "ambiguous_link");
      const selected = await link.evaluate((element) => ({
        tag: element.tagName,
        href: (element as HTMLAnchorElement).href,
        target: element.getAttribute("target"),
        download: element.hasAttribute("download"),
      }));
      if (
        selected.tag !== "A" ||
        selected.href !== options.url ||
        selected.download ||
        (selected.target && selected.target !== "_self")
      )
        throw new RequestError(
          "Select a same-tab anchor whose resolved href exactly matches the requested URL.",
          null,
          "invalid_link",
        );
      clickedLink = { selector: options.navigation!.linkSelector, href: selected.href };
      await link.click({ noWaitAfter: true });
      await page.waitForURL((url) => url.href === options.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(options.settleMs);
    }
    const dom = await page.evaluate(extractSeo, { url: page.url() });
    return {
      path: navigate ? "internal_navigation" : "direct",
      initialUrl,
      requestedUrl: options.url,
      finalUrl: page.url(),
      capturedAt: new Date().toISOString(),
      dom,
      domSha256: Bun.CryptoHasher.hash("sha256", JSON.stringify(dom), "hex"),
      source,
      clickedLink,
      documents,
      blockedRequests,
      requests,
      pageErrorNames: consoleErrors,
      targetDocumentResponse:
        [...documents].reverse().find((d) => d.url === (navigate ? page.url() : page.url().split("#")[0])) ?? null,
    };
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      timedOut
        ? "Browser capture exceeded its time budget."
        : "Browser navigation or capture failed; no rendered evidence was inferred.",
      null,
      timedOut ? "render_timeout" : "render_failed",
    );
  } finally {
    clearTimeout(deadline);
    await context.close().catch(() => {});
  }
}
