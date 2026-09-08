import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getAuthMethod, getOAuthSetupUrl } from "../src/lib/auth.js";

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

describe("getOAuthSetupUrl", () => {
  test("generates valid URL with client_id", () => {
    const url = getOAuthSetupUrl("test-client-id.apps.googleusercontent.com");
    expect(url).toContain("accounts.google.com/o/oauth2/auth");
    expect(url).toContain("client_id=test-client-id.apps.googleusercontent.com");
    expect(url).toContain("response_type=code");
    expect(url).toContain("scope=");
    expect(url).toContain("webmasters");
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
  });

  test("uses localhost redirect URI", () => {
    const url = getOAuthSetupUrl("test-id");
    expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost");
    expect(url).not.toContain("oob");
  });
});
