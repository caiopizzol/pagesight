import { spyOn } from "bun:test";

export function mockFetch(handler: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  return spyOn(globalThis, "fetch").mockImplementation(Object.assign(handler, { preconnect: fetch.preconnect }));
}

export function requestUrl(input: Parameters<typeof fetch>[0]): string {
  return input instanceof Request ? input.url : input.toString();
}
