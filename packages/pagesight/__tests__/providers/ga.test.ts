import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { gaCredentialPath } from "../../src/providers/ga.js";

test("empty GA credential variables fall through to the next source", () => {
  const keys = ["PAGESIGHT_GA_CREDENTIALS", "GOOGLE_APPLICATION_CREDENTIALS"];
  const previous = keys.map((key) => process.env[key]);
  try {
    process.env.PAGESIGHT_GA_CREDENTIALS = "";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/test-adc.json";
    expect(gaCredentialPath()).toBe("/tmp/test-adc.json");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
    expect(gaCredentialPath()).toBe(join(homedir(), ".config/gcloud/application_default_credentials.json"));
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});
