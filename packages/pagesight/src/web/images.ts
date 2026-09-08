/** Inspect fetched markup without executing scripts or requesting image URLs. */
export async function imageEvidence(html: string) {
  const images: Array<{
    src: string | null;
    altPresent: boolean;
    altText: string | null;
    inNoscript: boolean;
    width: string | null;
    height: string | null;
    role: string | null;
    ariaHidden: string | null;
  }> = [];
  let omittedImages = 0;
  const noscript: string[] = [];
  let currentNoscript = "";
  const handler = (inNoscript: boolean) => ({
    element(el: HTMLRewriterTypes.Element) {
      if (images.length >= 200) {
        omittedImages++;
        return;
      }
      const altPresent = el.hasAttribute("alt");
      images.push({
        src: el.getAttribute("src"),
        altPresent,
        altText: altPresent ? (el.getAttribute("alt") ?? "") : null,
        inNoscript,
        width: el.getAttribute("width"),
        height: el.getAttribute("height"),
        role: el.getAttribute("role"),
        ariaHidden: el.getAttribute("aria-hidden"),
      });
    },
  });
  await new HTMLRewriter()
    .on("img", handler(false))
    .on("noscript", {
      element(el) {
        currentNoscript = "";
        el.onEndTag(() => {
          noscript.push(currentNoscript);
          currentNoscript = "";
        });
      },
      text(chunk) {
        currentNoscript += chunk.text;
      },
    })
    .transform(new Response(html))
    .text();
  if (currentNoscript) noscript.push(currentNoscript);
  for (const fragment of noscript)
    await new HTMLRewriter().on("img", handler(true)).transform(new Response(fragment)).text();
  return {
    images,
    omittedImages,
    truncated: omittedImages > 0,
    warnings: [
      "Images are fetched HTML evidence, including noscript fallback markup; scripts and image URLs were not loaded. Empty ALT may be appropriate for decorative images; meaning requires context.",
    ],
  };
}
