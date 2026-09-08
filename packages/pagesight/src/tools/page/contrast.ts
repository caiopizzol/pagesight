import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
export function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length === 3) {
    const r = Number.parseInt(clean[0] + clean[0], 16);
    const g = Number.parseInt(clean[1] + clean[1], 16);
    const b = Number.parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

export function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagLevel(ratio: number, isLargeText: boolean): string {
  if (isLargeText) {
    if (ratio >= 4.5) return "AAA";
    if (ratio >= 3) return "AA";
    return "FAIL";
  }
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  return "FAIL";
}

export function findNearestPassing(
  fg: [number, number, number],
  bg: [number, number, number],
  targetRatio: number,
): string {
  const bgLum = relativeLuminance(...bg);

  // Try both directions: darken and lighten, pick the one closest to original
  let bestDarken: [number, number, number] | null = null;
  let bestLighten: [number, number, number] | null = null;

  for (let step = 0; step <= 100; step++) {
    const t = step / 100;
    const dark: [number, number, number] = [fg[0] * (1 - t), fg[1] * (1 - t), fg[2] * (1 - t)];
    if (!bestDarken && contrastRatio(relativeLuminance(...dark), bgLum) >= targetRatio) {
      bestDarken = dark;
    }
    const light: [number, number, number] = [
      fg[0] + (255 - fg[0]) * t,
      fg[1] + (255 - fg[1]) * t,
      fg[2] + (255 - fg[2]) * t,
    ];
    if (!bestLighten && contrastRatio(relativeLuminance(...light), bgLum) >= targetRatio) {
      bestLighten = light;
    }
    if (bestDarken && bestLighten) break;
  }

  // Pick the direction that changes the color least
  if (bestDarken && bestLighten) {
    const darkDist =
      Math.abs(fg[0] - bestDarken[0]) + Math.abs(fg[1] - bestDarken[1]) + Math.abs(fg[2] - bestDarken[2]);
    const lightDist =
      Math.abs(fg[0] - bestLighten[0]) + Math.abs(fg[1] - bestLighten[1]) + Math.abs(fg[2] - bestLighten[2]);
    return toHex(...(darkDist <= lightDist ? bestDarken : bestLighten));
  }
  return toHex(...(bestDarken ?? bestLighten ?? fg));
}

// --- Tool registration ---

export function analyzeContrast(foreground: string, background: string, large_text?: boolean): CallToolResult {
  const fg = parseHex(foreground);
  const bg = parseHex(background);

  if (!fg) return { content: [{ type: "text", text: `Invalid foreground color: ${foreground}` }] };
  if (!bg) return { content: [{ type: "text", text: `Invalid background color: ${background}` }] };

  const fgLum = relativeLuminance(...fg);
  const bgLum = relativeLuminance(...bg);
  const ratio = contrastRatio(fgLum, bgLum);
  const isLarge = large_text ?? false;
  const level = wcagLevel(ratio, isLarge);

  const aaThreshold = isLarge ? 3 : 4.5;
  const aaaThreshold = isLarge ? 4.5 : 7;

  const lines: string[] = [
    "=== Contrast Check ===",
    "",
    `Foreground: ${toHex(...fg)}`,
    `Background: ${toHex(...bg)}`,
    `Text size: ${isLarge ? "large (≥18pt)" : "normal"}`,
    "",
    `Contrast ratio: ${ratio.toFixed(2)}:1`,
    `WCAG AA (${aaThreshold}:1): ${ratio >= aaThreshold ? "PASS" : "FAIL"}`,
    `WCAG AAA (${aaaThreshold}:1): ${ratio >= aaaThreshold ? "PASS" : "FAIL"}`,
    `Result: ${level}`,
  ];

  if (ratio < aaThreshold) {
    const suggested = findNearestPassing(fg, bg, aaThreshold);
    lines.push("", `Nearest AA-passing foreground: ${suggested}`);

    const sugParsed = parseHex(suggested);
    if (sugParsed) {
      const sugRatio = contrastRatio(relativeLuminance(...sugParsed), bgLum);
      lines.push(`New ratio: ${sugRatio.toFixed(2)}:1`);
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
