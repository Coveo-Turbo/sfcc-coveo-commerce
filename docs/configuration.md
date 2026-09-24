# Configuration Guide

`int_coveo_commerce` reads business/runtime settings from site preferences through `Config.js` and reads outbound host and secret configuration from SFCC service credentials and profiles.

Before these preferences and service definitions appear in Business Manager, import the metadata package from:

```text
metadata/
```

You can bundle that import package with:

```text
npm run packageMetadata
```

Create these custom preferences in Business Manager or define them through your normal SFCC metadata import flow before enabling the cartridge on a site.

## Required SFCC Services

`int_coveo_commerce` now sends outbound requests through SFCC `dw/svc/LocalServiceRegistry`. The metadata package creates these HTTP services:

| Service ID | Purpose |
| --- | --- |
| `coveo.http.commerce.api` | Commerce API search, listing, query/product suggestion, facet-search, and recommendation calls |
| `coveo.http.search.token` | Server-side search-token generation |

Service notes:

- Configure authentication as `NONE`; the cartridge adds bearer headers itself.
- Set `coveo.http.commerce.api` credential URL to the Coveo platform host, such as `https://platform.cloud.coveo.com`.
- Set `coveo.http.search.token` credential URL to the search-token host, such as `https://<org>.org.coveo.com`.
- Store the Commerce API bearer token in the `coveo.http.commerce.api` credential password when using `apiKey` mode.
- Store the authenticated search API key in the `coveo.http.search.token` credential password when using `searchToken` mode.
- Prefer managing timeout, rate limiting, and circuit-breaker behavior in the service profile so SFCC owns the outbound-call policy. The cartridge no longer overrides the HTTP timeout per request.

## Required Preferences

| Preference ID | Purpose |
| --- | --- |
| `coveoCommerceOrganizationId` | Coveo organization identifier |
| `coveoCommerceTrackingId` | Storefront tracking ID used by Commerce API requests |

## Optional Preferences

| Preference ID | Purpose | Default |
| --- | --- | --- |
| `coveoCommerceAuthMode` | Authentication mode: `apiKey` or `searchToken` | `apiKey` |
| `coveoCommerceSearchTokenSecurityProvider` | Security identity provider used when minting search tokens | `Email Security Provider` |
| `coveoCommerceSearchTokenUserType` | User identity type for minted search tokens | `User` |
| `coveoCommerceSearchTokenValidityMillis` | Search token lifetime in milliseconds | `3600000` |
| `coveoCommerceLocale` | Optional fallback locale used when the current storefront request locale is not available | empty |
| `coveoCommerceLanguage` | Optional fallback language code. Runtime requests use the storefront locale first, then this preference | empty |
| `coveoCommerceCountry` | Optional fallback country code. Runtime requests use the storefront locale first, then this preference | empty |
| `coveoCommerceCurrency` | Optional fallback currency. Runtime requests use the current storefront session currency first, then this preference | empty |
| `coveoCommerceSearchHub` | Default search hub | empty |
| `coveoCommercePipeline` | Default pipeline | empty |
| `coveoCommerceAnalyticsEnabled` | Enables client ID management and analytics metadata | `true` |
| `coveoCommerceVerboseLogging` | Enables debug logging | `false` |
| `coveoCommerceRetryCount` | Retry count for retryable failures | `1` |

## Notes

- `apiKey` mode is appropriate for public storefronts where a shared Commerce bearer token is acceptable.
- `searchToken` mode is intended for authenticated storefronts. In this mode, SFCC generates search tokens on the server side and uses them when calling the Commerce API. The private API key used to mint those tokens never leaves the server.
- Configure the API host and secrets only on the SFCC service credentials. The cartridge no longer reads endpoint or secret values from site preferences.
- When configuring search-token authentication for Coveo Commerce, leave search-hub enforcement out of the underlying API key and generated token. The Commerce API sets the search hub automatically.
- Storefront requests resolve locale context dynamically:
  - `language` and `country` default from the current request locale, such as `fr_CA`
  - `currency` defaults from the current SFRA session currency
  - site preferences act as fallbacks for non-storefront contexts, jobs, or custom service calls
- `trackingId`, language, country, locale, currency, search hub, and pipeline can still be overridden per request by passing values into `CommerceApiService`.
- All Commerce request payloads can include additional context fields from the storefront layer. The sample `Search-Facet` route accepts a bounded JSON-object `context`; direct service calls can pass an object through `CommerceApiService`.
- If you need a specific user identity, groups, or filter in a search token, pass `searchTokenOptions` into `CommerceApiService` from an overriding controller or service layer.
