import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const entry = new URL("../../src/index.ts", import.meta.url).pathname;
const preload = new URL("../support/offline-login.ts", import.meta.url).pathname;
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

type Workspace = { root: string; config: string; login: string; env: Record<string, string> };
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function workspace(scope = `${GSC_SCOPE} ${GA_SCOPE}`): Promise<Workspace> {
  const root = await mkdtemp(join(tmpdir(), "pagesight-login-"));
  roots.push(root);
  const config = join(root, "config");
  await mkdir(join(root, "home"), { recursive: true });
  return {
    root,
    config,
    login: join(config, "google.json"),
    env: {
      PATH: process.env.PATH ?? "",
      HOME: join(root, "home"),
      PAGESIGHT_CONFIG_DIR: config,
      PAGESIGHT_GOOGLE_CLIENT_ID: "fixture-client",
      PAGESIGHT_GOOGLE_CLIENT_SECRET: "fixture-secret",
      PAGESIGHT_LOGIN_LOG: join(root, "requests.log"),
      PAGESIGHT_FIXTURE_SCOPE: scope,
    },
  };
}

const start = ({ root, env }: Workspace, ...argv: string[]) =>
  Bun.spawn([process.execPath, "--no-env-file", "--preload", preload, entry, ...argv], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

async function run(space: Workspace, ...argv: string[]) {
  const child = start(space, ...argv);
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exit, stdout, stderr };
}

async function requests(space: Workspace): Promise<Array<Record<string, string>>> {
  const file = Bun.file(space.env.PAGESIGHT_LOGIN_LOG);
  if (!(await file.exists())) return [];
  return (await file.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, string>);
}

// The CLI prints the authorize URL and then waits, so stdout has to be read while it runs.
function reader(stream: ReadableStream<Uint8Array>) {
  const source = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  return {
    async until(ready: (text: string) => boolean): Promise<string> {
      while (!ready(text)) {
        const { done, value } = await source.read();
        if (done) throw new Error(`The CLI exited before it was ready:\n${text}`);
        text += decoder.decode(value, { stream: true });
      }
      return text;
    },
    async rest(): Promise<string> {
      for (;;) {
        const { done, value } = await source.read();
        if (done) return text;
        text += decoder.decode(value, { stream: true });
      }
    },
  };
}

async function authorize(space: Workspace) {
  const child = start(space, "login", "google", "--no-browser");
  const stdout = reader(child.stdout as ReadableStream<Uint8Array>);
  const printed = await stdout.until((text) => text.split("\n").length > 2);
  return { child, stdout, url: new URL(printed.split("\n")[1]) };
}

test("login google authorizes with PKCE and saves a login both products then use", async () => {
  const space = await workspace();
  const { child, stdout, url } = await authorize(space);
  expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(url.searchParams.get("client_id")).toBe("fixture-client");
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("scope")).toBe(`${GSC_SCOPE} ${GA_SCOPE}`);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("access_type")).toBe("offline");
  expect(url.searchParams.get("prompt")).toBe("consent");
  expect(url.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
  const state = url.searchParams.get("state") ?? "";
  expect(state).toMatch(/^[\w-]{22}$/);
  const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
  expect(redirect.hostname).toBe("127.0.0.1");
  expect(redirect.pathname).toBe("/callback");

  const refused = await fetch(`${redirect.href}?code=fixture-code&state=wrong-state`);
  expect(refused.status).toBe(400);
  expect(await refused.text()).toContain("not the Pagesight sign-in response");

  const accepted = await fetch(`${redirect.href}?code=fixture-code&state=${encodeURIComponent(state)}`);
  expect(accepted.status).toBe(200);
  expect(await accepted.text()).toContain("Pagesight is signed in");
  expect(await child.exited).toBe(0);

  expect(await Bun.file(space.login).json()).toEqual({
    type: "authorized_user",
    client_id: "fixture-client",
    client_secret: "fixture-secret",
    refresh_token: "fixture-refresh",
    scopes: [GSC_SCOPE, GA_SCOPE],
  });
  expect((await stat(space.config)).mode & 0o777).toBe(0o700);
  expect((await stat(space.login)).mode & 0o777).toBe(0o600);
  const printed = await stdout.rest();
  expect(printed).toContain(`Signed in for Search Console and Analytics, saved to ${space.login}.`);
  expect(printed).toContain("Next: pagesight discover --url https://example.com/");
  expect(printed).not.toContain("fixture-refresh");
  expect(printed).not.toContain("fixture-secret");
  const exchange = (await requests(space)).at(-1) ?? {};
  expect(exchange.grant_type).toBe("authorization_code");
  expect(exchange.challenge).toBe(url.searchParams.get("code_challenge") ?? "");

  const sites = await run(space, "gsc", "sites");
  const accounts = await run(space, "ga", "accounts");
  expect([sites.exit, accounts.exit]).toEqual([0, 0]);
  expect(JSON.parse(accounts.stdout).credential).toEqual({
    source: "pagesight_login",
    type: "authorized_user",
    clientEmail: null,
  });
  const refreshes = (await requests(space)).filter((request) => request.grant_type === "refresh_token");
  expect(refreshes.map((request) => request.refresh_token)).toEqual(["fixture-refresh", "fixture-refresh"]);
});

test("a login without the Analytics scope warns and leaves GA unconfigured", async () => {
  const space = await workspace(GSC_SCOPE);
  const { child, stdout, url } = await authorize(space);
  const state = url.searchParams.get("state") ?? "";
  await fetch(`${new URL(url.searchParams.get("redirect_uri") ?? "").href}?code=fixture-code&state=${state}`);
  expect(await child.exited).toBe(0);
  expect(await stdout.rest()).toContain("Signed in for Search Console, saved to");
  expect(await new Response(child.stderr).text()).toBe("Analytics access was not granted; sign in again to add it.\n");
  expect((await Bun.file(space.login).json()).scopes).toEqual([GSC_SCOPE]);
  const accounts = await run(space, "ga", "accounts");
  expect(accounts.exit).toBe(1);
  expect(JSON.parse(accounts.stdout).error.code).toBe("not_configured");
});

test("a denied sign-in fails without writing a login", async () => {
  const space = await workspace();
  const { child, url } = await authorize(space);
  const state = url.searchParams.get("state") ?? "";
  const denied = await fetch(
    `${new URL(url.searchParams.get("redirect_uri") ?? "").href}?error=access_denied&state=${state}`,
  );
  expect(denied.status).toBe(200);
  expect(await denied.text()).toContain("Sign-in failed");
  expect(await child.exited).toBe(1);
  expect(JSON.parse(await new Response(child.stderr).text()).error).toEqual({
    code: "access_denied",
    message: "Google sign-in was denied",
  });
  expect(await Bun.file(space.login).exists()).toBe(false);
});

test("logout revokes the saved refresh token and removes the file", async () => {
  const space = await workspace();
  await Bun.write(
    space.login,
    JSON.stringify({
      type: "authorized_user",
      client_id: "fixture-client",
      client_secret: "fixture-secret",
      refresh_token: "fixture-refresh",
      scopes: [GSC_SCOPE, GA_SCOPE],
    }),
  );
  const first = await run(space, "logout");
  expect(first).toEqual({ exit: 0, stdout: `Signed out and removed ${space.login}.\n`, stderr: "" });
  expect(await Bun.file(space.login).exists()).toBe(false);
  expect(await requests(space)).toEqual([{ url: "https://oauth2.googleapis.com/revoke", token: "fixture-refresh" }]);
  const second = await run(space, "logout");
  expect(second).toEqual({ exit: 0, stdout: "No Pagesight Google login to remove.\n", stderr: "" });
});

test("GA falls back to the gcloud ADC file when nothing else is configured", async () => {
  const space = await workspace();
  await Bun.write(
    join(space.env.HOME, ".config/gcloud/application_default_credentials.json"),
    JSON.stringify({
      type: "authorized_user",
      client_id: "adc-client",
      client_secret: "adc-secret",
      refresh_token: "adc-refresh",
    }),
  );
  const accounts = await run(space, "ga", "accounts");
  expect(accounts.exit).toBe(0);
  expect(JSON.parse(accounts.stdout).credential).toEqual({
    source: "gcloud_adc",
    type: "authorized_user",
    clientEmail: null,
  });
  expect((await requests(space)).map((request) => request.refresh_token)).toEqual(["adc-refresh"]);
});
