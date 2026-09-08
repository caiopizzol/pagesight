# Provider access

## Credentials

| Provider       | Configuration                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Search Console | `GSC_SERVICE_ACCOUNT_KEY`, or `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN`                 |
| GA4            | `PAGESIGHT_GA_CREDENTIALS`, then `GOOGLE_APPLICATION_CREDENTIALS`, then the usual local gcloud ADC file |
| PageSpeed      | `GOOGLE_API_KEY` optional                                                                               |
| CrUX           | `GOOGLE_API_KEY` required                                                                               |

GA accepts service-account JSON or `authorized_user` ADC JSON. Use
`analytics.readonly` permission and grant property access. Enable both Analytics
Admin and Data APIs. GSC authentication remains separate with `webmasters.readonly`.
No new consent flow or provider settings are created by the read API.

Keep credentials in an environment file outside the repository and use Bun's
`--env-file` option. No tokens, API-key URLs, or provider error bodies are included
in report envelopes. Configuration files and operation requests must contain only
nonsecret identifiers and report parameters.

## Bing Webmaster reports

Set `BING_WEBMASTER_API_KEY` from Bing Webmaster Tools API Access, then discover
sites before copying a verified `Url` verbatim into `bingSite` in your config
(including its scheme and trailing-slash form):

```sh
pagesight discover --url https://example.com/ --providers bing
pagesight bing sites
pagesight bing queries --site https://example.com/
pagesight bing pages --site https://example.com/
pagesight bing traffic --site https://example.com/
```

The API operations are `bing.sites`, `bing.queries`, `bing.pages` and `bing.traffic`.
MCP `observe` and HTTP use the same operation objects. A configured `bingSite`
adds all three reports to snapshots; doctor checks traffic access. Google discovery
remains the default; use `--providers gsc,ga,bing` to include all providers.

These methods accept no date range or pagination options. Snapshot requested dates
apply to Google reports; Bing returns its provider-defined range. Responses retain
Bing's raw `d` envelope, numeric fields and `/Date(...)/` strings; reporting timezone
and coverage remain unknown. Query/page statistics update weekly, traffic daily.
`GetPageStats` uses `Query` for the page URL. Since March 24, 2023 traffic includes
Web, Chat, News, Images, Videos and Knowledge Panel; this is not isolated AI-citation
evidence or a Google Web equivalent. Site verification is not indexing evidence.

Contracts were checked against Microsoft Learn's [GetUserSites](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getusersites),
[GetQueryStats](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getquerystats),
[GetPageStats](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getpagestats)
and [GetRankAndTrafficStats](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getrankandtrafficstats).
Fixture tests verify these contracts and safe failures. Live Bing access has not
been verified because no API key is configured in the development environment.
