# Configuration Guide

`int_coveo_commerce` reads its runtime settings from site preferences through `Config.js`.

Create these custom preferences in Business Manager or define them through your normal SFCC metadata import flow before enabling the cartridge on a site.

## Required Preferences

| Preference ID | Purpose |
| --- | --- |
| `coveoCommerceOrganizationId` | Coveo organization identifier |
| `coveoCommerceApiEndpoint` | Base URL for the Commerce API |
| `coveoCommerceApiToken` | Bearer token used for v1 authentication |

## Optional Preferences

| Preference ID | Purpose | Default |
| --- | --- | --- |
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

- v1 authentication uses a bearer token. The service layer exposes an internal seam for a future OAuth implementation.
- Locale, currency, search hub, and pipeline can be overridden per request by passing values into `CommerceApiService`.
- Query suggestion and recommendation payloads can include additional context fields from the storefront layer.
