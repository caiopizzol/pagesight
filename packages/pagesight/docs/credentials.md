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
