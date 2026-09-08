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
