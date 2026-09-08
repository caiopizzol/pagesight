import { parseArgs } from "node:util";
import { defaultDates } from "./api/dates.js";
import { execute } from "./api/index.js";
import { RequestError } from "./lib/http.js";

export const help = `Pagesight — read-only site evidence

pagesight                      Show CLI help
pagesight mcp                  Start MCP explicitly
pagesight discover --url https://example.com/ [--providers gsc,ga]
pagesight doctor --config seo.config.json
pagesight gsc sites
pagesight gsc sitemaps --site sc-domain:example.com
pagesight gsc inspect --site sc-domain:example.com --url https://example.com/
pagesight gsc report --site sc-domain:example.com --request report.json [--max-pages 4]
pagesight bing crawl-stats --site https://example.com/
pagesight bing crawl-issues --site https://example.com/
pagesight bing url-info --site https://example.com/ --url https://example.com/page
pagesight bing link-counts --site https://example.com/ [--max-pages 4]
pagesight bing url-links --site https://example.com/ --url https://example.com/page [--max-pages 4]
pagesight bing sites
pagesight bing queries --site https://example.com/
pagesight bing pages --site https://example.com/
pagesight bing traffic --site https://example.com/
pagesight ga accounts
pagesight ga property --property 123456
pagesight ga key-events --property 123456
pagesight ga report --property 123456 --request report.json [--max-pages 4]
pagesight page --url https://example.com/
pagesight speed psi --url https://example.com/ [--strategy mobile]
pagesight speed crux --url https://example.com/ [--origin] [--form-factor PHONE]
pagesight speed history --url https://example.com/ [--origin]
pagesight snapshot --config seo.config.json [--start YYYY-MM-DD --end YYYY-MM-DD]
pagesight compare --baseline before.json --current after.json [--max-rows 100]
pagesight evidence import --request findings.json
pagesight api --request operation.json
pagesight serve [--port 6095]    Local HTTP API; requires PAGESIGHT_API_TOKEN

All data commands emit JSON. --json is accepted for clarity.
--out FILE saves the same evidence locally. Exit: 0 success, 1 provider failure,
2 invalid input, 3 partial evidence. Snapshot defaults to 28 days ending Pacific
today minus 3 days; max-pages defaults to 4 (ad hoc reports: 1; maximum: 20).
Credentials: GSC_* env, PAGESIGHT_GA_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS (GA), GOOGLE_API_KEY (speed), BING_WEBMASTER_API_KEY (Bing).
Requests, property metadata, provider limits and errors are preserved in evidence.
`;

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
        port: { type: "string" },
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
        "form-factor": { type: "string" },
        origin: { type: "boolean" },
        providers: { type: "string" },
        baseline: { type: "string" },
        current: { type: "string" },
        "max-rows": { type: "string" },
      },
    });
    if (args.length === 0 || values.help || positionals[0] === "help") {
      process.stdout.write(help);
      return 0;
    }
    const [family, action] = positionals;
    if (positionals.length > (["gsc", "ga", "bing", "speed", "evidence"].includes(family) ? 2 : 1))
      throw new RequestError("Too many command arguments", null, "invalid_input");
    const operation = ["gsc", "ga", "bing", "speed", "evidence"].includes(family)
      ? `${family}.${action ?? ""}`
      : family;
    const flags: Record<string, string[]> = {
      "evidence.import": ["request"],
      discover: ["url", "providers"],
      compare: ["baseline", "current", "max-rows"],
      "bing.crawl-stats": ["site"],
      "bing.crawl-issues": ["site"],
      "bing.url-info": ["site", "url"],
      "bing.link-counts": ["site", "max-pages"],
      "bing.url-links": ["site", "url", "max-pages"],
      "bing.sites": [],
      "bing.queries": ["site"],
      "bing.pages": ["site"],
      "bing.traffic": ["site"],
      "gsc.sites": [],
      "gsc.sitemaps": ["site"],
      "gsc.inspect": ["site", "url"],
      "gsc.report": ["site", "request", "max-pages"],
      "ga.accounts": [],
      "ga.property": ["property"],
      "ga.key-events": ["property"],
      "ga.report": ["property", "request", "max-pages"],
      page: ["url"],
      "speed.psi": ["url", "strategy"],
      "speed.crux": ["url", "origin", "form-factor"],
      "speed.history": ["url", "origin", "form-factor"],
      doctor: ["config"],
      snapshot: ["config", "start", "end", "max-pages"],
      api: ["request"],
      serve: ["port"],
    };
    const allowed = [...(flags[operation] ?? []), ...(operation === "serve" ? [] : ["out", "json"])];
    for (const flag of Object.keys(values))
      if (!allowed.includes(flag))
        throw new RequestError(`--${flag} is not supported for ${operation}`, null, "invalid_input");
    if (operation === "serve") {
      const port = Number(values.port ?? 6095);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new RequestError("Invalid port", null, "invalid_input");
      const { startHttpApi } = await import("./http.js");
      const server = startHttpApi(process.env.PAGESIGHT_API_TOKEN ?? "", port);
      process.stderr.write(`Pagesight API listening on ${server.url}v1/query\n`);
      return 0;
    }
    let input: unknown;
    if (operation === "api") input = await jsonFile(values.request, "request");
    else if (operation === "evidence.import")
      input = { operation, document: await jsonFile(values.request, "request") };
    else if (operation === "compare")
      input = {
        operation,
        baseline: await jsonFile(values.baseline, "baseline"),
        current: await jsonFile(values.current, "current"),
        maxRows: Number(values["max-rows"] ?? 100),
      };
    else if (operation === "snapshot" || operation === "doctor") {
      const config = await jsonFile(values.config, "config");
      if (operation === "doctor") input = { operation, config };
      else {
        if (Boolean(values.start) !== Boolean(values.end))
          throw new RequestError("Supply both --start and --end, or neither", null, "invalid_input");
        const dates = values.start ? { startDate: values.start, endDate: values.end } : defaultDates();
        input = { operation, config, ...dates, maxPages: Number(values["max-pages"] ?? 4) };
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
        ...(values["form-factor"] ? { formFactor: values["form-factor"] } : {}),
        ...(values.origin ? { origin: true } : {}),
        ...(values.providers !== undefined ? { providers: values.providers.split(",") } : {}),
      };
    }
    const result = await execute(input);
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (values.out) await Bun.write(values.out, output);
    process.stdout.write(output);
    return result.status === "ok" ? 0 : result.status === "partial" ? 3 : 1;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ error: { code: error instanceof RequestError ? error.code : "invalid_input", message: error instanceof RequestError ? error.message : "Invalid command or request; use --help" } })}\n`,
    );
    return 2;
  }
}
