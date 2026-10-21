# Provider access

## Sign in with Google

One sign-in covers Search Console and GA4:

```sh
pagesight login google
pagesight discover --url https://example.com/
```

The browser asks for `webmasters.readonly` and `analytics.readonly`. Pagesight saves
the refresh token to `$PAGESIGHT_CONFIG_DIR`, `$XDG_CONFIG_HOME/pagesight` or
`~/.config/pagesight`, in `google.json` with mode 0600. `pagesight logout` revokes it
and deletes the file. A product whose scope you declined keeps falling back to the
sources below.

Sign-in needs a Google OAuth "Desktop app" client in `PAGESIGHT_GOOGLE_CLIENT_ID` and
`PAGESIGHT_GOOGLE_CLIENT_SECRET`.

## Credentials for CI and service accounts

Each product takes the first source that is configured:

| Provider       | Order                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Search Console | `GSC_SERVICE_ACCOUNT_KEY`, `GSC_CLIENT_ID` with `GSC_CLIENT_SECRET` and `GSC_REFRESH_TOKEN`, login |
| GA4            | `PAGESIGHT_GA_CREDENTIALS`, `GOOGLE_APPLICATION_CREDENTIALS`, login, local gcloud ADC file         |
| PageSpeed      | `GOOGLE_API_KEY` optional                                                                          |
| CrUX           | `GOOGLE_API_KEY` required                                                                          |

Credential variables hold a path to service-account JSON or `authorized_user` JSON.
Grant the account access to the property and enable both the Analytics Admin and Data
APIs. The read API creates no consent flow or provider settings of its own.

Keep credentials in an environment file outside the repository and use Bun's
`--env-file` option. No tokens, API-key URLs, or provider error bodies are included
in report envelopes. Configuration files and operation requests must contain only
nonsecret identifiers and report parameters.
