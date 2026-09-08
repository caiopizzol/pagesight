import { dirname, resolve } from "node:path";
import { RequestError } from "./shared/http.js";

export async function loadFollowupManifest(path: string | undefined): Promise<unknown[]> {
  if (!path) throw new RequestError("Missing --manifest", null, "invalid_input");
  let manifest: unknown;
  try {
    manifest = await Bun.file(path).json();
  } catch {
    throw new RequestError("Cannot read --manifest JSON file", null, "invalid_input");
  }
  if (!Array.isArray(manifest) || !manifest.length || manifest.length > 50)
    throw new RequestError("Manifest must contain 1–50 experiment entries", null, "invalid_input");
  const base = dirname(resolve(path));
  const read = async (value: unknown) => {
    if (typeof value !== "string" || !value) return null;
    try {
      return await Bun.file(resolve(base, value)).json();
    } catch {
      return null;
    }
  };
  const entries = [];
  for (const item of manifest) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      entries.push(null);
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).some((key) => !["label", "record", "baseline", "current"].includes(key))) {
      entries.push(null);
      continue;
    }
    entries.push({
      label: entry.label,
      record: await read(entry.record),
      baseline: await read(entry.baseline),
      ...(Object.hasOwn(entry, "current") ? { current: await read(entry.current) } : {}),
    });
  }
  return entries;
}
