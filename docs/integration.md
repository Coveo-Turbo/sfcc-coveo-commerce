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

## Optional Demo Controllers

`int_coveo_commerce` contains no controllers. The separately deployed `app_coveo_commerce_demo` cartridge contains these thin reference routes:

- `Search-Show`
- `Search-InitializeAnalytics`
- `Search-Suggest`
- `Search-Facet`
- `Search-ProductSuggestions`
- `Search-Recommendations`
- `Category-Show`

These controllers:

- read request parameters
- call `CommerceApiService`
- expose normalized data and analytics metadata through `res.setViewData()` or JSON responses

They do not ship templates. The demo page routes render existing SFRA search templates to demonstrate the integration seam. The demo must appear before `int_coveo_commerce` on the cartridge path, for example `app_coveo_commerce_demo:int_coveo_commerce:app_storefront_base`.

SFCC selects controllers from left to right on the cartridge path and does not merge same-named controllers automatically. The demo's `Search.js` and `Category.js` can hide downstream storefront routes, so existing storefronts should keep their controllers in control and call `CommerceApiService` directly. A customer controller can expose equivalent routes where that is useful, but no demo cartridge is required to use any supported service operation.

## Authentication Modes

`int_coveo_commerce` supports two server-side authentication modes:

- `apiKey`: uses a shared Commerce bearer token for each Commerce API request
- `searchToken`: uses server-side code in SFCC to mint a per-user search token, then authenticates Commerce API requests with that token

The search-token flow is useful when the storefront is authenticated and product visibility or pricing should vary by shopper identity or entitlements.
In this cartridge, the minted search token is used by the server-side integration layer and is not exposed to the storefront browser by default.

## Expected Customer Work

- Install the cartridge
- Configure site preferences
- Call `CommerceApiService` from customer-owned `Search`, `Category`, or search-box controllers
- Wire existing templates to the normalized `coveoSearch` or `coveoListing` data contracts
- Connect autocomplete UI to a customer route that calls `CommerceApiService.querySuggest()`
- Connect field suggestions to a customer route that calls `CommerceApiService.facetSearch()`
- Connect recommendation slots to a customer route that calls `CommerceApiService.recommendations()`
- Push analytics events through GTM or another tracking layer

## Visitor Identity Initialization

`coveo_visitorId` is the first-party cookie authority for the Coveo Commerce
`clientId`. Before a storefront dispatches first-visit query and product
suggestion requests, it must complete one consent-compliant initialization
request. A customer route can call `AnalyticsService.buildRequestContext(request,
response)` and return the result; the demo exposes this behavior as
`Search-InitializeAnalytics`. The call establishes the cookie and returns the
same value in `analytics.clientId`.

Storefront code should retain one initialization promise and queue suggestion
requests until it resolves. Do not cancel the initialization request when the
shopper starts typing. This prevents concurrent first-visit suggestion calls
from each attempting to establish a different visitor identity. The cartridge
does not ship storefront JavaScript; customers own consent handling and this
request sequencing.

`AnalyticsService` resolves the client ID in this order:

1. the `coveo_visitorId` request cookie
2. an ID already generated earlier in the same request
3. an ID held in `session.privacy`
4. a newly generated UUID

Steps 2 and 3 exist because a cookie added to the response is not readable from
the current request. They guarantee that repeated `ensureClientId()` or
`buildRequestContext()` calls within one request return the same value and emit
at most one visitor cookie, and that concurrent first-visit requests sharing a
storefront session stay on one identity. Integrations that call
`AnalyticsService.ensureClientId()` directly get this behavior without changes.

Because the session can restore an ID, clearing only the `coveo_visitorId`
cookie mid-session re-applies the same ID until the storefront session ends.

When server-side code invokes multiple `CommerceApiService` operations within
one request, it can also pass one shared `analyticsContext` object to each call.

```javascript
var analyticsContext = {};
var querySuggestions = CommerceApiService.querySuggest({
    request: request,
    response: response,
    analyticsContext: analyticsContext,
    query: 'dog'
});
var productSuggestions = CommerceApiService.productSuggest({
    request: request,
    response: response,
    analyticsContext: analyticsContext,
    query: 'dog'
});
```

Do not accept `clientId` from query parameters. The client ID is resolved from
the first-party cookie or a server-owned `analyticsContext`; only response IDs
and query UIDs vary per API response.

Response normalization must not discard this resolved context. When a mapper or
helper computes fallback analytics, it should do so only when the source
response has no client ID, rather than eagerly on every response.

## Companion Repository

Use `sfcc-coveo-catalog-ingestion` alongside this repository when you need catalog synchronization from SFCC into Coveo. This repository is focused on runtime API integration only.

## Popular Searches and Field Suggestions

The demo `Search-Suggest` route accepts an empty query; a customer equivalent that calls `CommerceApiService.querySuggest()` has the same capability. Coveo can return popular query completions in that state:

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

For each descriptor the storefront chooses to display, call a customer-owned endpoint that invokes `CommerceApiService.facetSearch()` with its `facetId` (or `field` when `facetId` is absent). The demo route is `Search-Facet`:

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

The demo route accepts `context` only as a valid JSON object up to 8192 characters. It uses the HTTP `Referer` as `context.view.url` unless the supplied context already contains a view URL; without either, the request URL is used. Customer routes should apply equivalent input validation. `QueryBuilder` also supplies defaults for `capture` and `cart` and adds available user-agent/referrer metadata. Unrelated top-level query parameters are not forwarded into Commerce request context or search-token options.

This delegates to `CommerceApiService.facetSearch()` and sends `POST /rest/organizations/{organizationId}/commerce/v2/facet?type=SEARCH` with a payload containing `trackingId`, `clientId`, `query`, `facetId`, `numberOfValues`, `language`, `country`, `currency`, and `context`. The demo route returns:

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

The demo route applies these constraints:

| Parameter | Constraint |
| --- | --- |
| `facetId` | Required string; maximum 128 characters; letters, digits, `_`, `.`, and `-` only |
| `q` or `query` | String; empty is allowed; maximum 512 characters |
| `numberOfValues` or `count` | Optional strict integer from 1 through 100; default `5` |
| `context` | Optional JSON object; maximum 8192 characters |

Direct `CommerceApiService.facetSearch()` calls receive the mapper's additional `raw` response property and normalize `numberOfValues` to the 1–100 range. The demo route deliberately omits `raw`. Neither flow automatically calls the facet endpoint from `querySuggest`; the storefront owns which descriptors to resolve and can issue independent requests for them.

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
