import { type BingAction, bingFetch, bingMethods } from "../providers/bing.js";
import { capture } from "./evidence.js";

export function bingObservation(action: BingAction, site?: string) {
  return capture(
    "bing",
    action,
    site ?? "accessible-sites",
    { method: bingMethods[action], ...(site === undefined ? {} : { siteUrl: site }) },
    () => bingFetch(action, site),
    [
      "Bing returns one provider-defined response. These methods support no date range or pagination; completeness is unknown.",
      ...(action === "sites"
        ? ["Site verification is not evidence of indexing or traffic."]
        : [
            "Raw Bing Date strings are retained. Reporting timezone is unknown; snapshot requested dates do not constrain this response.",
            action === "traffic"
              ? "Updated daily. Since 2023-03-24 traffic includes Web, Chat, News, Images, Videos and Knowledge Panel; it is not Google Web scope or isolated AI citation evidence."
              : "Top-row statistics updated weekly; missing queries/pages are unknown, not zero. Do not assume exhaustive coverage or a Web-only scope.",
            ...(action === "pages" ? ["In GetPageStats, the Query field contains the page URL."] : []),
          ]),
    ],
  );
}
