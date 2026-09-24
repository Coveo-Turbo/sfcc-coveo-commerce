# Integration Guide

## Architecture

Current native flow:

```text
SFRA Controller -> ProductSearchModel -> Native SFCC Search
```

Integration flow with `int_coveo_commerce`:

```text
SFRA Controller -> CommerceApiService -> Coveo Commerce API
```

The storefront keeps ownership of templates, styling, JavaScript behavior, and customer-specific merchandising logic.

## Sample Controllers

The cartridge includes thin sample controllers:

- `Search-Show`
- `Search-Suggest`
- `Search-Facet`
- `Search-ProductSuggestions`
- `Search-Recommendations`
- `Category-Show`

These controllers:

- read request parameters
- call `CommerceApiService`
- expose normalized data and analytics metadata through `res.setViewData()` or JSON responses

They do not ship templates. The sample page routes render existing SFRA search templates to demonstrate the integration seam, while customers remain free to override the controllers or use the service layer directly.

SFCC selects controllers from left to right on the cartridge path and does not merge same-named controllers automatically. If `int_coveo_commerce` is first, its standalone `Search.js` and `Category.js` can hide downstream storefront routes. If a customer cartridge is first, its controllers can hide these sample routes. Existing storefronts should generally keep their controllers in control and call `CommerceApiService` directly or explicitly expose the desired sample actions.

## Authentication Modes

`int_coveo_commerce` supports two server-side authentication modes:

- `apiKey`: uses a shared Commerce bearer token for each Commerce API request
- `searchToken`: uses server-side code in SFCC to mint a per-user search token, then authenticates Commerce API requests with that token

The search-token flow is useful when the storefront is authenticated and product visibility or pricing should vary by shopper identity or entitlements.
In this cartridge, the minted search token is used by the server-side integration layer and is not exposed to the storefront browser by default.

## Expected Customer Work

- Install the cartridge
- Configure site preferences
- Override or extend the sample `Search` and `Category` controllers as needed
- Wire existing templates to the normalized `coveoSearch` or `coveoListing` data contracts
- Connect autocomplete UI to `Search-Suggest`
- Connect field suggestions returned by `Search-Suggest` to `Search-Facet`
- Connect recommendation slots to `Search-Recommendations`
- Push analytics events through GTM or another tracking layer

## Companion Repository

Use `sfcc-coveo-catalog-ingestion` alongside this repository when you need catalog synchronization from SFCC into Coveo. This repository is focused on runtime API integration only.

## Popular Searches and Field Suggestions

`Search-Suggest` accepts an empty query. Coveo can return popular query completions in that state:

```text
Search-Suggest?q=&count=5
```

The response includes normalized `suggestions` and `fieldSuggestionsFacets` descriptors supplied by Coveo Commerce. The normalized response returns an empty array when Coveo omits or returns no descriptors. Coveo has been observed to populate descriptors for facets with **Include in Filter suggestions** enabled in Coveo Merchandising Hub.

Example descriptor:

```json
{
  "facetId": "ec_brand",
  "field": "ec_brand",
  "displayName": "Brand",
  "type": "regular"
}
```

For each descriptor the storefront chooses to display, call the standalone facet route with its `facetId` (or `field` when `facetId` is absent):

```text
Search-Facet?q=&facetId=ec_brand&numberOfValues=5
```

Additional Commerce context can be passed as URL-encoded JSON. For example, Mondou's best-seller facet sorting context is:

```text
Search-Facet?q=&facetId=ec_brand&numberOfValues=5&context={"custom":{"applyBestSellerSort":true}}
```

With `curl`, use `--data-urlencode`:

```bash
curl --get "$BASE/Search-Facet" \
  --referer "$STOREFRONT_PAGE_URL" \
  --data-urlencode "q=" \
  --data-urlencode "facetId=ec_brand" \
  --data-urlencode "numberOfValues=5" \
  --data-urlencode 'context={"custom":{"applyBestSellerSort":true}}'
```

The sample route accepts `context` only as a valid JSON object up to 8192 characters. It uses the HTTP `Referer` as `context.view.url` unless the supplied context already contains a view URL; without either, the request URL is used. `QueryBuilder` also supplies defaults for `capture` and `cart` and adds available user-agent/referrer metadata. Unrelated top-level query parameters are not forwarded into Commerce request context or search-token options.

This delegates to `CommerceApiService.facetSearch()` and sends `POST /rest/organizations/{organizationId}/commerce/v2/facet?type=SEARCH` with a payload containing `trackingId`, `clientId`, `query`, `facetId`, `numberOfValues`, `language`, `country`, `currency`, and `context`. The sample route returns:

```json
{
  "facetId": "ec_brand",
  "values": [
    {
      "displayValue": "Kong",
      "rawValue": "Kong",
      "path": [],
      "count": 104
    }
  ],
  "moreValuesAvailable": true,
  "analytics": {
    "clientId": "<visitor-client-id>",
    "searchHub": "",
    "pipeline": ""
  }
}
```

The sample route applies these constraints:

| Parameter | Constraint |
| --- | --- |
| `facetId` | Required string; maximum 128 characters; letters, digits, `_`, `.`, and `-` only |
| `q` or `query` | String; empty is allowed; maximum 512 characters |
| `numberOfValues` or `count` | Optional strict integer from 1 through 100; default `5` |
| `context` | Optional JSON object; maximum 8192 characters |

Direct `CommerceApiService.facetSearch()` calls receive the mapper's additional `raw` response property and normalize `numberOfValues` to the 1–100 range. The sample route deliberately omits `raw`. Neither flow automatically calls the facet endpoint from `querySuggest`; the storefront owns which descriptors to resolve and can issue independent requests for them.

Server-side integrations can call the two primitives directly:

```javascript
var querySuggestions = CommerceApiService.querySuggest(params);
var facetValues = CommerceApiService.facetSearch({
    query: '',
    facetId: 'ec_brand',
    numberOfValues: 5,
    currentUrl: params.currentUrl,
    request: params.request,
    response: params.response,
    context: params.context
});
```

The facet-search request requires a page URL in `context.view.url`. Pass `currentUrl` or a context with `view.url` when calling the service outside an SFRA controller request.

## Normalized Product Pricing

`ProductMapper` normalizes a product's first non-null price using this precedence:

1. `price`
2. `pricing.price`
3. `ec_promo_price`
4. `ec_price`
5. `null`

A null promotional price therefore falls back to the regular `ec_price`. This is field normalization only; SFCC price-book selection, live pricing calculation, and customer-specific pricing rules remain outside the cartridge.
