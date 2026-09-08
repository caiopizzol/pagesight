import { expect, test } from "bun:test";
import { imageEvidence } from "../src/api/images.js";

test("image evidence distinguishes missing, empty and meaningful ALT including noscript", async () => {
  const result = await imageEvidence(
    '<img src="logo" alt=""><img src="chart" alt="Price history"><img src="missing"><noscript><img src="pixel" width="1" height="1"></noscript><script>"<img src=fake>"</script><!-- <img src=comment> -->',
  );
  expect(result.images).toEqual([
    expect.objectContaining({ src: "logo", altPresent: true, altText: "", inNoscript: false }),
    expect.objectContaining({ src: "chart", altPresent: true, altText: "Price history" }),
    expect.objectContaining({ src: "missing", altPresent: false, altText: null }),
    expect.objectContaining({ src: "pixel", altPresent: false, altText: null, inNoscript: true, width: "1" }),
  ]);
  expect(result.truncated).toBe(false);
});

test("image inventory reports omissions across normal and fallback markup", async () => {
  const result = await imageEvidence('<img alt="">'.repeat(199) + "<noscript><img><img><img></noscript>");
  expect(result.images).toHaveLength(200);
  expect(result.omittedImages).toBe(2);
  expect(result.truncated).toBe(true);
});
