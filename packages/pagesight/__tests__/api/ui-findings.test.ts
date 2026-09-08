import { expect, spyOn, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { operationSchema } from "../../src/api/schema.js";

export const document = {
  provider: "bing",
  site: "https://example.com/",
  source: {
    kind: "csv",
    label: "Affected URLs export",
    capturedAt: null,
    scannedAt: null,
    coverage: "Only URL column; report details transcribed separately.",
  },
  findings: [{ rule: "Meta description too short", severity: "unknown", urls: ["https://example.com/explore"] }],
};

test("UI import preserves unknowns and untrusted text without network access", async () => {
  const mocked = spyOn(globalThis, "fetch");
  try {
    const result = await execute({ operation: "evidence.import", document });
    expect(mocked).not.toHaveBeenCalled();
    expect(result.provider).toBe("user-import");
    expect(result.status).toBe("ok");
    expect(result.pages[0].response).toMatchObject({ document, verification: "unverified" });
    expect(result.credential).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("not instructions");
  } finally {
    mocked.mockRestore();
  }
});

test("UI import rejects invented verification and malformed or oversized evidence", () => {
  for (const extra of [
    { ...document, verification: "confirmed" },
    { ...document, source: { ...document.source, scannedAt: "yesterday" } },
    { ...document, findings: [{ ...document.findings[0], urls: ["https://user:secret@example.com/"] }] },
    {
      ...document,
      findings: Array.from({ length: 2 }, () => ({
        ...document.findings[0],
        urls: Array(501).fill("https://example.com/"),
      })),
    },
  ])
    expect(operationSchema.safeParse({ operation: "evidence.import", document: extra }).success).toBe(false);
});
