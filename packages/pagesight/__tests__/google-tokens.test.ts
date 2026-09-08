import { mockFetch, requestUrl } from "./support/fetch.js";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearTokenCache, getServiceAccountToken } from "../src/lib/auth.js";
import { gaAccessToken, gaFetch } from "../src/lib/ga.js";
import { listSites } from "../src/lib/gsc.js";

test("service-account token exchange signs the requested provider scope", async () => {
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pem = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
  const dir = await mkdtemp(join(tmpdir(), "pagesight-auth-"));
  const path = join(dir, "key.json");
  await Bun.write(
    path,
    JSON.stringify({
      client_email: "fixture@example.com",
      private_key: `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`,
    }),
  );
  const assertions: string[] = [];
  const mocked = mockFetch(async (_input, init) => {
    assertions.push(new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : "").get("assertion") ?? "");
    return Response.json({ access_token: "fixture-token" });
  });
  try {
    expect(await getServiceAccountToken(path, "https://www.googleapis.com/auth/analytics.readonly")).toBe(
      "fixture-token",
    );
    const [header, payload, signature] = assertions[0].split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString()).scope).toBe(
      "https://www.googleapis.com/auth/analytics.readonly",
    );
    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        keys.publicKey,
        Buffer.from(signature, "base64url"),
        new TextEncoder().encode(`${header}.${payload}`),
      ),
    ).toBe(true);
  } finally {
    mocked.mockRestore();
    await rm(dir, { recursive: true, force: true });
  }
});

test("GSC and GA refresh their own cached token after a 401", async () => {
  const env = [
    "GSC_SERVICE_ACCOUNT_KEY",
    "GSC_CLIENT_ID",
    "GSC_CLIENT_SECRET",
    "GSC_REFRESH_TOKEN",
    "PAGESIGHT_GA_CREDENTIALS",
  ];
  const previous = env.map((key) => process.env[key]);
  const dir = await mkdtemp(join(tmpdir(), "pagesight-refresh-"));
  const path = join(dir, "adc.json");
  await Bun.write(
    path,
    JSON.stringify({
      type: "authorized_user",
      client_id: "ga-client",
      client_secret: "secret",
      refresh_token: "refresh",
    }),
  );
  delete process.env.GSC_SERVICE_ACCOUNT_KEY;
  process.env.GSC_CLIENT_ID = "gsc-client";
  process.env.GSC_CLIENT_SECRET = "secret";
  process.env.GSC_REFRESH_TOKEN = "refresh";
  process.env.PAGESIGHT_GA_CREDENTIALS = path;
  clearTokenCache();
  const exchanges: string[] = [];
  const mocked = mockFetch(async (input, init) => {
    if (requestUrl(input).includes("oauth2.googleapis.com")) {
      exchanges.push(
        new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : "").get("client_id") ?? "",
      );
      return Response.json({ access_token: "fixture-token" });
    }
    return new Response("unauthorized", { status: 401 });
  });
  try {
    expect(await listSites().catch((error) => error)).toBeInstanceOf(Error);
    expect(await listSites().catch((error) => error)).toBeInstanceOf(Error);
    expect(await gaAccessToken()).toBe("fixture-token");
    expect(await gaFetch("properties/1").catch((error) => error)).toBeInstanceOf(Error);
    expect(await gaAccessToken()).toBe("fixture-token");
    expect(exchanges).toEqual(["gsc-client", "gsc-client", "ga-client", "ga-client"]);
  } finally {
    mocked.mockRestore();
    clearTokenCache();
    env.forEach((key, index) => {
      const value = previous[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    await rm(dir, { recursive: true, force: true });
  }
});
