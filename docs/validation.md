# Validation Guide

Use the reusable curl matrix to smoke-test controller routes and expected HTTP statuses against an SFCC sandbox after uploading and activating the code version.

## Prerequisites

- The cartridge is deployed and configured as described in the installation and configuration guides.
- The sample `Search` and `Category` controllers resolve on the effective cartridge path, or the storefront exposes equivalent routes with the same names.
- `curl` is installed.

SFCC selects the first controller with a given filename from the cartridge path. It does not automatically merge the sample `Search.js` or `Category.js` with customer controllers. A `ControllerException` stating that an action was not found means another controller took precedence; expose the route from the storefront controller or adjust the path temporarily in a sandbox.

## Required Setup

Set the SFCC controller base URL. The site ID and locale are case-sensitive:

```bash
export COVEO_BASE_URL="https://<sandbox-host>/on/demandware.store/Sites-<site-id>-Site/fr_CA"
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
