import { renderInvestigation } from "./investigation-text.js";
import { renderAssessment } from "./assessment-text.js";
import { renderOpportunities } from "./opportunities-text.js";
import { parseArgs } from "node:util";
import { defaultDates } from "./shared/dates.js";
import { execute } from "./api/index.js";
import { loginGoogle, logoutGoogle } from "./login.js";
import { RequestError } from "./shared/http.js";

export const help = `Pagesight — read-only site evidence

pagesight                      Show CLI help
pagesight mcp                  Start MCP explicitly
pagesight login google [--no-browser]
pagesight logout
pagesight discover --url https://example.com/ [--providers gsc,ga]
pagesight doctor --config seo.config.json
pagesight gsc sites
pagesight gsc sitemaps --site sc-domain:example.com
pagesight gsc inspect --site sc-domain:example.com --url https://example.com/
pagesight gsc report --site sc-domain:example.com --request report.json [--max-pages 4]
pagesight ga realtime --property 123456 --request realtime.json
pagesight ga accounts
pagesight ga property --property 123456
pagesight ga key-events --property 123456
pagesight ga report --property 123456 --request report.json [--max-pages 4]
pagesight render --url URL [--from-url URL --link-selector CSS] [--settle-ms 1000] [--timeout-ms 20000]
pagesight page --url https://example.com/
pagesight robots --url https://example.com/
pagesight speed psi --url https://example.com/ [--strategy mobile] [--categories performance,seo]
pagesight speed crux --url https://example.com/ [--origin] [--form-factor PHONE]
pagesight speed history --url https://example.com/ [--origin]
pagesight snapshot --config seo.config.json [--start YYYY-MM-DD --end YYYY-MM-DD]
pagesight crawl --config seo.config.json [--max-pages 20] [--max-depth 3] [--inspect-limit 3]
pagesight investigate --config seo.config.json --url https://example.com/page [--start YYYY-MM-DD --end YYYY-MM-DD] [--format text]
pagesight assess --snapshot saved.json [--format text] [--max-rows 10]
pagesight opportunities --snapshot saved.json [--min-impressions 20] [--max-clicks 2] [--max-rows 10] [--format text]
pagesight compare --baseline before.json --current after.json [--max-rows 100]
pagesight api --request operation.json

Data commands emit JSON by default; assess, opportunities and investigate accept --format text for readable summaries. --json is accepted for clarity.
--out FILE saves the same evidence locally. Exit: 0 success, 1 provider failure,
2 invalid input, 3 partial evidence. Snapshot defaults to 28 days ending Pacific
today minus 3 days; max-pages defaults to 4 (ad hoc reports: 1; maximum: 20).
Credentials: pagesight login google covers Search Console and GA4. Overrides: GSC_* env,
PAGESIGHT_GA_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS (GA), GOOGLE_API_KEY (speed).
Requests, property metadata, provider limits and errors are preserved in evidence.
`;

// Every CLI command and the flags it accepts; surface tests fail when one has no case.
export const commands: Record<string, string[]> = {
  "login.google": ["no-browser"],
  logout: [],
  render: ["url", "from-url", "link-selector", "settle-ms", "timeout-ms"],
  crawl: ["config", "max-pages", "max-depth", "max-links", "inspect-limit", "include-query"],
  investigate: ["config", "url", "start", "end", "max-pages", "max-rows", "format"],
  assess: ["snapshot", "max-rows", "format"],
  opportunities: ["snapshot", "max-rows", "format", "min-impressions", "max-clicks"],
  discover: ["url", "providers"],
  compare: ["baseline", "current", "max-rows"],
  "gsc.sites": [],
  "gsc.sitemaps": ["site"],
  "gsc.inspect": ["site", "url"],
  "gsc.report": ["site", "request", "max-pages"],
  "ga.realtime": ["property", "request"],
  "ga.accounts": [],
  "ga.property": ["property"],
  "ga.key-events": ["property"],
  "ga.report": ["property", "request", "max-pages"],
  page: ["url"],
  robots: ["url"],
  "speed.psi": ["url", "strategy", "categories"],
  "speed.crux": ["url", "origin", "form-factor"],
  "speed.history": ["url", "origin", "form-factor"],
  doctor: ["config"],
  snapshot: ["config", "start", "end", "max-pages"],
  api: ["request"],
};

function reportError(error: unknown): void {
  const request = error instanceof RequestError;
  process.stderr.write(
    `${JSON.stringify({
      error: {
        code: request ? error.code : "invalid_input",
        message: request ? error.message : "Invalid command or request; use --help",
      },
    })}\n`,
  );
}

async function jsonFile(path: string | undefined, label: string): Promise<unknown> {
  if (!path) throw new RequestError(`Missing --${label}`, null, "invalid_input");
  try {
    return await Bun.file(path).json();
  } catch {
    throw new RequestError(`Cannot read --${label} JSON file`, null, "invalid_input");
  }
}

export async function runCli(args: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        "from-url": { type: "string" },
        "link-selector": { type: "string" },
        "settle-ms": { type: "string" },
        "timeout-ms": { type: "string" },
        help: { type: "boolean", short: "h" },
        json: { type: "boolean" },
        config: { type: "string" },
        request: { type: "string" },
        site: { type: "string" },
        property: { type: "string" },
        url: { type: "string" },
        out: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        "max-pages": { type: "string" },
        strategy: { type: "string" },
        categories: { type: "string" },
        "form-factor": { type: "string" },
        origin: { type: "boolean" },
        providers: { type: "string" },
        snapshot: { type: "string" },
        format: { type: "string" },
        baseline: { type: "string" },
        current: { type: "string" },
        "max-rows": { type: "string" },
        "min-impressions": { type: "string" },
        "max-clicks": { type: "string" },
        "max-depth": { type: "string" },
        "max-links": { type: "string" },
        "inspect-limit": { type: "string" },
        "include-query": { type: "boolean" },
        "no-browser": { type: "boolean" },
      },
    });
    if (args.length === 0 || values.help || positionals[0] === "help") {
      process.stdout.write(help);
      return 0;
    }
    const [family, action] = positionals;
    const families = ["gsc", "ga", "speed", "login"];
    if (positionals.length > (families.includes(family) ? 2 : 1))
      throw new RequestError("Too many command arguments", null, "invalid_input");
    const operation = families.includes(family) ? `${family}.${action ?? ""}` : family;
    if (family === "login" && action !== "google")
      throw new RequestError("Use: pagesight login google", null, "invalid_input");
    const credential = operation === "login.google" || operation === "logout";
    const allowed = [...(commands[operation] ?? []), ...(credential ? [] : ["out", "json"])];
    for (const flag of Object.keys(values))
      if (!allowed.includes(flag))
        throw new RequestError(`--${flag} is not supported for ${operation}`, null, "invalid_input");
    if (credential)
      try {
        await (operation === "logout" ? logoutGoogle() : loginGoogle(!values["no-browser"]));
        return 0;
      } catch (error) {
        reportError(error);
        return error instanceof RequestError && error.code !== "invalid_input" ? 1 : 2;
      }
    if (values.format && !["json", "text"].includes(values.format))
      throw new RequestError("Use --format json or text", null, "invalid_input");
    if (values.json && values.format === "text")
      throw new RequestError("--json and --format text conflict", null, "invalid_input");
    let input: unknown;
    if (operation === "api") input = await jsonFile(values.request, "request");
    else if (operation === "render") {
      if (Boolean(values["from-url"]) !== Boolean(values["link-selector"]))
        throw new RequestError("Supply both --from-url and --link-selector", null, "invalid_input");
      input = {
        operation: "page.verify",
        url: values.url,
        ...(values["from-url"]
          ? { navigation: { fromUrl: values["from-url"], linkSelector: values["link-selector"] } }
          : {}),
        settleMs: Number(values["settle-ms"] ?? 1000),
        timeoutMs: Number(values["timeout-ms"] ?? 20000),
      };
    } else if (operation === "crawl")
      input = {
        operation,
        config: await jsonFile(values.config, "config"),
        maxPages: Number(values["max-pages"] ?? 20),
        maxDepth: Number(values["max-depth"] ?? 3),
        maxLinks: Number(values["max-links"] ?? 500),
        inspectLimit: Number(values["inspect-limit"] ?? 3),
        includeQuery: values["include-query"] ?? false,
      };
    else if (operation === "opportunities")
      input = {
        operation,
        snapshot: await jsonFile(values.snapshot, "snapshot"),
        minImpressions: Number(values["min-impressions"] ?? 20),
        maxClicks: Number(values["max-clicks"] ?? 2),
        maxRows: Number(values["max-rows"] ?? 10),
      };
    else if (operation === "assess")
      input = {
        operation,
        snapshot: await jsonFile(values.snapshot, "snapshot"),
        maxRows: Number(values["max-rows"] ?? 10),
      };
    else if (operation === "compare")
      input = {
        operation,
        baseline: await jsonFile(values.baseline, "baseline"),
        current: await jsonFile(values.current, "current"),
        maxRows: Number(values["max-rows"] ?? 100),
      };
    else if (operation === "snapshot" || operation === "doctor" || operation === "investigate") {
      const config = await jsonFile(values.config, "config");
      if (operation === "doctor") input = { operation, config };
      else {
        if (Boolean(values.start) !== Boolean(values.end))
          throw new RequestError("Supply both --start and --end, or neither", null, "invalid_input");
        const dates = values.start ? { startDate: values.start, endDate: values.end } : defaultDates();
        input = {
          operation,
          config,
          ...dates,
          maxPages: Number(values["max-pages"] ?? (operation === "investigate" ? 1 : 4)),
          ...(operation === "investigate" ? { url: values.url, maxRows: Number(values["max-rows"] ?? 28) } : {}),
        };
      }
    } else {
      input = {
        operation,
        ...(values.site ? { site: values.site } : {}),
        ...(values.property ? { property: values.property } : {}),
        ...(values.url ? { url: values.url } : {}),
        ...(values.request ? { request: await jsonFile(values.request, "request") } : {}),
        ...(values["max-pages"] ? { maxPages: Number(values["max-pages"]) } : {}),
        ...(values.strategy ? { strategy: values.strategy } : {}),
        ...(values.categories !== undefined ? { categories: values.categories.split(",") } : {}),
        ...(values["form-factor"] ? { formFactor: values["form-factor"] } : {}),
        ...(values.origin ? { origin: true } : {}),
        ...(values.providers !== undefined ? { providers: values.providers.split(",") } : {}),
      };
    }
    const result = await execute(input);
    const output =
      values.format === "text"
        ? operation === "investigate"
          ? renderInvestigation(result)
          : operation === "opportunities"
            ? renderOpportunities(result)
            : renderAssessment(result)
        : `${JSON.stringify(result, null, 2)}\n`;
    if (values.out) await Bun.write(values.out, output);
    process.stdout.write(output);
    return result.status === "ok" ? 0 : result.status === "partial" ? 3 : 1;
  } catch (error) {
    reportError(error);
    return 2;
  }
}
