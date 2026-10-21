import { getOAuthToken, getServiceAccountToken } from "./google-tokens.js";
import { existsSync } from "node:fs";
import { RequestError } from "../shared/http.js";

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
let cachedToken: { token: string; expiresAt: number } | null = null;

// --- Service Account Auth ---

// --- Public API ---

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  // Try service account first
  const saKeyPath = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (saKeyPath && existsSync(saKeyPath)) {
    const token = await getServiceAccountToken(saKeyPath, SCOPES.join(" "));
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
