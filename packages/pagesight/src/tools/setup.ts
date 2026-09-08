import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exchangeCodeForToken, getAuthMethod, getOAuthSetupUrl } from "../providers/gsc-auth.js";

export function registerSetupTool(server: McpServer): void {
  server.tool(
    "setup",
    "Check authentication status or get OAuth setup instructions for Google Search Console.",
    {
      action: z
        .enum(["status", "get_auth_url", "exchange_code"])
        .describe("'status' to check auth, 'get_auth_url' to start OAuth flow, 'exchange_code' to complete it."),
      client_id: z.string().optional().describe("Google OAuth client ID (for get_auth_url and exchange_code)."),
      client_secret: z.string().optional().describe("Google OAuth client secret (for exchange_code)."),
      code: z.string().optional().describe("Authorization code from Google (for exchange_code)."),
    },
    async ({ action, client_id, client_secret, code }) => {
      if (action === "status") {
        const method = getAuthMethod();
        if (method !== "none") {
          return {
            content: [
              {
                type: "text",
                text: `=== Pagesight Auth Status ===\n\nStatus: CONFIGURED\nMethod: ${method}`,
              },
            ],
          };
        }

        // Check for partial OAuth config
        const hasClientId = !!process.env.GSC_CLIENT_ID;
        const hasClientSecret = !!process.env.GSC_CLIENT_SECRET;
        const hasPartial = hasClientId || hasClientSecret;

        if (hasPartial) {
          const present = [hasClientId && "GSC_CLIENT_ID", hasClientSecret && "GSC_CLIENT_SECRET"]
            .filter(Boolean)
            .join(", ");
          const missing = [
            !hasClientId && "GSC_CLIENT_ID",
            !hasClientSecret && "GSC_CLIENT_SECRET",
            "GSC_REFRESH_TOKEN",
          ]
            .filter(Boolean)
            .join(", ");
          return {
            content: [
              {
                type: "text",
                text: [
                  "=== Pagesight Auth Status ===",
                  "",
                  "Status: PARTIAL",
                  `  Present: ${present}`,
                  `  Missing: ${missing}`,
                  "",
                  "Complete OAuth setup:",
                  "  1. Call: setup(action='get_auth_url', client_id='YOUR_ID')",
                  "  2. Visit the URL, authorize, copy the code",
                  "  3. Call: setup(action='exchange_code', client_id='YOUR_ID', client_secret='YOUR_SECRET', code='THE_CODE')",
                  "  4. Set GSC_REFRESH_TOKEN from the response",
                ].join("\n"),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: [
                "=== Pagesight Auth Status ===",
                "",
                "Status: NOT CONFIGURED",
                "",
                "To use Pagesight, configure one of:",
                "",
                "Option 1: OAuth 2.0 (recommended for personal use)",
                "  1. Create a Google Cloud project",
                "  2. Enable 'Google Search Console API'",
                "  3. Create OAuth 2.0 credentials (Desktop app)",
                "  4. Call: setup(action='get_auth_url', client_id='YOUR_ID')",
                "  5. Visit the URL, authorize, copy the code",
                "  6. Call: setup(action='exchange_code', client_id='YOUR_ID', client_secret='YOUR_SECRET', code='THE_CODE')",
                "  7. Set env vars: GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN",
                "",
                "Option 2: Service Account",
                "  1. Create a service account in Google Cloud",
                "  2. Download the JSON key file",
                "  3. Add the service account email as a user in Search Console",
                "  4. Set env var: GSC_SERVICE_ACCOUNT_KEY=/path/to/key.json",
              ].join("\n"),
            },
          ],
        };
      }

      if (action === "get_auth_url") {
        if (!client_id) {
          return { content: [{ type: "text", text: "Error: client_id is required for get_auth_url." }] };
        }
        const url = getOAuthSetupUrl(client_id);
        return {
          content: [
            {
              type: "text",
              text: [
                "=== OAuth Setup ===",
                "",
                "1. Open this URL in your browser:",
                "",
                url,
                "",
                "2. Sign in and authorize access to Search Console",
                "3. Copy the authorization code",
                "4. Call: setup(action='exchange_code', client_id='...', client_secret='...', code='THE_CODE')",
              ].join("\n"),
            },
          ],
        };
      }

      if (action === "exchange_code") {
        if (!client_id || !client_secret || !code) {
          return { content: [{ type: "text", text: "Error: client_id, client_secret, and code are all required." }] };
        }
        try {
          const tokens = await exchangeCodeForToken(client_id, client_secret, code);
          return {
            content: [
              {
                type: "text",
                text: [
                  "=== OAuth Setup Complete ===",
                  "",
                  "Add these environment variables to your MCP server config:",
                  "",
                  `GSC_CLIENT_ID=${client_id}`,
                  "GSC_CLIENT_SECRET=(use the client_secret you already have)",
                  `GSC_REFRESH_TOKEN=${tokens.refreshToken}`,
                  "",
                  "Then restart Pagesight.",
                ].join("\n"),
              },
            ],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: `Error exchanging code: ${msg}` }] };
        }
      }

      return { content: [{ type: "text", text: "Unknown action." }] };
    },
  );
}
