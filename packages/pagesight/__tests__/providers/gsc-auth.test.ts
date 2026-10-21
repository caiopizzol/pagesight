import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getAuthMethod } from "../../src/providers/gsc-auth.js";

describe("getAuthMethod", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GSC_SERVICE_ACCOUNT_KEY;
    delete process.env.GSC_REFRESH_TOKEN;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  test("returns 'none' when no credentials set", () => {
    expect(getAuthMethod()).toBe("none");
  });

  test("returns 'service_account' when GSC_SERVICE_ACCOUNT_KEY is set", () => {
    process.env.GSC_SERVICE_ACCOUNT_KEY = "/path/to/key.json";
    expect(getAuthMethod()).toBe("service_account");
  });

  test("returns 'oauth' when GSC_REFRESH_TOKEN is set", () => {
    process.env.GSC_REFRESH_TOKEN = "some-token";
    expect(getAuthMethod()).toBe("oauth");
  });

  test("prefers service_account over oauth", () => {
    process.env.GSC_SERVICE_ACCOUNT_KEY = "/path/to/key.json";
    process.env.GSC_REFRESH_TOKEN = "some-token";
    expect(getAuthMethod()).toBe("service_account");
  });
});
