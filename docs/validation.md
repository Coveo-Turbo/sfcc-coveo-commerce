# Validation Guide

Use the reusable curl matrix to smoke-test the cartridge against an SFCC sandbox after uploading and activating the code version.

## Prerequisites

- The cartridge is deployed and configured as described in the installation and configuration guides.
- The sample `Search` and `Category` controllers resolve on the effective cartridge path, or the storefront exposes equivalent routes.
- `curl` is installed.

## Required Setup

Set the SFCC controller base URL. The site ID and locale are case-sensitive:

```bash
export COVEO_BASE_URL="https://<sandbox-host>/on/demandware.store/Sites-<site-id>-Site/fr_CA"
```

Run the matrix:

```bash
npm run validateServices
```

The script uses one cookie jar across all calls so the SFCC session and Coveo visitor `clientId` remain stable. Response bodies and headers are saved under a timestamped directory in `${TMPDIR:-/tmp}`.

## Optional Configuration

```bash
export COVEO_QUERY="royal"
export COVEO_FACET_ID="ec_brand"
export COVEO_NUMBER_OF_VALUES="5"
export COVEO_FACET_CONTEXT='{"custom":{"applyBestSellerSort":true}}'
export COVEO_TIMEOUT="30"
export COVEO_PRINT_BODIES="true"
```

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

The script validates:

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

Each test asserts its expected HTTP status. Set `COVEO_PRINT_BODIES=true` to print JSON/HTML responses; responses are always retained in `COVEO_OUTPUT_DIR` for detailed inspection.

## Authentication Modes

In `apiKey` mode, the matrix can run as an anonymous shopper. In `searchToken` mode, supply an authenticated storefront cookie jar:

```bash
export COVEO_COOKIE_JAR="/path/to/authenticated-cookies.txt"
npm run validateServices
```

The script does not accept or transmit Coveo credentials. Authentication remains server-side in the configured SFCC services.
