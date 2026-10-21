import { rm } from "node:fs/promises";
import {
  base64Url,
  googleLoginPath,
  googleProducts,
  googleTokenRequest,
  readGoogleLogin,
  writeGoogleLogin,
  type GoogleProduct,
} from "./providers/google-auth.js";
import { RequestError } from "./shared/http.js";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const WAIT_MS = 300_000;
// A published Pagesight OAuth "Desktop app" client belongs here; until then sign-in needs the env overrides.
const BUILT_IN_CLIENT = { id: "", secret: "" };

type Outcome = { code: string } | { error: string };

const names = Object.keys(googleProducts) as GoogleProduct[];

function oauthClient(): { id: string; secret: string } {
  const id = process.env.PAGESIGHT_GOOGLE_CLIENT_ID || BUILT_IN_CLIENT.id;
  const secret = process.env.PAGESIGHT_GOOGLE_CLIENT_SECRET || BUILT_IN_CLIENT.secret;
  if (!id || !secret)
    throw new RequestError(
      'Google sign-in needs a Google OAuth "Desktop app" client. Set PAGESIGHT_GOOGLE_CLIENT_ID and PAGESIGHT_GOOGLE_CLIENT_SECRET.',
      null,
      "invalid_input",
    );
  return { id, secret };
}

const randomSegment = (bytes: number) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

const browserPage = (text: string, status = 200) =>
  new Response(`<!doctype html><title>Pagesight</title><p>${text}</p>\n`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

export function browserCommand(platform: NodeJS.Platform, url: string): string[] {
  if (platform === "darwin") return ["open", url];
  // Not "cmd /c start": cmd reads the URL's & separators as new commands and truncates it.
  if (platform === "win32") return ["rundll32", "url.dll,FileProtocolHandler", url];
  return ["xdg-open", url];
}

function openInBrowser(url: string): void {
  try {
    Bun.spawn(browserCommand(process.platform, url), { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
  } catch {
    // The URL is already printed, so the user can still open it.
  }
}

export async function loginGoogle(openBrowser: boolean): Promise<void> {
  const client = oauthClient();
  const verifier = randomSegment(32);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", Buffer.from(verifier))));
  const state = randomSegment(16);
  let settle!: (outcome: Outcome) => void;
  const callback = new Promise<Outcome>((resolve) => {
    settle = resolve;
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const query = new URL(request.url).searchParams;
      // Anything without our state is not our redirect, such as the browser's favicon fetch; keep waiting.
      if (query.get("state") !== state) return browserPage("This is not the Pagesight sign-in response.", 400);
      const code = query.get("code");
      const error = query.get("error");
      settle(code && !error ? { code } : { error: error || "invalid_request" });
      return browserPage(
        code && !error ? "Pagesight is signed in. You can close this tab." : "Sign-in failed. Return to the terminal.",
      );
    },
  });
  const redirectUri = `http://127.0.0.1:${server.port}/callback`;
  const authorize = `${AUTHORIZE_URL}?${new URLSearchParams({
    client_id: client.id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: names.map((name) => googleProducts[name].scope).join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  })}`;
  process.stdout.write(`Grant Pagesight access to Search Console and Analytics:\n${authorize}\n`);
  if (openBrowser) openInBrowser(authorize);
  let expire: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    callback,
    new Promise<Outcome>((resolve) => {
      expire = setTimeout(() => resolve({ error: "timeout" }), WAIT_MS);
    }),
  ]);
  clearTimeout(expire);
  // A graceful stop finishes the browser's in-flight response; stop(true) truncates it.
  await server.stop();
  if ("error" in outcome) {
    if (outcome.error === "timeout") throw new RequestError("Google sign-in timed out", null, "login_timeout");
    if (outcome.error === "access_denied") throw new RequestError("Google sign-in was denied", null, "access_denied");
    throw new RequestError(`Google sign-in failed: ${outcome.error}`, null, "login_failed");
  }
  const token = await googleTokenRequest({
    grant_type: "authorization_code",
    code: outcome.code,
    client_id: client.id,
    client_secret: client.secret,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const scopes = (token.scope ?? "").split(" ").filter(Boolean);
  const granted = names.filter((name) => scopes.includes(googleProducts[name].scope));
  if (!granted.length)
    throw new RequestError("Google granted neither Search Console nor Analytics access", null, "insufficient_scope");
  if (!token.refresh_token)
    throw new RequestError("Google returned no refresh token; sign in again", null, "invalid_response");
  const path = await writeGoogleLogin({
    type: "authorized_user",
    client_id: client.id,
    client_secret: client.secret,
    refresh_token: token.refresh_token,
    scopes,
  });
  for (const name of names.filter((name) => !granted.includes(name)))
    process.stderr.write(`${googleProducts[name].label} access was not granted; sign in again to add it.\n`);
  process.stdout.write(
    `Signed in for ${granted.map((name) => googleProducts[name].label).join(" and ")}, saved to ${path}.\n` +
      "Next: pagesight discover --url https://example.com/\n",
  );
}

export async function logoutGoogle(): Promise<void> {
  const path = googleLoginPath();
  const login = await readGoogleLogin();
  if (login)
    // Revocation is Google's to accept or refuse; the local file goes either way.
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: login.refresh_token }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  const existed = await Bun.file(path).exists();
  await rm(path, { force: true });
  process.stdout.write(existed ? `Signed out and removed ${path}.\n` : "No Pagesight Google login to remove.\n");
}
