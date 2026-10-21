import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearGoogleTokens,
  googleAccessToken,
  googleCredentialInfo,
  googleLoginPath,
  writeGoogleLogin,
  type GoogleLogin,
} from "../../src/providers/google-auth.js";
import { gaFetch } from "../../src/providers/ga.js";
import { listSitesResponse } from "../../src/providers/gsc.js";
import { mockFetch, requestUrl } from "../support/fetch.js";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const KEYS = [
  "PAGESIGHT_CONFIG_DIR",
  "XDG_CONFIG_HOME",
  "GSC_SERVICE_ACCOUNT_KEY",
  "GSC_CLIENT_ID",
  "GSC_CLIENT_SECRET",
  "GSC_REFRESH_TOKEN",
  "PAGESIGHT_GA_CREDENTIALS",
  "GOOGLE_APPLICATION_CREDENTIALS",
];

const directories: string[] = [];
async function sandbox(environment: Record<string, string> = {}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pagesight-auth-"));
  directories.push(directory);
  for (const key of KEYS) delete process.env[key];
  process.env.PAGESIGHT_CONFIG_DIR = directory;
  Object.assign(process.env, environment);
  clearGoogleTokens();
  return directory;
}

const login = (scopes: string[], refreshToken = "login-refresh"): GoogleLogin => ({
  type: "authorized_user",
  client_id: "login-client",
  client_secret: "login-secret",
  refresh_token: refreshToken,
  scopes,
});

const previous = KEYS.map((key) => process.env[key]);
afterEach(async () => {
  KEYS.forEach((key, index) => {
    const value = previous[index];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  clearGoogleTokens();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

test("the login path follows PAGESIGHT_CONFIG_DIR, then XDG_CONFIG_HOME", async () => {
  const directory = await sandbox();
  expect(googleLoginPath()).toBe(join(directory, "google.json"));
  delete process.env.PAGESIGHT_CONFIG_DIR;
  process.env.XDG_CONFIG_HOME = directory;
  expect(googleLoginPath()).toBe(join(directory, "pagesight", "google.json"));
});

test("the login file is written atomically with a private directory and file", async () => {
  const parent = await sandbox();
  const directory = join(parent, "pagesight");
  process.env.PAGESIGHT_CONFIG_DIR = directory;
  // A world-readable config directory and a temporary file left by an interrupted write.
  await mkdir(directory, { mode: 0o755 });
  await Bun.write(join(directory, `google.json.${process.pid}.tmp`), "stale");
  await chmod(join(directory, `google.json.${process.pid}.tmp`), 0o644);
  const path = await writeGoogleLogin(login([GSC_SCOPE, GA_SCOPE]));
  expect(path).toBe(join(directory, "google.json"));
  expect((await stat(directory)).mode & 0o777).toBe(0o700);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  await writeGoogleLogin(login([GA_SCOPE], "second-refresh"));
  expect(await Bun.file(path).json()).toEqual(login([GA_SCOPE], "second-refresh"));
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(await readdir(directory)).toEqual(["google.json"]);
});

test("both products use the login file when no environment credential is set", async () => {
  await sandbox();
  await writeGoogleLogin(login([GSC_SCOPE, GA_SCOPE]));
  const expected = { source: "pagesight_login", type: "authorized_user", clientEmail: null };
  expect(await googleCredentialInfo("gsc")).toEqual(expected);
  expect(await googleCredentialInfo("ga")).toEqual(expected);
  const refreshed: string[] = [];
  const mocked = mockFetch(async (_input, init) => {
    refreshed.push(new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : "").get("refresh_token")!);
    return Response.json({ access_token: "login-access", expires_in: 3600 });
  });
  try {
    expect(await googleAccessToken("gsc")).toBe("login-access");
    expect(await googleAccessToken("ga")).toBe("login-access");
    expect(refreshed).toEqual(["login-refresh", "login-refresh"]);
  } finally {
    mocked.mockRestore();
  }
});

test("environment credentials override the login file for their own product", async () => {
  const directory = await sandbox();
  await writeGoogleLogin(login([GSC_SCOPE, GA_SCOPE]));
  const adc = join(directory, "ga.json");
  await Bun.write(
    adc,
    JSON.stringify({
      type: "authorized_user",
      client_id: "env-client",
      client_secret: "env-secret",
      refresh_token: "env-refresh",
    }),
  );
  process.env.GSC_CLIENT_ID = "env-client";
  process.env.GSC_CLIENT_SECRET = "env-secret";
  process.env.GSC_REFRESH_TOKEN = "env-refresh";
  process.env.PAGESIGHT_GA_CREDENTIALS = "";
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adc;
  expect(await googleCredentialInfo("gsc")).toEqual({
    source: "GSC_CLIENT_ID",
    type: "authorized_user",
    clientEmail: null,
  });
  expect(await googleCredentialInfo("ga")).toEqual({
    source: "GOOGLE_APPLICATION_CREDENTIALS",
    type: "authorized_user",
    clientEmail: null,
  });
});

test("a product whose scope the login never granted has no credential", async () => {
  await sandbox();
  await writeGoogleLogin(login([GA_SCOPE]));
  expect(await googleCredentialInfo("gsc")).toEqual({ source: "none", type: null, clientEmail: null });
  expect(await googleCredentialInfo("ga")).toEqual({
    source: "pagesight_login",
    type: "authorized_user",
    clientEmail: null,
  });
  expect(await googleAccessToken("gsc").catch((error: Error) => error.message)).toBe(
    'No Google credentials for Search Console. Run "pagesight login google", or set GSC_SERVICE_ACCOUNT_KEY, or GSC_CLIENT_ID with GSC_CLIENT_SECRET and GSC_REFRESH_TOKEN.',
  );
});

test("a service-account key signs the requesting product's scope", async () => {
  const directory = await sandbox();
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pem = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
  const path = join(directory, "key.json");
  await Bun.write(
    path,
    JSON.stringify({
      type: "service_account",
      client_email: "fixture@example.com",
      private_key: `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`,
    }),
  );
  process.env.GSC_SERVICE_ACCOUNT_KEY = path;
  process.env.PAGESIGHT_GA_CREDENTIALS = path;
  const assertions: string[] = [];
  const mocked = mockFetch(async (_input, init) => {
    assertions.push(new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : "").get("assertion") ?? "");
    return Response.json({ access_token: "fixture-token", expires_in: 3600 });
  });
  try {
    expect(await googleCredentialInfo("ga")).toEqual({
      source: "PAGESIGHT_GA_CREDENTIALS",
      type: "service_account",
      clientEmail: "fixture@example.com",
    });
    expect(await googleAccessToken("gsc")).toBe("fixture-token");
    expect(await googleAccessToken("ga")).toBe("fixture-token");
    const parts = assertions.map((assertion) => assertion.split("."));
    const claims = parts.map(([, payload]) => JSON.parse(Buffer.from(payload, "base64url").toString()));
    expect(claims.map((claim) => claim.scope)).toEqual([GSC_SCOPE, GA_SCOPE]);
    expect(claims[0].iss).toBe("fixture@example.com");
    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        keys.publicKey,
        Buffer.from(parts[0][2], "base64url"),
        new TextEncoder().encode(`${parts[0][0]}.${parts[0][1]}`),
      ),
    ).toBe(true);
  } finally {
    mocked.mockRestore();
  }
});

test("each product refreshes only its own cached token after a 401", async () => {
  const directory = await sandbox();
  const adc = join(directory, "ga.json");
  await Bun.write(
    adc,
    JSON.stringify({
      type: "authorized_user",
      client_id: "ga-client",
      client_secret: "secret",
      refresh_token: "refresh",
    }),
  );
  process.env.GSC_CLIENT_ID = "gsc-client";
  process.env.GSC_CLIENT_SECRET = "secret";
  process.env.GSC_REFRESH_TOKEN = "refresh";
  process.env.PAGESIGHT_GA_CREDENTIALS = adc;
  const exchanges: string[] = [];
  const mocked = mockFetch(async (input, init) => {
    if (requestUrl(input).includes("oauth2.googleapis.com")) {
      exchanges.push(
        new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : "").get("client_id") ?? "",
      );
      return Response.json({ access_token: "fixture-token", expires_in: 3600 });
    }
    return new Response("unauthorized", { status: 401 });
  });
  try {
    expect(await listSitesResponse().catch((error) => error)).toBeInstanceOf(Error);
    expect(await listSitesResponse().catch((error) => error)).toBeInstanceOf(Error);
    expect(await googleAccessToken("ga")).toBe("fixture-token");
    expect(await gaFetch("properties/1").catch((error) => error)).toBeInstanceOf(Error);
    expect(await googleAccessToken("ga")).toBe("fixture-token");
    expect(exchanges).toEqual(["gsc-client", "gsc-client", "ga-client", "ga-client"]);
  } finally {
    mocked.mockRestore();
  }
});
