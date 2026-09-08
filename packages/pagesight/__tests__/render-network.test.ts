import { expect, test } from "bun:test";
import { publicAddress, checkedRenderAddress } from "../src/web/render-network.js";

test("render egress rejects nonpublic addresses including mapped IPv6", () => {
  for (const address of [
    "0.0.0.0",
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "192.0.2.1",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "fe80::1%lo0",
  ])
    expect(publicAddress(address)).toBe(false);
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) expect(publicAddress(address)).toBe(true);
});

test("mixed DNS answers fail closed and each new connection rechecks addresses", async () => {
  const url = new URL("https://example.com/");
  expect(
    await checkedRenderAddress(url, url, async () => [{ address: "1.1.1.1" }, { address: "::1" }]).catch(
      () => "blocked",
    ),
  ).toBe("blocked");
  let calls = 0;
  const resolve = async () => [{ address: ++calls === 1 ? "1.1.1.1" : "127.0.0.1" }];
  expect(await checkedRenderAddress(url, url, resolve)).toBe("1.1.1.1");
  expect(calls).toBe(1);
  expect(await checkedRenderAddress(url, url, resolve).catch(() => "blocked")).toBe("blocked");
  expect(calls).toBe(2);
});

test("a truncated upstream response fails without crashing the proxy process", async () => {
  const module = new URL("../src/web/render-network.ts", import.meta.url).href;
  const script = `
    import { createServer } from "node:net";
    import { startRenderNetwork } from ${JSON.stringify(module)};
    const server = createServer(socket => {
      socket.on("error", () => {});
      socket.once("data", () => {
        socket.write("HTTP/1.1 200 OK\\r\\nContent-Length: 1000\\r\\nContent-Type: text/html\\r\\n\\r\\n<title>short</title>");
        setTimeout(() => socket.destroy(), 20);
      });
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = "http://127.0.0.1:" + server.address().port;
    const network = await startRenderNetwork(url);
    try {
      const signal = AbortSignal.timeout(2000);
      let failed = false;
      try { await (await fetch(url, { proxy: network.proxy, signal })).text(); }
      catch { failed = true; }
      if (!failed) throw new Error("Truncated response accepted");
      if (signal.aborted) throw new Error("Truncated upstream left downstream hanging");
    } finally {
      await network.close();
      await new Promise(resolve => server.close(resolve));
    }
    console.log("survived");
  `;
  const child = Bun.spawn([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({ exitCode, stderr, stdout }).toEqual({ exitCode: 0, stderr: "", stdout: "survived\n" });
}, 5000);
