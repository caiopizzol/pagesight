import { RequestError, readBounded } from "../shared/http.js";

export type CloudflareQuery = { query: string; variables: Record<string, unknown> };
export async function cloudflareGraphql(request: CloudflareQuery): Promise<unknown> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token)
    throw new RequestError(
      "Set CLOUDFLARE_API_TOKEN with read access to the selected zone's analytics",
      null,
      "not_configured",
    );
  const signal = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new RequestError("Cloudflare request failed or timed out", null, "network_error");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new RequestError(
      `Cloudflare returned HTTP ${response.status}`,
      response.status,
      response.status === 401
        ? "unauthenticated"
        : response.status === 403
          ? "forbidden"
          : response.status === 429
            ? "quota_exceeded"
            : "provider_error",
    );
  }
  try {
    return JSON.parse(await readBounded(response, 8_000_000));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("Cloudflare response could not be read as JSON", null, "invalid_response");
  }
}
