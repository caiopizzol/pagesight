export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly code = "request_failed",
  ) {
    super(message);
  }
}

export async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new RequestError("Request failed or timed out", null, "network_error");
  }
  if (!response.ok) {
    // Provider bodies and request URLs can contain credentials; never echo them into evidence.
    const code =
      response.status === 401
        ? "unauthenticated"
        : response.status === 403
          ? "forbidden"
          : response.status === 429
            ? "quota_exceeded"
            : response.status === 404
              ? "not_found"
              : "provider_error";
    throw new RequestError(`Provider returned HTTP ${response.status}`, response.status, code);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new RequestError("Provider returned invalid JSON", response.status, "invalid_response");
  }
}
