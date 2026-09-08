import { existsSync } from "node:fs";
import { RequestError, requestJson } from "../shared/http.js";

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

// --- Service Account Auth ---

export async function getServiceAccountToken(keyPath: string, scope = SCOPES.join(" ")): Promise<string> {
  const keyFile = JSON.parse(await Bun.file(keyPath).text());
  if (!keyFile.client_email || !keyFile.private_key) {
    throw new Error("Service account key file missing client_email or private_key");
  }
  const now = Math.floor(Date.now() / 1000);

  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      iss: keyFile.client_email,
      scope,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuffer(keyFile.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${bufferToBase64Url(signature)}`;

  const data = await requestJson<TokenResponse>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!data.access_token) throw new RequestError("Token exchange returned no access token", null, "invalid_response");
  return data.access_token;
}

function pemToBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

function toBase64Url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return toBase64Url(binary);
}

// --- OAuth Refresh Token Auth ---

export async function getOAuthToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const data = await requestJson<TokenResponse>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  if (!data.access_token) throw new RequestError("Token refresh returned no access token", null, "invalid_response");
  return data.access_token;
}

// --- Public API ---

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  // Try service account first
  const saKeyPath = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (saKeyPath && existsSync(saKeyPath)) {
    const token = await getServiceAccountToken(saKeyPath);
    cachedToken = { token, expiresAt: Date.now() + 3500_000 }; // ~58 min
    return token;
  }

  // Try OAuth refresh token
  const clientId = process.env.GSC_CLIENT_ID;
  const clientSecret = process.env.GSC_CLIENT_SECRET;
  const refreshToken = process.env.GSC_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const token = await getOAuthToken(clientId, clientSecret, refreshToken);
    cachedToken = { token, expiresAt: Date.now() + 3500_000 };
    return token;
  }

  throw new RequestError(
    "No GSC credentials configured. Set either:\n" +
      "  - GSC_SERVICE_ACCOUNT_KEY (path to service account JSON)\n" +
      "  - GSC_CLIENT_ID + GSC_CLIENT_SECRET + GSC_REFRESH_TOKEN (OAuth 2.0)",
    null,
    "not_configured",
  );
}

export function clearTokenCache(): void {
  cachedToken = null;
}

export function getAuthMethod(): string {
  if (process.env.GSC_SERVICE_ACCOUNT_KEY) return "service_account";
  if (process.env.GSC_REFRESH_TOKEN) return "oauth";
  return "none";
}

// --- OAuth Setup Helper ---

export function getOAuthSetupUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: "http://localhost",
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/auth?${params}`;
}

export async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: "http://localhost",
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Code exchange failed: ${err}`);
  }

  const data = (await res.json()) as Record<string, string>;
  return { refreshToken: data.refresh_token, accessToken: data.access_token };
}
