import { expect, test } from "bun:test";
import { capture } from "../../src/api/evidence.js";

test("unexpected failures retain their class without exposing unsafe exception messages", async () => {
  const result = await capture("test", "read", "site", {}, async () => {
    throw new TypeError("private key=do-not-emit");
  });
  expect(result.error).toMatchObject({ code: "operation_failed", name: "TypeError" });
  expect(JSON.stringify(result)).not.toContain("do-not-emit");
});
