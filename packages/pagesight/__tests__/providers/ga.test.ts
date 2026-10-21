import { expect, spyOn, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { clearGoogleTokens } from "../../src/providers/google-auth.js";
import { execute } from "../../src/api/index.js";

test("GA metadata flags remaining pages and reports credential source without secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pagesight-test-"));
  const previous = process.env.PAGESIGHT_GA_CREDENTIALS;
  process.env.PAGESIGHT_GA_CREDENTIALS = join(dir, "credentials.json");
  clearGoogleTokens();
  await Bun.write(
    process.env.PAGESIGHT_GA_CREDENTIALS,
    JSON.stringify({
      type: "authorized_user",
      client_id: "test-client",
      client_secret: "test-secret",
      refresh_token: "test-refresh",
    }),
  );
  const mocked = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (url: Parameters<typeof fetch>[0]) =>
        Response.json(
          (url instanceof Request ? url.url : url.toString()).includes("oauth2.googleapis.com")
            ? { access_token: "test-access" }
            : { accountSummaries: [], nextPageToken: "next-page" },
        ),
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    const result = await execute({ operation: "ga.accounts" });
    expect(result.status).toBe("partial");
    expect(result.pages[0].response).toMatchObject({ nextPageToken: "next-page" });
    expect(result.credential).toEqual({
      source: "PAGESIGHT_GA_CREDENTIALS",
      type: "authorized_user",
      clientEmail: null,
    });
    for (const secret of ["test-secret", "test-refresh", "test-access"])
      expect(JSON.stringify(result)).not.toContain(secret);
  } finally {
    mocked.mockRestore();
    clearGoogleTokens();
    if (previous === undefined) delete process.env.PAGESIGHT_GA_CREDENTIALS;
    else process.env.PAGESIGHT_GA_CREDENTIALS = previous;
    await rm(dir, { recursive: true });
  }
});
