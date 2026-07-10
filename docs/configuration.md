# Configuration Guide

`int_coveo_commerce` reads its runtime settings from site preferences through `Config.js`.

Before these preferences appear in Business Manager, import the metadata package from:

```text
metadata/meta/system-objecttype-extensions.xml
```

You can bundle that import package with:

```text
npm run packageMetadata
```

Create these custom preferences in Business Manager or define them through your normal SFCC metadata import flow before enabling the cartridge on a site.

## Required Preferences

| Preference ID | Purpose |
| --- | --- |
| `coveoCommerceOrganizationId` | Coveo organization identifier |
| `coveoCommerceApiEndpoint` | Base URL for the Commerce API |
| `coveoCommerceTrackingId` | Storefront tracking ID used by Commerce API requests |
| `coveoCommerceAuthMode` | Authentication mode: `apiKey` or `searchToken` |

Example `coveoCommerceApiEndpoint` value:

```text
https://platform.cloud.coveo.com/rest/organizations/<ORG_ID>/commerce/v2
```

## Optional Preferences

| Preference ID | Purpose | Default |
| --- | --- | --- |
| `coveoCommerceApiToken` | Direct bearer token used when `coveoCommerceAuthMode=apiKey` | empty |
| `coveoCommerceAuthenticatedSearchApiKey` | Private API key used server-side to mint search tokens when `coveoCommerceAuthMode=searchToken` | empty |
| `coveoCommerceSearchTokenServiceUrl` | Optional override for the search-token endpoint URL | `https://<org>.org.coveo.com/rest/search/token` |
| `coveoCommerceSearchTokenSecurityProvider` | Security identity provider used when minting search tokens | `Email Security Provider` |
| `coveoCommerceSearchTokenUserType` | User identity type for minted search tokens | `User` |
| `coveoCommerceSearchTokenValidityMillis` | Search token lifetime in milliseconds | `3600000` |
| `coveoCommerceDefaultCatalog` | Default catalog identifier | empty |
| `coveoCommerceLocale` | Optional fallback locale used when the current storefront request locale is not available | empty |
| `coveoCommerceLanguage` | Optional fallback language code. Runtime requests use the storefront locale first, then this preference | empty |
| `coveoCommerceCountry` | Optional fallback country code. Runtime requests use the storefront locale first, then this preference | empty |
| `coveoCommerceCurrency` | Optional fallback currency. Runtime requests use the current storefront session currency first, then this preference | empty |
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
- Storefront requests resolve locale context dynamically:
  - `language` and `country` default from the current request locale, such as `fr_CA`
  - `currency` defaults from the current SFRA session currency
  - site preferences act as fallbacks for non-storefront contexts, jobs, or custom service calls
- `trackingId`, language, country, locale, currency, search hub, and pipeline can still be overridden per request by passing values into `CommerceApiService`.
- Query suggestion and recommendation payloads can include additional context fields from the storefront layer.
- If you need a specific user identity, groups, or filter in a search token, pass `searchTokenOptions` into `CommerceApiService` from an overriding controller or service layer.
