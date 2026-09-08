import { z } from "zod";

export const httpUrl = z
  .string()
  .url()
  .refine(
    (v) =>
      URL.canParse(v) &&
      ["http:", "https:"].includes(new URL(v).protocol) &&
      !new URL(v).username &&
      !new URL(v).password,
    "Use an HTTP(S) URL without credentials",
  );
