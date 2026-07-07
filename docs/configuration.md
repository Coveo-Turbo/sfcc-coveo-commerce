# Configuration Guide

`int_coveo_commerce` reads its runtime settings from site preferences through `Config.js`.

Create these custom preferences in Business Manager or define them through your normal SFCC metadata import flow before enabling the cartridge on a site.

## Required Preferences

| Preference ID | Purpose |
| --- | --- |
| `coveoCommerceOrganizationId` | Coveo organization identifier |
| `coveoCommerceApiEndpoint` | Base URL for the Commerce API |
| `coveoCommerceAuthMode` | Authentication mode: `apiKey` or `searchToken` |

## Optional Preferences

| Preference ID | Purpose | Default |
| --- | --- | --- |
| `coveoCommerceApiToken` | Direct bearer token used when `coveoCommerceAuthMode=apiKey` | empty |
| `coveoCommerceAuthenticatedSearchApiKey` | Private API key used server-side to mint search tokens when `coveoCommerceAuthMode=searchToken` | empty |
| `coveoCommerceSearchTokenServiceUrl` | Optional override for the search-token endpoint URL | `https://<org>.org.coveo.com/rest/search/token` |
| `coveoCommerceSearchTokenSecurityProvider` | Security identity provider used when minting search tokens | empty |
| `coveoCommerceSearchTokenUserType` | User identity type for minted search tokens | `User` |
| `coveoCommerceSearchTokenValidityMillis` | Search token lifetime in milliseconds | `3600000` |
| `coveoCommerceDefaultCatalog` | Default catalog identifier | empty |
| `coveoCommerceLocale` | Locale used for API requests | empty |
| `coveoCommerceCurrency` | Currency used for API requests | empty |
| `coveoCommerceSearchHub` | Default search hub | empty |
| `coveoCommercePipeline` | Default pipeline | empty |
| `coveoCommerceAnalyticsEnabled` | Enables client ID management and analytics metadata | `true` |
| `coveoCommerceVerboseLogging` | Enables debug logging | `false` |
| `coveoCommerceTimeoutMillis` | Request timeout in milliseconds | `5000` |
| `coveoCommerceRetryCount` | Retry count for retryable failures | `1` |

## Notes

- `apiKey` mode is appropriate for public storefronts where a shared Commerce bearer token is acceptable.
- `searchToken` mode is intended for authenticated storefronts. In this mode, SFCC generates search tokens on the server side and uses them when calling the Commerce API. The private API key used to mint those tokens never leaves the server.
- When configuring search-token authentication for Coveo Commerce, leave search-hub enforcement out of the underlying API key and generated token. The Commerce API sets the search hub automatically.
- Locale, currency, search hub, and pipeline can be overridden per request by passing values into `CommerceApiService`.
- Query suggestion and recommendation payloads can include additional context fields from the storefront layer.
- If you need a specific user identity, groups, or filter in a search token, pass `searchTokenOptions` into `CommerceApiService` from an overriding controller or service layer.
