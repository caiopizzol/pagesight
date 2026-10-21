// Preloaded into the CLI processes of __tests__/transports/login.test.ts. It answers Google's OAuth
// and read endpoints offline and appends every request to PAGESIGHT_LOGIN_LOG, including the challenge
// derived from any code_verifier it receives. Requests to the CLI's loopback server are passed through.
import { appendFileSync } from "node:fs";

const env = process.env as Record<string, string>;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCESS_TOKEN = "fixture-access";
const json = (value: unknown, status = 200) => Response.json(value, { status });
const authorized = (value: unknown) => (headers: Headers) =>
  headers.get("authorization") === `Bearer ${ACCESS_TOKEN}`
    ? json(value)
    : json({ error: { code: 401, status: "UNAUTHENTICATED" } }, 401);
const reads: Record<string, (headers: Headers) => Response> = {
  "https://www.googleapis.com/webmasters/v3/sites": authorized({ siteEntry: [] }),
  "https://analyticsadmin.googleapis.com/v1beta/accountSummaries": authorized({ accountSummaries: [] }),
};

function token(form: URLSearchParams): Response {
  if (form.get("grant_type") === "authorization_code")
    return form.get("code") === "fixture-code" &&
      form.get("code_verifier") &&
      form.get("client_secret") === env.PAGESIGHT_GOOGLE_CLIENT_SECRET
      ? json({
          access_token: ACCESS_TOKEN,
          refresh_token: "fixture-refresh",
          expires_in: 3600,
          scope: env.PAGESIGHT_FIXTURE_SCOPE,
        })
      : json({ error: "invalid_grant" }, 400);
  return form.get("grant_type") === "refresh_token" && form.get("refresh_token")
    ? json({ access_token: ACCESS_TOKEN, expires_in: 3600 })
    : json({ error: "invalid_grant" }, 400);
}

const passthrough = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "127.0.0.1") return passthrough(...args);
    const body = init?.body;
    const form = new URLSearchParams(
      typeof body === "string" ? body : body instanceof URLSearchParams ? body.toString() : "",
    );
    const verifier = form.get("code_verifier");
    appendFileSync(
      env.PAGESIGHT_LOGIN_LOG,
      `${JSON.stringify({
        url: `${url.origin}${url.pathname}`,
        ...Object.fromEntries(form),
        ...(verifier
          ? {
              challenge: Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(verifier))).toString(
                "base64url",
              ),
            }
          : {}),
      })}\n`,
    );
    if (url.href === "https://oauth2.googleapis.com/revoke") return json({});
    if (url.href === TOKEN_URL) return token(form);
    const read = reads[`${url.origin}${url.pathname}`];
    if (!read) throw new TypeError(`Offline login fixture has no route for ${url.pathname}`);
    return read(new Headers(init?.headers));
  },
  { preconnect: passthrough.preconnect },
);
