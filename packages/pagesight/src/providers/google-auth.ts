import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { RequestError, requestJson } from "../shared/http.js";

export type GoogleProduct = "gsc" | "ga";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const EXPIRY_MARGIN_SECONDS = 60;

type Credential =
  | { type: "service_account"; clientEmail: string; privateKeyId: string; privateKey: string }
  | { type: "authorized_user"; clientId: string; clientSecret: string; refreshToken: string };

interface CredentialSource {
  name: string;
  load: (product: GoogleProduct) => Promise<Credential | null>;
}

export interface GoogleLogin {
  type: "authorized_user";
  client_id: string;
  client_secret: string;
  refresh_token: string;
  scopes: string[];
}

export function googleLoginPath(): string {
  const directory =
    process.env.PAGESIGHT_CONFIG_DIR ||
    (process.env.XDG_CONFIG_HOME
      ? join(process.env.XDG_CONFIG_HOME, "pagesight")
      : join(homedir(), ".config", "pagesight"));
  return join(directory, "google.json");
}

export async function readGoogleLogin(): Promise<GoogleLogin | null> {
  const file = Bun.file(googleLoginPath());
  if (!(await file.exists())) return null;
  try {
    const login = (await file.json()) as GoogleLogin;
    const complete =
      login.type === "authorized_user" &&
      login.client_id &&
      login.client_secret &&
      login.refresh_token &&
      Array.isArray(login.scopes);
    return complete ? login : null;
  } catch {
    return null;
  }
}

export async function writeGoogleLogin(login: GoogleLogin): Promise<string> {
  const path = googleLoginPath();
  const directory = dirname(path);
  // mkdir and writeFile apply a mode only to paths they create, and umask clears bits; chmod is exact.
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(login, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  return path;
}

function toCredential(key: Record<string, unknown>): Credential {
  const text = (field: string) => (typeof key[field] === "string" ? key[field] : "");
  if (key.type === "service_account" && text("client_email") && text("private_key"))
    return {
      type: "service_account",
      clientEmail: text("client_email"),
      privateKeyId: text("private_key_id"),
      privateKey: text("private_key"),
    };
  if (key.type === "authorized_user" && text("client_id") && text("client_secret") && text("refresh_token"))
    return {
      type: "authorized_user",
      clientId: text("client_id"),
      clientSecret: text("client_secret"),
      refreshToken: text("refresh_token"),
    };
  throw new RequestError(
    "Google credential JSON must be a complete service_account or authorized_user key",
    null,
    "unsupported_credentials",
  );
}

async function readCredential(name: string, path: string): Promise<Credential | null> {
  let key: Record<string, unknown>;
  try {
    key = await Bun.file(path).json();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") return null;
    const cause = error instanceof SyntaxError ? "is not valid JSON" : `cannot be read (${code ?? "unknown"})`;
    throw new RequestError(`${name} at ${path} ${cause}`, null, "invalid_credentials");
  }
  return toCredential(key);
}

// A credential path someone set names the account they chose; a missing file is their error to see,
// not a reason to run as whoever the next source happens to be.
const environmentFile = (name: string): CredentialSource => ({
  name,
  load: async () => {
    const path = process.env[name];
    if (!path) return null;
    const credential = await readCredential(name, path);
    if (!credential) throw new RequestError(`${name} is set to ${path}, which does not exist`, null, "not_configured");
    return credential;
  },
});

const optionalFile = (name: string, locate: () => string): CredentialSource => ({
  name,
  load: () => readCredential(name, locate()),
});

const gscEnvironment: CredentialSource = {
  name: "GSC_CLIENT_ID",
  load: async () => {
    const [clientId, clientSecret, refreshToken] = ["GSC_CLIENT_ID", "GSC_CLIENT_SECRET", "GSC_REFRESH_TOKEN"].map(
      (key) => process.env[key] ?? "",
    );
    if (!clientId || !clientSecret || !refreshToken) return null;
    return { type: "authorized_user", clientId, clientSecret, refreshToken };
  },
};

// A login that never granted this product's scope is not a credential for it; the next source answers.
const pagesightLogin: CredentialSource = {
  name: "pagesight_login",
  load: async (product) => {
    const login = await readGoogleLogin();
    if (!login?.scopes.includes(products[product].scope)) return null;
    return {
      type: "authorized_user",
      clientId: login.client_id,
      clientSecret: login.client_secret,
      refreshToken: login.refresh_token,
    };
  },
};

const products: Record<
  GoogleProduct,
  { scope: string; label: string; overrides: string; sources: CredentialSource[] }
> = {
  gsc: {
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    label: "Search Console",
    overrides: "GSC_SERVICE_ACCOUNT_KEY, or GSC_CLIENT_ID with GSC_CLIENT_SECRET and GSC_REFRESH_TOKEN",
    sources: [environmentFile("GSC_SERVICE_ACCOUNT_KEY"), gscEnvironment, pagesightLogin],
  },
  ga: {
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    label: "Analytics",
    overrides: "PAGESIGHT_GA_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS",
    sources: [
      environmentFile("PAGESIGHT_GA_CREDENTIALS"),
      environmentFile("GOOGLE_APPLICATION_CREDENTIALS"),
      pagesightLogin,
      optionalFile("gcloud_adc", () => join(homedir(), ".config/gcloud/application_default_credentials.json")),
    ],
  },
};

export const googleProducts: Record<GoogleProduct, { scope: string; label: string }> = products;

async function resolve(product: GoogleProduct): Promise<{ source: string; credential: Credential }> {
  for (const source of products[product].sources) {
    const credential = await source.load(product);
    if (credential) return { source: source.name, credential };
  }
  const { label, overrides } = products[product];
  throw new RequestError(
    `No Google credentials for ${label}. Run "pagesight login google", or set ${overrides}.`,
    null,
    "not_configured",
  );
}

export async function googleCredentialInfo(
  product: GoogleProduct,
): Promise<{ source: string; type: string | null; clientEmail: string | null }> {
  try {
    const { source, credential } = await resolve(product);
    return {
      source,
      type: credential.type,
      clientEmail: credential.type === "service_account" ? credential.clientEmail : null,
    };
  } catch {
    return { source: "none", type: null, clientEmail: null };
  }
}

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export function googleTokenRequest(body: Record<string, string>): Promise<GoogleTokenResponse> {
  return requestJson<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}

const cache = new Map<string, { token: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string>>();

// The account the token belongs to, not the file it came from: a replaced file is a different account.
const identity = (credential: Credential) =>
  credential.type === "service_account"
    ? `service_account:${credential.clientEmail}:${credential.privateKeyId}`
    : `authorized_user:${credential.clientId}:${credential.refreshToken}`;

export async function googleAccessToken(product: GoogleProduct): Promise<string> {
  const { scope } = products[product];
  const { credential } = await resolve(product);
  const key = `${scope} ${identity(credential)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const running = inFlight.get(key);
  if (running) return running;
  const exchange = (async () => {
    const response =
      credential.type === "service_account"
        ? await serviceAccountToken(credential, scope)
        : await googleTokenRequest({
            grant_type: "refresh_token",
            client_id: credential.clientId,
            client_secret: credential.clientSecret,
            refresh_token: credential.refreshToken,
          });
    if (!response.access_token)
      throw new RequestError("Token exchange returned no access token", null, "invalid_response");
    const lifetime = Math.max((response.expires_in ?? 3600) - EXPIRY_MARGIN_SECONDS, 0);
    cache.set(key, { token: response.access_token, expiresAt: Date.now() + lifetime * 1000 });
    return response.access_token;
  })();
  inFlight.set(key, exchange);
  try {
    return await exchange;
  } finally {
    inFlight.delete(key);
  }
}

export function clearGoogleTokens(product?: GoogleProduct): void {
  if (!product) {
    cache.clear();
    return;
  }
  const prefix = `${products[product].scope} `;
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

async function serviceAccountToken(
  credential: Extract<Credential, { type: "service_account" }>,
  scope: string,
): Promise<GoogleTokenResponse> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: credential.clientEmail,
        scope,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuffer(credential.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, new TextEncoder().encode(signingInput));
  return googleTokenRequest({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${signingInput}.${base64Url(new Uint8Array(signature))}`,
  });
}

function pemToBuffer(pem: string): ArrayBuffer {
  const binary = atob(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, ""));
  const buffer = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) buffer[index] = binary.charCodeAt(index);
  return buffer.buffer;
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
