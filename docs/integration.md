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

The response includes normalized `suggestions` and the `fieldSuggestionsFacets` descriptors supplied by Coveo Commerce. Coveo returns an empty `fieldSuggestionsFacets` array when no facet has **Include in Filter suggestions** enabled in Coveo Merchandising Hub.

Example descriptor:

```json
{
  "facetId": "ec_brand",
  "field": "ec_brand",
  "displayName": "Brand",
  "type": "regular"
}
```

For each descriptor the storefront chooses to display, call the standalone facet route:

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
  --data-urlencode "q=" \
  --data-urlencode "facetId=ec_brand" \
  --data-urlencode "numberOfValues=5" \
  --data-urlencode 'context={"custom":{"applyBestSellerSort":true}}'
```

The sample route accepts `context` only as a valid JSON object up to 8192 characters. Unrelated top-level query parameters are not forwarded into the Commerce authentication context.

This delegates to `CommerceApiService.facetSearch()` and sends `POST /commerce/v2/facet?type=SEARCH`. The normalized response is:

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
  "analytics": {}
}
```

The sample route accepts `numberOfValues` from 1 through 100. It does not automatically call the facet endpoint from `querySuggest`; the storefront owns which descriptors to resolve and can issue independent requests for them.

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
