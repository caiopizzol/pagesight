import { RequestError } from "../shared/http.js";

export interface Evidence {
  schemaVersion: 1;
  provider: string;
  operation: string;
  name?: string;
  target: string;
  startedAt: string;
  finishedAt: string;
  status: "ok" | "partial" | "error";
  pages: Array<{ request: unknown; response: unknown }>;
  pagination?: { exhausted: boolean; nextOffset: number | null; rowsReturned: number };
  warnings: string[];
  credential?: { source: string; type: string | null; clientEmail: string | null };
  failedRequest?: unknown;
  error?: { code: string; message: string; httpStatus: number | null; name?: string };
}

export function createEvidence(provider: string, operation: string, target: string): Evidence {
  return {
    schemaVersion: 1,
    provider,
    operation,
    target,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    status: "ok",
    pages: [],
    warnings: [],
  };
}

export function fail(result: Evidence, error: unknown): void {
  result.status = result.pages.length ? "partial" : "error";
  result.error =
    error instanceof RequestError
      ? { code: error.code, message: error.message, httpStatus: error.status }
      : {
          code: "operation_failed",
          message: "Operation failed; check credentials, request and provider availability",
          httpStatus: null,
          name: error instanceof Error ? error.name : "UnknownError",
        };
}

export async function capture(
  provider: string,
  operation: string,
  target: string,
  request: unknown,
  run: () => Promise<unknown>,
  warnings: string[] = [],
): Promise<Evidence> {
  const result = createEvidence(provider, operation, target);
  result.warnings.push(...warnings);
  try {
    result.pages.push({ request, response: await run() });
  } catch (error) {
    result.failedRequest = request;
    fail(result, error);
  }
  result.finishedAt = new Date().toISOString();
  return result;
}

export function aggregate(operation: string, target: string, request: unknown, observations: Evidence[]): Evidence {
  if (!observations.length) throw new RequestError("Select at least one observation", null, "invalid_input");
  return {
    schemaVersion: 1,
    provider: "pagesight",
    operation,
    target,
    startedAt: observations.map((o) => o.startedAt).sort()[0] ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: observations.every((o) => o.status === "ok")
      ? "ok"
      : observations.every((o) => o.status === "error")
        ? "error"
        : "partial",
    pages: [
      {
        request,
        response: {
          observations,
          summary: observations.map((o) => ({
            provider: o.provider,
            operation: o.operation,
            ...(o.name ? { name: o.name } : {}),
            target: o.target,
            status: o.status,
            errorCode: o.error?.code ?? null,
          })),
        },
      },
    ],
    warnings: [],
  };
}
