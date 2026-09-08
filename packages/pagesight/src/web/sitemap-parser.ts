import { SaxesParser, type SaxesTagNS } from "saxes";
import { RequestError } from "../shared/http.js";

export function parseInventorySitemap(xml: string) {
  const parser = new SaxesParser({ xmlns: true });
  const stack: SaxesTagNS[] = [];
  const urls: string[] = [];
  const children: string[] = [];
  const lastmods: string[] = [];
  let root = "";
  let text = "";
  let locations = 0;
  const invalid = () => {
    throw new RequestError("Expected well-formed sitemap XML", null, "invalid_sitemap");
  };
  parser.on("error", invalid);
  parser.on("doctype", invalid);
  parser.on("opentag", (tag) => {
    stack.push(tag);
    if (stack.length === 1) {
      root = tag.local;
      if (tag.prefix)
        throw new RequestError(
          "Prefixed sitemap XML is not supported by this inventory reader",
          null,
          "unsupported_sitemap",
        );
      if (
        !["urlset", "sitemapindex"].includes(root) ||
        (tag.uri && tag.uri !== "http://www.sitemaps.org/schemas/sitemap/0.9")
      )
        invalid();
    }
    if (stack.length === 2) {
      if (tag.local !== (root === "urlset" ? "url" : "sitemap") || tag.uri !== stack[0].uri) invalid();
      locations = 0;
    }
    if (stack.length === 3) text = "";
    if (stack.length > 3 && ["loc", "lastmod"].includes(stack[2].local) && stack[2].uri === stack[0].uri) invalid();
  });
  const append = (value: string) => {
    if (stack.length === 3) text += value;
  };
  parser.on("text", append);
  parser.on("cdata", append);
  parser.on("closetag", (tag) => {
    if (stack.length === 3 && tag.uri === stack[0].uri) {
      if (tag.local === "loc") {
        if (++locations !== 1 || !text.trim()) invalid();
        (root === "urlset" ? urls : children).push(text.trim());
      }
      if (tag.local === "lastmod") lastmods.push(text.trim());
    }
    if (stack.length === 2 && locations !== 1) invalid();
    stack.pop();
  });
  parser.write(xml).close();
  return { urls, children, lastmods };
}
