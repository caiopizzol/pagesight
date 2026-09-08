import { timingSafeEqual } from "node:crypto";
import { execute } from "./api/index.js";
import { RequestError } from "./shared/http.js";

export function startHttpApi(token: string, port = 6095) {
  if (token.length < 24)
    throw new RequestError("Set PAGESIGHT_API_TOKEN to at least 24 characters", null, "invalid_input");
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    maxRequestBodySize: 32_000_000,
    idleTimeout: 255,
    async fetch(request) {
      const authorization = Buffer.from(request.headers.get("authorization") ?? "");
      const expected = Buffer.from(`Bearer ${token}`);
      if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected))
        return Response.json({ error: { code: "unauthenticated" } }, { status: 401 });
      if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/query")
        return Response.json({ error: { code: "not_found" } }, { status: 404 });
      try {
        const result = await execute(await request.json());
        return Response.json(result, {
          status: result.status === "error" ? 502 : 200,
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        return Response.json(
          {
            error: {
              code: error instanceof RequestError ? error.code : "invalid_input",
              message: error instanceof RequestError ? error.message : "Invalid JSON operation",
            },
          },
          { status: 400 },
        );
      }
    },
  });
}
