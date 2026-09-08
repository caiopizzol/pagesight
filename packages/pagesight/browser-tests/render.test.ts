import { expect, test } from "bun:test";
import { execute } from "../src/api/index.js";

const html = (title: string, body: string, extra = "") =>
  `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title}"><link rel="canonical" href="/target">${extra}</head><body><h1>${title}</h1>${body}</body></html>`;
const start = () =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/missing") return new Response("missing", { status: 404 });
      if (path === "/from" || path === "/fixed")
        return new Response(
          html(
            "Source",
            `<a id="go" href="/target">Target</a><script>document.querySelector('#go').onclick=e=>{e.preventDefault();history.pushState({},'', '/target');document.querySelector('h1').textContent='Target';${path === "/fixed" ? "document.title='Target';document.querySelector('meta[name=description]').content='Target';" : ""}}</script>`,
          ),
          { headers: { "content-type": "text/html" } },
        );
      if (path === "/duplicate")
        return new Response(
          html(
            "First",
            "",
            '<title>Second</title><meta name="description" content=""><link rel="CANONICAL alternate" href="/duplicate"><script type="application/ld+json">{broken</script>',
          ),
          { headers: { "content-type": "text/html" } },
        );
      return new Response(html("Target", '<a id="go" href="/target">Target</a>'), {
        headers: { "content-type": "text/html", "x-robots-tag": "noindex" },
      });
    },
  });

test("real Chromium catches stale SPA metadata and preserves source/target HTTP distinction", async () => {
  const server = start();
  try {
    const result = await execute({
      operation: "page.verify",
      url: new URL("target", server.url).href,
      navigation: { fromUrl: new URL("from", server.url).href, linkSelector: "#go" },
      settleMs: 10,
      timeoutMs: 3000,
    });
    const data = result.pages[0]?.response as any;
    expect(result.status).toBe("ok");
    expect(data.comparisons.serverToDirect.status).toBe("equal");
    expect(data.comparisons.directToNavigation.differences.map((d: any) => d.field)).toContain("titles");
    expect(data.observations.navigation.pages[0].response.dom.titles).toEqual(["Source"]);
    expect(data.observations.navigation.pages[0].response.targetDocumentResponse).toBeNull();
    expect(data.observations.direct.pages[0].response.targetDocumentResponse.xRobotsTag).toBe("noindex");
    const fixed = await execute({
      operation: "page.verify",
      url: new URL("target", server.url).href,
      navigation: { fromUrl: new URL("fixed", server.url).href, linkSelector: "#go" },
      settleMs: 10,
      timeoutMs: 3000,
    });
    expect((fixed.pages[0]!.response as any).comparisons.directToNavigation.status).toBe("equal");
  } finally {
    await server.stop(true);
  }
}, 20000);

test("duplicates and invalid JSON survive extraction; absent link is failure rather than equal", async () => {
  const server = start();
  try {
    const result = await execute({
      operation: "page.verify",
      url: new URL("duplicate", server.url).href,
      navigation: { fromUrl: new URL("from", server.url).href, linkSelector: "#absent" },
      settleMs: 0,
      timeoutMs: 3000,
    });
    const data = result.pages[0]?.response as any;
    expect(result.status).toBe("partial");
    expect(data.observations.server.pages[0].response.dom.titles).toEqual(["First", "Second"]);
    expect(data.observations.server.pages[0].response.dom.descriptions).toEqual(["First", ""]);
    expect(data.observations.server.pages[0].response.dom.jsonLd[0]).toEqual({ raw: "{broken", validJson: false });
    expect(data.observations.navigation.error.code).toBe("ambiguous_link");
    expect(data.comparisons.directToNavigation.status).toBe("unavailable");
  } finally {
    await server.stop(true);
  }
}, 15000);

test("bounded capture timeout and truncated evidence cannot masquerade as an equal comparison", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === "/source")
        return new Response(html("Source", '<a id="go" href="/target" onclick="event.preventDefault()">Target</a>'), {
          headers: { "content-type": "text/html" },
        });
      return new Response(html("Target", '<a href="/">x</a>'.repeat(201)), {
        headers: { "content-type": "text/html" },
      });
    },
  });
  try {
    const result = await execute({
      operation: "page.verify",
      url: new URL("target", server.url).href,
      navigation: { fromUrl: new URL("source", server.url).href, linkSelector: "#go" },
      settleMs: 0,
      timeoutMs: 1000,
    });
    const data = result.pages[0]!.response as any;
    expect(result.status).toBe("partial");
    expect(data.observations.direct.pages[0].response.dom.truncated).toBe(true);
    expect(data.comparisons.serverToDirect.status).toBe("unavailable");
    expect(data.observations.navigation.status).toBe("error");
    expect(data.comparisons.directToNavigation.status).toBe("unavailable");
  } finally {
    await server.stop(true);
  }
}, 10000);

test("DOM equality does not hide differing HTTP evidence and fragment captures remain comparable", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const isServer = request.headers.get("user-agent")?.startsWith("Pagesight/");
      return new Response(html("Same", '<a href="/">Home</a>'), {
        status: isServer ? 200 : 403,
        headers: { "content-type": "text/html", "x-robots-tag": isServer ? "index" : "noindex" },
      });
    },
  });
  try {
    const result = await execute({
      operation: "page.verify",
      url: new URL("target#section", server.url).href,
      settleMs: 0,
    });
    const data = result.pages[0]!.response as any;
    expect(data.comparisons.serverToDirect.status).toBe("equal");
    expect(data.observations.direct.pages[0].response.documents[0].status).toBe(403);
    expect(data.documentComparison.status).toBe("different");
    const normal = await execute({ operation: "page.verify", url: new URL("target", server.url).href, settleMs: 0 });
    expect((normal.pages[0]!.response as any).documentComparison.status).toBe("different");
  } finally {
    await server.stop(true);
  }
}, 10000);

test("page scripts cannot replace extraction primitives", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        html(
          "Actual",
          "",
          `<script type="application/ld+json">{broken</script><script>JSON.parse=()=>({}); Document.prototype.querySelectorAll=()=>[];</script>`,
        ),
        { headers: { "content-type": "text/html" } },
      ),
  });
  try {
    const result = await execute({ operation: "page.verify", url: server.url.href, settleMs: 0 });
    const data = result.pages[0]!.response as any;
    expect(data.observations.direct.pages[0].response.dom.titles).toEqual(["Actual"]);
    expect(data.observations.direct.pages[0].response.dom.jsonLd[0].validJson).toBe(false);
    expect(data.comparisons.serverToDirect.status).toBe("equal");
  } finally {
    await server.stop(true);
  }
}, 10000);

test("fragment document navigation retains target HTTP evidence and reports capped history", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/hop/")) {
        const hop = Number(path.split("/")[2]);
        if (hop < 19) return new Response(null, { status: 302, headers: { location: `/hop/${hop + 1}` } });
      }
      return new Response(html("Target", '<a id="go" href="/target#section">Target</a>'), {
        headers: { "content-type": "text/html", "x-robots-tag": "noindex" },
      });
    },
  });
  try {
    const request = {
      operation: "page.verify",
      url: new URL("target#section", server.url).href,
      settleMs: 0,
      navigation: { fromUrl: server.url.href, linkSelector: "#go" },
    };
    const result = await execute(request);
    expect(
      (result.pages[0]!.response as any).observations.navigation.pages[0].response.targetDocumentResponse.xRobotsTag,
    ).toBe("noindex");
    const capped = await execute({
      ...request,
      navigation: { ...request.navigation, fromUrl: new URL("hop/0", server.url).href },
    });
    const data = capped.pages[0]!.response as any;
    expect(data.observations.navigation.pages[0].response.documentsTruncated).toBe(true);
    expect(capped.status).toBe("partial");
  } finally {
    await server.stop(true);
  }
}, 15000);

test("a rendered fixture cannot reach other local services by subresource or hostname alias", async () => {
  let privateHits = 0;
  const privateService = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => {
      privateHits++;
      return new Response("private");
    },
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        html(
          "Safe",
          `<img src="${privateService.url}image"><iframe src="${privateService.url}frame"></iframe><script>fetch('${privateService.url}fetch');fetch('${privateService.url.href.replace("127.0.0.1", "localhost")}alias')</script>`,
        ),
        { headers: { "content-type": "text/html" } },
      ),
  });
  try {
    const result = await execute({ operation: "page.verify", url: server.url.href, settleMs: 100 });
    const data = result.pages[0]!.response as any;
    expect(data.observations.direct.pages[0].response.dom.titles).toEqual(["Safe"]);
    expect(data.network.blockedRequests).toBeGreaterThanOrEqual(4);
    expect(privateHits).toBe(0);
    const denied = await execute({
      operation: "page.verify",
      url: privateService.url.href.replace("127.0.0.1", "localhost"),
      settleMs: 0,
    });
    expect((denied.pages[0]!.response as any).observations.server.status).toBe("error");
    expect(privateHits).toBe(0);
  } finally {
    await server.stop(true);
    await privateService.stop(true);
  }
}, 10000);

test("truncated HTTP bodies produce failed observations rather than equal metadata", async () => {
  const { createServer } = await import("node:net");
  const server = createServer((socket) => {
    socket.on("error", () => {});
    socket.once("data", () => {
      socket.write(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 1000\r\n\r\n<title>Incomplete</title>",
      );
      setTimeout(() => socket.destroy(), 20);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const result = await execute({
      operation: "page.verify",
      url: `http://127.0.0.1:${address.port}/`,
      settleMs: 0,
      timeoutMs: 1000,
    });
    const data = result.pages[0]!.response as any;
    expect(result.status).toBe("partial");
    expect(data.observations.server.status).toBe("error");
    expect(data.observations.direct.status).toBe("error");
    expect(data.comparisons.serverToDirect.status).toBe("unavailable");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 5000);
