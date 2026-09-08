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
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal });
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
  } catch (error) {
    if (signal.aborted || !(error instanceof SyntaxError))
      throw new RequestError("Response body failed or timed out", null, "network_error");
    throw new RequestError("Provider returned invalid JSON", response.status, "invalid_response");
  }
}

export async function readBounded(response: Response, maxBytes: number): Promise<string> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new RequestError("Response exceeds byte limit", null, "size_limit");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestError("Response exceeds byte limit", null, "size_limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}
