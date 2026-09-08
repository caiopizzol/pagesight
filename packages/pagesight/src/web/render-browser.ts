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
export async function launchRenderer(proxy: string) {
  try {
    return await chromium.launch({
      timeout: 15000,
      proxy: { server: proxy, bypass: "<-loopback>" },
      args: ["--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    });
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
async function isolated<T, I>(page: Page, fn: (input: I) => T, input: I): Promise<T> {
  const session = await page.context().newCDPSession(page);
  try {
    const { frameTree } = await session.send("Page.getFrameTree");
    const { executionContextId } = await session.send("Page.createIsolatedWorld", {
      frameId: frameTree.frame.id,
      worldName: "pagesight-evidence",
    });
    const result = await session.send("Runtime.callFunctionOn", {
      functionDeclaration: fn.toString(),
      executionContextId,
      arguments: [{ value: input }],
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error("Isolated extraction failed");
    return result.result.value as T;
  } finally {
    await session.detach();
  }
}
function documentResponse(page: Page) {
  const documents: Array<{ url: string; status: number; location: string | null; xRobotsTag: string | null }> = [];
  const history = { documents, documentsTruncated: false };
  page.on("response", (response) => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
      if (documents.length === 20) {
        history.documentsTruncated = true;
        return;
      }
      const headers = response.headers();
      documents.push({
        url: response.url(),
        status: response.status(),
        location: headers.location ?? null,
        xRobotsTag: headers["x-robots-tag"] ?? null,
      });
    }
  });
  return history;
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
    const history = documentResponse(page);
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
      source = await isolated(page, extractSeo, { url: page.url() });
      const link = page.locator(`css=${options.navigation!.linkSelector}`);
      if ((await link.count()) !== 1)
        throw new RequestError("Navigation selector must identify exactly one anchor.", null, "ambiguous_link");
      const selected = await isolated(
        page,
        (selector: string) => {
          const element = document.querySelector(selector)!;
          return {
            tag: element.tagName,
            href: (element as HTMLAnchorElement).href,
            target: element.getAttribute("target"),
            download: element.hasAttribute("download"),
          };
        },
        options.navigation!.linkSelector,
      );
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
    const dom = await isolated(page, extractSeo, { url: page.url() });
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
      ...history,
      blockedRequests,
      requests,
      pageErrorNames: consoleErrors,
      targetDocumentResponse: history.documentsTruncated
        ? null
        : ([...history.documents].reverse().find((d) => d.url === page.url().split("#")[0]) ?? null),
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
