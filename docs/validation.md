# Validation Guide

Use the reusable curl matrix to smoke-test explicitly mapped controller routes and expected HTTP statuses against an SFCC sandbox after uploading and activating the code version.

## Prerequisites

- The cartridge is deployed and configured as described in the installation and configuration guides.
- For the default demo workflow, `app_coveo_commerce_demo:int_coveo_commerce` resolves on the effective cartridge path.
- For a customer storefront workflow, equivalent routes are configured with the `COVEO_ROUTE_*` variables below.
- `curl` is installed.

The defaults target the optional demo routes. SFCC selects the first controller with a given filename from the cartridge path and does not merge controllers. Do not add the demo cartridge to a production customer path merely to run this matrix; map the customer-owned equivalent routes instead.

## Required Setup

Set the SFCC controller base URL. The site ID and locale are case-sensitive:

```bash
export COVEO_BASE_URL="https://<sandbox-host>/on/demandware.store/Sites-<site-id>-Site/fr_CA"
export COVEO_ROUTE_TARGET="demo"
```

Run the matrix:

```bash
npm run validateServices
```

The script uses one cookie jar across all calls so the SFCC session remains stable. When Coveo analytics is enabled and the expected controller handles the request, inspect the responses to confirm that the same visitor `clientId` is reused. Response bodies and headers are saved under a timestamped directory in `${TMPDIR:-/tmp}`.

## Optional Configuration

```bash
export COVEO_QUERY="royal"
export COVEO_FACET_ID="ec_brand"
export COVEO_NUMBER_OF_VALUES="5"
export COVEO_FACET_CONTEXT='{"custom":{"applyBestSellerSort":true}}'
export COVEO_TIMEOUT="30"
export COVEO_PRINT_BODIES="true"
```

`COVEO_NUMBER_OF_VALUES` is used as query-suggest `count` and facet-search `numberOfValues`.

### Customer Route Mapping

The defaults below target the demo routes. For a customer storefront, set a descriptive target label and provide its route mappings before running the matrix:

```bash
export COVEO_ROUTE_TARGET="customer storefront"
export COVEO_ROUTE_SEARCH_SHOW="CoveoSearch-Show"
export COVEO_ROUTE_INITIALIZE_ANALYTICS="CoveoSearch-InitializeAnalytics"
export COVEO_ROUTE_SUGGEST="CoveoSearch-Suggest"
export COVEO_ROUTE_FACET="CoveoSearch-Facet"
export COVEO_ROUTE_PRODUCT_SUGGESTIONS="CoveoSearch-ProductSuggestions"
export COVEO_ROUTE_RECOMMENDATIONS="CoveoSearch-Recommendations"
export COVEO_ROUTE_CATEGORY_SHOW="CoveoCategory-Show"
```

Each mapped endpoint must preserve the response contracts expected by the matrix, including `analytics.clientId` for the initialization, query-suggest, and product-suggestion identity checks.

Override where artifacts and cookies are stored:

```bash
export COVEO_OUTPUT_DIR="/tmp/my-coveo-validation"
export COVEO_COOKIE_JAR="/tmp/my-coveo-validation-cookies.txt"
```

Enable recommendation and category checks by providing customer-specific identifiers:

```bash
export COVEO_RECOMMENDATION_SLOT_ID="<published-cmh-slot-id>"
export COVEO_CATEGORY_ID="<category-id>"
```

## Matrix

The script requests these routes and checks their expected HTTP statuses:

- Empty-query popular searches and `fieldSuggestionsFacets`
- Typed query suggestions
- Empty-query facet values
- Facet values with custom `applyBestSellerSort` context
- Typed-query facet values
- Product suggestions
- Rejection of a malformed facet value count
- Search page routing
- Recommendations when a slot ID is supplied
- Category listing when a category ID is supplied

## Client ID Continuity

After the route matrix, the script runs first-visit identity checks on isolated
cookie jars:

| Check | Assertion |
| --- | --- |
| `first-preview-identity` | A fresh-cookie product-suggestion route response reports the same `analytics.clientId` it stores in `coveo_visitorId` |
| `first-preview-single-cookie` | That response sets at most one `coveo_visitorId` header |
| `initialize-analytics` | The configured initialization route establishes the visitor cookie it reports |
| `concurrent-suggest-identity` | Query suggest and product suggest issued concurrently after initialization both reuse the established client ID |
| `concurrent-no-cookie-reissue` | Neither concurrent response replaces the visitor cookie |

These checks require `python3` to read `analytics.clientId` and are skipped when
it is unavailable. They are also skipped when analytics is disabled and no client
ID is returned. Identifiers are printed as truncated fingerprints so full visitor
values stay out of validation logs.

The concurrency check passes only because identity is established first. Two
genuinely cookie-less concurrent requests still mint separate IDs; the storefront
is responsible for completing one consent-compliant initialization request before
it starts typed suggestion traffic.

The matrix is a route/status smoke test; HTTP 200 alone does not prove the normalized Commerce contract. Set `COVEO_PRINT_BODIES=true` to print responses, or inspect the files retained in `COVEO_OUTPUT_DIR`. Confirm that:

- Empty-query suggestions include the expected popular searches and normalized `fieldSuggestionsFacets`.
- Facet responses include ordered `values` and `moreValuesAvailable`.
- The custom-context request produces the expected CMH behavior.
- Product suggestions contain expected normalized product fields.
- Coveo response and analytics identifiers are present where applicable.
- The same analytics `clientId` is reused across requests when analytics is enabled.

## Authentication Modes

In `apiKey` mode, the matrix can run as an anonymous shopper. In `searchToken` mode, supply an authenticated storefront cookie jar:

```bash
export COVEO_COOKIE_JAR="/path/to/authenticated-cookies.txt"
npm run validateServices
```

The script does not accept or transmit Coveo credentials. Authentication remains server-side in the configured SFCC services.
